const isVideoPage = (url) => /^https:\/\/(?:www\.)?bilibili\.com\/video\/(?:BV[\da-zA-Z]+|av\d+)\/?(?:[?#]|$)/.test(url || "");
const uploaderId = (url) => (url || "").match(/^https:\/\/space\.bilibili\.com\/(\d+)(?:\/(?:upload(?:\/video)?|video))?\/?(?:[?#]|$)/)?.[1];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const upId = uploaderId(sender.tab?.url);
  if (message.type === "UP_SELECTION_CHANGED" && upId && Array.isArray(message.videos) && message.videos.length <= 100) {
    chrome.runtime.sendMessage({ type: "BATCH_SELECTION_CHANGED", tabId: sender.tab.id, videos: message.videos }).catch(() => {});
    sendResponse({ ok: true });
    return;
  }
  if (message.type !== "DOWNLOAD_CONTEXT") return;
  if (!isVideoPage(sender.tab?.url) && !upId) {
    sendResponse({ ok: false, error: "请刷新 B 站视频页或 UP 主页，再打开下载面板。" });
    return;
  }
  sendResponse({ ok: true, tabId: sender.tab.id, kind: upId ? "uploader" : "video", uploaderId: upId });
});

chrome.action.onClicked.addListener(async (sourceTab) => {
  if (isVideoPage(sourceTab.url) || uploaderId(sourceTab.url)) {
    const message = { type: "TOGGLE_VIDEO_DOWNLOAD" };
    try {
      await chrome.tabs.sendMessage(sourceTab.id, message, { frameId: 0 });
    } catch {
      await chrome.scripting.executeScript({ target: { tabId: sourceTab.id }, files: ["uploader-selection.js", "download-content.js"] });
      await chrome.tabs.sendMessage(sourceTab.id, message, { frameId: 0 });
    }
    return;
  }
  const { workbenchTabId } = await chrome.storage.session.get("workbenchTabId");
  if (workbenchTabId) {
    try {
      const tab = await chrome.tabs.get(workbenchTabId);
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.runtime.sendMessage({ type: "SOURCE_SELECTED", tabId: sourceTab.id });
      return;
    } catch {
      // 工作台关闭后，用这次点击授权的来源页重新打开。
    }
  }
  const tab = await chrome.tabs.create({
    url: chrome.runtime.getURL(`workbench.html?tab=${sourceTab.id}`)
  });
  await chrome.storage.session.set({ workbenchTabId: tab.id });
});
