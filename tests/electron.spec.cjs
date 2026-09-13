const { test, expect, _electron: electron } = require("@playwright/test");
const path = require("node:path");
const fs = require("node:fs/promises");

async function terminalCommand(page, command) {
  await expect(page.locator(".terminal-panel")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  const status = await page.evaluate(
    (value) =>
      new Promise((resolve, reject) => {
        let buffer = "";
        let timeout;
        const off = window.gitLab.onData((data) => {
          buffer += new TextDecoder().decode(
            Uint8Array.from(atob(data), (c) => c.charCodeAt(0)),
          );
          const match = /\x1b\]133;D;(\d+)\x07/.exec(buffer);
          if (match) {
            clearTimeout(timeout);
            off();
            resolve({ code: Number(match[1]), output: buffer });
          }
        });
        timeout = setTimeout(() => {
          off();
          reject(new Error("Terminal did not return a prompt"));
        }, 15000);
        window.gitLab.input(value + "\r");
      }),
    command,
  );
  expect(status.code, status.output).toBe(0);
}

test("submodule initialization and parent gitlink update through desktop", async () => {
  const env = {
    ...process.env,
    GIT_ONBOARDING_DATA_DIR: path.resolve(
      process.env.GIT_ONBOARDING_TEST_DATA_DIR || ".local/ui-after-wsl-restart",
    ),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: process.env.GIT_ONBOARDING_EXECUTABLE,
    args: process.env.GIT_ONBOARDING_EXECUTABLE ? [] : ["."],
    cwd: path.resolve("."),
    env,
  });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await expect(page.locator(".local-status")).toContainText(
      "本地练习环境已就绪",
    );
    await page.getByRole("combobox", { name: "显示比例" }).selectOption("1");
    await page.getByRole("searchbox", { name: "查找练习" }).fill("submodule");
    const card = page
      .locator(".course-card")
      .filter({ hasText: "初始化并升级子模块版本" });
    await card.getByRole("button").first().click();
    await expect(
      page.getByRole("textbox", { name: "文件内容" }),
    ).toBeEditable();
    await page.getByRole("button", { name: "重新开始", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "重新开始", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "检查练习结果", exact: true }),
    ).toBeEnabled();
    await terminalCommand(
      page,
      "git -c protocol.file.allow=always submodule update --init --recursive && git -C vendor/library fetch origin && git -C vendor/library checkout origin/main",
    );
    await page
      .getByRole("button", { name: "检查练习结果", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("3 / 5 条件通过");
    await expect(page.getByRole("dialog")).toContainText(
      "父仓库提交了正确的 gitlink",
    );
    await page.getByRole("button", { name: "返回练习", exact: true }).click();
    await terminalCommand(
      page,
      'git add vendor/library && git commit -m "upgrade library"',
    );
    await page
      .getByRole("button", { name: "检查练习结果", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("本关已完成");
    await page.getByRole("button", { name: "关闭检查结果" }).click();
    await expect(
      page.locator('option[value="vendor/library/version.txt"]'),
    ).toHaveCount(1);
    await page
      .getByRole("combobox", { name: "选择练习文件" })
      .selectOption("vendor/library/version.txt");
    await expect(page.getByRole("textbox", { name: "文件内容" })).toHaveValue(
      "version=ready\n",
    );
    await page.screenshot({
      path: "test-results/submodule.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test("maintenance catalog, partial staging and editable ignore rules", async () => {
  const env = {
    ...process.env,
    GIT_ONBOARDING_DATA_DIR: path.resolve(
      process.env.GIT_ONBOARDING_TEST_DATA_DIR || ".local/ui-after-wsl-restart",
    ),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: process.env.GIT_ONBOARDING_EXECUTABLE,
    args: process.env.GIT_ONBOARDING_EXECUTABLE ? [] : ["."],
    cwd: path.resolve("."),
    env,
  });
  try {
    const page = await app.firstWindow();
    await expect(page.locator(".local-status")).toContainText(
      "本地练习环境已就绪",
    );
    await page.getByRole("combobox", { name: "显示比例" }).selectOption("1");
    await page
      .getByRole("combobox", { name: "课程分类" })
      .selectOption("仓库维护");
    await expect(
      page.locator(".course-card").filter({ hasText: "同时保留两套工作现场" }),
    ).toBeVisible();
    await expect(
      page
        .locator(".course-card")
        .filter({ hasText: "初始化并升级子模块版本" }),
    ).toBeVisible();
    await page.getByRole("searchbox", { name: "查找练习" }).fill("worktree");
    await expect(page.locator(".course-card")).toHaveCount(1);
    await page.getByRole("combobox", { name: "课程分类" }).selectOption("全部");
    await page.getByRole("searchbox", { name: "查找练习" }).fill("add -p");
    await page.locator(".course-card button").first().click();
    await expect(
      page.getByRole("textbox", { name: "文件内容" }),
    ).toBeEditable();
    async function reset() {
      await page.getByRole("button", { name: "重新开始", exact: true }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "重新开始", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "检查练习结果", exact: true }),
      ).toBeEnabled();
    }
    await reset();
    await expect(page.getByRole("textbox", { name: "文件内容" })).toHaveValue(
      /theme=dark/,
    );
    await terminalCommand(page, 'printf "y\\nn\\n" | git add -p settings.ini');
    await terminalCommand(page, 'git commit -m "feature only"');
    await page
      .getByRole("button", { name: "检查练习结果", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("本关已完成");
    await page.getByRole("button", { name: "关闭检查结果" }).click();
    await page.getByRole("button", { name: "仓库状态", exact: true }).click();
    await expect(page.locator(".state-zone").first()).toContainText(
      "settings.ini",
    );
    expect(
      await page
        .locator(".unit-nav button")
        .evaluateAll((buttons) =>
          buttons.every(
            (button) => button.scrollHeight <= button.clientHeight + 1,
          ),
        ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/partial-stage.png",
      fullPage: true,
    });
    await page
      .locator(".unit-nav button")
      .filter({ hasText: "停止跟踪日志但保留本地文件" })
      .click();
    await reset();
    const editor = page.getByRole("textbox", { name: "文件内容" });
    await expect(editor).toHaveValue("# 项目忽略规则\n");
    await editor.fill("*.log\ncache/\n");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.locator(".feedback-bar")).toContainText(
      "文件已保存到真实工作区",
    );
    await expect(
      page.getByRole("button", { name: "保存", exact: true }),
    ).toBeDisabled();
    await terminalCommand(
      page,
      'git rm --cached build.log && git rm -r --cached cache && git add .gitignore && git commit -m "untrack build artifacts"',
    );
    await page
      .getByRole("button", { name: "检查练习结果", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("本关已完成");
    await page.getByRole("button", { name: "关闭检查结果" }).click();
    await expect(editor).toHaveValue("*.log\ncache/\n");
  } finally {
    await app.close();
  }
});

test("advanced catalog and offline fork PR lifecycle through desktop", async () => {
  const env = {
    ...process.env,
    GIT_ONBOARDING_DATA_DIR: path.resolve(
      process.env.GIT_ONBOARDING_TEST_DATA_DIR || ".local/ui-after-wsl-restart",
    ),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: process.env.GIT_ONBOARDING_EXECUTABLE,
    args: process.env.GIT_ONBOARDING_EXECUTABLE ? [] : ["."],
    cwd: path.resolve("."),
    env,
  });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await expect(page.locator(".local-status")).toContainText(
      "本地练习环境已就绪",
    );
    await page.getByRole("combobox", { name: "显示比例" }).selectOption("1");
    await page.getByRole("searchbox", { name: "查找练习" }).fill("rebase");
    await expect(
      page.locator(".course-card").filter({ hasText: "用 rebase 跟上主线" }),
    ).toBeVisible();
    await expect(
      page
        .locator(".course-card")
        .filter({ hasText: "把堆叠分支移到正确基线" }),
    ).toBeVisible();
    await page.getByRole("searchbox", { name: "查找练习" }).fill("无匹配场景");
    await expect(
      page.getByText("没有匹配的练习", { exact: false }),
    ).toBeVisible();
    await page.getByRole("searchbox", { name: "查找练习" }).fill("upstream");
    const forkCard = page
      .locator(".course-card")
      .filter({ hasText: "从 Fork 到上游合并 PR" });
    await expect(forkCard).toBeVisible();
    await expect(forkCard.getByRole("button").first()).toBeEnabled();
    await forkCard.getByRole("button").first().click();
    await expect(
      page.getByRole("textbox", { name: "文件内容" }),
    ).toBeEditable();
    await page.getByRole("button", { name: "重新开始", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "重新开始", exact: true })
      .click();
    await page.getByRole("button", { name: "托管练习", exact: true }).click();
    await page.getByRole("button", { name: "Fork 上游仓库" }).click();
    await expect(page.getByRole("textbox", { name: "PR 标题" })).toBeVisible();
    await page.evaluate(() => {
      window.promptResults = [];
      let buffer = "";
      window.gitLab.onData((data) => {
        buffer += new TextDecoder().decode(
          Uint8Array.from(atob(data), (c) => c.charCodeAt(0)),
        );
        const pattern = /\x1b\]133;D;(\d+)\x07/g;
        let match,
          consumed = 0;
        while ((match = pattern.exec(buffer))) {
          window.promptResults.push(Number(match[1]));
          consumed = pattern.lastIndex;
        }
        buffer = buffer.slice(consumed).slice(-512);
      });
    });
    async function command(value) {
      await page.evaluate((command) => {
        window.promptResults = [];
        window.gitLab.input(command + "\r");
      }, value);
      await expect
        .poll(() => page.evaluate(() => window.promptResults.length))
        .toBeGreaterThan(0);
      expect(await page.evaluate(() => window.promptResults.at(-1))).toBe(0);
    }
    await command(
      "git remote add origin ../origin.git && git remote add upstream ../upstream.git && git fetch upstream && git merge --ff-only upstream/main && git switch -c feature/welcome",
    );
    await command(
      'printf "ready\\n" > feature.txt && git add feature.txt && git commit -m "contribution" && git push -u origin feature/welcome',
    );
    await page
      .getByRole("textbox", { name: "PR 标题" })
      .fill("贡献功能并补充测试");
    await page.getByRole("button", { name: "创建 PR", exact: true }).click();
    await page.getByRole("button", { name: "请求评审" }).click();
    await expect(page.locator(".hosting-status")).toContainText("请求修改");
    await expect(
      page.getByRole("button", { name: "合并 PR", exact: true }),
    ).toBeDisabled();
    await command(
      'printf "tests=pass\\n" > tests.txt && git add tests.txt && git commit -m "review update" && git push origin feature/welcome',
    );
    await page.getByRole("button", { name: "请求评审" }).click();
    await expect(page.locator(".hosting-status")).toContainText("评审通过");
    await page.getByRole("button", { name: "合并 PR", exact: true }).click();
    await expect(page.locator(".hosting-status")).toContainText("已合并");
    await command(
      "git switch main && git fetch upstream && git merge --ff-only upstream/main && git push origin main",
    );
    await page
      .getByRole("button", { name: "检查练习结果", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("本关已完成");
    await page.getByRole("button", { name: "关闭检查结果" }).click();
    await expect(page.getByRole("textbox", { name: "文件内容" })).toHaveValue(
      "ready\n",
    );
    await page.screenshot({ path: "test-results/fork-pr.png", fullPage: true });
    await page.getByRole("button", { name: "仓库状态", exact: true }).click();
    await expect(page.locator(".state-content")).toContainText("upstream");
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test("Windows desktop: initialize, learn, edit, commit, reset confirmation and resume", async () => {
  const manifest = JSON.parse(
    await fs.readFile(path.resolve("resources/runtime-manifest.json"), "utf8"),
  );
  const env = {
    ...process.env,
    GIT_ONBOARDING_DATA_DIR: process.env.GIT_ONBOARDING_TEST_DATA_DIR
      ? path.resolve(process.env.GIT_ONBOARDING_TEST_DATA_DIR)
      : path.resolve(
          process.env.GIT_ONBOARDING_EXECUTABLE
            ? ".local/installed user's data"
            : ".local/ui-data",
          manifest.sha256.slice(0, 12),
        ),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () =>
    electron.launch({
      executablePath: process.env.GIT_ONBOARDING_EXECUTABLE,
      args: process.env.GIT_ONBOARDING_EXECUTABLE ? [] : ["."],
      cwd: path.resolve("."),
      env,
    });
  let app = await launch();
  let page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(
    page.getByRole("heading", { name: "把 Git，练成你的日常。" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /开始练习|准备练习环境/ }),
  ).toBeEnabled({ timeout: 30000 });
  await page.getByRole("combobox", { name: "显示比例" }).selectOption("1");
  await fs.mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/home.png", fullPage: true });
  await page.getByRole("button", { name: /开始练习|准备练习环境/ }).click();
  if (await page.getByRole("dialog").isVisible()) {
    await page
      .getByRole("button", { name: "初始化练习环境", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 60000 });
    await page.getByRole("button", { name: "开始练习", exact: true }).click();
  }
  // Resume may open any unfinished lesson in a reused test environment.
  await expect(page.getByRole("textbox", { name: "文件内容" })).toBeEditable();
  await page.locator(".unit-nav button").first().click();
  await expect(
    page.getByRole("heading", { name: "你的第一次提交", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "文件内容" })).toBeEditable();
  // Always construct a known scenario through the public UI and its reset confirmation.
  await page.getByRole("button", { name: "重新开始", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "重新开始", exact: true })
    .click();
  const editor = page.getByRole("textbox", { name: "文件内容" });
  await expect(page.locator(".story")).toHaveCSS("font-size", "16px");
  await expect(editor).toHaveCSS("font-size", "16px");
  await expect(editor).toBeEditable();
  await expect(editor).toHaveValue(/学习从这里开始/);
  await page.getByRole("button", { name: "检查练习结果", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("还差一步");
  await expect(page.getByRole("dialog")).toContainText("README 修改已进入提交");
  await page.getByRole("button", { name: "返回练习", exact: true }).click();
  await editor.fill("# Git 学习手册\n\n今天天气不错。今天晚餐吃了什么？\n");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.getByText("文件已保存到真实工作区。保存文件不会自动暂存或提交。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "仓库状态", exact: true }).click();
  await expect(page.locator(".state-zone").first()).toContainText("README.md");
  await page.getByRole("button", { name: "本次任务", exact: true }).click();
  await page.screenshot({ path: "test-results/workbench.png", fullPage: true });
  await page.locator(".xterm-helper-textarea").focus();
  await page.keyboard.type("git definitely-not-a-command");
  await page.keyboard.press("Enter");
  await expect(page.locator(".feedback-bar")).toContainText(
    "上一条命令未成功完成",
  );
  await page.keyboard.type(
    'git add README.md && git commit -m "UI integration commit"',
    { delay: 5 },
  );
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("已完成！学习进度已保存。", { exact: false }),
  ).toBeVisible({ timeout: 20000 });
  // A manual check must acknowledge the click, even after automatic completion.
  for (let attempt = 0; attempt < 2; attempt++) {
    await page
      .getByRole("button", { name: "检查练习结果", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("本关已完成");
    await expect(page.getByRole("dialog")).toContainText("2 / 2 条件通过");
    await expect(
      page.getByRole("dialog").getByRole("button", { name: "进入独立挑战" }),
    ).toBeVisible();
    if (attempt === 0)
      await page.screenshot({ path: "test-results/check-result.png" });
    await page.getByRole("button", { name: "关闭检查结果" }).click();
  }
  await page.getByRole("button", { name: "提交图", exact: true }).click();
  await expect(page.locator(".commit-subject").first()).toHaveText(
    "UI integration commit",
  );
  await page.screenshot({ path: "test-results/commit.png", fullPage: true });
  await page.getByRole("button", { name: "重新开始", exact: true }).click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.locator(".commit-subject").first()).toHaveText(
    "UI integration commit",
  );
  // Dirty editor changes require a deliberate decision before switching lessons.
  await editor.fill("尚未保存的内容");
  await page.getByRole("button", { name: "检查练习结果", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("编辑器还有未保存内容");
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "进入独立挑战" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "返回练习", exact: true }).click();
  await page.getByRole("button", { name: "独立挑战", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "放弃尚未保存的编辑？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(editor).toHaveValue("尚未保存的内容");
  await editor.fill("# Git 学习手册\n\n今天天气不错。今天晚餐吃了什么？\n");
  await page.getByRole("combobox", { name: "显示比例" }).selectOption("1.25");
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.getZoomFactor(),
      ),
    )
    .toBe(1.25);
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await expect(page.getByRole("combobox", { name: "显示比例" })).toHaveValue(
    "1.25",
  );
  await page.getByRole("combobox", { name: "显示比例" }).selectOption("1");
  await expect(
    page.getByRole("button", { name: "开始练习", exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  await page
    .getByRole("button", { name: "再次带练", exact: true })
    .first()
    .click();
  await expect(page.getByRole("textbox", { name: "文件内容" })).toHaveValue(
    /今天天气不错/,
  );
  await expect(
    page.getByText("已完成！学习进度已保存。", { exact: false }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "显示比例" }).selectOption("2");
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.getZoomFactor(),
      ),
    )
    .toBe(2);
  await expect(
    page.getByRole("button", { name: "检查练习结果" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
  // CDP screenshots crop Electron's zoomed viewport; capture at native pixels.
  const largeText = await app.evaluate(async ({ BrowserWindow }) =>
    (
      await BrowserWindow.getAllWindows()[0].webContents.capturePage()
    ).toDataURL(),
  );
  await fs.writeFile(
    "test-results/large-text.png",
    Buffer.from(largeText.split(",")[1], "base64"),
  );
  await page.getByRole("combobox", { name: "显示比例" }).selectOption("1");
  // The Fluent inspector must reflow without covering the real editor or terminal.
  for (const [width, height] of [
    [1536, 1000],
    [1280, 800],
    [1080, 720],
  ]) {
    await app.evaluate(
      ({ BrowserWindow }, size) => {
        BrowserWindow.getAllWindows()[0].setSize(...size);
      },
      [width, height],
    );
    await expect
      .poll(() =>
        page.evaluate(() => {
          const editor = document
            .querySelector(".editor-panel")
            .getBoundingClientRect();
          const terminal = document
            .querySelector(".terminal-panel")
            .getBoundingClientRect();
          const inspector = document
            .querySelector(".task-panel")
            .getBoundingClientRect();
          return (
            document.documentElement.scrollWidth <= innerWidth + 1 &&
            terminal.width > 300 &&
            terminal.height >= 230 &&
            terminal.top >= editor.bottom &&
            (inspector.left >= editor.right || inspector.top >= terminal.bottom)
          );
        }),
      )
      .toBe(true);
  }
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1536, 1000),
  );
  // Completed guided and challenge checks must both offer a working next step.
  await page.getByRole("button", { name: "检查练习结果", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "进入独立挑战", exact: true })
    .click();
  await expect(page.locator(".mode-switch button.active")).toHaveText(
    "独立挑战",
  );
  await expect(page.getByRole("textbox", { name: "文件内容" })).toBeEditable();
  await page.getByRole("button", { name: "重新开始", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "重新开始", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "文件内容" })).toHaveValue(
    /学习从这里开始/,
  );
  await page
    .getByRole("textbox", { name: "文件内容" })
    .fill("# Git 学习手册\n\n独立挑战记录。\n");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "保存", exact: true }),
  ).toBeDisabled();
  await page.locator(".xterm-helper-textarea").focus();
  await expect(page.locator(".terminal-panel")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.locator(".xterm-helper-textarea").focus();
  await page.keyboard.type(
    'git add README.md && git commit -m "challenge result test"',
    { delay: 5 },
  );
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("已完成！学习进度已保存。", { exact: false }),
  ).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "本次任务", exact: true }).click();
  await page.screenshot({
    path: "test-results/fluent-challenge.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "检查练习结果", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("本关已完成");
  await page.getByRole("button", { name: "关闭检查结果" }).click();
  // The J design's inline next action must work as well as the modal action.
  await page
    .locator(".task-footer")
    .getByRole("button", { name: "下一关：和队友一起开发" })
    .click();
  await expect(
    page.getByRole("heading", { name: "和队友一起开发", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await app.close();
});
