chrome.action.onClicked.addListener(async (sourceTab) => {
  const { workbenchTabId } = await chrome.storage.session.get("workbenchTabId");
  if (workbenchTabId) {
    try {
      const tab = await chrome.tabs.get(workbenchTabId);
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.runtime.sendMessage({ type: "SOURCE_SELECTED", tabId: sourceTab.id });
      return;
    } catch {
      // 工作台关闭后，用这次点击授权的回放页重新打开。
    }
  }
  const tab = await chrome.tabs.create({
    url: chrome.runtime.getURL(`workbench.html?tab=${sourceTab.id}`)
  });
  await chrome.storage.session.set({ workbenchTabId: tab.id });
});
