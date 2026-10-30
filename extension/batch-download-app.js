import { BatchDownloadQueue } from "./batch-download.js";

export function mountBatchDownloader(adapter, initialVideos = []) {
  const element = (id) => document.getElementById(id);
  let selected = initialVideos;
  let queue = null;
  const notify = (message, tone = "info") => {
    element("notice").textContent = message;
    element("notice").className = `notice ${tone}`;
    element("notice").hidden = !message;
  };
  const render = () => {
    const items = queue?.items || selected.map((video) => ({ ...video, status: "pending" }));
    const done = items.filter((item) => item.status === "completed").length;
    element("batchSummary").textContent = queue ? `本次队列 ${items.length} 个 · 已完成 ${done} 个 · 当前勾选 ${selected.length} 个`
      : selected.length ? `已勾选 ${selected.length} 个视频` : "请在主页视频封面勾选要下载的视频。";
    element("batchStart").disabled = Boolean(queue?.running || queue?.completed) || !items.length;
    element("batchStart").textContent = queue?.completed ? "全部完成" : queue?.error ? "重试并继续" : queue ? "继续下载" : "开始下载";
    element("batchPause").hidden = !queue?.running;
    element("batchPause").disabled = Boolean(queue?.pauseRequested);
    element("batchPause").textContent = queue?.pauseRequested ? "当前文件完成后暂停" : "暂停后续";
    element("batchRebuild").hidden = !queue;
    element("batchRebuild").disabled = Boolean(queue?.running) || !selected.length;
    element("batchQuality").disabled = Boolean(queue);
    const rows = element("batchRows");
    rows.replaceChildren();
    const labels = { pending: "等待下载", running: "下载中", paused: "已暂停", failed: "下载失败", completed: "已完成" };
    for (const item of items) {
      const row = document.createElement("li");
      row.innerHTML = '<strong></strong><small></small><span></span>';
      row.querySelector("strong").textContent = item.title;
      row.querySelector("small").textContent = item.partCount
        ? `${item.bvid} · P${Math.min(item.nextPart + 1, item.partCount)}/${item.partCount} · 已保存 ${item.completedFiles} 个文件${item.actualQuality ? ` · ${item.actualQuality}` : ""}` : item.bvid;
      row.querySelector("span").textContent = item.error || labels[item.status];
      row.className = item.status;
      rows.append(row);
    }
    if (queue?.error) notify(queue.error, "error");
    else if (queue?.completed) notify("队列全部下载完成。", "success");
    else if (queue?.pauseRequested && !queue.running) notify("后续下载已暂停，可以继续原队列。");
    else if (queue?.running) notify("正在逐个下载，请留意 Chrome 的多文件下载提示。");
    else notify("");
  };
  element("batchStart").addEventListener("click", async () => {
    try {
      if (!queue) queue = new BatchDownloadQueue(selected, adapter, Number(element("batchQuality").value), render);
      await queue.run();
    } catch (error) { notify(error.message, "error"); }
  });
  element("batchPause").addEventListener("click", () => queue?.pause());
  element("batchRebuild").addEventListener("click", () => { queue = null; render(); });
  render();
  return {
    setSelection: (videos) => {
      selected = videos.filter((video) => /^BV[\da-zA-Z]+$/.test(video.bvid)).slice(0, 100);
      render();
    }
  };
}
