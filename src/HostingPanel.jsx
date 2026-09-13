import { useState } from "react";

export default function HostingPanel({ hosting, busy, onAction }) {
  const [title, setTitle] = useState("");
  const [branch, setBranch] = useState("feature/welcome");
  if (!hosting) return null;
  const pr = hosting.pr;
  return (
    <section className="hosting-panel task-scroll" aria-label="离线托管练习">
      <h2>
        托管练习 <small>离线模拟</small>
      </h2>
      <p>
        使用真实 Git 仓库练习 Fork 和 PR。这里的操作只作用于本关，不会向 GitHub
        发送请求。
      </p>
      <div className="remote-card">
        <b>upstream · 上游项目</b>
        <code>{hosting.upstream}</code>
      </div>
      <div className="remote-card">
        <b>origin · 你的 Fork</b>
        <code>{hosting.forked ? hosting.origin : "尚未创建"}</code>
      </div>
      {!hosting.forked && (
        <button
          className="primary"
          disabled={busy}
          onClick={() => onAction({ operation: "fork" })}
        >
          Fork 上游仓库
        </button>
      )}
      {hosting.forked && !pr && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onAction({ operation: "create", title, branch });
          }}
        >
          <h3>创建 Pull Request</h3>
          <label>
            PR 标题
            <input
              required
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            来源 · origin 分支
            <input
              required
              maxLength={120}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            />
          </label>
          <p>目标：upstream / main</p>
          <button className="primary" disabled={busy}>
            创建 PR
          </button>
        </form>
      )}
      {pr && (
        <>
          <h3>
            #{pr.number} {pr.title}
          </h3>
          <p>
            <code>origin/{pr.branch}</code> → <code>upstream/{pr.base}</code>
          </p>
          <p className="hosting-status">
            {pr.status === "merged" ? "已合并" : "等待合并"} ·{" "}
            {
              {
                pending: "等待评审",
                approved: "评审通过",
                changes_requested: "请求修改",
              }[pr.review]
            }
          </p>
          <p>{pr.message}</p>
          {pr.staleReview && pr.status !== "merged" && (
            <p role="status">
              当前远端提交尚未评审。继续推送后，请重新请求评审。
            </p>
          )}
          <p>
            远端提交 <code>{pr.currentHead?.slice(0, 12) || "分支已删除"}</code>
          </p>
          {pr.status === "open" && (
            <div className="hosting-actions">
              <button
                disabled={busy}
                onClick={() => onAction({ operation: "review" })}
              >
                请求评审
              </button>
              <button
                className="primary"
                disabled={busy || pr.review !== "approved" || pr.staleReview}
                onClick={() => onAction({ operation: "merge" })}
              >
                合并 PR
              </button>
            </div>
          )}
          <details>
            <summary>查看 PR 差异</summary>
            <pre>{pr.diff || "没有可显示的差异"}</pre>
          </details>
        </>
      )}
    </section>
  );
}
