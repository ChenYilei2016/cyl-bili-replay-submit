import assert from "node:assert/strict";
import { BatchDownloadQueue, waitForPageDownload } from "../extension/batch-download.js";

const event = () => {
  const listeners = new Set();
  return { addListener: (listener) => listeners.add(listener), removeListener: (listener) => listeners.delete(listener),
    emit: (value) => [...listeners].forEach((listener) => listener(value)), count: () => listeners.size };
};
const created = event();
const changed = event();
const nativeItems = new Map();
globalThis.chrome = { downloads: { onCreated: created, onChanged: changed, search: async ({ id }) => nativeItems.has(id) ? [nativeItems.get(id)] : [] } };
let id = 0;
let active = 0;
let maxActive = 0;
let interrupted = false;
const downloaded = [];
const reads = [];
const adapter = {
  load: async (options) => {
    reads.push(options);
    if (options.bvid) return {
      source: { bvid: options.bvid, title: `视频 ${options.bvid}`, uploaderId: "1790439" },
      parts: [{ cid: "100", pageNumber: 1, part: "第一 P" }, { cid: "200", pageNumber: 2, part: "第二 P" }]
    };
    return { combined: { quality: 64, format: "mp4720", accept_quality: [64], accept_description: ["高清 720P"],
      durl: Array.from({ length: options.source.cid === "100" ? 2 : 1 }, (_, index) => ({
        url: `https://cdn.bilivideo.com/upgcxcode/${options.source.bvid}-${options.source.cid}-${index}.mp4`
      })) } };
  },
  download: async (source, file) => {
    const currentId = ++id;
    active++;
    maxActive = Math.max(maxActive, active);
    downloaded.push(file.url);
    nativeItems.set(currentId, { id: currentId, url: file.url, state: "in_progress" });
    created.emit({ id: 999999, url: "https://example.com/unrelated.mp4", state: "complete" });
    created.emit({ id: currentId, url: file.url, state: "in_progress" });
    queueMicrotask(() => {
      active--;
      nativeItems.set(currentId, { id: currentId, state: interrupted ? "interrupted" : "complete", ...(interrupted ? { error: "SERVER_FORBIDDEN" } : {}) });
      changed.emit({ id: currentId, state: { current: interrupted ? "interrupted" : "complete" },
        ...(interrupted ? { error: { current: "SERVER_FORBIDDEN" } } : {}) });
    });
    return currentId;
  }
};

let pausedOnce = false;
const queue = new BatchDownloadQueue([{ bvid: "BV1TEST11111", title: "双 P 视频" }], adapter, 64, () => {
  if (queue.items[0].completedFiles === 1 && !pausedOnce) { pausedOnce = true; queue.pause(); }
});
await queue.run();
assert.equal(queue.items[0].status, "paused");
assert.equal(queue.items[0].nextPart, 0);
assert.equal(queue.items[0].nextFile, 1, "暂停后保留当前 P 已完成的文件位置");
assert.equal(downloaded.length, 1);
await queue.run();
assert.equal(queue.completed, true);
assert.equal(queue.items[0].completedFiles, 3);
assert.equal(queue.items[0].metadata, null, "完成后释放完整分 P 列表，避免随队列长度累积加载的数据");
assert.equal(new Set(downloaded).size, 3, "恢复时不能重复下载已完成的文件");
assert.equal(reads.filter((options) => options.bvid).length, 1, "整个视频只读取一次分 P 列表");
assert.equal(maxActive, 1, "必须等文件下载完成后再启动下一个文件");
assert.equal(created.count(), 0);
assert.equal(changed.count(), 0);

interrupted = true;
const failed = new BatchDownloadQueue([{ bvid: "BV1FAIL11111", title: "失败视频" }, { bvid: "BV1NEXT11111", title: "后续视频" }], adapter);
await failed.run();
assert.match(failed.error, /SERVER_FORBIDDEN/);
assert.equal(failed.items[0].status, "failed");
assert.equal(failed.items[0].completedFiles, 0);
assert.equal(failed.items[1].metadata, null, "失败后暂停，不能继续批量请求后续视频");
assert.equal(created.count(), 0);
assert.equal(changed.count(), 0);
await assert.rejects(waitForPageDownload({ download: async () => { throw new Error("页面已关闭"); } }, {}, { url: "https://cdn.bilivideo.com/test.mp4" }), /页面已关闭/);
assert.equal(created.count(), 0, "启动失败时清理下载监听器");
assert.equal(changed.count(), 0);
assert.throws(() => new BatchDownloadQueue([], adapter), /1–100/);
assert.throws(() => new BatchDownloadQueue([{ bvid: "javascript:bad" }], adapter), /编号无效/);
delete globalThis.chrome;
console.log("批量自检通过：多 P、多文件、串行下载、暂停继续、失败停止和监听器清理。");
