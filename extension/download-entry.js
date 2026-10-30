import { mountVideoDownloader } from "./download-app.js";
import { chromeVideoDownloadAdapter } from "./video-download.js";

async function connectDownloader() {
  const params = new URL(location.href).searchParams;
  let tabId = Number(params.get("tab"));
  if (params.get("embedded") === "1") {
    document.body.classList.add("embedded");
    const context = await chrome.runtime.sendMessage({ type: "DOWNLOAD_CONTEXT" });
    if (!context?.ok) throw new Error(context?.error || "无法连接当前视频页，请刷新视频后重试。");
    tabId = context.tabId;
  }
  if (!Number.isInteger(tabId) || tabId <= 0) throw new Error("未连接到 B 站视频页，请从视频页右上角打开下载面板。");
  mountVideoDownloader(chromeVideoDownloadAdapter(tabId));
}

connectDownloader().catch((error) => {
  const notice = document.getElementById("notice");
  notice.textContent = error.message;
  notice.className = "notice error";
  notice.hidden = false;
});
