const { test, expect, _electron: electron } = require("@playwright/test");
const path = require("node:path");
const fs = require("node:fs/promises");

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
  await expect(
    page.getByRole("heading", { name: "你的第一次提交", exact: true }),
  ).toBeVisible();
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
  await editor.fill("# Git 学习手册\n\n今天天气不错。今天晚餐吃了什么？\n");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.getByText("文件已保存到真实工作区。保存文件不会自动暂存或提交。"),
  ).toBeVisible();
  await expect(page.locator(".state-zone").first()).toContainText("README.md");
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
  expect(errors).toEqual([]);
  await app.close();
});
