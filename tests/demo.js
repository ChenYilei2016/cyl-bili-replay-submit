import { mountWorkbench } from "../extension/app.js";
import { normalizeNamingHistory, rememberNaming } from "../extension/naming-history.js";

// 独立演示适配器；不读取浏览器账号，也不调用 B 站接口。
const start = Date.parse("2026-09-29T19:06:00+08:00") / 1000;
const source = {
  accountId: "DEMO", liveKey: "DEMO-7H", start, end: start + 7 * 3600,
  intervals: [{ start, end: start + 7 * 3600 }],
  canPublishDanmaku: false, hasRestrictedContent: false, cover: "", pageUrl: ""
};
const storageKey = "cyl-bili-replay-demo";
const namingKey = "cyl-bili-replay-demo-naming";
async function loadNaming() {
  const saved = JSON.parse(localStorage.getItem(namingKey) || "null");
  if (saved) return normalizeNamingHistory(saved);
  const job = JSON.parse(localStorage.getItem(storageKey) || "null");
  const history = job ? rememberNaming([], job.options, job.updatedAt) : [];
  localStorage.setItem(namingKey, JSON.stringify(history));
  return history;
}
const workbench = mountWorkbench({
  inspect: async () => structuredClone(source),
  load: async () => JSON.parse(localStorage.getItem(storageKey) || "null"),
  save: async (job) => localStorage.setItem(storageKey, JSON.stringify(job)),
  loadNamingHistory: loadNaming,
  savePlan: async (job) => {
    const history = rememberNaming(await loadNaming(), job.options);
    localStorage.setItem(storageKey, JSON.stringify(job));
    localStorage.setItem(namingKey, JSON.stringify(history));
    return history;
  },
  submit: async () => { await new Promise((resolve) => setTimeout(resolve, 900)); },
  lock: (callback) => navigator.locks.request("cyl-bili-replay-demo", { ifAvailable: true }, (lock) => {
    if (!lock) throw new Error("另一个演示页正在运行队列。");
    return callback();
  })
});

// 演示标记和重置控件只存在于辅助页面，正式应用没有模拟分支。
document.querySelector(".environment").innerHTML = '<i></i>交互演示 · 不会真实投稿';
const banner = document.createElement("div");
banner.className = "demo-banner";
banner.textContent = "这是 7 小时回放的交互演示。所有进度都来自模拟队列，不会访问账号或发布视频。";
document.querySelector(".page-heading").after(banner);
document.querySelector('#confirmDialog button[value="submit"]').textContent = "开始模拟投稿";
document.getElementById("startButton").addEventListener("click", () => {
  document.getElementById("confirmationText").textContent = "将模拟提交已选片段，验证编号、间隔和队列进度。本次不会访问 B 站或发布视频。";
});
const resetButton = document.createElement("button");
resetButton.className = "text-button";
resetButton.textContent = "重置演示";
resetButton.addEventListener("click", () => {
  if (workbench.isRunning()) { workbench.notify("请先暂停演示队列，再重置。"); return; }
  localStorage.removeItem(storageKey);
  location.reload();
});
document.querySelector(".environment").after(resetButton);
