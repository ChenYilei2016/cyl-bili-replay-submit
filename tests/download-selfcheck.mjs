import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { chromeVideoDownloadAdapter, downloadFilename, parseDownloadInfo, requestVideoInPage, selectMediaUrl } from "../extension/video-download.js";

const mediaUrl = "https://cdn.bilivideo.com/upgcxcode/example.mp4";
const combined = {
  quality: 64, format: "mp4720", accept_quality: [64, 16], accept_description: ["高清 720P", "流畅 360P"],
  durl: [{ url: "http://node.mcdn.bilivideo.cn:8082/upgcxcode/example.mp4", backup_url: [mediaUrl] }]
};
const separated = {
  accept_quality: [64, 32, 16], accept_description: ["高清 720P", "清晰 480P", "流畅 360P"],
  dash: {
    video: [
      { id: 64, codecs: "hvc1.1.6", bandwidth: 120000, base_url: mediaUrl },
      { id: 64, codecs: "avc1.64001F", bandwidth: 300000, baseUrl: mediaUrl + "?codec=avc" },
      { id: 32, codecs: "avc1.64001E", bandwidth: 200000, baseUrl: mediaUrl }
    ],
    audio: [{ id: 30280, codecs: "mp4a.40.2", bandwidth: 192000, baseUrl: mediaUrl }],
    flac: { audio: { id: 30251, codecs: "fLaC", mimeType: "audio/mp4", baseUrl: mediaUrl } }
  }
};
const parsed = parseDownloadInfo(combined, separated);
assert.equal(parsed.videosWithAudio[0].url, mediaUrl, "优先使用标准 HTTPS 备用 CDN");
assert.equal(parsed.videos.length, 2, "同一清晰度不重复展示不同编码");
assert.match(parsed.videos[0].url, /codec=avc/, "优先兼容性更好的 AVC");
assert.equal(parsed.audios[0].label, "AAC · 192 kbps", "AAC 高码率不得标成无损");
assert.equal(parsed.audios[1].label, "FLAC 无损");
assert.equal(parsed.audios[1].extension, "m4a", "FLAC 编码仍须保留 MP4 容器扩展名");
assert.equal(selectMediaUrl({ url: "https://bilivideo.com.attacker.example/test" }), "");
assert.equal(selectMediaUrl({ url: "https://cdn.bilivideo.com@attacker.example/test" }), "");
assert.equal(selectMediaUrl({ url: "javascript:alert(1)" }), "");
assert.equal(parseDownloadInfo(null, separated).videos.length, 2, "完整视频读取失败时仍可展示独立音视频");
const multipart = parseDownloadInfo({ ...combined, durl: [{ url: mediaUrl }, { url: mediaUrl + "?part=2" }] });
assert.equal(multipart.videosWithAudio.length, 2, "完整保留所有分段，不能只下载第一段");
assert.match(multipart.videosWithAudio[1].label, /2\/2/);
assert.throws(() => parseDownloadInfo({ ...combined, durl: [{ url: mediaUrl }, { url: "https://unknown.example/video" }] }), /部分视频/);

const requests = [];
const context = {
  URL, URLSearchParams, AbortSignal,
  location: { href: "https://www.bilibili.com/video/BV1pAWA63Et8/?p=2" },
  fetch: async (input, options) => {
    const url = new URL(input);
    requests.push({ url, options });
    const data = url.pathname.endsWith("/view")
      ? { bvid: "BV1pAWA63Et8", title: "测试/标题", pages: [{ cid: 100, part: "第一 P" }, { cid: 200, part: "第二 P" }] }
      : url.searchParams.has("fnval") ? separated : combined;
    return { ok: true, json: async () => ({ code: 0, data }) };
  }
};
const bridge = vm.runInNewContext(`(${requestVideoInPage.toString()})`, context);
const initial = await bridge();
assert.equal(initial.ok, true);
assert.equal(initial.data.source.cid, "200", "必须使用当前分 P 的 cid");
assert.equal(requests.length, 3, "初始化只读取一次元信息和两种播放格式");
assert.equal(requests.every(({ options }) => options.credentials === "include"), true);
assert.equal(requests.filter(({ url }) => url.pathname.endsWith("/playurl")).every(({ url }) => url.searchParams.get("cid") === "200"), true);
const source = initial.data.source;
await bridge({ quality: 16, source });
assert.equal(requests.length, 5, "切换完整视频清晰度不重复读取 DASH");
assert.equal(requests.at(-1).url.searchParams.get("qn"), "16");
context.location.href = "https://www.bilibili.com/video/BV1pAWA63Et8/?p=1";
assert.match((await bridge({ quality: 64, source })).error, /切换/);
assert.equal(requests.length, 6, "视频改变后不请求旧分 P 的播放地址");
context.location.href = "https://www.bilibili.com.attacker.example/video/BV1pAWA63Et8/";
assert.equal((await bridge()).ok, false);
assert.equal(requests.length, 6);
context.location.href = "https://www.bilibili.com/video/BV1pAWA63Et8/?p=1";
const originalFetch = context.fetch;
context.fetch = async (input, options) => new URL(input).searchParams.has("otype")
  ? { ok: false, status: 403 } : originalFetch(input, options);
