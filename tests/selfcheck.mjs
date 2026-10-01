import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { createPlan, DEFAULT_TEMPLATE, formatTime, recoverJob, SubmissionQueue } from "../extension/core.js";
import { requestInPage } from "../extension/bilibili.js";

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
  URL, URLSearchParams, AbortSignal,
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
const before = networkCalls.length;
context.document.cookie = "DedeUserID=999; bili_jct=TEST_CSRF";
assert.equal((await bridge("submit", { source, segment: plan.segments[1] })).error.kind, "preflight");
assert.equal(networkCalls.length, before, "账号改变时不得发送请求");
context.document.cookie = "DedeUserID=123; bili_jct=TEST_CSRF";
context.fetch = async () => { throw new Error("timeout"); };
assert.equal((await bridge("submit", { source, segment: plan.segments[1] })).error.kind, "uncertain");
context.fetch = async () => ({ ok: true, json: async () => ({ code: -101, message: "登录失效" }) });
assert.equal((await bridge("submit", { source, segment: plan.segments[1] })).error.kind, "rejected");

const manifest = JSON.parse(await readFile(new URL("../extension/manifest.json", import.meta.url)));
assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "storage"]);
console.log("自检通过：分段边界、断流时间轴、标题和权限、进度落盘、暂停恢复、失败分类、账号校验、投稿请求格式。");
