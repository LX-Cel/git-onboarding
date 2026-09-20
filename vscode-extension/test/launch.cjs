"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { runTests } = require("@vscode/test-electron");
const { Runtime, findPython } = require("../src/runtime.cjs");

async function main() {
  if (process.platform !== "win32")
    throw new Error("The native integration suite requires Windows.");
  const extensionPath = path.resolve(__dirname, "..");
  execFileSync(
    process.execPath,
    [path.join(extensionPath, "scripts", "prepare.cjs")],
    { stdio: "inherit", windowsHide: true },
  );
  const temporary = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "git-onboarding-vscode-test-")),
  );
  const root = path.join(temporary, "labs");
  const userData = path.join(temporary, "user-data");
  const extensions = path.join(temporary, "extensions");
  const python = await findPython(process.env.GIT_ONBOARDING_TEST_PYTHON || "");
  const git =
    process.env.GIT_ONBOARDING_TEST_GIT ||
    execFileSync("where.exe", ["git"], { encoding: "utf8", windowsHide: true })
      .trim()
      .split(/\r?\n/)[0];
  fs.mkdirSync(path.join(userData, "User"), { recursive: true });
  fs.mkdirSync(extensions);
  fs.writeFileSync(
    path.join(userData, "User", "settings.json"),
    JSON.stringify(
      {
        "git.path": git,
        "gitOnboarding.pythonPath": python,
        "git.autofetch": false,
        "git.confirmSync": false,
        "git.enableSmartCommit": false,
        "git.branchProtection": [],
        "git.openRepositoryInParentFolders": "never",
        "git.showProgress": false,
        "files.autoSave": "off",
        "workbench.startupEditor": "none",
        "telemetry.telemetryLevel": "off",
        "update.mode": "none",
        "extensions.autoUpdate": false,
      },
      null,
      2,
    ),
  );
  const runtime = new Runtime({ python, git, root, extensionPath });
  let initial;
  try {
    initial = await runtime.request({
      action: "init",
      lesson: "basics",
      mode: "guided",
    });
  } finally {
    runtime.dispose();
  }
  console.log(`Isolated VS Code test artifacts: ${temporary}`);
  await runTests({
    vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH || undefined,
    extensionDevelopmentPath: extensionPath,
    extensionTestsPath: path.join(__dirname, "integration.cjs"),
    extensionTestsEnv: {
      GIT_ONBOARDING_VSCODE_TEST_ROOT: root,
      GIT_ONBOARDING_VSCODE_TEST_ARTIFACTS: temporary,
      ELECTRON_RUN_AS_NODE: undefined,
    },
    launchArgs: [
      initial.path,
      "--new-window",
      `--user-data-dir=${userData}`,
      `--extensions-dir=${extensions}`,
      "--disable-extensions",
      "--disable-gpu",
      "--skip-welcome",
      "--skip-release-notes",
    ],
  });
  console.log(
    `Integration evidence: ${path.join(temporary, "integration-results.json")}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
