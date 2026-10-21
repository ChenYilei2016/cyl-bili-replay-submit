chrome.action.onClicked.addListener(async (sourceTab) => {
  const isVideo = /^https:\/\/(?:www\.)?bilibili\.com\/video\/(?:BV[\da-zA-Z]+|av\d+)\/?(?:[?#]|$)/.test(sourceTab.url || "");
  const storageKey = isVideo ? "downloadTabId" : "workbenchTabId";
  const messageType = isVideo ? "VIDEO_SOURCE_SELECTED" : "SOURCE_SELECTED";
  const { [storageKey]: workbenchTabId } = await chrome.storage.session.get(storageKey);
  if (workbenchTabId) {
    try {
      const tab = await chrome.tabs.get(workbenchTabId);
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.runtime.sendMessage({ type: messageType, tabId: sourceTab.id });
      return;
    } catch {
      // 工作台关闭后，用这次点击授权的来源页重新打开。
    }
  }
  const tab = await chrome.tabs.create({
    url: chrome.runtime.getURL(`${isVideo ? "download.html" : "workbench.html"}?tab=${sourceTab.id}`)
  });
  await chrome.storage.session.set({ [storageKey]: tab.id });
});
