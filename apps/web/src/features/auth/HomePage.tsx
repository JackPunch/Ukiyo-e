import { useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../api/client";
import { useHealthCheck } from "../health/useHealthCheck";
import styles from "./home.module.css";
import { useLogout } from "./useLogout";
import { useSession } from "./useSession";
import {
  useCreateTask,
  useTaskHistory,
  useTaskStatus,
} from "../tasks/useCreateTask";

const statusLabels = {
  queued: "排队中",
  running: "生成中",
  succeeded: "成功",
  failed: "失败",
} as const;

export function HomePage() {
  const { user } = useSession();
  const logout = useLogout();
  const health = useHealthCheck();
  const createTask = useCreateTask();
  const taskHistory = useTaskHistory();
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [resolution, setResolution] = useState<"1K" | "2K" | "4K">("1K");
  const [outputFormat, setOutputFormat] = useState<"jpg" | "png">("jpg");
  const taskStatus = useTaskStatus(selectedTaskId);

  if (!user) return null;

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <h2>历史任务</h2>
        <button
          type="button"
          className={`${styles.newTaskItem} ${selectedTaskId === null ? styles.selectedTask : ""}`}
          onClick={() => setSelectedTaskId(null)}
        >
          <strong>＋ 新建任务</strong>
          <span>创建一张新的图片</span>
        </button>
        {taskHistory.isPending && <p>加载中…</p>}
        {taskHistory.isError && (
          <p className={styles.error}>加载失败：{errorMessage(taskHistory.error)}</p>
        )}
        {taskHistory.data?.items.length === 0 && <p>暂无任务</p>}
        <ul className={styles.taskList}>
          {taskHistory.data?.items.map((task) => (
            <li key={task.taskId}>
              <button
                type="button"
                className={`${styles.taskItem} ${selectedTaskId === task.taskId ? styles.selectedTask : ""}`}
                onClick={() => setSelectedTaskId(task.taskId)}
              >
                <strong>#{task.taskId} · {statusLabels[task.status]}</strong>
                <span>{task.prompt}</span>
                <time dateTime={task.createdAt}>
                  {new Date(task.createdAt).toLocaleString()}
                </time>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className={styles.page}>
        <h1>Ukiyo-e</h1>
        <p>AI 制图工作流</p>
        {selectedTaskId === null ? (
          <>
            <form
              className={styles.taskForm}
              onSubmit={(event) => {
                event.preventDefault();
                createTask.mutate(
                  {
                    model: "nano-banana-2-1",
                    input: {
                      prompt,
                      aspect_ratio: aspectRatio,
                      resolution,
                      output_format: outputFormat,
                    },
                  },
                  { onSuccess: (task) => setSelectedTaskId(task.taskId) },
                );
              }}
            >
              <h2>创建新任务</h2>
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
          </>
        ) : (
          <>
            {taskStatus.isPending && <p>正在加载任务详情…</p>}
            {taskStatus.isError && (
              <p className={styles.error}>详情加载失败：{errorMessage(taskStatus.error)}</p>
            )}
          </>
        )}
        {selectedTaskId !== null && taskStatus.data && (
          <section className={styles.detail}>
            <h2>任务 #{taskStatus.data.taskId}</h2>
            <p className={styles.detailStatus}>
              状态：{statusLabels[taskStatus.data.status]}
            </p>
            <dl className={styles.summary}>
              <dt>描述</dt>
              <dd>{taskStatus.data.prompt}</dd>
              <dt>模型</dt>
              <dd>{taskStatus.data.model ?? "—"}</dd>
              <dt>创建时间</dt>
              <dd>{new Date(taskStatus.data.createdAt).toLocaleString()}</dd>
              <dt>开始时间</dt>
              <dd>{taskStatus.data.startedAt ? new Date(taskStatus.data.startedAt).toLocaleString() : "—"}</dd>
              <dt>完成时间</dt>
              <dd>{taskStatus.data.finishedAt ? new Date(taskStatus.data.finishedAt).toLocaleString() : "—"}</dd>
              {taskStatus.data.error && (
                <>
                  <dt>错误</dt>
                  <dd className={styles.error}>{taskStatus.data.error}</dd>
                </>
              )}
            </dl>
            {taskStatus.data.images.length > 0 && (
              <div className={styles.imageGrid}>
                {taskStatus.data.images.map((image) => (
                  <img
                    key={image.imageId}
                    src={image.url}
                    alt={taskStatus.data.prompt}
                    className={styles.generatedImage}
                  />
                ))}
              </div>
            )}
          </section>
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
        </dl>
        <div className={styles.actions}>
          {user.role === "admin" && (
            <Link className={styles.adminLink} to="/admin/users">用户管理</Link>
          )}
          <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>
            {logout.isPending ? "登出中…" : "登出"}
          </button>
          <button type="button" onClick={() => health.mutate()} disabled={health.isPending}>
            {health.isPending ? "检查中…" : "检查后端"}
          </button>
        </div>
        {logout.isError && <p className={styles.error}>{errorMessage(logout.error)}</p>}
        {health.isError && <p className={styles.error}>请求失败：{health.error.message}</p>}
        {health.isSuccess && (
          <pre className={styles.debug}>{JSON.stringify(health.data, null, 2)}</pre>
        )}
      </main>
    </div>
  );
}
