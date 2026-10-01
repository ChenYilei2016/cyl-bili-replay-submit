import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { createPlan, DEFAULT_TEMPLATE, formatTime, recoverJob, SubmissionQueue } from "../extension/core.js";
import { chromeAdapter, jobKey, requestInPage } from "../extension/bilibili.js";
import { loadNamingHistory, NAMING_HISTORY_LIMIT, namingHistoryFromJobs, namingHistoryKey, rememberNaming } from "../extension/naming-history.js";

const start = 1790679966;
const source = {
  accountId: "123", liveKey: "900719925474099312", start, end: start + 25200,
  intervals: [{ start, end: start + 25200 }],
  canPublishDanmaku: false, hasRestrictedContent: false,
  cover: "https://i0.hdslb.com/bfs/live/test.jpg"
};
const options = { title: "van 游戏", minutes: 120, intervalSeconds: 15, template: DEFAULT_TEMPLATE };
const plan = createPlan(source, options);
assert.deepEqual(plan.segments.map((item) => [item.start - start, item.end - start]), [[0, 7200], [7200, 14400], [14400, 21600], [21600, 25200]]);
assert.match(plan.segments[3].title, /第 04\/04 段$/);
assert.equal(formatTime(25200), "07:00:00");
assert.equal(createPlan({ ...source, end: start + 7200, intervals: [{ start, end: start + 7200 }] }, options).segments.length, 1);
assert.throws(() => createPlan(source, { ...options, minutes: 121 }), /1–120/);
assert.throws(() => createPlan(source, { ...options, title: "长".repeat(80) }), /标题/);
assert.throws(() => createPlan(source, { ...options, withDanmaku: true }), /未开放/);
assert.throws(() => createPlan(source, { ...options, template: "{unknown}" }), /不支持/);
assert.throws(() => createPlan({ ...source, hasRestrictedContent: true }, options), /受限/);
const discontinuous = createPlan({ ...source, end: start + 20000, intervals: [
  { start, end: start + 3600 }, { start: start + 12000, end: start + 20000 }
] }, options);
assert.deepEqual(discontinuous.segments.map((item) => [item.start - start, item.end - start]), [[0, 3600], [12000, 19200], [19200, 20000]]);

let stored;
const calls = [];
let waits = 0;
const job = structuredClone(plan);
const queue = new SubmissionQueue({
  job, save: async (snapshot) => { stored = snapshot; },
  submit: async (segment) => {
    assert.equal(stored.segments[segment.index - 1].status, "submitting", "发 POST 前必须持久化");
    calls.push(segment.index);
    if (segment.index === 2) throw new Error("模拟响应中断");
  },
  sleep: async () => { waits++; }
});
await queue.run();
assert.deepEqual(calls, [1, 2]);
assert.equal(waits, 1);
assert.deepEqual(job.segments.map((item) => item.status), ["submitted", "uncertain", "pending", "pending"]);
await assert.rejects(queue.run(), /先处理/);
const interrupted = structuredClone(plan);
interrupted.segments[1].status = "submitting";
interrupted.status = "running";
assert.equal(recoverJob(interrupted).segments[1].status, "uncertain");

job.segments[1].status = "submitted"; // 用户在官方记录中核对后确认。
const resumed = [];
await new SubmissionQueue({ job, save: async () => {}, submit: async (item) => resumed.push(item.index), sleep: async () => {} }).run();
assert.deepEqual(resumed, [3, 4]);
assert.equal(job.status, "completed");

const rejected = structuredClone(plan);
await new SubmissionQueue({ job: rejected, save: async () => {}, submit: async () => {
  const error = new Error("B站拒绝"); error.kind = "rejected"; throw error;
} }).run();
assert.equal(rejected.segments[0].status, "failed");
assert.equal(rejected.segments[1].status, "pending");

let pauseQueue;
let pauseCalls = 0;
pauseQueue = new SubmissionQueue({ job: structuredClone(plan), save: async () => {}, submit: async () => { pauseCalls++; pauseQueue.pause(); } });
await pauseQueue.run();
assert.equal(pauseCalls, 1);
assert.equal(pauseQueue.job.segments[0].status, "submitted");
assert.equal(pauseQueue.job.status, "paused");
let storageFailureCalls = 0;
let saves = 0;
await assert.rejects(new SubmissionQueue({ job: structuredClone(plan), save: async () => {
  if (++saves === 2) throw new Error("磁盘写入失败");
}, submit: async () => { storageFailureCalls++; } }).run(), /无法保存/);
assert.equal(storageFailureCalls, 0);

