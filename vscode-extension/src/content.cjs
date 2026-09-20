"use strict";

const fs = require("node:fs");
const path = require("node:path");

const supportedIds = ["basics", "collab", "recovery"];
const packagedLessons = path.join(__dirname, "..", "runtime", "lessons.json");
const lessonsPath = fs.existsSync(packagedLessons)
  ? packagedLessons
  : path.join(__dirname, "..", "..", "runtime", "lessons.json");
const lessons = JSON.parse(fs.readFileSync(lessonsPath, "utf8"));

// These adapt interaction instructions only; targets and assessment stay in the shared runtime.
const sourceControlSteps = {
  basics: [
    {
      title: "认识 Source Control 中的仓库",
      body: "按 Ctrl+Shift+G 打开源代码管理（Source Control），确认当前选择的是练习仓库。左下角分支应为 main。展开源代码管理图（Source Control Graph）查看初始提交；若当前版本没有显示图，可使用下方命令查看历史。",
    },
    {
      title: "编辑、保存，再看差异",
      body: "在资源管理器打开 README.md，写下自己的学习记录并按 Ctrl+S 保存。回到源代码管理，在更改（Changes）中点击 README.md 查看差异。此时修改仍在工作区，尚未进入提交。",
    },
    {
      title: "点击 +，暂存这次修改",
      body: "将鼠标移到 README.md 上，点击 +（暂存更改 / Stage Changes）。文件会进入暂存的更改（Staged Changes）。再点击文件，检查这次准备提交的内容。如果需要取消暂存，点击 -（取消暂存 / Unstage Changes）；文件正文会保留。",
    },
    {
      title: "写说明，完成提交并检查",
      body: "在源代码管理的消息框填写提交说明，再点击提交（Commit）。使用普通提交即可。完成后查看提交图，并在 Git 练习视图点击检查练习结果：需要 README 的正文修改已进入提交，且没有剩余未提交修改。",
    },
  ],
  collab: [
    {
      title: "从 main 创建自己的分支",
      body: "点击左下角分支名，选择创建新分支（Create Branch），输入 feature/welcome，从当前 main 开始。也可按 Ctrl+Shift+P 搜索 Git: Create Branch。确认已切换到 feature/welcome，再编辑 release.txt 为上方目标内容，保存、点击 + 暂存并提交。",
    },
    {
      title: "获取队友更新：Fetch",
      body: "在源代码管理的 … 菜单选择获取（Fetch），或通过命令面板运行 Git: Fetch。此时仅更新 origin/main 对远端的记录，当前文件不会自动合并。在提交图中查看本地分支与 origin/main 的分叉。这里的 origin 是本机练习远端，不需要 GitHub 账号。",
    },
    {
      title: "合并 origin/main 并解决冲突",
      body: "保持当前分支为 feature/welcome。按 Ctrl+Shift+P，运行 Git: Merge Branch（合并分支），选择 origin/main。出现冲突是本关的预期情况。在合并更改中打开 release.txt，使用合并编辑器或直接编辑结果，使最终内容与本关目标完全一致，并清除冲突标记。保存后完成合并；若文件尚未暂存，点击 +，再提交此次合并。",
    },
    {
      title: "把成果合并并推送到 main",
      body: "点击左下角分支菜单切回 main，再运行 Git: Merge Branch，选择 feature/welcome。确认 release.txt 为目标内容，随后从 … 菜单选择推送（Push），或运行 Git: Push，把 main 推送到 origin。保留 feature/welcome 分支供本关检查，最后点击检查练习结果。",
    },
  ],
  recovery: [
    {
      title: "区分更改、暂存与历史",
      body: "按 Ctrl+Shift+G 打开源代码管理。在更改（Changes）中查看 notes.txt 的差异，在暂存的更改（Staged Changes）中查看 draft.txt 的差异，再从提交图查看最近一次错误关闭安全模式的提交。先确认每项修改所在的位置。",
    },
    {
      title: "只丢弃 notes.txt 的临时修改",
      body: "在更改中点击 notes.txt，确认显示的临时试验确实不需要保留。只对 notes.txt 选择放弃更改（Discard Changes），并确认对话框；这会丢弃该文件的未提交内容。不要选择放弃所有更改，以免丢失需要保留的 draft.txt。",
    },
    {
      title: "点击 -，取消草稿的暂存",
      body: "在暂存的更改中，将鼠标移到 draft.txt 并点击 -（取消暂存 / Unstage Changes）。确认它回到更改列表，草稿正文仍然存在。本关要求保留这份未提交草稿。",
    },
    {
      title: "用反向提交恢复安全模式",
      body: "打开终端 > 新建终端，确认终端位于当前练习仓库。先运行 git log --oneline 核对错误提交；若它仍是 HEAD，可手动运行下方 git revert --no-edit HEAD。若已产生其他提交，使用核对后的错误提交 ID 代替 HEAD。revert 会新增修正提交并保留原历史，之后检查 config.ini 的 safe_mode=on。draft.txt 留在更改列表是正确结果，无需提交它。",
    },
  ],
};

