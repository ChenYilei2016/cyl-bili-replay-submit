import { createPlan, DEFAULT_TEMPLATE, formatTime, normalizeTimeline, recoverJob, replayDate, SubmissionQueue, validateSegment } from "./core.js";

const LIVE_CENTER = "https://link.bilibili.com/p/center/index#/my-room/live-record";
const ARCHIVES = "https://member.bilibili.com/platform/upload-manager/article";
const TOOL_HOME = "https://github.com/ChenYilei2016/cyl-bili-replay-submit";
const AUTHOR_HOME = "https://space.bilibili.com/1790439";
const STATUS = {
  pending: "等待投稿", submitting: "正在提交", submitted: "已提交",
  failed: "提交失败", uncertain: "待核对"
};
const escapeHtml = (text) => String(text ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const playIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7Z"/></svg>';

export function mountWorkbench(adapter) {
  document.querySelector("#app").innerHTML = `
    <aside class="sidebar">
      <a class="brand" href="#"><span class="brand-icon">${playIcon}<i></i></span><span>回放接力<small>REPLAY RELAY</small></span></a>
      <a class="brand-author" href="${AUTHOR_HOME}" target="_blank" rel="noreferrer">作者：球磨川みそぎ · ChenYilei2016</a>
      <div class="workspace-label">我的工作台</div>
      <a class="nav-item active" href="#workspace" aria-current="page"><span>▤</span>分段投稿<span class="nav-dot"></span></a>
      <a class="nav-item" href="${LIVE_CENTER}" target="_blank" rel="noreferrer"><span>▻</span>B 站直播回放<span class="external">↗</span></a>
      <a class="nav-item" href="${ARCHIVES}" target="_blank" rel="noreferrer"><span>▱</span>稿件管理<span class="external">↗</span></a>
      <div class="sidebar-note"><div class="note-icon">✦</div><strong>让回放，完整留下来。</strong><p>长直播分成短片段，<br>把重复操作交给队列。</p></div>
      <div class="sidebar-footer"><span class="local-dot"></span><span id="toolVersion">本地工具</span><small>登录状态由 B 站管理</small></div>
    </aside>
    <main id="workspace">
      <header class="topbar"><span>工作台 <b>/</b> 分段投稿</span><span class="environment"><i></i>Chrome 扩展 · 本地运行</span></header>
      <div class="page-content">
        <div class="page-heading"><div><div class="eyebrow">为每一场长直播，接好下一棒</div><h1>长回放，一次安排<span>。</span></h1><p>自动按时长分段、编号，确认后依次投稿。</p></div><button id="helpButton" class="button secondary">使用指南 <span>↗</span></button></div>
        <div id="notice" class="notice" role="status" aria-live="polite" hidden></div>
        <section class="source-card" aria-label="当前回放">
          <div class="source-art"><div class="art-grid"></div>${playIcon}<span>LIVE REPLAY</span></div>
          <div class="source-details"><div class="card-eyebrow">当前直播回放 <span id="sourceBadge" class="pill neutral">连接中</span></div><h2 id="sourceTitle">正在连接 B 站回放页…</h2><p id="sourceMeta">读取可投稿的时间范围和账号权限</p></div>
          <div class="source-metric"><small>回放总时长</small><strong id="totalDuration">—</strong><span id="sourceDate">—</span></div>
          <button id="refreshButton" class="button secondary small">重新读取</button>
        </section>
        <div class="workspace-grid">
          <section class="card settings-card"><div class="section-heading"><h2><span class="step">01</span>设置分段</h2><span class="muted">先安排，再投稿</span></div>
            <form id="settingsForm">
              <label for="baseTitle">回放标题</label><input id="baseTitle" name="title" maxlength="80" required placeholder="例如：van 游戏直播回放">
              <div class="naming-history"><label for="namingHistory">历史命名 <span>最近 20 组</span></label><select id="namingHistory" disabled><option value="">暂无历史命名</option></select><p id="namingHistoryHint" class="field-help">更新分段计划后，会记住这次的名字和标题格式。</p></div>
              <div class="two-fields"><div><label for="segmentMinutes">每段时长</label><div class="input-unit"><input id="segmentMinutes" type="number" min="1" max="120" step="1" value="120" required><span>分钟</span></div></div><div><label for="intervalSeconds">投稿间隔</label><div class="input-unit"><input id="intervalSeconds" type="number" min="5" max="300" step="1" value="15" required><span>秒</span></div></div></div>
              <p class="field-help">单段最多 120 分钟，最后一段自动收尾。</p>
              <label for="titleTemplate">标题格式</label><input id="titleTemplate" value="${escapeHtml(DEFAULT_TEMPLATE)}" required>
              <p class="field-help template-help">可用变量 <code>{title}</code> <code>{date}</code> <code>{index}</code> <code>{total}</code> <code>{start}</code> <code>{end}</code></p>
              <label class="checkbox-label"><input id="withDanmaku" type="checkbox" disabled>同步直播弹幕 <span id="danmakuHint">读取权限中</span></label>
              <button id="planButton" type="submit" class="button primary full-width">更新分段计划 <span>→</span></button>
              <p id="settingsHint" class="settings-hint">标题和每段范围将在右侧预览。</p>
            </form>
            <div class="flow-note"><span>✓</span><div><strong>直接使用云端回放</strong><p>通过 B 站网页已有的剪辑流程投稿，无需下载或重新上传整场视频。</p></div></div>
          </section>
          <section class="card plan-card"><div class="section-heading"><h2><span class="step">02</span>预览投稿队列</h2><button id="exportButton" class="text-button" disabled>导出记录 ↓</button></div>
            <div class="plan-summary"><div><small>将生成</small><strong id="segmentCount">—<span> 段</span></strong></div><div><small>最长片段</small><strong id="longestDuration">—</strong></div><div><small>已提交</small><strong id="submittedCount">0<span> 段</span></strong></div><span id="queueBadge" class="pill neutral">等待回放</span></div>
            <div id="timeline" class="timeline" aria-label="分段时间轴"></div><div class="timeline-scale"><span>00:00:00</span><span id="timelineEnd">—</span></div>
            <div class="table-scroll"><table><thead><tr><th class="check-col"><span class="sr-only">选择</span></th><th>片段 / 时间范围</th><th>投稿标题</th><th>状态</th></tr></thead><tbody id="segmentRows"><tr><td colspan="4" class="empty-state">从 B 站直播中心打开「投片段」，即可生成分段计划。</td></tr></tbody></table></div>
            <div class="queue-footer"><div id="queueHint"><span class="hint-dot"></span>确认分段标题后，一次开始依次投稿。</div><div id="queueProgress" class="progress-track"><span></span></div></div>
          </section>
        </div>
        <section class="start-card"><div><strong id="actionTitle">准备好后，把接力交给我们</strong><p id="actionDescription">保持原回放页和工作台打开，投稿进度会保存在本机。</p></div><div class="start-actions"><button id="pauseButton" class="button secondary" hidden>暂停队列</button><button id="startButton" class="button primary" disabled>${playIcon}开始依次投稿</button></div></section>
        <p class="page-footnote">每段都是独立投稿。提交成功后，视频生成与审核进度以 B 站稿件管理为准。</p>
        <p class="project-links"><a href="${TOOL_HOME}" target="_blank" rel="noreferrer">工具地址 · GitHub 仓库 ↗</a><span>·</span><a href="${AUTHOR_HOME}" target="_blank" rel="noreferrer">作者 · 球磨川みそぎ（B站）↗</a><span>·</span><button id="aboutButton" class="text-button" type="button">关于作者</button></p>
      </div>
    </main>
    <dialog id="confirmDialog" aria-labelledby="confirmationHeading"><form method="dialog"><div class="dialog-icon">${playIcon}</div><h2 id="confirmationHeading">确认这次分段投稿</h2><p id="confirmationText"></p><p class="dialog-note">只提交已勾选的片段。遇到失败或不明确的结果，队列会暂停。</p><div class="dialog-actions"><button class="button secondary" value="cancel">再检查一下</button><button class="button primary" value="submit">确认并开始投稿</button></div></form></dialog>
    <dialog id="helpDialog" aria-labelledby="helpHeading"><form method="dialog"><div class="dialog-icon">✦</div><h2 id="helpHeading">三步，交给队列</h2><ol class="guide-list"><li><strong>打开官方回放页</strong><p>在 B 站直播中心 → 直播回放中，点击目标场次的「投片段」。</p></li><li><strong>打开回放接力</strong><p>在该剪辑页点击 Chrome 工具栏的扩展图标，设置标题和每段时长。选择历史命名可快速复用以前的名字和格式。</p></li><li><strong>预览后开始投稿</strong><p>检查每段时间和标题，点击「开始依次投稿」。工具会串行处理，保存每段进度。</p></li></ol><p class="dialog-note">关闭工作台会中断队列。提交中的片段会标为「待核对」，恢复前请查看官方已发布片段。验证码、风控或额度提示需在 B 站页面处理。</p><button class="button primary full-width" value="close">知道了</button></form></dialog>
    <dialog id="aboutDialog" aria-labelledby="aboutHeading"><form method="dialog"><div class="dialog-icon">✦</div><h2 id="aboutHeading">关于回放接力</h2><p class="about-version" id="aboutVersion">本地 Chrome 扩展</p><dl class="author-details"><dt>作者</dt><dd>球磨川みそぎ</dd><dt>GitHub</dt><dd><a href="https://github.com/ChenYilei2016" target="_blank" rel="noreferrer">ChenYilei2016 ↗</a></dd><dt>B 站 UID</dt><dd><a href="${AUTHOR_HOME}" target="_blank" rel="noreferrer">1790439 · 访问作者主页 ↗</a></dd><dt>工具地址</dt><dd><a href="${TOOL_HOME}" target="_blank" rel="noreferrer">cyl-bili-replay-submit ↗</a></dd></dl><p class="dialog-note">命名历史按 B 站账号保存在当前浏览器的扩展数据中，仅复用名字和格式。日期、段号和时间范围会按当前回放重新生成。</p><button class="button primary full-width" value="close">关闭</button></form></dialog>`;

  const element = (id) => document.getElementById(id);
  let source = null;
  let job = null;
  let queue = null;
  let busy = false;
  let dirty = false;
  let namingHistory = [];
  const notify = (message, tone = "info") => {
    element("notice").textContent = message;
    element("notice").className = `notice ${tone}`;
    element("notice").hidden = !message;
  };
  const locked = () => job?.segments.some((item) => item.status !== "pending");
  const save = async () => { await adapter.save(job); render(); };
  const fieldOptions = () => ({
    title: element("baseTitle").value,
    minutes: Number(element("segmentMinutes").value),
    intervalSeconds: Number(element("intervalSeconds").value),
    template: element("titleTemplate").value,
    withDanmaku: element("withDanmaku").checked
  });

  function renderNamingHistory() {
    const select = element("namingHistory");
    select.innerHTML = '<option value="">选择以前用过的命名…</option>' + namingHistory.map((item, index) => `<option value="${index}">${escapeHtml(item.title)} · ${escapeHtml(item.template)}</option>`).join("");
    const selected = namingHistory.findIndex((item) => item.title === element("baseTitle").value.trim() && item.template === element("titleTemplate").value);
    select.value = selected < 0 ? "" : String(selected);
    select.disabled = !source || busy || Boolean(queue?.running) || Boolean(locked()) || !namingHistory.length;
    element("namingHistoryHint").textContent = locked() ? "当前队列已有投稿记录，命名保持原样。新回放可继续复用历史。" : selected >= 0 ? `已保存格式：${namingHistory[selected].template}` : namingHistory.length ? "选择名字和格式后，会按当前回放重新生成分段预览。" : "更新分段计划后，会记住这次的名字和标题格式。";
  }

  function render() {
    const running = Boolean(queue?.running);
    const selected = job?.segments.filter((item) => item.enabled) || [];
    const completed = selected.filter((item) => item.status === "submitted").length;
    const pending = selected.filter((item) => item.status === "pending").length;
    const unresolved = selected.some((item) => ["failed", "uncertain", "submitting"].includes(item.status));
    element("refreshButton").disabled = busy || running;
    element("exportButton").disabled = !job || busy;
    for (const id of ["baseTitle", "segmentMinutes", "intervalSeconds", "titleTemplate", "planButton"]) {
      element(id).disabled = !source || busy || running || Boolean(locked());
    }
    element("withDanmaku").disabled = !source?.canPublishDanmaku || busy || running || Boolean(locked());
    renderNamingHistory();
    element("settingsHint").textContent = locked() ? "已有投稿记录，分段设置已锁定，防止重排后重复投稿。" : dirty ? "设置已改变，请先更新右侧分段计划。" : "标题和每段范围将在右侧预览。";
    element("startButton").disabled = busy || running || dirty || !pending || unresolved;
    element("startButton").innerHTML = `${playIcon}${job?.status === "paused" ? "继续依次投稿" : "开始依次投稿"}`;
    element("pauseButton").hidden = !running;
    element("pauseButton").disabled = Boolean(queue?.stopping);
    element("pauseButton").textContent = queue?.stopping ? "当前请求结束后暂停" : "暂停队列";
    if (!job) {
      element("segmentCount").innerHTML = '—<span> 段</span>';
      element("submittedCount").innerHTML = '0<span> 段</span>';
      element("longestDuration").textContent = "—";
      element("totalDuration").textContent = "—";
      element("sourceDate").textContent = "—";
      element("timeline").innerHTML = "";
      element("timelineEnd").textContent = "—";
      element("queueBadge").textContent = "等待回放";
      element("queueBadge").className = "pill neutral";
      element("segmentRows").innerHTML = '<tr><td colspan="4" class="empty-state">从 B 站直播中心打开「投片段」，即可生成分段计划。</td></tr>';
      element("queueProgress").firstElementChild.style.width = "0";
      element("queueHint").textContent = "读取回放后，检查分段标题和时间范围。";
      element("actionTitle").textContent = "先连接自己的回放剪辑页";
      element("actionDescription").textContent = "在 B 站回放列表点击「投片段」，再点击扩展图标。";
      return;
    }
    const badge = element("queueBadge");
    const hasUncertain = selected.some((item) => item.status === "uncertain");
    badge.textContent = running ? queue.stopping ? "正在暂停" : "投稿中" : hasUncertain ? "需要核对" : job.status === "completed" ? "已全部提交" : job.status === "paused" ? "已暂停" : "待确认";
    badge.className = `pill ${running ? "blue" : job.status === "completed" ? "green" : hasUncertain ? "orange" : "neutral"}`;
    element("segmentCount").innerHTML = `${selected.length}<span> 段</span>`;
    element("submittedCount").innerHTML = `${completed}<span> / ${selected.length}</span>`;
    element("longestDuration").textContent = selected.length ? formatTime(Math.max(...selected.map((item) => item.duration))) : "—";
    const span = source.end - source.start;
    element("timeline").innerHTML = job.segments.map((item, index) => `<div class="timeline-part color-${index % 4} ${item.enabled ? "" : "skipped"} ${item.status === "submitted" ? "done" : ""}" style="flex:${item.end - item.start}" title="${escapeHtml(item.title)}：${formatTime(item.start - source.start)}–${formatTime(item.end - source.start)}"><span>${String(item.index).padStart(2, "0")}</span><small>${formatTime(item.duration)}</small></div>`).join("");
    element("timelineEnd").textContent = formatTime(span);
    element("queueProgress").firstElementChild.style.width = `${selected.length ? completed / selected.length * 100 : 0}%`;
    element("segmentRows").innerHTML = job.segments.map((item) => {
      const immutable = busy || running || ["submitted", "submitting", "uncertain"].includes(item.status);
      return `<tr data-index="${item.index}" class="${item.enabled ? "" : "disabled-row"}"><td><input type="checkbox" class="segment-toggle" aria-label="投稿第 ${item.index} 段" ${item.enabled ? "checked" : ""} ${immutable ? "disabled" : ""}></td><td><div class="segment-name">第 ${String(item.index).padStart(2, "0")} 段 <span>${formatTime(item.duration)}</span></div><div class="time-range">${formatTime(item.start - source.start)} → ${formatTime(item.end - source.start)}</div></td><td><input class="segment-title" aria-label="第 ${item.index} 段投稿标题" value="${escapeHtml(item.title)}" maxlength="80" ${immutable ? "disabled" : ""}>${item.error ? `<p class="row-error">${escapeHtml(item.error)}</p>` : ""}</td><td><span class="status-label ${item.status}"><i></i>${item.enabled ? STATUS[item.status] : "已跳过"}</span>${!running && item.status === "failed" ? '<button class="text-button row-action" data-action="retry">准备重试</button>' : ""}${!running && item.status === "uncertain" ? '<div class="reconcile-actions"><button class="text-button row-action" data-action="confirmed">已核对：已提交</button><button class="text-button row-action" data-action="not-submitted">已核对：未提交</button></div>' : ""}</td></tr>`;
    }).join("");
    element("queueHint").innerHTML = `<span class="hint-dot"></span>${hasUncertain ? "有片段结果不明确，先核对官方已发布记录。" : running ? "队列串行运行中，请保持两个页面打开。" : completed === selected.length && selected.length ? "全部片段已提交，接下来等待 B 站生成和审核。" : `已选择 ${selected.length} 段 · 投稿间隔 ${job.options.intervalSeconds} 秒 · 可逐段修改标题`}`;
    element("actionTitle").textContent = hasUncertain ? "先核对这一棒，再继续下一棒" : job.status === "completed" ? "这场回放，已全部交给 B 站" : running ? "接力进行中" : job.status === "paused" ? "进度已保存，随时接着投" : "准备好后，把接力交给我们";
    element("actionDescription").textContent = job.status === "completed" ? "提交成功表示 B 站已接收请求，生成和审核结果请到稿件管理查看。" : "保持原回放页和工作台打开，投稿进度会保存在本机。";
  }

  async function loadSource() {
    if (busy || queue?.running) return;
    busy = true;
    render();
    notify("正在读取官方回放时间轴…");
    try {
      const inspected = await adapter.inspect();
      normalizeTimeline(inspected);
      source = inspected;
      const [saved, history] = await Promise.all([adapter.load(source), adapter.loadNamingHistory(source)]);
      namingHistory = history;
      const latestNaming = namingHistory[0];
      job = saved ? recoverJob(saved) : createPlan(source, {
        title: latestNaming?.title || "直播回放", minutes: 120, intervalSeconds: 15, template: latestNaming?.template || DEFAULT_TEMPLATE
      });
      // 新读取的权限和来源参与提交校验，历史状态继续保留。
      job.source = source;
      const options = job.options;
      element("baseTitle").value = options.title;
      element("segmentMinutes").value = options.minutes;
      element("intervalSeconds").value = options.intervalSeconds;
      element("titleTemplate").value = options.template;
      element("withDanmaku").checked = options.withDanmaku;
      element("danmakuHint").textContent = source.canPublishDanmaku ? "当前账号可用" : "当前账号未开放";
      element("sourceTitle").textContent = `${options.title} · ${replayDate(source.start)}`;
      element("sourceMeta").textContent = `回放 ID ${source.liveKey} · 账号 ${source.accountId} · 使用官方回放封面`;
      const timeline = normalizeTimeline(source);
      element("totalDuration").textContent = formatTime(timeline.reduce((sum, item) => sum + item.end - item.start, 0));
      element("sourceDate").textContent = `${replayDate(source.start)} 直播场次`;
      element("sourceBadge").textContent = "已连接";
      element("sourceBadge").className = "pill green";
      dirty = false;
      queue = null;
      await adapter.save(job);
      const needsCheck = job.segments.some((item) => item.status === "uncertain");
      notify(saved ? needsCheck ? "已恢复队列，有提交中断的片段需要先核对。" : "已恢复本机队列进度，已提交的片段会自动跳过。" : latestNaming ? "已带入最近一次的名字和格式，模板变量和分段已按当前回放生成。" : "分段计划已生成，请检查标题和时间范围。", "success");
    } catch (error) {
      source = null;
      job = null;
      namingHistory = [];
      element("sourceBadge").textContent = "未连接";
      element("sourceBadge").className = "pill orange";
      element("sourceTitle").textContent = "请连接自己的回放剪辑页";
      element("sourceMeta").textContent = "从 B 站直播回放列表点击「投片段」，再点击扩展图标。";
      notify(error.message, "error");
    } finally { busy = false; render(); }
  }

  element("settingsForm").addEventListener("input", () => { dirty = true; render(); });
  async function updatePlan() {
    if (!source || busy || locked() || queue?.running) return;
    busy = true;
    render();
    try {
      const plan = createPlan(source, fieldOptions());
      namingHistory = await adapter.savePlan(plan);
      job = plan;
      dirty = false;
      queue = null;
      element("sourceTitle").textContent = `${job.options.title} · ${replayDate(source.start)}`;
      notify("分段计划已更新，名字和标题格式已保存到历史。每段标题仍可单独修改。", "success");
    } catch (error) { notify(error.message, "error"); }
    finally { busy = false; render(); }
  }
  element("settingsForm").addEventListener("submit", (event) => {
    event.preventDefault();
    updatePlan();
  });
  element("namingHistory").addEventListener("input", (event) => event.stopPropagation());
  element("namingHistory").addEventListener("change", () => {
    if (!source || busy || locked() || queue?.running || element("namingHistory").value === "") return;
    const naming = namingHistory[Number(element("namingHistory").value)];
    if (!naming) return;
    element("baseTitle").value = naming.title;
    element("titleTemplate").value = naming.template;
    dirty = true;
    updatePlan();
  });
  element("segmentRows").addEventListener("change", async (event) => {
    if (busy || queue?.running) return;
    const row = event.target.closest("tr[data-index]");
    if (!row) return;
    const segment = job.segments[Number(row.dataset.index) - 1];
    const previous = { ...segment };
    try {
      if (event.target.classList.contains("segment-title")) segment.title = event.target.value.trim();
      if (event.target.classList.contains("segment-toggle")) segment.enabled = event.target.checked;
      validateSegment(segment, source);
      await save();
    } catch (error) { Object.assign(segment, previous); render(); notify(error.message, "error"); }
  });
  element("segmentRows").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || busy || queue?.running) return;
    const segment = job.segments[Number(button.closest("tr").dataset.index) - 1];
    const previous = { ...segment };
    const action = button.dataset.action;
    if (action !== "retry" && !confirm(`请等待服务端处理，并到 B 站「已发布片段」核对标题和时间。\n\n第 ${segment.index} 段：${segment.title}\n${formatTime(segment.start - source.start)}–${formatTime(segment.end - source.start)}\n\n你已确认此段${action === "confirmed" ? "已提交" : "没有提交，可以重试"}吗？`)) return;
    segment.status = action === "confirmed" ? "submitted" : "pending";
    segment.error = "";
    if (action === "confirmed") { segment.confirmation = "user"; segment.submittedAt = Date.now(); }
    job.status = "paused";
    try { await save(); notify("核对结果已保存，可继续处理其余片段。", "success"); }
    catch (error) { Object.assign(segment, previous); render(); notify(`保存失败：${error.message}`, "error"); }
  });

  element("startButton").addEventListener("click", () => {
    if (!job || busy || queue?.running || dirty) return;
    const segments = job.segments.filter((item) => item.enabled && item.status === "pending");
    element("confirmationText").textContent = `将向 B 站账号 ${source.accountId} 提交 ${segments.length} 个独立片段，使用上方预览的标题和官方回放封面。片段投稿会展示在个人空间和动态中。`;
    element("confirmDialog").showModal();
  });
  element("confirmDialog").addEventListener("close", async () => {
    if (element("confirmDialog").returnValue !== "submit" || busy || queue?.running) return;
    busy = true;
    render();
    try {
      await adapter.lock(async () => {
        const current = await adapter.load(source);
        if (current) job = recoverJob(current);
        namingHistory = await adapter.savePlan(job);
        queue = new SubmissionQueue({ job, submit: adapter.submit, save: adapter.save, changed: render });
        notify("队列已开始，遇到失败或待核对结果会自动暂停。");
        await queue.run();
        if (job.status === "completed") notify("所有选中片段已提交。请到 B 站稿件管理查看生成与审核进度。", "success");
        else notify("队列已暂停，进度已保存。请处理表格中的提示后继续。", "info");
      });
    } catch (error) { notify(error.message, "error"); }
    finally { busy = false; render(); }
  });
  element("pauseButton").addEventListener("click", () => queue?.pause());
  element("refreshButton").addEventListener("click", loadSource);
  element("helpButton").addEventListener("click", () => element("helpDialog").showModal());
  element("aboutButton").addEventListener("click", () => element("aboutDialog").showModal());
  element("exportButton").addEventListener("click", () => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(job, null, 2)], { type: "application/json" }));
    link.download = `回放接力-${source.liveKey}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
  window.addEventListener("beforeunload", (event) => {
    if (queue?.running) { event.preventDefault(); event.returnValue = ""; }
  });
  render();
  const metadataReady = fetch(new URL("./manifest.json", import.meta.url)).then((response) => response.json()).then((manifest) => {
    element("toolVersion").textContent = `本地工具 · v${manifest.version}`;
    element("aboutVersion").textContent = `版本 ${manifest.version} · 本地 Chrome 扩展`;
  }).catch(() => { element("aboutVersion").textContent = "本地 Chrome 扩展 · 可在 Chrome 扩展详情查看版本"; });
  const ready = Promise.all([loadSource(), metadataReady]);
  return { isRunning: () => busy || Boolean(queue?.running), notify, ready };
}
