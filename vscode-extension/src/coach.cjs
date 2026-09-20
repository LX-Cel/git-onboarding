"use strict";

const journeys = {
  basics: [
    {
      title: "找到你的练习仓库",
      do: [
        "打开 Source Control，确认仓库是这次练习的 workspace。",
        "看看左下角的分支名，再展开源代码管理图，找到初始提交。",
      ],
      where:
        "点击「打开 Source Control」，或按 Ctrl+Shift+G。分支名位于 VS Code 左下角。",
      observe: [
        "当前分支是 main。",
        "提交图里已经有一条初始历史；你接下来会在它的基础上提交。",
      ],
      meaning:
        "分支标记当前工作的历史位置。现在先认清仓库，之后的编辑和提交都会发生在这里。",
      action: "sourceControl",
    },
    {
      title: "写一句话，保存后看差异",
      do: [
        "打开 README.md，在正文末尾写一句自己的学习记录。内容可以自由发挥。",
        "按 Ctrl+S 保存，再到 Source Control 的「更改 / Changes」中点击 README.md。",
      ],
      where:
        "点击「打开练习文件」。写完并保存后，再点击「打开 Source Control」查看更改列表。",
      observe: [
        "README.md 出现在「更改」中。",
        "差异视图显示你新写的那一行；它此时还没有进入提交。",
      ],
      meaning:
        "保存把编辑器内容写入工作区文件。Git 能看到这次修改，但保存本身不会产生提交。",
      action: "openFile",
    },
    {
      title: "点击 +，选好这次提交的内容",
      do: [
        "把鼠标移到「更改」中的 README.md 上，点击旁边的 +。",
        "在「暂存的更改 / Staged Changes」中再次点击它，检查准备提交的正文。",
      ],
      where:
        "Source Control → 更改 → README.md 右侧的 +（暂存更改 / Stage Changes）。",
      observe: [
        "README.md 从「更改」移到「暂存的更改」。",
        "如需退回，点击 -（取消暂存）；正文不会丢失。",
      ],
      meaning:
        "暂存区是这次提交的候选内容。暂存后又编辑了文件，需要再次暂存，才能把新编辑一起提交。",
      action: "sourceControl",
    },
    {
      title: "提交，让修改成为历史",
      do: [
        "在 Source Control 顶部的消息框，写下这次改了什么。",
        "点击「提交 / Commit」。完成后，回到这里点击「检查练习结果」。",
      ],
      where:
        "Source Control 顶部的提交消息框和「提交」按钮。选择普通提交即可。",
      observe: [
        "暂存的更改清空，提交图中出现你的新提交。",
        "下方两项完成条件都通过，才表示本次仓库状态达到了目标。",
      ],
      meaning:
        "提交把暂存内容保存成可追溯的历史。判题看的是 README 的实际正文修改，提交说明不需要照抄示例。",
      action: "sourceControl",
    },
  ],
  collab: [
    {
      title: "在自己的分支准备发布",
      do: [
        "点击左下角 main，选择「创建新分支 / Create Branch」，输入 feature/welcome。",
        "确认分支已切换，再打开 release.txt，改为本关目标内容并保存。",
        "在 Source Control 点击文件旁的 +，写消息并提交这次配置修改。",
      ],
      where:
        "左下角分支菜单；也可以按 Ctrl+Shift+P 搜索 Git: Create Branch。编辑后到 Source Control 暂存和提交。",
      observe: [
        "左下角显示 feature/welcome。",
        "该分支比初始历史多出你的发布配置提交。",
      ],
      meaning:
        "功能分支给你的工作一个独立位置。先留下自己的提交，之后才能看清它与队友更新的关系。",
      action: "openFile",
    },
    {
      title: "Fetch：先取回队友的更新",
      do: [
        "在 Source Control 的 … 菜单中找到「获取 / Fetch」并执行。",
        "在提交图中找到 origin/main，比较它与 feature/welcome 的位置。",
      ],
      where: "Source Control 的 … 菜单；或按 Ctrl+Shift+P 搜索 Git: Fetch。",
      observe: [
        "origin/main 指向队友的新提交。",
        "你的 release.txt 仍然是自己的版本；还没有开始合并。",
      ],
      meaning:
        "Fetch 更新你对远端历史的了解，不会直接改写工作区。这里的 origin 是本机练习远端，不需要 GitHub 账号。",
      action: "sourceControl",
    },
    {
      title: "合并队友更新，亲手解决冲突",
      do: [
        "保持在 feature/welcome，按 Ctrl+Shift+P 搜索 Git: Merge Branch，选择 origin/main。",
        "在「合并更改」中打开 release.txt，查看双方修改。根据本关目标编辑最终结果，清除冲突标记并保存。",
        "在合并编辑器完成合并；如果文件尚未暂存，点击 +，再提交这次合并。",
      ],
      where:
        "命令面板的 Git: Merge Branch；然后使用 Source Control 的冲突文件列表与 VS Code 合并编辑器。",
      observe: [
        "首次合并会出现真实冲突，这是本关预期的状态。",
        "解决后 release.txt 与目标一致，冲突列表清空，历史保留双方提交。",
      ],
      meaning:
        "冲突表示 Git 需要你决定最终内容。合并提交将两条历史连接起来，队友的工作仍然可追溯。",
      action: "sourceControl",
    },
    {
      title: "回到 main，合并并推送成果",
      do: [
        "通过左下角分支菜单切回 main。",
        "运行 Git: Merge Branch，这次选择 feature/welcome。",
        "执行「推送 / Push」，把 main 推送到 origin，随后检查练习结果。保留 feature/welcome 分支。",
      ],
      where:
        "左下角分支菜单 → 命令面板 Git: Merge Branch → Source Control 的 … 菜单「推送 / Push」。",
      observe: [
        "当前分支回到 main，且文件内容正确。",
        "推送后，练习远端收到同一份成果；下方每项条件都可逐一核对。",
      ],
      meaning:
        "合并让成果进入本地主线，推送让远端收到它。只完成本地提交，还没有完成团队交付。",
      action: "sourceControl",
    },
  ],
  recovery: [
    {
      title: "先看清三种不同的错误",
      do: [
        "打开 Source Control，在「更改」中点击 notes.txt 看差异。",
        "在「暂存的更改」中点击 draft.txt，确认草稿内容需要保留。",
        "展开提交图，找到最近一次关闭安全模式的错误提交。",
      ],
      where:
        "Source Control 的「更改」「暂存的更改」两组文件，以及源代码管理图。",
      observe: [
        "notes.txt 是未暂存的临时修改。",
        "draft.txt 已暂存；关闭安全模式的问题则已经进入历史。",
      ],
      meaning:
        "工作区、暂存区和提交历史是三个不同的位置。先分清位置，才能选择不会伤及其他工作的恢复方法。",
      action: "sourceControl",
    },
    {
      title: "只放弃 notes.txt 的临时修改",
      do: [
        "先点击 notes.txt，确认差异中的临时试验不需要保留。",
        "只对这个文件选择「放弃更改 / Discard Changes」，核对确认框中的文件名后确认。",
      ],
      where:
        "Source Control → 更改 → notes.txt 的右键菜单或放弃更改图标。不要选择「放弃所有更改」。",
      observe: [
        "notes.txt 恢复为原来的笔记，并退出更改列表。",
        "draft.txt 的草稿内容仍然保留。",
      ],
      meaning:
        "放弃更改会丢弃所选文件的未提交内容。这一步的关键是先看差异，并且只选 notes.txt。",
      action: "sourceControl",
    },
    {
      title: "点击 -，保留草稿并取消暂存",
      do: [
        "在「暂存的更改」中，把鼠标移到 draft.txt 上。",
        "点击旁边的 -（取消暂存 / Unstage Changes），再打开文件确认正文还在。",
      ],
      where: "Source Control → 暂存的更改 → draft.txt 右侧的 -。",
      observe: [
        "draft.txt 回到「更改」中，暂存区清空。",
        "草稿正文与刚才一致。它需要继续留在工作区，不要提交。",
      ],
      meaning:
        "取消暂存只撤回这次提交的选择，不会撤销文件正文。它和放弃更改的作用不同。",
      action: "sourceControl",
    },
    {
      title: "新增修正提交，恢复安全模式",
      do: [
        "打开练习终端，手动运行 git log --oneline，核对关闭安全模式的错误提交。",
        "如果错误提交仍是 HEAD，手动运行 git revert --no-edit HEAD；否则把 HEAD 换成核对后的错误提交 ID。",
        "检查 config.ini 中 safe_mode=on，再点击「检查练习结果」。不要把 draft.txt 一起提交。",
      ],
      where: "点击「打开练习终端」。命令仅作为阅读指引，扩展不会代你执行。",
      observe: [
        "历史里新增一条修正提交，原来的错误提交仍保留。",
        "draft.txt 仍显示在更改列表，这是本关要求的正确结果。",
      ],
      meaning:
        "Revert 用新的反向提交修正旧提交，保留发生过什么。本关无需让工作区完全干净，因为草稿要继续保留。",
      action: "terminal",
    },
  ],
};