const partial = await bridge();
assert.equal(partial.ok, true);
assert.equal(partial.data.combined, null);
assert.equal(partial.data.separated.dash.audio.length, 1);
assert.match(partial.data.errors[0], /403/);

let rules;
let clicked = 0;
let anchor;
const downloadPage = {
  URL, location: { href: source.pageUrl },
  document: {
    createElement: () => (anchor = { click: () => { clicked++; }, remove: () => {} }),
    body: { append: () => {} }
  }
};
globalThis.chrome = {
  runtime: { id: "test-extension" },
  declarativeNetRequest: { updateSessionRules: async (value) => { rules = value; } },
  scripting: { executeScript: async ({ func, args, target, world }) => {
    assert.equal(target.tabId, 1);
    assert.equal(world, "MAIN", "下载必须在原 B 站页发起，浏览器才会自然携带 B 站来源");
    return [{ result: vm.runInNewContext(`(${func.toString()})`, downloadPage)(...args) }];
  } },
  downloads: { download: async () => { throw new Error("403 Forbidden：扩展页发起的下载未携带 B 站来源"); } }
};
await chromeVideoDownloadAdapter(1).download(source, parsed.videosWithAudio[0]);
assert.equal(clicked, 1);
assert.equal(anchor.href, mediaUrl);
assert.equal(anchor.referrerPolicy, "strict-origin-when-cross-origin");
assert.equal(anchor.target, "_blank", "下载不能替换原 B 站视频页");
const downloadRule = rules.addRules[0];
assert.equal(downloadRule.condition.urlFilter, `|${mediaUrl}|`, "规则必须从头到尾精确匹配本次下载的完整地址");
assert.deepEqual(downloadRule.condition.resourceTypes, ["main_frame"], "附件规则只匹配文件导航，不影响播放器媒体请求");
assert.equal(downloadRule.condition.initiatorDomains, undefined, "规则不依赖浏览器下载请求的 initiator");
const disposition = downloadRule.action.responseHeaders[0];
assert.equal(disposition.header, "Content-Disposition");
assert.equal(disposition.value, `attachment; filename*=UTF-8''${encodeURIComponent(downloadFilename(source, parsed.videosWithAudio[0]))}`);
assert.equal(downloadFilename(source, parsed.videosWithAudio[0]).includes("测试_标题"), true);
assert.equal(downloadFilename(source, multipart.videosWithAudio[0]) === downloadFilename(source, multipart.videosWithAudio[1]), false);
assert.ok(Buffer.byteLength(downloadFilename({ ...source, title: "中".repeat(100) }, parsed.videosWithAudio[0])) < 255);
const signedFile = { ...parsed.videosWithAudio[0], url: mediaUrl + "?e=a.b%2Fc&deadline=1792598888" };
await chromeVideoDownloadAdapter(1).download(source, signedFile);
assert.equal(anchor.href, signedFile.url, "保留下载地址的完整签名参数");
assert.equal(rules.addRules[0].condition.urlFilter, `|${signedFile.url}|`);
await assert.rejects(chromeVideoDownloadAdapter(1).download(source, { url: "file:///etc/passwd" }), /地址无效/);
downloadPage.location.href = source.pageUrl.replace("p=2", "p=1");
await assert.rejects(chromeVideoDownloadAdapter(1).download(source, parsed.videosWithAudio[0]), /切换/);
assert.equal(clicked, 2, "切换视频后不能启动旧视频的下载");
delete globalThis.chrome;

const opened = [];
const stored = {};
let onClicked;
const backgroundChrome = {
  action: { onClicked: { addListener: (listener) => { onClicked = listener; } } },
  storage: { session: { get: async () => ({}), set: async (value) => Object.assign(stored, value) } },
  runtime: { getURL: (path) => `chrome-extension://test/${path}` },
  tabs: { create: async (value) => { opened.push(value.url); return { id: opened.length }; } }
};
vm.runInNewContext(await readFile(new URL("../extension/background.js", import.meta.url), "utf8"), { chrome: backgroundChrome });
await onClicked({ id: 11, url: "https://www.bilibili.com/video/BV1pAWA63Et8/?p=2" });
await onClicked({ id: 12, url: "https://live.bilibili.com/web-cut/quick-publish.html?live_key=123" });
assert.match(opened[0], /download\.html\?tab=11$/);
assert.match(opened[1], /workbench\.html\?tab=12$/);
assert.equal(stored.downloadTabId, 1);
assert.equal(stored.workbenchTabId, 2);
console.log("下载自检通过：当前分 P、清晰度、音轨标签、完整分段、CDN 地址、下载请求和投稿入口分流。");