const sourceControlHints = {
  basics: [
    "先确认 README.md 已保存。Source Control 的更改、暂存的更改和提交历史分别对应三个不同阶段。",
    "点击 README.md 旁的 + 把修改放入暂存区，然后填写消息并点击 Commit。暂存后再次编辑文件，需要重新暂存才能提交新内容。",
    "修改并保存 README.md 正文 → 打开 Source Control 查看差异 → 点击文件旁的 + → 填写提交说明 → 点击 Commit → 检查练习结果。判题看提交中的实际文件内容，提交说明可以自由填写。",
  ],
  collab: [
    "本地功能分支与队友更新都需要保留。先完成自己的提交，再同步队友历史；最终成果应在 main 与练习远端中。",
    "在 feature/welcome 提交后运行 Fetch，再使用 Git: Merge Branch 合并 origin/main。冲突时按本关目标编辑最终文件，保存、暂存并提交。",
    "分支菜单创建 feature/welcome → 编辑 release.txt 为挑战目标并提交 → Fetch → Git: Merge Branch 选择 origin/main → 解决冲突并提交 → 切回 main → Git: Merge Branch 选择 feature/welcome → Push。保留 feature/welcome 分支，随后检查结果。",
  ],
  recovery: [
    "先判断每项问题在工作区、暂存区还是提交历史中。草稿应该保留，不能用一次放弃所有更改处理。",
    "只放弃 notes.txt 的更改；点击 draft.txt 旁的 - 取消暂存；再通过集成终端用 revert 创建修正提交。",
    "检查差异后，只对 notes.txt 选择 Discard Changes → 对 draft.txt 选择 Unstage Changes（-）→ 核对 git log --oneline；若错误提交仍是 HEAD，运行 git revert --no-edit HEAD，否则换成错误提交 ID → 检查结果。不要把 draft.txt 一并提交。",
  ],
};

const reasons = {
  "README 修改已进入提交": [
    "提交中已包含 README 的正文修改，且保留练习初始历史。",
    "请先保存 README.md，点击 + 暂存并提交；只改提交说明或创建空提交无法满足这一条件。",
  ],
  工作区与暂存区干净: [
    "当前没有尚未提交的文件修改。",
    "请在 Source Control 查看更改与暂存的更改，完成需要保留的修改后重新检查。",
  ],
  创建并合并功能分支: [
    "feature/welcome 包含新提交，且其提交已进入 main 的历史。",
    "需要在 feature/welcome 提交成果，并将它合并到 main；请保留该分支供检查。",
  ],
  保留队友提交历史: [
    "main 的历史已包含练习队友的提交。",
    "main 尚未包含队友提交，请 Fetch 并合并 origin/main，解决冲突后再把功能分支合并到 main。",
  ],
  "main 包含正确配置": [
    "main 提交中的 release.txt 与本关目标一致。",
    "请核对本关目标，确认正确的 release.txt 已提交并合并到 main；仅修改编辑器内容还不够。",
  ],
  "练习远端已收到 main": [
    "练习远端 main 已收到本地 main，且提交中的配置符合目标。",
    "确认本地 main 包含正确配置，再使用 Push 将 main 推送到练习远端 origin。",
  ],
  "回到 main 且没有待处理改动": [
    "当前在 main，工作区与暂存区没有待处理改动。",
    "请确认合并已完成、文件已保存并提交，然后通过分支菜单切回 main。",
  ],
  "notes.txt 已恢复且没有额外改动": [
    "notes.txt 已恢复为要求保留的笔记正文。",
    "请核对 notes.txt 的差异，只放弃它的临时修改，恢复原来的笔记。",
  ],
  草稿修改保留在工作区: [
    "draft.txt 的草稿修改仍在工作区，尚未写入提交。",
    "请保留 draft.txt 的练习草稿，不要丢弃它或把它提交到历史中。",
  ],
  暂存区已清空: [
    "当前暂存区没有文件改动。",
    "请在暂存的更改中使用 - 取消暂存，保留工作区文件内容。",
  ],
  新提交恢复安全模式并保留旧历史: [
    "新的后续提交已恢复 safe_mode=on，错误提交仍保留在历史中。",
    "请先清空暂存区，再核对并 revert 错误提交，让修正进入新提交；只编辑 config.ini 尚未完成。",
  ],
};

