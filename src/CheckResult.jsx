import { useEffect, useRef } from "react";
import { CheckCircle2, Circle, LoaderCircle, X } from "lucide-react";

export default function CheckResult({
  report,
  nextLabel,
  onNext,
  onClose,
  onRetry,
}) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const snapshot = report.snapshot;
  const passed = snapshot?.checks.filter((check) => check.done).length || 0;
  const total = snapshot?.checks.length || 0;
  const title =
    report.phase === "checking"
      ? "正在检查练习…"
      : report.phase === "error"
        ? "这次检查没有完成"
        : snapshot.complete
          ? "本关已完成"
          : total - passed === 1
            ? "还差一步"
            : `还有 ${total - passed} 项未完成`;
  return (
    <dialog
      ref={ref}
      className="check-dialog"
      aria-labelledby="check-result-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <button
        className="modal-close"
        aria-label="关闭检查结果"
        onClick={onClose}
      >
        <X size={20} />
      </button>
      <p className="check-caption">练习检查结果</p>
      <div aria-live="polite" aria-busy={report.phase === "checking"}>
        <h2 id="check-result-title">{title}</h2>
        {report.phase === "checking" && (
          <p className="check-wait">
            <LoaderCircle className="spin" size={20} />
            正在读取已保存的仓库状态…
          </p>
        )}
        {report.phase === "error" && <p role="alert">{report.error}</p>}
        {report.phase === "ready" && (
          <>
            <p>
              {passed} / {total} 条件通过
            </p>
            <ul className="check-result-list">
              {snapshot.checks.map((check) => (
                <li key={check.label}>
                  {check.done ? (
                    <CheckCircle2 size={21} className="passed" />
                  ) : (
                    <Circle size={21} />
                  )}
                  <div>
                    <strong>{check.label}</strong>
                    <p>
                      {check.detail ||
                        (check.done
                          ? "当前仓库已满足此条件。"
                          : "请根据任务目标调整仓库，再次检查。")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="check-evidence">
              本次检查：{snapshot.branch || "分离 HEAD"} · 提交{" "}
              <code>{snapshot.head}</code> · {report.checkedAt}
            </p>
            {report.unsaved && (
              <p className="check-unsaved">
                编辑器还有未保存内容，本次只检查已保存到仓库的文件。继续前请先返回保存。
              </p>
            )}
          </>
        )}
      </div>
      <div className="check-result-actions">
        {report.phase === "error" ? (
          <button className="primary" onClick={onRetry}>
            重新检查
          </button>
        ) : report.phase === "ready" && snapshot.complete && !report.unsaved ? (
          <>
            <button className="secondary" onClick={onClose}>
              继续查看仓库
            </button>
            <button className="primary" onClick={onNext}>
              {nextLabel}
            </button>
          </>
        ) : (
          <button className="primary" onClick={onClose}>
            {report.phase === "checking" ? "返回练习，稍后检查" : "返回练习"}
          </button>
        )}
      </div>
    </dialog>
  );
}
