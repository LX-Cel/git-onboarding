const { test, expect, _electron: electron } = require("@playwright/test");
const path = require("node:path");
const fs = require("node:fs/promises");

test("Windows desktop: initialize, learn, edit, commit, reset confirmation and resume", async () => {
  const manifest = JSON.parse(
    await fs.readFile(path.resolve("resources/runtime-manifest.json"), "utf8"),
  );
  const env = {
    ...process.env,
    GIT_ONBOARDING_DATA_DIR: path.resolve(
      ".local/ui-data",
      manifest.sha256.slice(0, 12),
    ),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () =>
    electron.launch({ args: ["."], cwd: path.resolve("."), env });
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
  await expect(editor).toBeEditable();
  await expect(editor).toHaveValue(/学习从这里开始/);
  await editor.fill("# Git 学习手册\n\n今天完成了第一次 Git 提交。\n");
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
  await editor.fill("# Git 学习手册\n\n今天完成了第一次 Git 提交。\n");
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await expect(
    page.getByRole("button", { name: "开始练习", exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  await page
    .getByRole("button", { name: "再次带练", exact: true })
    .first()
    .click();
  await expect(page.getByRole("textbox", { name: "文件内容" })).toHaveValue(
    /今天完成了第一次 Git 提交/,
  );
  await expect(
    page.getByText("已完成！学习进度已保存。", { exact: false }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await app.close();
});
