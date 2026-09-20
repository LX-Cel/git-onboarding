const { execFile, spawn } = require("node:child_process");
const path = require("node:path");

function exec(executable, args) {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      args,
      {
        windowsHide: true,
        timeout: 12000,
        maxBuffer: 1024 * 1024,
        encoding: "utf8",
      },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout.trim());
      },
    );
  });
}

async function findPython(configured = "") {
  const candidates = configured
    ? [[configured, []]]
    : [
        ["py", ["-3"]],
        ["python", []],
        ["python3", []],
      ];
  for (const [executable, args] of candidates) {
    try {
      const value = JSON.parse(
        await exec(executable, [
          ...args,
          "-X",
          "utf8",
          "-c",
          'import json,sys;print(json.dumps({"path":sys.executable,"version":list(sys.version_info[:3])}))',
        ]),
      );
      if (value.version[0] === 3 && value.version[1] >= 11) return value.path;
    } catch {
      /* Try the next known interpreter; no shell is involved. */
    }
  }
  throw new Error(
    "需要 Python 3.11 或更高版本。安装后重试，或在设置中填写 Git Onboarding: Python Path。",
  );
}

class Runtime {
  constructor({ python, git, root, extensionPath }) {
    this.python = python;
    this.git = git;
    this.root = root;
    this.entry = path.join(extensionPath, "runtime", "native.py");
    this.pending = Promise.resolve();
    this.children = new Set();
    this.disposed = false;
  }
  request(request) {
    const operation = this.pending.then(() => this.run(request));
    this.pending = operation.catch(() => {});
    return operation;
  }
  run(request) {
    if (this.disposed) return Promise.reject(new Error("练习环境已关闭。"));
    return new Promise((resolve, reject) => {
      const child = spawn(
        this.python,
        ["-X", "utf8", this.entry, "--root", this.root, "--git", this.git],
        {
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
        },
      );
      this.children.add(child);
      let stdout = "",
        stderr = "",
        done = false;
      const finish = (error, value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.children.delete(child);
        if (error) reject(error);
        else resolve(value);
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(new Error("检查超时。请等待 Git 操作结束后重试。"));
      }, 60000);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (data) => {
        stdout += data;
        if (stdout.length > 4 * 1024 * 1024) {
          child.kill();
          finish(new Error("课程引擎返回的数据过大。"));
        }
      });
      child.stderr.on("data", (data) => {
        stderr = (stderr + data).slice(-4000);
      });
      child.on("error", (error) => finish(error));
      child.stdin.on("error", () => {});
      child.on("close", (code) => {
        try {
          const message = JSON.parse(stdout);
          if (!message.ok || code !== 0)
            finish(
              new Error(message.error || stderr || `课程引擎退出：${code}`),
            );
          else finish(null, message.result);
        } catch {
          finish(new Error(stderr || "课程引擎未返回有效结果。"));
        }
      });
      child.stdin.end(JSON.stringify(request));
    });
  }
  dispose() {
    this.disposed = true;
    for (const child of this.children) child.kill();
  }
}

module.exports = { Runtime, findPython };
