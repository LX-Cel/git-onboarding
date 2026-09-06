import React, { useCallback, useEffect, useRef, useState } from "react";
import { Terminal as XTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  GitBranch,
  GitCommitHorizontal,
  GraduationCap,
  LayoutDashboard,
  Lightbulb,
  LoaderCircle,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Terminal,
  Trash2,
  X,
  AlertCircle,
  Layers,
  Monitor,
  Download,
  Circle,
} from "lucide-react";
import lessons from "../runtime/lessons.json";
import { layoutGraph } from "./graph.js";
import { version } from "../package.json";
import CheckResult from "./CheckResult.jsx";

const api = window.gitLab;
const colors = ["#3469e8", "#8764b8", "#b66c16", "#18856b", "#497caa"];
const labelMode = (mode) => (mode === "guided" ? "引导练习" : "独立挑战");

function CommitGraph({ history = [] }) {
  const { nodes, edges, width } = layoutGraph(history);
  if (!nodes.length) return <div className="empty">还没有可显示的提交</div>;
  return (
    <div className="commit-graph" style={{ minHeight: nodes.length * 56 }}>
      <svg
        width={width}
        height={nodes.length * 56}
        aria-label="真实提交父子关系图"
      >
        {edges.map(({ from, to }) => (
          <path
            key={`${from.hash}-${to.hash}`}
            d={`M${from.x},${from.y} C${from.x},${from.y + 26} ${to.x},${to.y - 26} ${to.x},${to.y}`}
            fill="none"
            stroke={colors[from.lane % colors.length]}
            strokeWidth="2"
            opacity=".7"
          />
        ))}
        {nodes.map((n) => (
          <circle
            key={n.hash}
            cx={n.x}
            cy={n.y}
            r="5"
            fill="white"
            stroke={colors[n.lane % colors.length]}
            strokeWidth="2.5"
          />
        ))}
      </svg>
      <div className="commit-labels" style={{ marginLeft: width }}>
        {nodes.map((n) => (
          <div className="commit-row" key={n.hash}>
            <div className="commit-subject" title={n.subject}>
              {n.subject}
            </div>
            <div className="commit-detail">
              <code>{n.hash.slice(0, 7)}</code>
              {n.refs && (
                <span className="ref-label" title={n.refs}>
                  {n.refs}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TerminalPane({ sessionKey, onChange, onResult }) {
  const host = useRef(null),
    term = useRef(null);
  const [ended, setEnded] = useState(false);
  const [reconnect, setReconnect] = useState(0);
  useEffect(() => {
    if (!api || !host.current) return;
    const terminal = new XTerminal({
      cursorBlink: true,
      cursorStyle: "bar",
      fontSize: 16,
      fontFamily: 'Cascadia Code, Consolas, "Microsoft YaHei", monospace',
      lineHeight: 1.5,
      scrollback: 3000,
      theme: {
        background: "#172338",
        foreground: "#dce6f3",
        cursor: "#93dfff",
        selectionBackground: "#365268",
        black: "#172338",
        red: "#ff8891",
        brightRed: "#ffadb0",
        green: "#7de2bc",
        brightGreen: "#a7efce",
        blue: "#82aaff",
        yellow: "#ebca80",
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host.current);
    fit.fit();
    term.current = terminal;
    let promptBuffer = "";
    const decoder = new TextDecoder();
    const offData = api.onData((data) => {
      const bytes = Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));
      terminal.write(bytes);
      promptBuffer += decoder.decode(bytes, { stream: true });
      const pattern = /\x1b\]133;D;(\d+)\x07/g;
      let match,
        consumed = 0;
      while ((match = pattern.exec(promptBuffer))) {
        onResult(Number(match[1]));
        consumed = pattern.lastIndex;
      }
      promptBuffer = promptBuffer.slice(consumed).slice(-128);
    });
    const offExit = api.onExit((message) => {
      setEnded(true);
      terminal.writeln(`\r\n${message}`);
    });
    const input = terminal.onData((data) => {
      api.input(data);
      if (data.includes("\r") || data.includes("\x03")) onChange();
    });
    const resize = () => {
      if (!host.current?.clientWidth) return;
      fit.fit();
      api.resize({ cols: terminal.cols, rows: terminal.rows });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host.current);
    setEnded(false);
    api
      .connect()
      .then(() => {
        resize();
        // Startup may finish after the learner has already focused the editor.
        if (
          document.activeElement === document.body ||
          host.current?.contains(document.activeElement)
        )
          terminal.focus();
      })
      .catch((error) => {
        terminal.writeln(error.message);
        setEnded(true);
      });
    return () => {
      offData();
      offExit();
      input.dispose();
      observer.disconnect();
      api.disconnect();
      terminal.dispose();
      term.current = null;
    };
  }, [sessionKey, reconnect]);
  return (
    <section className="terminal-panel">
      <div className="terminal-bar">
        <span>
          <Terminal size={16} /> 终端 <i /> Bash
        </span>
        <div>
          <button
            title="清屏（Ctrl + L）"
            onClick={() => {
              term.current?.clear();
              term.current?.focus();
            }}
          >
            <Trash2 size={15} />
            清屏
          </button>
          <button
            title="重新连接终端"
            onClick={() => setReconnect((n) => n + 1)}
          >
            <RefreshCw size={14} />
            {ended ? "重新连接" : ""}
          </button>
        </div>
      </div>
      <div className="terminal-host" ref={host} />
    </section>
  );
}

function App() {
  const [displayScale, setDisplayScale] = useState(1);
  const [view, setView] = useState("home");
  const [runtime, setRuntime] = useState(null);
  const [progress, setProgress] = useState({});
  const [lesson, setLesson] = useState(lessons[0]);
  const [mode, setMode] = useState("guided");
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(false);
  const [setupLog, setSetupLog] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [hint, setHint] = useState(0);
  const [sessionKey, setSessionKey] = useState(0);
  const [file, setFile] = useState("");
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState("");
  const [tab, setTab] = useState("task");
  const [updatedAt, setUpdatedAt] = useState("");
  const gutter = useRef(null);
  const [editorTab, setEditorTab] = useState("file");
  const [feedback, setFeedback] = useState(
    "每一次操作，都能看见 Git 状态的变化。",
  );
  const [confirmation, setConfirmation] = useState(null);
  const [copied, setCopied] = useState(false);
  const [checkReport, setCheckReport] = useState(null);
  const checkGeneration = useRef(0),
    checkInFlight = useRef(false);
  const stateRef = useRef(null),
    refreshing = useRef(false),
    refreshTimer = useRef(null),
    fileRef = useRef("");
  const dirtyRef = useRef(false),
    contentRef = useRef(""),
    selectionEpoch = useRef(0),
    switching = useRef(false),
    lastExit = useRef(0);
  const dirty = content !== saved;
  dirtyRef.current = dirty;
  fileRef.current = file;
  contentRef.current = content;

  useEffect(() => {
    const beforeUnload = (event) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = false;
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  useEffect(() => {
    if (!api) {
      setRuntime({ ready: false, preview: true });
      return;
    }
    api
      .status()
      .then(setRuntime)
      .catch((e) => setError(e.message));
    api.progress().then(setProgress);
    api.display().then(setDisplayScale);
    const offSetup = api.onSetup(setSetupLog);
    const offDisplay = api.onDisplay(setDisplayScale);
    return () => {
      offSetup();
      offDisplay();
    };
  }, []);

  const applyState = useCallback((next) => {
    const prev = stateRef.current;
    if (next.conflicts.length)
      setFeedback(
        `发现合并冲突：${next.conflicts.join("、")}。编辑文件，删除冲突标记并保留正确内容，再暂存和提交。`,
      );
    else if (lastExit.current !== 0)
      setFeedback(
        `上一条命令未成功完成（退出码 ${lastExit.current}）。请先阅读终端错误。${next.stagedDiff ? "暂存区仍有待提交内容，可用 git diff --staged 检查。" : next.diff ? "修改仍在工作区，可用 git status 和 git diff 定位当前状态。" : "仓库状态没有待提交修改，可用 git status 确认。"}需要帮助时可展开任务面板中的提示。`,
      );
    else if (next.complete)
      setFeedback(
        "目标已达成！判题依据是实际仓库状态，你可以使用不同的正确操作路径。",
      );
    else if (prev && prev.branch !== next.branch)
      setFeedback(
        `当前分支从 ${prev.branch || "分离 HEAD"} 切换为 ${next.branch || "分离 HEAD"}。接下来的提交将记录在当前所在的位置。`,
      );
    else if (prev && prev.head !== next.head)
      setFeedback(
        `HEAD 已从 ${prev.head} 移动到 ${next.head}。查看提交图，确认新提交或历史移动是否符合预期。`,
      );
    else if (prev && prev.stagedDiff !== next.stagedDiff)
      setFeedback(
        next.stagedDiff
          ? "暂存区发生了变化。下一次 commit 将记录暂存区中的内容。"
          : "暂存区已清空。查看工作区，确认修改是已提交，还是被取消暂存。",
      );
    else if (prev && prev.diff !== next.diff)
      setFeedback("工作区内容发生了变化。用 git diff 查看尚未暂存的修改。");
    stateRef.current = next;
    setState(next);
    setUpdatedAt(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
    if (next.complete) api?.progress().then(setProgress);
  }, []);

  const refresh = useCallback(async () => {
    if (
      !api ||
      refreshing.current ||
      switching.current ||
      checkInFlight.current
    )
      return;
    refreshing.current = true;
    const epoch = selectionEpoch.current;
    try {
      const next = await api.state();
      if (epoch !== selectionEpoch.current) return;
      applyState(next);
      if (
        fileRef.current &&
        !dirtyRef.current &&
        next.files.includes(fileRef.current)
      ) {
        const name = fileRef.current;
        const result = await api.read(name);
        if (
          epoch === selectionEpoch.current &&
          !dirtyRef.current &&
          fileRef.current === name
        ) {
          setContent(result.content);
          setSaved(result.content);
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      refreshing.current = false;
    }
  }, [applyState]);

  function closeCheck() {
    checkGeneration.current += 1;
    checkInFlight.current = false;
    setCheckReport(null);
  }
  async function checkExercise() {
    if (!api || switching.current || checkInFlight.current) return;
    const generation = ++checkGeneration.current;
    const epoch = selectionEpoch.current;
    checkInFlight.current = true;
    setCheckReport({ phase: "checking" });
    try {
      // A deliberate check is never dropped just because polling is in flight.
      const snapshot = await api.state();
      if (
        generation !== checkGeneration.current ||
        epoch !== selectionEpoch.current
      )
        return;
      if (snapshot.error || !snapshot.checks.length)
        throw new Error(snapshot.error || "未能读取完成条件，请重试。");
      applyState(snapshot);
      setCheckReport({
        phase: "ready",
        snapshot,
        unsaved: dirtyRef.current,
        checkedAt: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      });
    } catch (error) {
      if (
        generation === checkGeneration.current &&
        epoch === selectionEpoch.current
      )
        setCheckReport({ phase: "error", error: error.message });
    } finally {
      if (generation === checkGeneration.current) checkInFlight.current = false;
    }
  }

  const scheduleRefresh = useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(refresh, 650);
  }, [refresh]);
  useEffect(() => {
    if (view !== "lab" || busy) return;
    const timer = setInterval(refresh, 3000);
    return () => {
      clearInterval(timer);
      clearTimeout(refreshTimer.current);
    };
  }, [view, busy, refresh, sessionKey]);

  function confirmDiscard(action) {
    if (dirtyRef.current)
      setConfirmation({
        title: "放弃尚未保存的编辑？",
        body: "编辑器中的改动尚未写入练习文件。继续后这些编辑会丢失，已保存的仓库内容会保留。",
        label: "放弃编辑并继续",
        action,
      });
    else action();
  }
  async function begin(nextLesson = lesson, nextMode = mode, reset = false) {
    if (!runtime?.ready) {
      setSetup(true);
      return;
    }
    if (switching.current) return;
    switching.current = true;
    selectionEpoch.current += 1;
    lastExit.current = 0;
    setBusy(true);
    setError("");
    setLesson(nextLesson);
    setMode(nextMode);
    try {
      await api.disconnect();
      const next = await api.begin({
        lesson: nextLesson.id,
        mode: nextMode,
        reset,
      });
      setLesson(nextLesson);
      setMode(nextMode);
      setStep(0);
      setHint(0);
      setTab("task");
      setEditorTab("file");
      stateRef.current = null;
      applyState(next);
      const openingFile = next.files.includes(nextLesson.file)
        ? nextLesson.file
        : next.files[0] || "";
      setFile(openingFile);
      const data = openingFile ? await api.read(openingFile) : { content: "" };
      setContent(data.content);
      setSaved(data.content);
      setFeedback(
        "先阅读任务目标，再操作终端。修改文件后记得保存，状态会自动更新。",
      );
      setView("lab");
      setSessionKey((n) => n + 1);
    } catch (e) {
      setError(`${e.message}。可以点击「重新开始」重建本练习。`);
      setState(null);
      stateRef.current = null;
      setContent("");
      setSaved("");
      setFile("");
      setView("lab");
    } finally {
      setBusy(false);
      switching.current = false;
    }
  }
  async function initialize() {
    setBusy(true);
    setError("");
    try {
      const result = await api.initialize();
      setRuntime(result);
      if (result.ready) setSetup(false);
      else setSetupLog(result.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    const captured = content;
    setBusy(true);
    setError("");
    try {
      const next = await api.write({ path: file, content: captured });
      setSaved(captured);
      applyState(next);
      setFeedback("文件已保存到真实工作区。保存文件不会自动暂存或提交。");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function selectFile(name) {
    try {
      const data = await api.read(name);
      setFile(name);
      setContent(data.content);
      setSaved(data.content);
    } catch (e) {
      setError(e.message);
    }
  }
  const home = () =>
    confirmDiscard(() => {
      api?.disconnect();
      setView("home");
    });
  const completed = Object.keys(progress).filter((k) =>
    k.endsWith("-challenge"),
  ).length;
  const target = lesson[mode === "guided" ? "target" : "challengeTarget"];
  const working = state?.changes.filter((c) => c.worktree !== " ") || [];
  const staged =
    state?.changes.filter((c) => c.index !== " " && c.index !== "?") || [];

  const nextLesson = lessons[lessons.indexOf(lesson) + 1];
  const nextLabel =
    mode === "guided"
      ? "进入独立挑战"
      : nextLesson
        ? `下一关：${nextLesson.title}`
        : "返回学习路径";
  function goNext() {
    closeCheck();
    confirmDiscard(() => {
      if (mode === "guided") begin(lesson, "challenge");
      else if (nextLesson) begin(nextLesson, "guided");
      else home();
    });
  }

  return (
    <div className={`app-shell ${view === "lab" ? "lab-shell" : "home-shell"}`}>
      <aside className="sidebar">
        <button className="brand" onClick={home} disabled={busy}>
          <span className="brand-icon">
            <GitBranch size={24} />
          </span>
          <span>Git Onboarding</span>
        </button>
        <div className="workspace-label">你的 Git 练习空间</div>
        <nav aria-label="主要导航">
          <button
            className={view === "home" ? "nav-item active" : "nav-item"}
            aria-current={view === "home" ? "page" : undefined}
            disabled={busy}
            onClick={home}
          >
            <LayoutDashboard size={18} />
            学习路径
          </button>
          <button
            className={view === "lab" ? "nav-item active" : "nav-item"}
            aria-current={view === "lab" ? "page" : undefined}
            disabled={busy}
            onClick={() => confirmDiscard(() => begin())}
          >
            <Terminal size={18} />
            练习工作台
          </button>
        </nav>
        <div className="nav-label">
          练习单元 <span>03</span>
        </div>
        <div className="unit-nav">
          {lessons.map((item) => (
            <button
              key={item.id}
              disabled={busy}
              className={
                view === "lab" && lesson.id === item.id ? "selected" : ""
              }
              aria-current={
                view === "lab" && lesson.id === item.id ? "step" : undefined
              }
              onClick={() => confirmDiscard(() => begin(item, "guided"))}
            >
              <span className="unit-number">
                {progress[`${item.id}-challenge`] ? (
                  <Check size={14} />
                ) : (
                  item.number
                )}
              </span>
              <span>
                {item.title}
                <small>
                  {item.level} · {item.minutes} 分钟
                </small>
              </span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="safe-note">
            <ShieldCheck size={19} />
            <span>
              放心动手，允许出错<small>练习可以随时重新开始</small>
            </span>
          </div>
          <div className="local-status">
            <span
              className={runtime?.ready ? "status-dot ready" : "status-dot"}
            />
            {runtime?.ready ? "本地练习环境已就绪" : "等待环境初始化"}
            <span>v{version}</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="breadcrumb">我的学习空间</span>
            <ChevronRight size={14} />
            <strong>{view === "home" ? "学习路径" : lesson.title}</strong>
          </div>
          <div className="topbar-right">
            <label className="display-scale">
              字号
              <select
                aria-label="显示比例"
                value={displayScale}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (api)
                    api
                      .setDisplay(value)
                      .then(setDisplayScale)
                      .catch((e) => setError(e.message));
                }}
              >
                {[1, 1.25, 1.5, 2].map((scale) => (
                  <option key={scale} value={scale}>
                    {scale * 100}%
                  </option>
                ))}
              </select>
            </label>
            <span>
              <Monitor size={14} /> 本地运行
            </span>
          </div>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={17} />
            <span>
              {error.replace(
                /^Error invoking remote method '[^']+': Error: /,
                "",
              )}
            </span>
            <button onClick={() => setError("")} aria-label="关闭错误">
              <X size={16} />
            </button>
          </div>
        )}
        {view === "home" ? (
          <main className="home-view">
            <div className="page-heading">
              <div>
                <div className="eyebrow">LEARN BY DOING</div>
                <h1>把 Git，练成你的日常。</h1>
                <p>从第一次提交到从容解决冲突，在真实环境中一步步掌握 Git。</p>
              </div>
              <div className="progress-pill">
                <GraduationCap size={20} />
                <span>
                  <b>{completed} / 3</b> 单元挑战完成
                </span>
              </div>
            </div>
            <section className="hero-card">
              <div className="hero-copy">
                <div className="hero-badge">
                  <span />
                  真实操作 · 即时反馈
                </div>
                <h2>
                  读懂命令，
                  <br />
                  更看懂每一次变化。
                </h2>
                <p>
                  在这里，犯错也是学习的一部分。
                  <br />
                  跟着引导动手，再用独立挑战检验自己。
                </p>
                <button
                  className="primary"
                  disabled={busy || !runtime}
                  onClick={() =>
                    begin(
                      lessons.find((l) => !progress[`${l.id}-challenge`]) ||
                        lessons[0],
                      "guided",
                    )
                  }
                >
                  {!runtime ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Play size={16} fill="currentColor" />
                  )}
                  {runtime?.ready
                    ? "开始练习"
                    : runtime?.updateRequired
                      ? "更新练习环境"
                      : "准备练习环境"}
                  <ArrowRight size={17} />
                </button>
                <div className="hero-foot">
                  <ShieldCheck size={14} />
                  无需账号 · 进度自动保存在本机
                </div>
              </div>
              <div className="hero-visual" aria-hidden="true">
                <div className="mock-window">
                  <div className="mock-top">
                    <i />
                    <i />
                    <i />
                    <span>your-first-commit</span>
                    <GitBranch size={14} />
                  </div>
                  <div className="mock-command">
                    <span>$</span> git commit -m "向前一步"
                    <b>[main 8f2a19c] 向前一步</b>
                    <small>1 file changed, 1 insertion(+)</small>
                  </div>
                  <svg viewBox="0 0 410 145">
                    <path
                      d="M36 95H370M135 95C164 95 154 38 194 38H253C287 38 290 95 320 95"
                      stroke="#5b7684"
                      strokeWidth="3"
                      fill="none"
                    />
                    <path
                      d="M135 95C164 95 154 38 194 38H253C287 38 290 95 320 95"
                      stroke="#8d9af9"
                      strokeWidth="3"
                      fill="none"
                    />
                    {[55, 135, 320, 370].map((x) => (
                      <circle
                        key={x}
                        cx={x}
                        cy="95"
                        r="7"
                        fill="#122837"
                        stroke="#78b4ff"
                        strokeWidth="3"
                      />
                    ))}
                    {[194, 253].map((x) => (
                      <circle
                        key={x}
                        cx={x}
                        cy="38"
                        r="7"
                        fill="#122837"
                        stroke="#a7b1ff"
                        strokeWidth="3"
                      />
                    ))}
                    <rect
                      x="211"
                      y="2"
                      width="89"
                      height="22"
                      rx="5"
                      fill="#3a3c64"
                    />
                    <text x="222" y="17" fill="#c9ccff" fontSize="11">
                      feature/learn
                    </text>
                    <rect
                      x="318"
                      y="114"
                      width="50"
                      height="22"
                      rx="5"
                      fill="#244773"
                    />
                    <text x="329" y="129" fill="#bad7ff" fontSize="11">
                      main
                    </text>
                  </svg>
                </div>
                <div className="float-badge">
                  <CheckCircle2 size={20} />
                  <span>
                    每一步，都有迹可循<small>修改 → 暂存 → 提交</small>
                  </span>
                </div>
              </div>
            </section>
            <div className="section-heading">
              <div>
                <h2>
                  你的学习路径 <span>三个单元，循序渐进</span>
                </h2>
              </div>
              <span className="subtle">已有经验？可以直接挑战。</span>
            </div>
            <div className="course-grid">
              {lessons.map((item, index) => {
                const Icon = [GitCommitHorizontal, GitBranch, RotateCcw][index];
                const done = progress[`${item.id}-challenge`];
                return (
                  <article
                    className={`course-card course-${index}`}
                    key={item.id}
                  >
                    <div className="course-top">
                      <div className="course-icon">
                        <Icon size={24} />
                      </div>
                      <span>{done ? "已完成挑战" : `UNIT ${item.number}`}</span>
                    </div>
                    <div className="course-level">
                      {item.level}
                      <span>·</span>
                      <Clock3 size={12} />
                      {item.minutes} 分钟
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.subtitle}</p>
                    <div className="concepts">
                      {item.concepts.map((c) => (
                        <span key={c}>{c}</span>
                      ))}
                    </div>
                    <div className="course-actions">
                      <button
                        disabled={busy}
                        onClick={() => begin(item, "guided")}
                      >
                        {progress[`${item.id}-guided`]
                          ? "再次带练"
                          : "开始带练"}
                        <ArrowRight size={15} />
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => begin(item, "challenge")}
                      >
                        直接挑战
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="learning-note">
              <Lightbulb size={20} />
              <div>
                <strong>不必记住所有命令，先理解它们改变了什么。</strong>
                <p>
                  每个单元都有引导练习和独立挑战。卡住时，提示会从思路开始，一步步帮你找到答案。
                </p>
              </div>
              <span>按自己的节奏来</span>
            </div>
          </main>
        ) : (
          <main className="lab-view">
            <div className="lab-heading">
              <div>
                <div className="eyebrow">
                  练习 {lesson.number} · {lesson.level}
                </div>
                <h1>{lesson.title}</h1>
              </div>
              <div className="lab-actions">
                <div className="mode-switch">
                  {["guided", "challenge"].map((m) => (
                    <button
                      key={m}
                      className={m === mode ? "active" : ""}
                      aria-pressed={m === mode}
                      disabled={busy}
                      onClick={() =>
                        m !== mode && confirmDiscard(() => begin(lesson, m))
                      }
                    >
                      {labelMode(m)}
                    </button>
                  ))}
                </div>
                <button
                  className="secondary reset-button"
                  disabled={busy}
                  onClick={() =>
                    setConfirmation({
                      title: "重新开始本次练习？",
                      body: `将删除「${lesson.title} · ${labelMode(mode)}」的练习仓库、提交和未保存编辑，并重新构造初始场景。其他练习和已获得的完成记录会保留。`,
                      label: "重新开始",
                      action: () => begin(lesson, mode, true),
                    })
                  }
                >
                  <RotateCcw size={15} />
                  重新开始
                </button>
              </div>
            </div>
            <div className="lab-layout">
              <div className="workbench">
                <div className="workbench-top">
                  <section className="editor-panel">
                    <div className="panel-title">
                      <button
                        className={
                          editorTab === "file" ? "text-tab active" : "text-tab"
                        }
                        onClick={() => setEditorTab("file")}
                      >
                        <FileText size={14} />
                        文件编辑
                      </button>
                      <button
                        className={
                          editorTab === "diff" ? "text-tab active" : "text-tab"
                        }
                        onClick={() => setEditorTab("diff")}
                      >
                        差异
                      </button>
                      <span className="save-status">
                        {dirty ? "有未保存编辑" : "已保存"}
                      </span>
                    </div>
                    {editorTab === "file" ? (
                      <>
                        <div className="file-toolbar">
                          <select
                            disabled={busy}
                            aria-label="选择练习文件"
                            value={file}
                            onChange={(e) => {
                              const name = e.target.value;
                              confirmDiscard(() => selectFile(name));
                            }}
                          >
                            {(state?.files || []).map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                          <button
                            className="primary save-button"
                            disabled={!dirty || busy}
                            onClick={save}
                          >
                            <Save size={16} />
                            保存
                          </button>
                        </div>
                        <div className="code-editor">
                          <div
                            className="line-numbers"
                            aria-hidden="true"
                            ref={gutter}
                          >
                            {content.split("\n").map((_, i) => (
                              <div key={i}>{i + 1}</div>
                            ))}
                          </div>
                          <textarea
                            aria-label="文件内容"
                            disabled={busy}
                            spellCheck="false"
                            wrap="off"
                            onScroll={(e) => {
                              if (gutter.current)
                                gutter.current.scrollTop =
                                  e.currentTarget.scrollTop;
                            }}
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            onKeyDown={(e) => {
                              if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                                e.preventDefault();
                                save();
                              }
                            }}
                          />
                        </div>
                        <div className="editor-footer">
                          <span>UTF-8 · LF</span>
                          <span>Ctrl + S 保存到工作区</span>
                        </div>
                      </>
                    ) : (
                      <div className="diff-view">
                        <h5>工作区 → 暂存区</h5>
                        <pre>{state?.diff || "没有未暂存差异"}</pre>
                        <h5>暂存区 → HEAD</h5>
                        <pre>{state?.stagedDiff || "没有已暂存差异"}</pre>
                      </div>
                    )}
                  </section>
                </div>
                <div
                  className={`feedback-bar ${state?.conflicts.length ? "warning" : ""} ${state?.complete ? "complete" : ""}`}
                >
                  <Lightbulb size={17} />
                  <span>{feedback}</span>
                </div>
                {state ? (
                  <TerminalPane
                    sessionKey={sessionKey}
                    onChange={scheduleRefresh}
                    onResult={(code) => {
                      lastExit.current = code;
                      scheduleRefresh();
                    }}
                  />
                ) : (
                  <div className="terminal-loading">
                    练习仓库尚未就绪。请点击「重新开始」恢复场景。
                  </div>
                )}
                <div className="workbench-footer">
                  <span>
                    <ShieldCheck size={13} />
                    本练习在独立环境中运行，放心尝试
                  </span>
                  <span>仓库状态每 3 秒自动更新</span>
                </div>
              </div>
              <aside className="task-panel" aria-label="练习详情">
                <div className="inspector-tabs" aria-label="练习详情视图">
                  {[
                    ["task", "本次任务", BookOpen],
                    ["state", "仓库状态", Layers],
                    ["graph", "提交图", GitBranch],
                  ].map(([value, label, Icon]) => (
                    <button
                      key={value}
                      className={tab === value ? "active" : ""}
                      aria-pressed={tab === value}
                      onClick={() => setTab(value)}
                    >
                      <Icon size={15} />
                      {label}
                    </button>
                  ))}
                </div>
                <div className="task-scroll" hidden={tab !== "task"}>
                  <h2 className="inspector-heading">本次任务</h2>
                  <details
                    className="task-context"
                    open={mode === "guided"}
                    key={`${lesson.id}-${mode}`}
                  >
                    <summary>任务背景</summary>
                    <p className="story">
                      {lesson[mode === "guided" ? "story" : "challengeStory"]}
                    </p>
                  </details>
                  <div className="target-box">
                    <span>
                      {lesson.id === "basics"
                        ? "本关目标 · 内容可以自由发挥"
                        : "目标内容"}
                    </span>
                    <pre>{target}</pre>
                  </div>
                  {mode === "guided" ? (
                    <details className="guided-details" open>
                      <summary>
                        操作引导 <span>{lesson.steps.length} 个步骤</span>
                      </summary>
                      <div className="steps">
                        {lesson.steps.map((item, index) => (
                          <div
                            key={item.title}
                            className={`step ${index === step ? "current" : ""}`}
                          >
                            <button
                              className="step-title"
                              onClick={() => setStep(index)}
                            >
                              <span>{index + 1}</span>
                              {item.title}
                              <ChevronRight size={14} />
                            </button>
                            {index === step && (
                              <div className="step-body">
                                <p>{item.body}</p>
                                <div className="command-example">
                                  <pre>{item.command}</pre>
                                  <button
                                    aria-label="复制示例命令"
                                    title="复制命令（不会自动执行）"
                                    onClick={async () => {
                                      await navigator.clipboard.writeText(
                                        item.command,
                                      );
                                      setCopied(true);
                                      setTimeout(() => setCopied(false), 1800);
                                    }}
                                  >
                                    {copied ? (
                                      <Check size={13} />
                                    ) : (
                                      <Copy size={13} />
                                    )}
                                  </button>
                                </div>
                                {index < lesson.steps.length - 1 && (
                                  <button
                                    className="next-step"
                                    onClick={() => setStep(index + 1)}
                                  >
                                    阅读下一步
                                    <ArrowRight size={13} />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  <div className="hints">
                    <button
                      onClick={() => setHint((n) => Math.min(n + 1, 3))}
                      disabled={hint === 3}
                    >
                      <Lightbulb size={15} />
                      {hint === 0
                        ? "卡住了？查看提示"
                        : hint < 3
                          ? "再给我一点提示"
                          : "已展开全部提示"}
                      <span>{hint}/3</span>
                    </button>
                    {lesson.hints.slice(0, hint).map((text, i) => (
                      <div className="hint" key={text}>
                        <b>{["思路", "相关命令", "完整示例"][i]}</b>
                        <pre>{text}</pre>
                      </div>
                    ))}
                  </div>
                  <section className="checks" aria-label="当前检查结果">
                    <h2 className="inspector-heading">检查结果</h2>
                    <div
                      className={`result-summary ${state?.complete ? "passed" : ""}`}
                    >
                      {state?.complete ? (
                        <CheckCircle2 size={30} />
                      ) : (
                        <Circle size={28} />
                      )}
                      <div>
                        <strong>
                          {state?.complete ? "本关已完成" : "等待完成练习"}
                        </strong>
                        <small>
                          {state?.checks.filter((c) => c.done).length || 0} /{" "}
                          {state?.checks.length || 0} 条件通过
                        </small>
                      </div>
                    </div>
                    {state?.checks.map((c) => (
                      <div key={c.label} className={c.done ? "done" : ""}>
                        {c.done ? (
                          <CheckCircle2 size={15} />
                        ) : (
                          <Circle size={15} />
                        )}
                        <span>
                          {c.label}
                          {c.detail && (
                            <small className="check-detail">{c.detail}</small>
                          )}
                        </span>
                      </div>
                    ))}
                    {state?.error && (
                      <p className="check-error">{state.error}</p>
                    )}
                    {state && (
                      <div className="inspector-evidence">
                        <h3>仓库记录</h3>
                        <p>
                          <GitBranch size={15} />
                          <code>
                            {state.branch || "分离 HEAD"} · {state.head}
                          </code>
                        </p>
                        <p>
                          <Clock3 size={15} />
                          最近更新 {updatedAt}
                        </p>
                      </div>
                    )}
                  </section>
                </div>
                {tab !== "task" && (
                  <section
                    className="state-panel"
                    aria-label={tab === "state" ? "仓库状态详情" : "提交历史"}
                  >
                    <div className="state-toolbar">
                      <span>
                        {tab === "state" ? "实时仓库状态" : "真实提交历史"}
                      </span>
                      <button
                        className="icon-button"
                        aria-label="刷新仓库状态"
                        onClick={refresh}
                      >
                        <RefreshCw size={15} />
                      </button>
                    </div>
                    <div className="state-content">
                      {tab === "graph" ? (
                        <CommitGraph history={state?.history} />
                      ) : (
                        <>
                          <div className="branch-summary">
                            <GitBranch size={15} />
                            <b>{state?.branch || "分离 HEAD"}</b>
                            <code>{state?.head}</code>
                          </div>
                          <div className="state-zone">
                            <div>
                              <span className="zone-dot work" />
                              <strong>工作区</strong>
                              <span>{working.length} 个文件</span>
                            </div>
                            {working.length ? (
                              working.map((c) => (
                                <p key={c.path}>
                                  <code>
                                    {c.worktree === "?" ? "新增" : c.worktree}
                                  </code>
                                  {c.path}
                                </p>
                              ))
                            ) : (
                              <p className="muted">没有未暂存修改</p>
                            )}
                          </div>
                          <div className="flow-arrow">
                            ↓ <span>git add</span>
                          </div>
                          <div className="state-zone">
                            <div>
                              <span className="zone-dot stage" />
                              <strong>暂存区</strong>
                              <span>{staged.length} 个文件</span>
                            </div>
                            {staged.length ? (
                              staged.map((c) => (
                                <p key={c.path}>
                                  <code>{c.index}</code>
                                  {c.path}
                                </p>
                              ))
                            ) : (
                              <p className="muted">等待放入本次要提交的修改</p>
                            )}
                          </div>
                          <div className="flow-arrow">
                            ↓ <span>git commit</span>
                          </div>
                          <div className="state-zone commit-zone">
                            <div>
                              <span className="zone-dot committed" />
                              <strong>最近提交</strong>
                              <code>{state?.head}</code>
                            </div>
                            <p>
                              {state?.history.find((c) =>
                                c.refs.includes("HEAD"),
                              )?.subject ||
                                state?.history[0]?.subject ||
                                "暂无提交"}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </section>
                )}
                <div className="task-footer">
                  {dirty && (
                    <p className="unsaved-note">
                      编辑尚未保存，检查以仓库文件为准。
                    </p>
                  )}
                  <div className="task-footer-actions">
                    <button
                      className={
                        state?.complete && !dirty ? "secondary" : "primary"
                      }
                      disabled={
                        busy || checkReport?.phase === "checking" || !state
                      }
                      onClick={checkExercise}
                    >
                      {checkReport?.phase === "checking" ? (
                        <LoaderCircle size={16} className="spin" />
                      ) : (
                        <CheckCircle2 size={16} />
                      )}
                      检查练习结果
                    </button>
                    {state?.complete && !dirty && (
                      <button
                        className="primary next-lesson"
                        disabled={busy}
                        onClick={goNext}
                        aria-label={nextLabel}
                        title={nextLabel}
                      >
                        下一关 <ArrowRight size={16} />
                      </button>
                    )}
                  </div>
                  {state?.complete && (
                    <div className="success-note">已完成！学习进度已保存。</div>
                  )}
                  {state?.complete && !dirty && (
                    <div className="next-lesson-caption">{nextLabel}</div>
                  )}
                </div>
              </aside>
            </div>
          </main>
        )}
        <footer className="page-footer">
          <span>Git Onboarding</span>
          <span>让理解发生在每一次动手之后。</span>
        </footer>
      </div>
      {checkReport && (
        <CheckResult
          report={checkReport}
          onClose={closeCheck}
          onRetry={checkExercise}
          nextLabel={nextLabel}
          onNext={goNext}
        />
      )}
      {setup && (
        <div className="modal-backdrop">
          <section
            className="modal setup-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="setup-title"
          >
            <button
              className="modal-close"
              disabled={busy}
              onClick={() => setSetup(false)}
              aria-label="关闭初始化窗口"
            >
              <X size={18} />
            </button>
            <div className="setup-icon">
              <Terminal size={28} />
            </div>
            <div className="eyebrow">FIRST-TIME SETUP</div>
            <h2 id="setup-title">
              {runtime?.updateRequired
                ? "更新课程，保留你的练习"
                : "准备你的 Git 练习空间"}
            </h2>
            <p>
              {runtime?.updateRequired
                ? runtime.message
                : "只需初始化一次，之后打开应用就能继续练习。"}
            </p>
            <div className="setup-items">
              <div>
                <CheckCircle2 size={19} />
                <span>
                  应用自带 Git、Bash 和编辑工具
                  <small>无需自行安装 Git 或 Docker</small>
                </span>
              </div>
              <div>
                <ShieldCheck size={19} />
                <span>
                  创建专用 Linux 练习环境
                  <small>不挂载 Windows 文件，不连接外部网络</small>
                </span>
              </div>
              <div>
                <Monitor size={19} />
                <span>
                  首次可能需要管理员授权和重启
                  <small>需要 Windows x64、WSL 2 与硬件虚拟化</small>
                </span>
              </div>
            </div>
            {setupLog && (
              <div className="setup-log" role="status">
                {setupLog}
              </div>
            )}
            {error && (
              <div className="setup-log setup-error" role="alert">
                {error}
              </div>
            )}
            {runtime?.preview && (
              <div className="setup-log">
                这是浏览器界面预览。真实终端与初始化功能需要通过 Windows
                桌面应用打开。
              </div>
            )}
            <button
              className="primary"
              disabled={busy || runtime?.preview}
              onClick={initialize}
            >
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Download size={17} />
              )}
              {busy
                ? "正在初始化…"
                : runtime?.restartRequired
                  ? "重启后继续检查"
                  : runtime?.updateRequired
                    ? "保留练习并更新"
                    : "初始化练习环境"}
            </button>
            <small className="setup-foot">
              练习终端以普通用户运行。首次安装系统组件可能需要联网。
            </small>
          </section>
        </div>
      )}
      {confirmation && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true">
            <h2>{confirmation.title}</h2>
            <p>{confirmation.body}</p>
            <div className="modal-actions">
              <button
                className="secondary"
                onClick={() => setConfirmation(null)}
              >
                取消
              </button>
              <button
                className="danger-button"
                onClick={() => {
                  const action = confirmation.action;
                  setConfirmation(null);
                  action();
                }}
              >
                {confirmation.label}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
export default App;