// 用真实桥接函数验证 URL、账号、请求格式和结果分类；没有网络请求。
const networkCalls = [];
const context = {
  URL, URLSearchParams, AbortSignal, Blob, FormData,
  location: { href: `https://live.bilibili.com/web-cut/quick-publish.html?live_key=${source.liveKey}&start_time=${start}&end_time=${source.end}&cover=${encodeURIComponent(source.cover)}` },
  document: { cookie: "DedeUserID=123; bili_jct=TEST_CSRF" },
  fetch: async (url, init = {}) => {
    networkCalls.push({ url: String(url), init });
    if (init.method === "POST") return { ok: true, json: async () => ({ code: 0, data: {} }) };
    return { ok: true, json: async () => ({ code: 0, data: { list: [{ start_time: start, end_time: source.end }], is_sync_danmaku_publish: "0" } }) };
  }
};
const bridge = vm.runInNewContext(`(${requestInPage.toString()})`, context);
const inspected = await bridge("inspect");
assert.equal(inspected.ok, true);
assert.equal(inspected.data.liveKey, source.liveKey, "回放 ID 必须保持字符串精度");
assert.equal(inspected.data.canPublishDanmaku, false);
assert.equal(JSON.stringify(inspected).includes("TEST_CSRF"), false, "登录凭据不得离开页面");
const response = await bridge("submit", { source, segment: plan.segments[0], withDanmaku: false });
assert.equal(response.ok, true);
const post = networkCalls.at(-1);
assert.equal(post.url, "https://api.live.bilibili.com/xlive/app-blink/v1/anchorVideo/AnchorPublishVideoSlice");
assert.equal(post.init.credentials, "include");
assert.equal(post.init.body.get("csrf"), "TEST_CSRF");
assert.equal(post.init.body.get("end_ts"), String(start + 7200));
assert.equal(post.init.body.get("live_key"), source.liveKey);
assert.equal(post.init.body.get("av_cover"), source.cover);
const imageData = "data:image/jpeg;base64,/9j/2Q==";
const video = { readyState: 4, videoWidth: 1200, videoHeight: 900, getClientRects: () => [{}] };
let drawn;
let renderedCanvas;
context.document.querySelectorAll = () => [video];
context.document.createElement = () => {
  const canvas = {
    getContext: () => ({ fillRect: () => {}, drawImage: (...args) => { drawn = args; } }),
    toDataURL: (type, quality) => { assert.equal(type, "image/jpeg"); assert.equal(quality, 0.8); return imageData; }
  };
  renderedCanvas = canvas;
  return canvas;
};
const captured = await bridge("captureCover", { source });
assert.equal(captured.data.dataUrl, imageData);
assert.equal(renderedCanvas.width, 1600);
assert.equal(renderedCanvas.height, 900);
assert.deepEqual(drawn.slice(1), [200, 0, 1200, 900], "截帧保持原比例并补边");
video.readyState = 0;
assert.equal((await bridge("captureCover", { source })).ok, false);
video.readyState = 4;
const originalFetch = context.fetch;
const uploadedUrl = "https://i0.hdslb.com/bfs/live/custom-cover.jpg";
context.fetch = async (url, init = {}) => {
  if (String(url).startsWith("data:")) return { blob: async () => new Blob([new Uint8Array([255, 216, 255, 217])], { type: "image/jpeg" }) };
  if (String(url).startsWith("https://api.bilibili.com/x/upload/web/image")) {
    assert.equal(new URL(url).searchParams.get("csrf"), "TEST_CSRF");
    assert.equal(init.credentials, "include");
    assert.equal(init.body.get("bucket"), "live");
    assert.equal(init.body.get("file").type, "image/jpeg");
    return { ok: true, json: async () => ({ code: 0, data: { location: uploadedUrl } }) };
  }
  return originalFetch(url, init);
};
assert.equal((await bridge("uploadCover", { source, dataUrl: imageData })).data.url, uploadedUrl);
await bridge("submit", { source, segment: plan.segments[0], coverUrl: uploadedUrl, withDanmaku: false });
assert.equal(networkCalls.at(-1).init.body.get("av_cover"), uploadedUrl, "投稿使用选中的封面");
const callsBeforeInvalidCover = networkCalls.length;
assert.equal((await bridge("submit", { source, segment: plan.segments[0], coverUrl: "https://example.com/cover.jpg" })).ok, false);
assert.equal(networkCalls.length, callsBeforeInvalidCover);
assert.equal((await bridge("uploadCover", { source, dataUrl: "data:image/svg+xml;base64,QQ==" })).ok, false);
context.fetch = async (url) => String(url).startsWith("data:") ? { blob: async () => new Blob([], { type: "image/jpeg" }) } : { ok: false, status: 503 };
assert.equal((await bridge("uploadCover", { source, dataUrl: imageData })).error.kind, "preflight", "封面上传失败时未提交视频");
context.fetch = originalFetch;
const before = networkCalls.length;
context.document.cookie = "DedeUserID=999; bili_jct=TEST_CSRF";
assert.equal((await bridge("submit", { source, segment: plan.segments[1] })).error.kind, "preflight");
assert.equal(networkCalls.length, before, "账号改变时不得发送请求");
assert.equal((await bridge("captureCover", { source })).error.kind, "preflight");
context.document.cookie = "DedeUserID=123; bili_jct=TEST_CSRF";
context.fetch = async () => { throw new Error("timeout"); };
assert.equal((await bridge("submit", { source, segment: plan.segments[1] })).error.kind, "uncertain");
context.fetch = async () => ({ ok: true, json: async () => ({ code: -101, message: "登录失效" }) });
assert.equal((await bridge("submit", { source, segment: plan.segments[1] })).error.kind, "rejected");

