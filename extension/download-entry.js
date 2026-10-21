import { mountVideoDownloader } from "./download-app.js";
import { chromeVideoDownloadAdapter } from "./video-download.js";

const tabId = Number(new URL(location.href).searchParams.get("tab"));
const downloader = mountVideoDownloader(chromeVideoDownloadAdapter(tabId));
chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== "VIDEO_SOURCE_SELECTED") return;
  if (downloader.isRunning()) {
    downloader.notify("正在准备下载，请完成当前操作后再切换视频。");
    return;
  }
  const url = new URL(location.href);
  url.searchParams.set("tab", String(message.tabId));
  location.replace(url.href);
});