function getLesson(id) {
  if (!supportedIds.includes(id)) throw new Error(`暂不支持此练习：${id}`);
  const spec = lessons.find((lesson) => lesson.id === id);
  if (!spec) throw new Error(`课程资料缺失：${id}`);
  const lesson = JSON.parse(JSON.stringify(spec));
  lesson.steps = lesson.steps.map((step, index) => ({
    ...step,
    ...sourceControlSteps[id][index],
  }));
  lesson.hints = [...sourceControlHints[id]];
  return lesson;
}

function resolveLesson(lesson) {
  return typeof lesson === "string" ? getLesson(lesson) : lesson;
}

function validateMode(mode) {
  if (!["guided", "challenge"].includes(mode))
    throw new Error(`未知练习模式：${mode}`);
}

function escapeMarkdown(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\\`*_{}\[\]()#+.!|~-]/g, "\\$&");
}

function fenced(value, language = "") {
  const text = String(value ?? "");
  const runs = text.match(/`+/g) || [];
  const fence = "`".repeat(Math.max(3, ...runs.map((run) => run.length + 1)));
  return `${fence}${language}\n${text}\n${fence}`;
}

function guideMarkdown(lessonInput, mode = "guided", hintLevel = 0) {
  validateMode(mode);
  const lesson = resolveLesson(lessonInput);
  const challenge = mode === "challenge";
  const hintCount = Math.min(
    lesson.hints.length,
    Math.max(0, Math.floor(Number(hintLevel) || 0)),
  );
  const output = [
    `# ${escapeMarkdown(lesson.title)}`,
    challenge ? "**独立挑战**" : "**引导练习 · VS Code Source Control**",
    escapeMarkdown(challenge ? lesson.challengeStory : lesson.story),
    "## 本关目标",
    fenced(challenge ? lesson.challengeTarget : lesson.target),
    "在当前练习窗口中操作。扩展检查真实仓库结果；你可以使用 Source Control 或集成终端。编辑器中尚未保存的内容不会进入 Git 提交。",
  ];
  if (challenge) {
    output.push(
      "## 独立完成",
      "这一次由你决定步骤。需要帮助时，在 Git 练习视图逐级展开提示；展开提示不会执行任何 Git 操作。",
    );
  } else {
    for (const [index, step] of lesson.steps.entries()) {
      output.push(
        `## ${index + 1}. ${escapeMarkdown(step.title)}`,
        escapeMarkdown(step.body),
      );
      if (step.command) {
        output.push(
          "对应的 Git 命令（仅供阅读，需要时自行在终端运行）：",
          fenced(step.command, "shell"),
        );
      }
    }
  }
  if (hintCount) {
    output.push(`## 已展开提示 · ${hintCount}/${lesson.hints.length}`);
    for (let index = 0; index < hintCount; index += 1) {
      output.push(`### 提示 ${index + 1}`, escapeMarkdown(lesson.hints[index]));
    }
  }
  output.push(
    "## 检查练习结果",
    "完成操作后，在 Git 练习视图点击检查练习结果。报告会显示本次读取的仓库、分支、提交、时间及逐项原因；曾经通过的学习记录不代表当前仓库仍然通过。",
  );
  return `${output.join("\n\n")}\n`;
}