const manifest = JSON.parse(await readFile(new URL("../extension/manifest.json", import.meta.url)));
assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "storage"]);
assert.match(manifest.description, /球磨川みそぎ.*ChenYilei2016.*1790439/);

let naming = [];
for (let index = 0; index < 25; index++) naming = rememberNaming(naming, { title: `游戏 ${index}`, template: "{date} P{index} {title}" }, index + 1);
assert.equal(naming.length, NAMING_HISTORY_LIMIT);
naming = rememberNaming(naming, { title: "游戏 10", template: "{date} P{index} {title}" }, 30);
assert.equal(naming[0].title, "游戏 10");
assert.equal(naming.filter((item) => item.title === "游戏 10").length, 1, "相同名字和格式去重");
naming = rememberNaming(naming, { title: "游戏 10", template: "{title} 第{index}段" }, 31);
assert.equal(naming.filter((item) => item.title === "游戏 10").length, 2, "同名的不同格式都要保留");
const legacyJobs = {
  [`job:123:${source.liveKey}`]: { ...plan, updatedAt: 100 },
  "job:999:other": { ...plan, source: { ...source, accountId: "999" }, options: { ...options, title: "别的账号" }, updatedAt: 200 }
};
assert.equal(namingHistoryFromJobs(legacyJobs, "123")[0].title, "van 游戏");
assert.equal(namingHistoryFromJobs(legacyJobs, "123").length, 1, "历史按账号隔离");
const data = structuredClone(legacyJobs);
const batches = [];
const storage = {
  get: async (keys) => {
    if (keys === null) return structuredClone(data);
    const list = typeof keys === "string" ? [keys] : keys;
    batches.push(list.length);
    return Object.fromEntries(list.filter((key) => key in data).map((key) => [key, data[key]]));
  },
  getKeys: async () => Object.keys(data),
  set: async (values) => Object.assign(data, values)
};
for (let index = 0; index < 110; index++) data[`job:123:${index}`] = { ...plan, options: { ...options, title: `旧队列 ${index}` }, updatedAt: 1000 + index };
const migrated = await loadNamingHistory(storage, "123");
assert.equal(migrated.length, 20);
assert.equal(migrated[0].title, "旧队列 109");
assert.equal(batches.every((size) => size <= 50), true);
assert.ok(data[namingHistoryKey("123")]);
const count = batches.length;
await loadNamingHistory(storage, "123");
assert.equal(batches.length, count + 1, "迁移仅执行一次，后续只读历史键");
const compatible = { get: async () => legacyJobs, set: async () => {} };
assert.equal((await loadNamingHistory(compatible, "123"))[0].title, "van 游戏", "旧 Chrome 兼容迁移");
const nextStart = start + 86400;
const nextSource = { ...source, liveKey: "900719925474099313", start: nextStart, end: nextStart + 25200, intervals: [{ start: nextStart, end: nextStart + 25200 }] };
const reused = createPlan(nextSource, { ...options, ...naming[0] });
assert.equal(reused.segments[0].start, nextStart);
assert.equal(reused.segments[0].title, "游戏 10 第01段");
const dated = createPlan(nextSource, { ...options, template: "{date} P{index} {title}" });
assert.match(dated.segments[0].title, /2026-09-30 P01 van 游戏/);
globalThis.chrome = { storage: { local: storage } };
const savedNaming = await chromeAdapter(1).savePlan(plan);
assert.equal(savedNaming[0].title, "van 游戏");
assert.deepEqual(data[jobKey(source)], plan);
assert.deepEqual(data[namingHistoryKey("123")], savedNaming);
delete globalThis.chrome;
console.log("自检通过：分段、暂停恢复、作者与命名历史、截帧尺寸、封面上传格式、封面投稿参数和账号校验。");
