import { useHealthCheck } from "./features/health/useHealthCheck";

function App() {
  const health = useHealthCheck();

  return (
    <main className="app">
      <h1>Ukiyo-e</h1>
      <p>AI 制图工作流 · 后端健康检查</p>

      <button
        type="button"
        onClick={() => health.mutate()}
        disabled={health.isPending}
      >
        {health.isPending ? "检查中…" : "检查后端"}
      </button>

      {health.isError && (
        <p className="error">请求失败：{health.error.message}</p>
      )}
      {health.isSuccess && <pre>{JSON.stringify(health.data, null, 2)}</pre>}
    </main>
  );
}

export default App;
