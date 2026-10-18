import { useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../api/client";
import { useHealthCheck } from "../health/useHealthCheck";
import styles from "./home.module.css";
import { useLogout } from "./useLogout";
import { useSession } from "./useSession";
import { useCreateTask } from "../tasks/useCreateTask";

export function HomePage() {
  const { user } = useSession();
  const logout = useLogout();
  const health = useHealthCheck();
  const createTask = useCreateTask();
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [resolution, setResolution] = useState<"1K" | "2K" | "4K">("1K");
  const [outputFormat, setOutputFormat] = useState<"jpg" | "png">("jpg");

  // RequireAuth already guarantees a user; this keeps the type honest.
  if (!user) return null;

  return (
    <div className={styles.page}>
      <h1>Ukiyo-e</h1>
      <p>AI 制图工作流</p>

      <form
        className={styles.taskForm}
        onSubmit={(event) => {
          event.preventDefault();
          createTask.mutate({
            model: "nano-banana-2-1",
            input: {
              prompt,
              aspect_ratio: aspectRatio,
              resolution,
              output_format: outputFormat,
            },
          });
        }}
      >
        <h2>创建图片任务</h2>
        <label>
          描述
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            maxLength={20_000}
            required
            placeholder="描述你想生成的图片"
          />
        </label>
        <label>
          比例
          <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>
            {["1:1", "16:9", "9:16", "4:3", "3:4"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          分辨率
          <select value={resolution} onChange={(event) => setResolution(event.target.value as typeof resolution)}>
            <option>1K</option>
            <option>2K</option>
            <option>4K</option>
          </select>
        </label>
        <label>
          格式
          <select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value as typeof outputFormat)}>
            <option>jpg</option>
            <option>png</option>
          </select>
        </label>
        <button type="submit" disabled={createTask.isPending}>
          {createTask.isPending ? "提交中…" : "创建任务"}
        </button>
      </form>

      {createTask.isError && (
        <p className={styles.error}>创建失败：{errorMessage(createTask.error)}</p>
      )}
      {createTask.isSuccess && (
        <p className={styles.success}>
          任务已提交，任务 ID：{createTask.data.providerTaskId}
        </p>
      )}

      <dl className={styles.summary}>
        <dt>邮箱</dt>
        <dd>{user.email}</dd>
        <dt>展示名</dt>
        <dd>{user.displayName ?? "—"}</dd>
        <dt>角色</dt>
        <dd>{user.role === "admin" ? "管理员" : "普通用户"}</dd>
        <dt>积分余额</dt>
        <dd>{user.pointsBalance}</dd>
        <dt>最近登录</dt>
        <dd>
          {user.lastLoginAt
            ? new Date(user.lastLoginAt).toLocaleString()
            : "—"}
        </dd>
      </dl>

      <div className={styles.actions}>
        {user.role === "admin" && (
          <Link className={styles.adminLink} to="/admin/users">
            用户管理
          </Link>
        )}

        <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>
          {logout.isPending ? "登出中…" : "登出"}
        </button>

        <button type="button" onClick={() => health.mutate()} disabled={health.isPending}>
          {health.isPending ? "检查中…" : "检查后端"}
        </button>
      </div>

      {logout.isError && <p className={styles.error}>{errorMessage(logout.error)}</p>}
      {health.isError && (
        <p className={styles.error}>请求失败：{health.error.message}</p>
      )}
      {health.isSuccess && (
        <pre className={styles.debug}>{JSON.stringify(health.data, null, 2)}</pre>
      )}
    </div>
  );
}
