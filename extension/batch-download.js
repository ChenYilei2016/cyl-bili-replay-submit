import { parseDownloadInfo } from "./video-download.js";

// 只跟踪当前队列的这个 URL，不读取或保存用户的其他下载记录。
export async function waitForPageDownload(adapter, source, file) {
  let downloadId = null;
  let resolveDownload;
  let rejectDownload;
  const finished = new Promise((resolve, reject) => { resolveDownload = resolve; rejectDownload = reject; });
  const onChanged = (delta) => {
    if (delta.id !== downloadId) return;
    if (delta.state?.current === "complete") resolveDownload();
    if (delta.state?.current === "interrupted") rejectDownload(new Error(`浏览器下载中断：${delta.error?.current || "请查看 Chrome 下载列表"}`));
  };
  chrome.downloads.onChanged.addListener(onChanged);
  try {
    downloadId = await adapter.download(source, file);
    const current = chrome.downloads.search({ id: downloadId }).then(([item]) => {
      if (!item) throw new Error("找不到本次下载记录，请查看 Chrome 下载列表。");
      if (item.state === "complete") resolveDownload();
      if (item.state === "interrupted") rejectDownload(new Error(`浏览器下载中断：${item.error || "请查看 Chrome 下载列表"}`));
    });
    await Promise.all([current, finished]);
  } finally {
    chrome.downloads.onChanged.removeListener(onChanged);
  }
}

export class BatchDownloadQueue {
  constructor(videos, adapter, quality = 64, onChange = () => {}) {
    if (!Array.isArray(videos) || !videos.length || videos.length > 100) throw new Error("请选择 1–100 个视频。");
    if (videos.some((video) => !/^BV[\da-zA-Z]+$/.test(video.bvid))) throw new Error("所选视频编号无效，请重新勾选。");
    this.items = [...new Map(videos.map((video) => [video.bvid, video])).values()].map((video) => ({
      bvid: video.bvid, title: video.title, status: "pending", metadata: null, partCount: 0, nextPart: 0, nextFile: 0, completedFiles: 0, error: ""
    }));
    this.adapter = adapter;
    this.quality = quality;
    this.onChange = onChange;
    this.running = false;
    this.pauseRequested = false;
    this.error = "";
  }

  pause() { this.pauseRequested = true; this.onChange(); }
  get completed() { return this.items.every((item) => item.status === "completed"); }

  async downloadVideo(item) {
    if (!item.metadata) item.metadata = await this.adapter.load({ bvid: item.bvid });
    const { source, parts } = item.metadata;
    if (!parts?.length) throw new Error("视频没有可下载的分 P。");
    item.title = source.title;
    item.partCount = parts.length;
    while (item.nextPart < parts.length && !this.pauseRequested) {
      const part = parts[item.nextPart];
      const partSource = { ...source, ...part };
      const data = await this.adapter.load({ source: partSource, quality: this.quality });
      const files = parseDownloadInfo(data.combined).videosWithAudio;
      if (!files.length) throw new Error(`P${part.pageNumber} 暂无带声音的视频，已暂停队列。`);
      item.actualQuality = files[0].label;
      for (; item.nextFile < files.length; item.nextFile++) {
        if (this.pauseRequested) return;
        this.onChange();
        await waitForPageDownload(this.adapter, partSource, files[item.nextFile]);
        item.completedFiles++;
        this.onChange();
        if (!this.pauseRequested) await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      item.nextPart++;
      item.nextFile = 0;
    }
    if (item.nextPart === parts.length) {
      item.status = "completed";
      item.metadata = null;
    }
  }

  async run() {
    if (this.running || this.completed) return;
    this.running = true;
    this.pauseRequested = false;
    this.error = "";
    try {
      for (const item of this.items) {
        if (item.status === "completed") continue;
        item.status = "running";
        item.error = "";
        this.onChange();
        try {
          await this.downloadVideo(item);
        } catch (error) {
          item.status = "failed";
          item.error = error.message;
          this.error = error.message;
          break;
        }
        if (this.pauseRequested) { if (item.status !== "completed") item.status = "paused"; break; }
      }
    } finally {
      this.running = false;
      this.onChange();
    }
  }
}