function bounded(value, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(0, Math.floor(parsed)))
    : 0;
}

function coachModel({
  lesson,
  mode = "guided",
  snapshot,
  dirtyFiles = [],
  step = 0,
  hintLevel = 0,
  error = null,
}) {
  if (!["guided", "challenge"].includes(mode))
    throw new Error("不支持的练习模式");
  if (!lesson)
    return {
      welcome: true,
      lesson: null,
      mode,
      step: 0,
      total: 0,
      steps: [],
      currentStep: null,
      target: "",
      story: "",
      checks: [],
      dirtyFiles: [],
      error: error ? String(error.message || error) : null,
      complete: false,
      hintLevel: 0,
      hints: [],
    };
  if (!journeys[lesson.id]) throw new Error("此课程尚未提供分步教学");
  const failure = error || snapshot?.error;
  const dirty = dirtyFiles.map((file) =>
    typeof file === "string"
      ? file
      : String(file.fsPath || file.fileName || file.path || file),
  );
  const checks = (snapshot?.checks || []).map((check) => ({
    label: String(check.label || "检查条件"),
    done: check.done === true,
    detail: String(
      check.detail ||
        (check.done === true
          ? "当前读取的仓库状态满足此条件。"
          : "请完成对应目标后重新检查。"),
    ),
  }));
  const count = bounded(hintLevel, Math.min(3, lesson.hints?.length || 0));
  const steps =
    mode === "guided"
      ? journeys[lesson.id].map((item) => ({
          ...item,
          do: [...item.do],
          observe: [...item.observe],
        }))
      : [];
  const selected = bounded(step, journeys[lesson.id].length - 1);
  return {
    welcome: false,
    lesson: {
      id: lesson.id,
      title: String(lesson.title),
      file: String(lesson.file),
    },
    mode,
    step: selected,
    total: journeys[lesson.id].length,
    steps,
    currentStep: steps[selected] || null,
    target: String(
      mode === "challenge" ? lesson.challengeTarget : lesson.target,
    ),
    story: String(mode === "challenge" ? lesson.challengeStory : lesson.story),
    checks,
    dirtyFiles: dirty,
    error: failure ? String(failure.message || failure) : null,
    complete:
      !failure &&
      !dirty.length &&
      checks.length > 0 &&
      checks.every((check) => check.done),
    hintLevel: count,
    hints: (lesson.hints || []).slice(0, count).map(String),
    repository: {
      path: String(snapshot?.path || ""),
      branch: String(snapshot?.branch || ""),
      head: String(snapshot?.head || ""),
    },
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}

function button(action, label, attributes = "") {
  return `<button type="button" data-action="${action}" ${attributes}>${escapeHtml(label)}</button>`;
}

function coachHtml(model, nonce) {
  if (!/^[A-Za-z0-9+/_=-]{1,128}$/.test(nonce || ""))
    throw new Error("无效的 webview nonce");
  const html = escapeHtml;
  const guided = model.mode === "guided";
  const step = model.currentStep;
  const checking = model.error
    ? "本次检查失败"
    : model.dirtyFiles.length
      ? "有未保存内容"
      : model.complete
        ? "本次目标已达成"
        : model.checks.length
          ? "练习进行中"
          : "等待读取仓库";
  let content;
  if (model.welcome) {
    content = `<header><p class="eyebrow">GIT ONBOARDING</p><h1>边操作，边学 Git</h1><p class="muted">在熟悉的 Source Control 里练习。这里会一直陪着你，告诉你下一步在哪里、怎么做。</p></header><section class="card"><h2>从一次真实提交开始</h2><p>选择课程后，专用练习会在独立窗口打开。你的日常项目不会变成练习场。</p>${button("start", "选择一门练习", 'class="primary full"')}</section>`;
  } else {
    const navigation = guided
      ? `<nav class="steps" aria-label="选择教学步骤">${model.steps.map((item, index) => `<button type="button" data-action="step" data-step="${index}" aria-label="第 ${index + 1} 步：${html(item.title)}" title="${html(item.title)}" ${index === model.step ? 'aria-current="step"' : ""}>${index + 1}</button>`).join("")}</nav><p class="muted step-note">第 ${model.step + 1} / ${model.total} 步 · 自己选择学习节奏</p>`
      : "";
    const instructions =
      guided && step
        ? `<section class="lesson-step" aria-labelledby="current-step-title"><h2 id="current-step-title">${html(step.title)}</h2><div class="actions">${button("openFile", "打开练习文件", step.action === "openFile" ? 'class="primary"' : "")}${button("sourceControl", "打开 Source Control", step.action === "sourceControl" ? 'class="primary"' : "")}${step.action === "terminal" ? button("terminal", "打开练习终端", 'class="primary"') : ""}</div><div class="instruction"><h3>现在做什么</h3><ol>${step.do.map((line) => `<li>${html(line)}</li>`).join("")}</ol></div><div class="instruction"><h3>在哪里操作</h3><p>${html(step.where)}</p></div><div class="instruction"><h3>完成后你会看到</h3><ul>${step.observe.map((line) => `<li>${html(line)}</li>`).join("")}</ul></div><aside class="meaning"><h3>理解这一步</h3><p>${html(step.meaning)}</p></aside><div class="paging">${button("previous", "上一步", model.step === 0 ? "disabled" : "")}<span class="muted">切换步骤不会执行 Git 操作</span>${model.step === model.total - 1 ? button("check", "检查结果", 'class="primary"') : button("next", "下一步", 'class="primary"')}</div></section>`
        : `<section class="card"><h2>这一次，由你决定步骤</h2><p>使用原生 Source Control 或终端完成目标。需要帮助时，再展开一条提示。</p><div class="actions">${button("openFile", "打开练习文件")}${button("sourceControl", "打开 Source Control")}${button("terminal", "打开练习终端")}</div></section>`;
    const hints = `<section class="hints" aria-label="逐级提示">${button("hint", model.hintLevel >= 3 ? "已展开全部提示 · 3/3" : `需要帮助？展开提示 · ${model.hintLevel}/3`, model.hintLevel >= 3 ? 'disabled class="full"' : 'class="full"')}${model.hints.map((hint, index) => `<div class="hint"><h3>提示 ${index + 1}</h3><p>${html(hint)}</p></div>`).join("")}</section>`;
    const notices = `${model.error ? `<div class="notice error" role="status"><strong>检查暂时无法完成</strong><p>${html(model.error)}</p><p>请处理错误后重试，历史通关不能代替本次结果。</p></div>` : ""}${model.dirtyFiles.length ? `<div class="notice" role="status"><strong>先处理未保存的编辑</strong><p>Git 读取磁盘文件。请保存或自行放弃下列编辑，再检查结果。</p><ul>${model.dirtyFiles.map((file) => `<li>${html(file)}</li>`).join("")}</ul></div>` : ""}`;
    const checks = `<section class="assessment" aria-labelledby="assessment-title"><div class="section-heading"><h2 id="assessment-title">实际完成条件</h2><span class="count">${model.checks.filter((check) => check.done).length}/${model.checks.length}</span></div><p class="status ${model.complete ? "passed" : ""}" role="status">${html(checking)}</p>${notices}${model.checks.length ? `<ul class="checks">${model.checks.map((check) => `<li><span class="check-mark ${check.done ? "passed" : ""}" aria-label="${check.done ? "通过" : "未通过"}">${check.done ? "✓" : "○"}</span><div><strong>${html(check.label)}</strong><p>${html(check.detail)}</p></div></li>`).join("")}</ul>` : '<p class="muted">点击检查，从当前仓库读取每项完成条件。</p>'}<p class="muted">教学步骤由你手动切换。上面的勾选只来自真实 Git 状态；翻到最后一步不会自动通关。</p>${button("check", "检查练习结果", 'class="primary full"')}${model.repository.path ? `<details class="repository"><summary>当前练习仓库</summary><p>${html(model.repository.path)}</p><p>分支：${html(model.repository.branch || "分离 HEAD")}<br>HEAD：${html(model.repository.head || "未读取")}</p></details>` : ""}</section>`;
    content = `<header><p class="eyebrow">${guided ? "引导练习" : "独立挑战"} · GIT ONBOARDING</p><h1>${html(model.lesson.title)}</h1><p class="muted">${html(model.story)}</p></header><section class="goal" aria-labelledby="goal-title"><h2 id="goal-title">本关目标</h2><p>${html(model.target)}</p></section>${navigation}${instructions}${hints}${checks}<footer>${button("start", "选择其他练习", 'class="full"')}</footer>`;
  }
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><title>Git 练习教练</title>
<style nonce="${nonce}">
:root{color-scheme:light dark;font-family:var(--vscode-font-family,system-ui,sans-serif);font-size:max(14px,var(--vscode-font-size,14px));color:var(--vscode-foreground);background:var(--vscode-sideBar-background,var(--vscode-editor-background));line-height:1.65}
*{box-sizing:border-box}body{margin:0;padding:20px 18px 24px;min-width:230px}button{font:inherit;line-height:1.4;cursor:pointer;min-height:36px;padding:8px 12px;color:var(--vscode-button-secondaryForeground,var(--vscode-foreground));background:var(--vscode-button-secondaryBackground,var(--vscode-input-background));border:1px solid var(--vscode-button-border,var(--vscode-contrastBorder,transparent));border-radius:5px;text-align:center}button:hover{background:var(--vscode-button-secondaryHoverBackground,var(--vscode-list-hoverBackground))}button:focus-visible,summary:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:3px}button:disabled{cursor:default;color:var(--vscode-disabledForeground)}button.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}button.primary:hover{background:var(--vscode-button-hoverBackground)}.full{width:100%}h1,h2,h3,p{margin:0}h1{font-size:1.65rem;line-height:1.35;font-weight:650;margin:7px 0 12px}h2{font-size:1.15rem;line-height:1.45;font-weight:650}h3{font-size:1rem;font-weight:650;margin-bottom:5px}p,li{overflow-wrap:anywhere}p+p{margin-top:8px}header{margin-bottom:20px}.eyebrow{color:var(--vscode-descriptionForeground);letter-spacing:.04em}.muted{color:var(--vscode-descriptionForeground)}.goal,.card{padding:15px;border:1px solid var(--vscode-panel-border,var(--vscode-contrastBorder,transparent));border-radius:7px;margin-bottom:20px;background:var(--vscode-editor-background)}.goal{border-left:3px solid var(--vscode-focusBorder)}.goal h2{font-size:1rem;margin-bottom:8px}.goal p{white-space:pre-wrap}.card p{margin:9px 0 15px}.steps{display:flex;gap:8px}.steps button{flex:1;font-weight:600}.steps button[aria-current="step"]{color:var(--vscode-button-foreground);background:var(--vscode-button-background);border-color:var(--vscode-focusBorder)}.step-note{margin:8px 0 16px}.lesson-step>h2{margin-bottom:14px;scroll-margin-top:18px}.lesson-step>.actions{margin-bottom:20px}.instruction{margin:0 0 17px}.instruction ol,.instruction ul{padding-left:22px;margin:6px 0 0}.instruction li+li{margin-top:9px}.instruction h3{color:var(--vscode-textLink-foreground,var(--vscode-foreground))}.meaning{border-left:2px solid var(--vscode-panel-border,var(--vscode-focusBorder));padding:2px 0 2px 12px;margin:20px 0}.meaning p{color:var(--vscode-descriptionForeground)}.actions{display:flex;flex-wrap:wrap;gap:8px}.actions button{flex:1 1 120px}.paging{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:18px 0 0}.paging span{flex:1;text-align:center}.hints{margin:24px 0}.hint{padding:14px 0;border-bottom:1px solid var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))}.hint p{white-space:pre-wrap}.assessment{padding-top:20px;border-top:1px solid var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))}.section-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}.count{color:var(--vscode-descriptionForeground)}.status{margin:9px 0 12px}.passed{color:var(--vscode-testing-iconPassed,var(--vscode-terminal-ansiGreen,var(--vscode-foreground)))}.checks{padding:0;list-style:none;margin:12px 0 16px}.checks li{display:flex;align-items:flex-start;gap:10px;margin:0 0 15px}.check-mark{font-weight:700;line-height:1.65;flex:0 0 18px}.checks p{margin-top:3px;color:var(--vscode-descriptionForeground)}.assessment>.full{margin-top:14px}.notice{padding:12px;border:1px solid var(--vscode-inputValidation-warningBorder,var(--vscode-focusBorder));background:var(--vscode-inputValidation-warningBackground,var(--vscode-editor-background));margin:12px 0;border-radius:5px}.notice p{margin-top:6px}.notice ul{padding-left:20px;margin-bottom:0}.error{border-color:var(--vscode-inputValidation-errorBorder,var(--vscode-errorForeground));background:var(--vscode-inputValidation-errorBackground,var(--vscode-editor-background))}.repository{margin-top:16px;color:var(--vscode-descriptionForeground)}.repository summary{cursor:pointer}.repository p{margin-top:8px}footer{margin-top:24px;padding-top:16px;border-top:1px solid var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))}@media(max-width:320px){body{padding:16px 12px}.paging{flex-wrap:wrap}.paging span{order:3;flex-basis:100%}}
</style></head><body><main id="git-coach" data-step="${bounded(model.step, 3)}">${content}</main>
<script nonce="${nonce}">
(() => {
  const vscode = acquireVsCodeApi();
  const actions = new Set(['previous','next','openFile','sourceControl','terminal','check','hint','start','step']);
  const currentStep = Number(document.getElementById('git-coach')?.dataset.step);
  const heading = document.getElementById('current-step-title');
  const readState = () => {
    const state = vscode.getState();
    return state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  };
  const scrollToStep = () => heading?.scrollIntoView({ block: 'start', behavior: 'auto' });
  const savedState = readState();
  if (heading && Number.isInteger(savedState.coachScrollStep) && savedState.coachScrollStep === currentStep) {
    const { coachScrollStep, ...remaining } = savedState;
    vscode.setState(remaining);
    // VS Code restores the previous frame's scroll during load. Apply explicit
    // lesson navigation after that layout, without moving ordinary status refreshes.
    const afterLoad = () => requestAnimationFrame(() => requestAnimationFrame(scrollToStep));
    if (document.readyState === 'complete') afterLoad();
    else window.addEventListener('load', afterLoad, { once: true });
  }
  const navigate = step => {
    if (step === currentStep) scrollToStep();
    else vscode.setState({ ...readState(), coachScrollStep: step });
  };
  document.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (!actions.has(action)) return;
    if (action === 'step') {
      const step = Number(button.dataset.step);
      if (!Number.isInteger(step) || step < 0 || step > 3) return;
      navigate(step);
      vscode.postMessage({ action, step });
    } else {
      if (action === 'next' || action === 'previous') {
        const step = currentStep + (action === 'next' ? 1 : -1);
        if (!Number.isInteger(step) || step < 0 || step > 3) return;
        navigate(step);
      }
      vscode.postMessage({ action });
    }
  });
})();
</script></body></html>`;
}

module.exports = { coachModel, coachHtml };
