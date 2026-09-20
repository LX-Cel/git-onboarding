// Packaged VSIX smoke test in an isolated VS Code profile. Uses the repository's Playwright dependency.
const { _electron: electron, expect } = require("@playwright/test");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { findPython } = require("../src/runtime.cjs");

async function main() {
  const executablePath = process.env.VSCODE_EXECUTABLE_PATH;
  if (!executablePath)
    throw new Error(
      "Set VSCODE_EXECUTABLE_PATH to an independent VS Code test installation.",
    );
  const root = path.resolve(__dirname, "../..");
  const output = path.join(root, ".local", `vscode-ui-${Date.now()}`);
  const userData = path.join(output, "user-data");
  const extensions = path.join(output, "extensions");
  fs.mkdirSync(path.join(userData, "User"), { recursive: true });
  fs.mkdirSync(extensions);
  const python = await findPython();
  const git = execFileSync("where.exe", ["git"], {
    encoding: "utf8",
    windowsHide: true,
  })
    .trim()
    .split(/\r?\n/)[0];
  fs.writeFileSync(
    path.join(userData, "User", "settings.json"),
    JSON.stringify({
      "git.path": git,
      "gitOnboarding.pythonPath": python,
      "workbench.startupEditor": "none",
      "workbench.colorTheme": "Default Dark Modern",
      "window.zoomLevel": 0,
      "telemetry.telemetryLevel": "off",
      "update.mode": "none",
      "extensions.autoUpdate": false,
      "git.autofetch": false,
      "git.enableSmartCommit": false,
      "git.branchProtection": [],
      "git.confirmSync": false,
      "chat.disableAIFeatures": true,
      "workbench.secondarySideBar.defaultVisibility": "hidden",
    }),
  );
  const codeRoot = path.dirname(executablePath);
  const cliRelative = /%~dp0\.\.\\([^\"]+cli\.js)/.exec(
    fs.readFileSync(path.join(codeRoot, "bin/code.cmd"), "utf8"),
  )?.[1];
  if (!cliRelative)
    throw new Error("Unable to locate VS Code CLI in this test installation.");
  execFileSync(
    executablePath,
    [
      path.join(codeRoot, cliRelative),
      "--user-data-dir",
      userData,
      "--extensions-dir",
      extensions,
      "--install-extension",
      path.join(
        root,
        `release/git-onboarding-vscode-${require("../package.json").version}.vsix`,
      ),
      "--force",
    ],
    {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      windowsHide: true,
      stdio: "inherit",
      timeout: 60000,
    },
  );
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath,
    args: [
      "--user-data-dir",
      userData,
      "--extensions-dir",
      extensions,
      "--new-window",
      "--disable-workspace-trust",
      "--skip-welcome",
      "--skip-release-notes",
    ],
    env,
    timeout: 60000,
  });
  const command = async (page, value) => {
    await (await app.browserWindow(page)).evaluate((window) => window.focus());
    await page.bringToFront();
    await page.keyboard.press("Control+Shift+P");
    const input = page.locator(".quick-input-widget input").first();
    await input.fill(`>${value}`);
    await expect(
      page.locator(".quick-input-list .monaco-list-row").first(),
    ).toContainText(value, { timeout: 30000 });
    await page.keyboard.press("Enter");
    if (
      !value.endsWith("开始 / 继续练习") &&
      value !== "Developer: Reload Window"
    )
      await expect(input).not.toBeVisible();
  };
  const coachFrame = async (page, step) => {
    let found;
    await expect
      .poll(
        async () => {
          for (const frame of page.frames()) {
            const selector =
              step === undefined
                ? "#git-coach"
                : `#git-coach[data-step="${step}"]`;
            if (
              await frame
                .locator(selector)
                .isVisible()
                .catch(() => false)
            ) {
              found = frame;
              return true;
            }
          }
          return false;
        },
        {
          timeout: 60000,
          message: "The visible step-by-step coach must open automatically",
        },
      )
      .toBe(true);
    return found;
  };
  try {
    const first = await app.firstWindow();
    first.setDefaultTimeout(15000);
    await first.waitForSelector(".monaco-workbench", { timeout: 60000 });
    await command(first, "Git Onboarding: 开始 / 继续练习");
    await expect(first.locator(".quick-input-title")).toContainText(
      "选择 Git 练习",
      { timeout: 30000 },
    );
    await first.keyboard.press("Enter");
    await expect(first.locator(".quick-input-title")).toContainText(
      "你的第一次提交",
    );
    const newWindow = app.waitForEvent("window", { timeout: 60000 });
    await first.keyboard.press("Enter");
    const page = await newWindow;
    page.setDefaultTimeout(15000);
    await page.waitForSelector(".monaco-workbench", { timeout: 60000 });
    await expect(
      page.getByText("Git 练习", { exact: true }).first(),
    ).toBeVisible({ timeout: 60000 });
    const labs = path.join(
      userData,
      "User",
      "globalStorage",
      "lx-cel.git-onboarding",
      "labs",
    );
    const repo = path.join(labs, "basics-guided", "workspace");
    let coach = await coachFrame(page, 0);
    await expect(coach.locator("#git-coach")).toHaveAttribute("data-step", "0");
    await expect(coach.locator("#current-step-title")).toContainText("仓库");
    await page.screenshot({
      path: path.join(output, "guided-start.png"),
      fullPage: true,
    });
    await coach.locator('[data-action="next"]').click();
    coach = await coachFrame(page, 1);
    await expect(coach.locator("#git-coach")).toHaveAttribute("data-step", "1");
    await expect(coach.locator("#current-step-title")).toBeInViewport({
      ratio: 1,
    });
    await coach.locator('[data-action="openFile"]').first().click();
    await expect(
      page.getByRole("tab", { name: /README.md/ }).first(),
    ).toBeVisible();
    await expect(coach.locator("#git-coach")).toBeVisible();
    await expect(page.locator(".statusbar")).not.toContainText("Git 练习 2/2");
    const initialHead = execFileSync(git, ["-C", repo, "rev-parse", "HEAD"], {
      encoding: "utf8",
      windowsHide: true,
    });
    const reloaded = page.waitForEvent("domcontentloaded", { timeout: 60000 });
    await command(page, "Developer: Reload Window");
    await reloaded;
    await page.waitForSelector(".monaco-workbench", { timeout: 60000 });
    coach = await coachFrame(page, 1);
    await expect(coach.locator("#git-coach")).toHaveAttribute("data-step", "1");
    await expect(coach.locator("#current-step-title")).toContainText("保存");
    await expect(
      page.getByRole("tab", { name: /Git 练习 · 分步指引/ }),
    ).toHaveCount(1);
    expect(
      execFileSync(git, ["-C", repo, "rev-parse", "HEAD"], {
        encoding: "utf8",
        windowsHide: true,
      }),
    ).toBe(initialHead);
    await page.screenshot({
      path: path.join(output, "guided-restored.png"),
      fullPage: true,
    });
    await coach.locator('[data-action="sourceControl"]').first().click();
    fs.appendFileSync(
      path.join(repo, "README.md"),
      "\nSource Control UI smoke test.\n",
    );
    const changedFile = page
      .locator(".scm-view .monaco-list-row")
      .filter({ hasText: "README.md" })
      .first();
    await expect(changedFile).toBeVisible({ timeout: 30000 });
    await changedFile.hover();
    await changedFile.locator(".codicon-add").click();
    const commitInput = page.locator(".scm-editor .monaco-editor").first();
    await expect(commitInput).toBeVisible({ timeout: 30000 });
    await commitInput.click();
    await page.keyboard.insertText("Practice through native Source Control");
    await page.getByRole("button", { name: "Commit", exact: true }).click();
    await expect
      .poll(
        () =>
          execFileSync(git, ["-C", repo, "log", "-1", "--format=%s"], {
            encoding: "utf8",
            windowsHide: true,
          }).trim(),
        { timeout: 30000 },
      )
      .toBe("Practice through native Source Control");
    await expect
      .poll(async () => page.locator(".statusbar").innerText(), {
        timeout: 30000,
      })
      .toContain("Git 练习 2/2");
    await page
      .locator(".statusbar")
      .getByText(/Git 练习 2\/2/)
      .click();
    await expect(
      page.getByRole("tab", { name: /练习检查报告/ }).first(),
    ).toBeVisible({ timeout: 30000 });
    coach = await coachFrame(page);
    await expect(coach.locator("#git-coach")).toBeVisible();
    await page.screenshot({
      path: path.join(output, "native-source-control.png"),
      fullPage: true,
    });
    fs.writeFileSync(
      path.join(output, "result.json"),
      JSON.stringify(
        {
          passed: true,
          version: require("../package.json").version,
          guidance: {
            autoOpened: true,
            manualStepsDoNotPass: true,
            reloadRestoresStep: true,
            visibleBesideFileAndReport: true,
          },
          repo,
          executablePath,
          screenshot: path.join(output, "native-source-control.png"),
        },
        null,
        2,
      ),
    );
    console.log(`PASS packaged VSIX native UI: ${output}`);
  } catch (error) {
    const pages = app.windows();
    const page = pages[pages.length - 1];
    if (page) {
      console.log((await page.locator("body").innerText()).slice(-6500));
      await page
        .screenshot({ path: path.join(output, "failure.png") })
        .catch(() => {});
    }
    throw error;
  } finally {
    // This child is our isolated test application only; kill avoids unsaved-file dialogs.
    app.process().kill();
    await app.close().catch(() => {});
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
