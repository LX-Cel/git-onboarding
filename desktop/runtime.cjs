const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const { APPLY_COURSES } = require("./course-update.cjs");
const COURSE_VERSION = require("../package.json").courseVersion;

const VALID_LESSONS = new Set(
  require("../runtime/lessons.json").map((lesson) => lesson.id),
);
function validateSelection(value) {
  if (
    !value ||
    !VALID_LESSONS.has(value.lesson) ||
    !["guided", "challenge"].includes(value.mode)
  ) {
    throw new Error("无效的练习选择");
  }
  return { lesson: value.lesson, mode: value.mode };
}
function decode(buffer) {
  return buffer.includes(0)
    ? buffer.toString("utf16le").replace(/^\uFEFF/, "")
    : buffer.toString("utf8");
}
function isWslMissing(error) {
  return (
    error.code === "ENOENT" ||
    /WSL_E_WSL_OPTIONAL_COMPONENT_REQUIRED|0x8007019e/i.test(error.message)
  );
}
function run(file, args, { input, timeout = 30000, onOutput } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(file, args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const out = [],
      err = [];
    let bytes = 0,
      failure;
    const timer = setTimeout(() => {
      failure = new Error("操作超时，请重试或重新检查练习环境");
      failure.code = "ETIMEDOUT";
      proc.kill();
    }, timeout);
    const collect = (target) => (data) => {
      bytes += data.length;
      if (bytes > 2 * 1024 * 1024) {
        failure = new Error("运行环境返回内容过多");
        proc.kill();
        return;
      }
      target.push(data);
      onOutput?.(decode(data));
    };
    proc.stdout.on("data", collect(out));
    proc.stderr.on("data", collect(err));
    proc.stdin.on("error", () => {});
    proc.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      const stdout = decode(Buffer.concat(out)),
        stderr = decode(Buffer.concat(err));
      if (failure) reject(failure);
      else if (code !== 0)
        reject(
          new Error((stderr || stdout || `进程退出：${code}`).slice(-3000)),
        );
      else resolve(stdout);
    });
    proc.stdin.end(input);
  });
}

