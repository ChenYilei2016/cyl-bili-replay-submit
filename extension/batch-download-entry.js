import { mountBatchDownloader } from "./batch-download-app.js";
import { chromeVideoDownloadAdapter } from "./video-download.js";

async function connectBatch() {
  const context = await chrome.runtime.sendMessage({ type: "DOWNLOAD_CONTEXT" });
  if (!context?.ok || context.kind !== "uploader") throw new Error("请从 UP 主页右上角打开批量下载面板。");
  let app = null;
  let latest = null;
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== "BATCH_SELECTION_CHANGED" || message.tabId !== context.tabId || !Array.isArray(message.videos)) return;
    latest = message.videos;
    app?.setSelection(latest);
  });
  const selection = await chrome.tabs.sendMessage(context.tabId, { type: "GET_SELECTED_VIDEOS" }, { frameId: 0 });
  app = mountBatchDownloader(chromeVideoDownloadAdapter(context.tabId), latest || selection.videos || []);
}

connectBatch().catch((error) => {
  const notice = document.getElementById("notice");
  notice.textContent = error.message;
  notice.className = "notice error";
  notice.hidden = false;
});
