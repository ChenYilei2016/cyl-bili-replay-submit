import { mountWorkbench } from "./app.js";
import { chromeAdapter } from "./bilibili.js";

const tabId = Number(new URL(location.href).searchParams.get("tab"));
let workbench = mountWorkbench(chromeAdapter(tabId));
chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== "SOURCE_SELECTED") return;
  if (workbench.isRunning()) {
    workbench.notify("队列运行中，已保留当前回放。请先暂停，再切换回放。");
    return;
  }
  const url = new URL(location.href);
  url.searchParams.set("tab", String(message.tabId));
  location.replace(url.href);
});