class Runtime {
  constructor(dataDir, resources) {
    this.dataDir = dataDir;
    this.resources = resources;
    this.wsl = path.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "wsl.exe",
    );
    this.ownerFile = path.join(dataDir, "runtime-owner.json");
    this.owner = null;
    this.terminal = null;
    this.initializing = false;
  }
  async registered() {
    return (await run(this.wsl, ["--list", "--quiet"]))
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  async loadOwner() {
    try {
      const owner = JSON.parse(await fs.readFile(this.ownerFile, "utf8"));
      if (
        !/^GitOnboarding-[a-f0-9]{12}$/.test(owner.distro) ||
        owner.directory !== path.join(this.dataDir, "linux")
      ) {
        throw new Error("应用环境记录无效，拒绝操作发行版");
      }
      this.owner = owner;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return this.owner;
  }
  async status() {
    if (process.platform !== "win32" || process.arch !== "x64")
      return {
        ready: false,
        supported: false,
        message: "此版本支持 Windows x64。",
      };
    try {
      await this.loadOwner();
      const names = await this.registered();
      if (this.owner && names.includes(this.owner.distro)) {
        const probe = await this.call({ action: "probe" });
        if (
          probe.uid !== 1000 ||
          probe.windowsMount ||
          probe.interop ||
          probe.initVisible
        ) {
          throw new Error("练习环境隔离检查未通过，已禁止启动终端");
        }
        if (probe.courseVersion !== COURSE_VERSION) {
          return {
            ready: false,
            supported: true,
            wsl: true,
            updateRequired: true,
            message:
              "课程判定有更新。更新只替换课程程序，保留现有提交、文件和学习进度。",
          };
        }
        return {
          ready: true,
          supported: true,
          git: probe.git,
          distro: this.owner.distro,
        };
      }
      return {
        ready: false,
        supported: true,
        wsl: true,
        message: "将导入应用自带的 Linux 练习环境。",
      };
    } catch (error) {
      return {
        ready: false,
        supported: true,
        wsl: !isWslMissing(error),
        message:
          error.code === "ETIMEDOUT"
            ? "WSL 未及时响应。请先保存其他 Linux 工作，再检查 WSL 状态后重试。"
            : error.message,
      };
    }
  }
  async initialize(onOutput = () => {}) {
    if (this.initializing) throw new Error("正在初始化，请稍候");
    this.initializing = true;
    try {
      if (process.platform !== "win32" || process.arch !== "x64")
        throw new Error("首版仅支持 Windows x64");
      try {
        await this.registered();
      } catch (error) {
        // A hung or broken WSL service is not evidence that WSL is absent.
        if (!isWslMissing(error)) throw error;
        onOutput("正在请求管理员权限以安装 WSL。完成后可能需要重启电脑。");
        const script = `Start-Process -FilePath '${this.wsl.replaceAll("'", "''")}' -ArgumentList '--install','--no-distribution' -Verb RunAs -Wait -WindowStyle Hidden`;
        await run(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-EncodedCommand",
            Buffer.from(script, "utf16le").toString("base64"),
          ],
          { timeout: 600000, onOutput },
        );
        return {
          ready: false,
          restartRequired: true,
          message: "系统组件安装完成。请重启电脑后重新打开应用，继续初始化。",
        };
      }
      await fs.mkdir(this.dataDir, { recursive: true });
      await this.loadOwner();
      if (!this.owner) {
        this.owner = {
          distro: "GitOnboarding-" + crypto.randomBytes(6).toString("hex"),
          directory: path.join(this.dataDir, "linux"),
        };
        await fs.writeFile(
          this.ownerFile,
          JSON.stringify(this.owner, null, 2),
          { flag: "wx" },
        );
      }
      const names = await this.registered();
      if (!names.includes(this.owner.distro)) {
        onOutput("正在校验内置环境完整性…");
        const manifest = JSON.parse(
          await fs.readFile(
            path.join(this.resources, "runtime-manifest.json"),
            "utf8",
          ),
        );
        const image = path.join(this.resources, "runtime.tar");
        const hash = crypto.createHash("sha256");
        for await (const chunk of require("node:fs").createReadStream(image))
          hash.update(chunk);
        if (hash.digest("hex") !== manifest.sha256)
          throw new Error("内置环境校验失败，请重新下载安装包");
        onOutput("正在导入独立的 Linux 环境，首次导入可能需要几分钟…");
        await run(
          this.wsl,
          [
            "--import",
            this.owner.distro,
            this.owner.directory,
            image,
            "--version",
            "2",
          ],
          { timeout: 300000, onOutput },
        );
      }
      const beforeUpdate = await this.call({ action: "probe" });
      if (beforeUpdate.courseVersion !== COURSE_VERSION) {
        this.stopTerminal();
        onOutput("正在更新课程判定；现有练习仓库和学习进度会保留…");
        const payload = await fs.readFile(
          path.join(this.resources, "course-update.json"),
          "utf8",
        );
        if (JSON.parse(payload).version !== COURSE_VERSION)
          throw new Error("课程更新版本不匹配");
        await run(
          this.wsl,
          [
            "-d",
            this.owner.distro,
            "-u",
            "root",
            "--exec",
            "/usr/bin/python3",
            "-I",
            "-c",
            APPLY_COURSES,
          ],
          { input: payload },
        );
      }
      const result = await this.status();
      if (!result.ready) throw new Error(result.message || "环境检查失败");
      onOutput("Git、Bash 和隔离检查已通过。可以开始练习。");
      return result;
    } finally {
      this.initializing = false;
    }
  }
  async call(request) {
    if (!this.owner) await this.loadOwner();
    if (!this.owner) throw new Error("请先初始化练习环境");
    if (request.action !== "probe") validateSelection(request);
    const input = JSON.stringify(request);
    if (Buffer.byteLength(input) > 1048576) throw new Error("请求内容过大");
    const output = await run(
      this.wsl,
      [
        "-d",
        this.owner.distro,
        "-u",
        "student",
        "--exec",
        "/opt/git-onboarding/sandbox.sh",
        "python3",
        "/opt/git-onboarding/engine.py",
      ],
      { input, timeout: 25000 },
    );
    const response = JSON.parse(output);
    if (!response.ok) throw new Error(response.error);
    return response.result;
  }
  startTerminal(selection, onData, onExit) {
    validateSelection(selection);
    if (!this.owner) throw new Error("请先初始化环境");
    this.stopTerminal();
    const proc = spawn(
      this.wsl,
      [
        "-d",
        this.owner.distro,
        "-u",
        "student",
        "--exec",
        "python3",
        "/opt/git-onboarding/relay.py",
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    this.terminal = proc;
    let pending = "",
      entered = false;
    const labPath = `/home/student/labs/${selection.lesson}-${selection.mode}/workspace`;
    proc.stdout.on("data", (chunk) => {
      if (this.terminal !== proc) return;
      pending += chunk.toString();
      if (pending.length > 1048576) {
        proc.kill();
        return;
      }
      let end;
      while ((end = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 1);
        try {
          const message = JSON.parse(line);
          if (message.data) {
            onData(message.data);
            if (!entered) {
              entered = true;
              proc.stdin.write(
                JSON.stringify({
                  data: Buffer.from(`cd -- ${labPath}\r`).toString("base64"),
                }) + "\n",
              );
            }
          }
        } catch {
          /* Only JSON from the trusted PTY relay is accepted. */
        }
      }
    });
    proc.stderr.on("data", (chunk) => {
      if (this.terminal !== proc) return;
      const message = decode(chunk);
      // WSL emits an inherited localhost proxy warning; it is irrelevant inside the offline sandbox.
      if (!message.includes("localhost"))
        onData(Buffer.from(message).toString("base64"));
    });
    proc.stdin.on("error", () => {});
    proc.on("error", (error) => {
      if (this.terminal === proc) onExit(error.message);
    });
    proc.on("close", () => {
      if (this.terminal === proc) {
        this.terminal = null;
        onExit("终端已关闭，可以重新连接。");
      }
    });
  }
  terminalInput(data) {
    if (typeof data !== "string" || data.length > 65536)
      throw new Error("终端输入无效");
    this.terminal?.stdin.write(
      JSON.stringify({ data: Buffer.from(data).toString("base64") }) + "\n",
    );
  }
  terminalResize({ cols, rows }) {
    if (
      !Number.isInteger(cols) ||
      !Number.isInteger(rows) ||
      cols < 20 ||
      cols > 400 ||
      rows < 5 ||
      rows > 160
    )
      return;
    this.terminal?.stdin.write(JSON.stringify({ cols, rows }) + "\n");
  }
  stopTerminal() {
    if (this.terminal) {
      const proc = this.terminal;
      this.terminal = null;
      // EOF lets the relay terminate and reap the entire child process group.
      proc.stdin.end();
      const timer = setTimeout(() => proc.kill(), 2000);
      timer.unref();
      proc.once("close", () => clearTimeout(timer));
    }
  }
}
module.exports = { Runtime, run, decode, validateSelection, isWslMissing };