function reportMarkdown({
  lesson: lessonInput,
  mode = "guided",
  snapshot,
  checkedAt,
  dirtyFiles = [],
  error = null,
}) {
  validateMode(mode);
  const lesson = resolveLesson(lessonInput);
  const state = snapshot || {};
  const checks = Array.isArray(state.checks) ? state.checks : [];
  const failure = error || state.error;
  const dirty = Array.isArray(dirtyFiles) ? dirtyFiles : [];
  const passed = checks.filter((check) => check.done === true).length;
  const complete =
    !failure && !dirty.length && checks.length > 0 && passed === checks.length;
  const timestamp =
    checkedAt instanceof Date ? checkedAt.toISOString() : checkedAt || "未记录";
  const output = [
    `# 检查报告 · ${escapeMarkdown(lesson.title)}`,
    complete
      ? "**本次检查：全部条件通过**"
      : failure
        ? "**本次检查：未能完成检查**"
        : "**本次检查：尚未完成**",
    `- 模式：${mode === "challenge" ? "独立挑战" : "引导练习"}\n- 检查时间：${escapeMarkdown(timestamp)}\n- 仓库路径：${escapeMarkdown(state.path || state.workspacePath || state.repo || "未读取")}\n- 当前分支：${escapeMarkdown(state.branch || "分离 HEAD 或未读取")}\n- HEAD：${escapeMarkdown(state.head || "未读取")}`,
    "这份报告记录本次读取的磁盘文件与 Git 状态，不是历史通关记录。之后的编辑、提交或分支切换会改变结果，请再次检查。",
  ];
  if (failure) {
    output.push(
      "## 检查错误",
      escapeMarkdown(failure instanceof Error ? failure.message : failure),
      "本次不能确认完成。请处理错误后重新检查；此前保存的学习进度不能代替本次结果。",
    );
  }
  if (dirty.length) {
    output.push(
      "## 有未保存的编辑器内容",
      "以下文件仍有未保存的编辑。磁盘上的条件即使通过，也不能据此确认当前编辑已完成；请保存或自行放弃这些编辑后重新检查。",
      dirty
        .map(
          (file) =>
            `- ${escapeMarkdown(typeof file === "string" ? file : file.fsPath || file.path || file.fileName || String(file))}`,
        )
        .join("\n"),
    );
  }
  output.push(`## 磁盘状态的检查条件 · ${passed}/${checks.length}`);
  if (!checks.length) output.push("未取得可用的检查条件，本次不能确认完成。");
  checks.forEach((check, index) => {
    const label = check.label || `条件 ${index + 1}`;
    const done = check.done === true;
    const explanation =
      check.detail ||
      reasons[label]?.[done ? 0 : 1] ||
      (done
        ? "该条件在本次读取的仓库状态中已满足。"
        : "该条件尚未满足，请对照练习目标检查实际文件与提交历史。");
    output.push(
      `### ${done ? "通过" : "未通过"} · ${escapeMarkdown(label)}`,
      escapeMarkdown(explanation),
    );
  });
  if (Array.isArray(state.conflicts) && state.conflicts.length) {
    output.push(
      "## 待解决冲突",
      state.conflicts.map((file) => `- ${escapeMarkdown(file)}`).join("\n"),
    );
  }
  output.push("## 下一步");
  if (failure) output.push("先处理上方错误，再点击检查练习结果。");
  else if (dirty.length)
    output.push(
      "先处理未保存的编辑，再检查一次；检查按钮不会替你保存、暂存或提交文件。",
    );
  else if (complete)
    output.push(
      "本次目标已达成。可以继续下一单元，或切换到独立挑战；报告中的通过只说明此次状态满足条件。",
    );
  else
    output.push(
      "根据未通过条件调整文件或 Git 状态。需要操作帮助时打开本关指南或逐级提示，然后重新检查。",
    );
  return `${output.join("\n\n")}\n`;
}

module.exports = {
  supportedIds,
  getLesson,
  guideMarkdown,
  reportMarkdown,
  escapeMarkdown,
};
