import { useState } from "react";

export default function HostingPanel({ hosting, busy, onAction }) {
  const [title, setTitle] = useState("");
  const [branch, setBranch] = useState("feature/welcome");
  const [strategy, setStrategy] = useState("merge");
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
        {hosting.protected && (
          <p>main 已保护：直接推送会被拒绝，需要通过 PR、评审与必需检查。</p>
        )}
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
          {hosting.requireChecks && (
            <div
              className="remote-card"
              aria-label="必需检查结果"
              role="status"
            >
              <b>
                必需检查 ·{" "}
                {
                  { pending: "尚未运行", passed: "通过", failed: "失败" }[
                    pr.checks || "pending"
                  ]
                }
              </b>
              <p>
                {pr.checkMessage ||
                  "检查将验证当前分支与上游合并后的功能和测试内容。"}
              </p>
              {pr.staleChecks &&
                pr.checks !== "pending" &&
                pr.status === "open" && (
                  <p>检查已过期：提交或上游发生变化，请重新运行。</p>
                )}
            </div>
          )}
          {pr.staleReview && pr.status !== "merged" && (
            <p role="status">
              当前远端提交或上游基线尚未评审，请重新请求评审。
            </p>
          )}
          <p>
            远端提交 <code>{pr.currentHead?.slice(0, 12) || "分支已删除"}</code>
          </p>
          {pr.status === "open" && (
            <>
              {hosting.canAdvance && !hosting.upstreamAdvanced && (
                <button
                  disabled={busy}
                  onClick={() => onAction({ operation: "advance" })}
                >
                  模拟上游更新
                </button>
              )}
              {hosting.requireChecks && (
                <label className="merge-strategy">
                  合并方式
                  <select
                    value={strategy}
                    onChange={(event) => setStrategy(event.target.value)}
                  >
                    <option value="merge">Merge · 保留分支与合并提交</option>
                    <option value="squash">Squash · 汇总为一个提交</option>
                    <option value="rebase">Rebase · 逐个重放为线性历史</option>
                  </select>
                  <small>
                    本关要求：{hosting.requiredStrategy}
                    。来源分支会保留，合并后仍需同步 main。
                  </small>
                </label>
              )}
              <div className="hosting-actions">
                <button
                  disabled={busy}
                  onClick={() => onAction({ operation: "review" })}
                >
                  请求评审
                </button>
                {hosting.requireChecks && (
                  <button
                    disabled={busy}
                    onClick={() => onAction({ operation: "check" })}
                  >
                    运行必需检查
                  </button>
                )}
                <button
                  className="primary"
                  disabled={
                    busy ||
                    pr.review !== "approved" ||
                    pr.staleReview ||
                    (hosting.requireChecks &&
                      (pr.checks !== "passed" || pr.staleChecks)) ||
                    (hosting.canAdvance && !hosting.upstreamAdvanced)
                  }
                  onClick={() =>
                    onAction({
                      operation: "merge",
                      strategy: hosting.requireChecks ? strategy : "merge",
                    })
                  }
                >
                  合并 PR
                </button>
              </div>
            </>
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
