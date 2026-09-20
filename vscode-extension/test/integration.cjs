"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const vscode = require("vscode");
const { getLesson } = require("../src/content.cjs");
const execFileAsync = promisify(execFile);
const outcomes = [];

async function scenario(name, operation) {
  console.log(`RUN ${name}`);
  const started = Date.now();
  try {
    await operation();
    outcomes.push({ name, passed: true, durationMs: Date.now() - started });
    console.log(`PASS ${name}`);
  } catch (error) {
    outcomes.push({
      name,
      passed: false,
      durationMs: Date.now() - started,
      error: error.stack || error.message,
    });
    throw error;
  }
}

async function edit(file, content, save = true) {
  const document = await vscode.workspace.openTextDocument(
    vscode.Uri.file(file),
  );
  const change = new vscode.WorkspaceEdit();
  change.replace(
    document.uri,
    new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length),
    ),
    content,
  );
  assert.equal(await vscode.workspace.applyEdit(change), true);
  if (save) assert.equal(await document.save(), true);
  return document;
}

async function waitFor(predicate, message, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}

function complete(snapshot, message) {
  assert.equal(snapshot.error, null, JSON.stringify(snapshot));
  assert.equal(
    snapshot.complete,
    true,
    `${message}: ${JSON.stringify(snapshot.checks)}`,
  );
  assert.ok(snapshot.checks.length > 0);
  assert.ok(snapshot.checks.every((check) => check.done === true));
}

exports.run = async function run() {
  const root = process.env.GIT_ONBOARDING_VSCODE_TEST_ROOT;
  const artifacts = process.env.GIT_ONBOARDING_VSCODE_TEST_ARTIFACTS;
  assert.ok(
    root && path.isAbsolute(root),
    "Launcher must provide a dedicated absolute test root.",
  );
  assert.ok(
    artifacts && path.dirname(root) === artifacts,
    "Test output and labs must share the isolated launcher directory.",
  );
  const expected = path.join(root, "basics-guided", "workspace");
  assert.equal(vscode.workspace.workspaceFolders.length, 1);
  assert.equal(
    path.resolve(vscode.workspace.workspaceFolders[0].uri.fsPath).toLowerCase(),
    expected.toLowerCase(),
  );
  const extension = vscode.extensions.getExtension("LX-Cel.git-onboarding");
  assert.ok(extension, "Development extension must be installed.");
  const { lessons } = await extension.activate();
  assert.ok(
    lessons.session,
    `Practice window did not restore: ${lessons.error}`,
  );
  const runtime = await lessons.getRuntime();
  const gitExtension = await vscode.extensions
    .getExtension("vscode.git")
    .activate();
  const git = gitExtension.getAPI(1);
  await waitFor(
    () => git.state === "initialized",
    "Built-in Git API did not initialize.",
  );
  const commitOptions = {
    all: false,
    signCommit: false,
    useEditor: false,
    postCommitCommand: null,
  };
  const state = (lesson, mode) =>
    runtime.request({ action: "state", lesson, mode });
  const repository = async (snapshot) => {
    const repo = await git.openRepository(vscode.Uri.file(snapshot.path));
    assert.ok(repo, `Built-in Source Control did not open ${snapshot.path}`);
    await repo.status();
    return repo;
  };
  try {
    const baseline = await state("basics", "guided");
    const repo = await repository(baseline);
    const readme = path.join(baseline.path, "README.md");

    await scenario(
      "basics-guided: editor, native Source Control add and commit",
      async () => {
        assert.equal(baseline.complete, false);
        await edit(
          readme,
          "# Git 学习手册\n\n通过 VS Code Source Control 完成真实提交。\n",
        );
        assert.equal(
          (await lessons.check()).passed,
          false,
          "Saved but uncommitted edit must not pass.",
        );
        await repo.add([readme]);
        assert.ok(
          repo.state.indexChanges.some(
            (item) => item.uri.fsPath.toLowerCase() === readme.toLowerCase(),
          ),
        );
        assert.equal(
          (await state("basics", "guided")).complete,
          false,
          "Staging alone must not pass.",
        );
        await repo.commit(
          "通过原生 Source Control 提交学习记录",
          commitOptions,
        );
        const checked = await lessons.check();
        assert.equal(checked.passed, true);
        complete(checked.snapshot, "Native commit was not assessed");
        assert.equal(
          lessons.context.globalState.get("passed.basics.guided").head,
          checked.snapshot.head,
        );
        const report = [...lessons.documents.values()].find((text) =>
          text.startsWith("# 检查报告"),
        );
        assert.match(report, /本次检查：全部条件通过/);
      },
    );

    await scenario(
      "unsaved editor buffers block passing even with a complete disk state",
      async () => {
        const saved = await fs.readFile(readme, "utf8");
        const document = await edit(
          readme,
          `${saved}\n这行仍在未保存的编辑器中。\n`,
          false,
        );
        assert.equal(document.isDirty, true);
        const unsaved = await lessons.check();
        assert.equal(unsaved.snapshot.complete, true);
        assert.equal(unsaved.passed, false);
        assert.ok(unsaved.dirtyFiles.includes("README.md"));
        assert.ok(
          [...lessons.documents.values()].some((text) =>
            text.includes("有未保存的编辑器内容"),
          ),
        );
        assert.equal(await document.save(), true);
        assert.equal(
          (await lessons.check()).passed,
          false,
          "Saving does not commit the new text.",
        );
        await repo.add([readme]);
        await repo.commit("保存并提交后续学习记录", commitOptions);
        assert.equal((await lessons.check()).passed, true);
      },
    );

    await scenario(
      "runtime error clears current passing state without erasing historical progress",
      async () => {
        const guard = path.join(
          root,
          ".empty-hooks",
          "integration-test-blocker",
        );
        await fs.writeFile(
          guard,
          "Owned test fixture: engine must reject a nonempty hook directory.\n",
        );
        try {
          const result = await lessons.check();
          assert.equal(result.passed, false);
          assert.equal(result.snapshot, null);
          assert.ok(result.error);
          assert.match(lessons.status.text, /检查失败/);
          const report = [...lessons.documents.values()].find((text) =>
            text.startsWith("# 检查报告"),
          );
          assert.match(report, /未能完成检查/);
          assert.doesNotMatch(report, /本次检查：全部条件通过/);
          assert.ok(lessons.context.globalState.get("passed.basics.guided"));
        } finally {
          await fs.unlink(guard);
        }
        assert.equal((await lessons.check()).passed, true);
      },
    );

    await scenario(
      "basics-challenge: separate workspace and free-form native commit",
      async () => {
        const initial = await lessons.prepareLesson("basics", "challenge");
        assert.notEqual(initial.path, baseline.path);
        assert.equal(initial.complete, false);
        const challengeRepo = await repository(initial);
        const file = path.join(initial.path, "README.md");
        await edit(
          file,
          "# 独立挑战\n\n我能通过暂存和提交保留自己的学习记录。\n",
        );
        await challengeRepo.add([file]);
        await challengeRepo.commit("完成独立挑战", commitOptions);
        complete(
          await state("basics", "challenge"),
          "Challenge native commit failed",
        );
      },
    );

    for (const mode of ["guided", "challenge"]) {
      await scenario(
        `collab-${mode}: native branch, fetch, merge conflict, resolution, main and push`,
        async () => {
          const initial = await lessons.prepareLesson("collab", mode);
          assert.equal(initial.complete, false);
          const collabRepo = await repository(initial);
          const file = path.join(initial.path, "release.txt");
          const lesson = getLesson("collab");
          const target =
            mode === "guided" ? lesson.target : lesson.challengeTarget;
          await collabRepo.createBranch("feature/welcome", true);
          assert.equal(collabRepo.state.HEAD.name, "feature/welcome");
          await edit(file, `${target}\n`);
          await collabRepo.add([file]);
          await collabRepo.commit("在功能分支准备发布", commitOptions);
          await collabRepo.fetch({ remote: "origin" });
          let mergeError;
          try {
            await collabRepo.merge("origin/main");
          } catch (error) {
            mergeError = error;
          }
          await collabRepo.status();
          const conflict = await state("collab", mode);
          assert.ok(
            mergeError || collabRepo.state.mergeChanges.length,
            "Expected a real merge conflict.",
          );
          assert.ok(conflict.conflicts.includes("release.txt"));
          assert.equal(conflict.complete, false);
          // A clean editor may still show its pre-merge version until the file watcher fires.
          await waitFor(async () => {
            const document = await vscode.workspace.openTextDocument(
              vscode.Uri.file(file),
            );
            return document.getText().includes("<<<<<<<");
          }, "Editor did not reflect the merge conflict.");
          await edit(file, `${target}\n`);
          await collabRepo.add([file]);
          await collabRepo.commit(
            "解决发布配置冲突并保留队友历史",
            commitOptions,
          );
          await collabRepo.checkout("main");
          await collabRepo.merge("feature/welcome");
          assert.equal(
            (await state("collab", mode)).complete,
            false,
            "Unpushed result must not pass.",
          );
          await collabRepo.push("origin", "main");
          complete(
            await state("collab", mode),
            "Native collaboration workflow failed",
          );
        },
      );
    }

    for (const mode of ["guided", "challenge"]) {
      await scenario(
        `recovery-${mode}: native discard and unstage with explicit history revert`,
        async () => {
          const initial = await lessons.prepareLesson("recovery", mode);
          assert.equal(initial.complete, false);
          const recoveryRepo = await repository(initial);
          const notes = path.join(initial.path, "notes.txt");
          const draft = path.join(initial.path, "draft.txt");
          const draftText = await fs.readFile(draft, "utf8");
          const badHead = recoveryRepo.state.HEAD.commit;
          await recoveryRepo.clean([notes]);
          await recoveryRepo.revert([draft]);
          assert.equal(await fs.readFile(draft, "utf8"), draftText);
          assert.equal(recoveryRepo.state.indexChanges.length, 0);
          assert.equal(
            (await state("recovery", mode)).complete,
            false,
            "Discard and unstage alone must not repair history.",
          );
          await execFileAsync(
            git.git.path,
            ["-C", initial.path, "revert", "--no-edit", badHead],
            { windowsHide: true, timeout: 20000 },
          );
          await recoveryRepo.status();
          assert.equal(recoveryRepo.state.indexChanges.length, 0);
          assert.ok(
            recoveryRepo.state.workingTreeChanges.some(
              (item) => item.uri.fsPath.toLowerCase() === draft.toLowerCase(),
            ),
          );
          complete(await state("recovery", mode), "Recovery workflow failed");
        },
      );
    }

    await scenario(
      "reopening lesson keeps its history; reset archives existing user work",
      async () => {
        const before = await state("basics", "challenge");
        const reopened = await lessons.prepareLesson("basics", "challenge");
        assert.equal(reopened.head, before.head);
        complete(reopened, "Reopening changed completed lesson");
        const reset = await runtime.request({
          action: "init",
          lesson: "basics",
          mode: "challenge",
          reset: true,
        });
        assert.ok(reset.archivedPath);
        assert.ok(
          path.relative(path.join(root, ".archives"), reset.archivedPath)
            .length > 0,
        );
        const archived = await fs.readFile(
          path.join(reset.archivedPath, "workspace", "README.md"),
          "utf8",
        );
        assert.match(archived, /我能通过暂存和提交保留自己的学习记录/);
        assert.equal(reset.complete, false);
        assert.notEqual(reset.head, before.head);
        complete(
          await state("basics", "guided"),
          "Reset crossed into the other mode",
        );
      },
    );

    await scenario(
      "current practice window can archive and rebuild its open repository",
      async () => {
        const before = await state("basics", "guided");
        complete(before, "Current lesson should be complete before reset");
        const savedReadme = await fs.readFile(readme, "utf8");
        assert.ok(git.getRepository(vscode.Uri.file(expected)));
        const reset = await lessons.archiveAndInitialize("basics", "guided");
        assert.equal(reset.path.toLowerCase(), expected.toLowerCase());
        assert.ok(reset.archivedPath);
        assert.equal(
          await fs.readFile(
            path.join(reset.archivedPath, "workspace", "README.md"),
            "utf8",
          ),
          savedReadme,
        );
        assert.equal(reset.complete, false);
        assert.notEqual(reset.head, before.head);
        await repo.status();
        const checked = await lessons.check();
        assert.equal(checked.passed, false);
        assert.equal(checked.snapshot.complete, false);
        assert.equal(
          lessons.session.path.toLowerCase(),
          expected.toLowerCase(),
        );
        assert.ok(lessons.context.globalState.get("passed.basics.guided"));
      },
    );

    console.log(`${outcomes.length} VS Code integration scenarios passed.`);
  } finally {
    await fs.writeFile(
      path.join(artifacts, "integration-results.json"),
      JSON.stringify(
        {
          testedAt: new Date().toISOString(),
          vscode: vscode.version,
          platform: process.platform,
          gitPath: git.git.path,
          root,
          results: outcomes,
        },
        null,
        2,
      ),
    );
  }
};
