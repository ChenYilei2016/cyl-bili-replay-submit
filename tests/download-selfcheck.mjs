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

context.fetch = originalFetch;
context.location.href = "https://space.bilibili.com/1790439/upload/video";
const beforeUploader = requests.length;
const uploaderMetadata = await bridge({ bvid: "BV1pAWA63Et8" });
assert.equal(uploaderMetadata.ok, true);
assert.equal(uploaderMetadata.data.parts.length, 2);
assert.equal(requests.length, beforeUploader + 1, "批量下载每个视频只读取一次分 P 列表");
const uploaderSource = { ...uploaderMetadata.data.source, ...uploaderMetadata.data.parts[1] };
assert.equal((await bridge({ source: uploaderSource, quality: 64 })).ok, true);
assert.equal(requests.length, beforeUploader + 2, "逐 P 下载不重复读取视频元信息");
assert.equal(requests.at(-1).url.searchParams.get("cid"), "200");
context.location.href = "https://space.bilibili.com/999/upload/video";
assert.match((await bridge({ source: uploaderSource })).error, /切换/);
assert.equal(requests.length, beforeUploader + 2);

let rules;
let framesCreated = 0;
let transfer;
const transfers = [];
const createdListeners = new Set();
let nativeDownloadId = 0;
let activeRule = false;
let starts = Promise.resolve();
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { locks: { request: (name, task) => {
  assert.equal(name, "cyl-bili-download-start");
  const next = starts.then(task);
  starts = next.catch(() => {});
  return next;
} } } });
const downloadPage = {
  URL, location: { href: source.pageUrl },
  document: {
    getElementById: () => transfer,
    createElement: (tag) => {
      assert.equal(tag, "iframe", "下载不能打开新的标签页");
      transfer = {};
      Object.defineProperty(transfer, "src", { get: () => transfers.at(-1), set: (url) => {
        transfers.push(url);
        for (const listener of createdListeners) listener({ id: ++nativeDownloadId, url, state: "in_progress" });
      } });
      framesCreated++;
      return transfer;
    },
    body: { append: () => {} }
  }
};
globalThis.chrome = {
  runtime: { id: "test-extension" },
  declarativeNetRequest: { updateSessionRules: async (value) => {
    if (value.addRules) {
      assert.equal(activeRule, false, "新的下载启动前不能覆盖尚未被浏览器接受的附件规则");
      activeRule = true;
      rules = value;
    } else activeRule = false;
  } },
  scripting: { executeScript: async ({ func, args, target, world }) => {
    assert.ok([1, 2].includes(target.tabId));
    assert.equal(world, "MAIN", "下载必须在原 B 站页发起，浏览器才会自然携带 B 站来源");
    return [{ result: vm.runInNewContext(`(${func.toString()})`, downloadPage)(...args) }];
  } },
  downloads: {
    onCreated: { addListener: (listener) => createdListeners.add(listener), removeListener: (listener) => createdListeners.delete(listener) },
    download: async () => { throw new Error("403 Forbidden：扩展页发起的下载未携带 B 站来源"); }
  }
};
assert.equal(await chromeVideoDownloadAdapter(1).download(source, parsed.videosWithAudio[0]), 1, "返回浏览器已接受的下载 ID");
assert.equal(createdListeners.size, 0, "启动后释放匹配监听器");
assert.equal(transfers.length, 1);
assert.equal(transfer.src, mediaUrl);
assert.equal(transfer.referrerPolicy, "strict-origin-when-cross-origin");
assert.equal(transfer.hidden, true, "文件传输不遮挡原视频或 UP 主页");
const downloadRule = rules.addRules[0];
assert.equal(downloadRule.condition.urlFilter, `|${mediaUrl}|`, "规则必须从头到尾精确匹配本次下载的完整地址");
assert.deepEqual(downloadRule.condition.resourceTypes, ["sub_frame"], "附件规则只匹配下载帧，不影响播放器媒体请求");
assert.equal(downloadRule.condition.initiatorDomains, undefined, "规则不依赖浏览器下载请求的 initiator");
const disposition = downloadRule.action.responseHeaders[0];
assert.equal(disposition.header, "Content-Disposition");
assert.equal(disposition.value, `attachment; filename*=UTF-8''${encodeURIComponent(downloadFilename(source, parsed.videosWithAudio[0]))}`);
assert.equal(downloadFilename(source, parsed.videosWithAudio[0]).includes("测试_标题"), true);
assert.equal(downloadFilename(source, multipart.videosWithAudio[0]) === downloadFilename(source, multipart.videosWithAudio[1]), false);
assert.ok(Buffer.byteLength(downloadFilename({ ...source, title: "中".repeat(100) }, parsed.videosWithAudio[0])) < 255);
const signedFile = { ...parsed.videosWithAudio[0], url: mediaUrl + "?e=a.b%2Fc&deadline=1792598888" };
await chromeVideoDownloadAdapter(1).download(source, signedFile);
assert.equal(transfer.src, signedFile.url, "保留下载地址的完整签名参数");
assert.equal(framesCreated, 1, "多个下载复用同一个传输帧");
assert.equal(rules.addRules[0].condition.urlFilter, `|${signedFile.url}|`);
await assert.rejects(chromeVideoDownloadAdapter(1).download(source, { url: "file:///etc/passwd" }), /地址无效/);
downloadPage.location.href = source.pageUrl.replace("p=2", "p=1");
await assert.rejects(chromeVideoDownloadAdapter(1).download(source, parsed.videosWithAudio[0]), /切换/);
assert.equal(transfers.length, 2, "切换视频后不能启动旧视频的下载");
downloadPage.location.href = "https://space.bilibili.com/1790439/upload/video";
await chromeVideoDownloadAdapter(1).download(uploaderSource, parsed.videosWithAudio[0]);
assert.equal(transfers.length, 3, "允许在原 UP 主页下载所选视频");
downloadPage.location.href = "https://space.bilibili.com/999/upload/video";
await assert.rejects(chromeVideoDownloadAdapter(1).download(uploaderSource, parsed.videosWithAudio[0]), /切换/);
assert.equal(transfers.length, 3);
downloadPage.location.href = source.pageUrl;
await Promise.all([
  chromeVideoDownloadAdapter(1).download(source, parsed.videosWithAudio[0]),
  chromeVideoDownloadAdapter(2).download(source, signedFile)
]);
assert.equal(transfers.length, 5);
assert.equal(activeRule, false, "文件开始后释放附件规则");
assert.equal(createdListeners.size, 0);
delete globalThis.chrome;
if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
else delete globalThis.navigator;

const opened = [];
const stored = {};
let onClicked;
let onMessage;
let contentMissing = true;
const panelMessages = [];
const injections = [];
const backgroundChrome = {
  action: { onClicked: { addListener: (listener) => { onClicked = listener; } } },
  storage: { session: { get: async () => ({}), set: async (value) => Object.assign(stored, value) } },
  runtime: { getURL: (path) => `chrome-extension://test/${path}`, onMessage: { addListener: (listener) => { onMessage = listener; } } },
  scripting: { executeScript: async (options) => { injections.push(options); contentMissing = false; } },
  tabs: {
    create: async (value) => { opened.push(value.url); return { id: opened.length }; },
    sendMessage: async (tabId, message, options) => {
      if (contentMissing) throw new Error("尚未加载内容脚本");
      panelMessages.push({ tabId, message, options });
    }
  }
};
vm.runInNewContext(await readFile(new URL("../extension/background.js", import.meta.url), "utf8"), { chrome: backgroundChrome });
await onClicked({ id: 11, url: "https://www.bilibili.com/video/BV1pAWA63Et8/?p=2" });
assert.equal(opened.length, 0, "视频页点击扩展也应在当前页面打开面板");
assert.equal(injections.length, 1, "旧页面可按需注入，避免要求先重开整个视频");
assert.equal(panelMessages[0].message.type, "TOGGLE_VIDEO_DOWNLOAD");
assert.equal(panelMessages[0].tabId, 11);
await onClicked({ id: 13, url: "https://space.bilibili.com/1790439/upload/video" });
assert.equal(opened.length, 0, "UP 批量下载也不新开工作台");
assert.equal(injections.length, 1, "已加载的内容脚本不重复注入");
await onClicked({ id: 12, url: "https://live.bilibili.com/web-cut/quick-publish.html?live_key=123" });
assert.match(opened[0], /workbench\.html\?tab=12$/);
assert.equal(stored.workbenchTabId, 1);
let panelContext;
onMessage({ type: "DOWNLOAD_CONTEXT", tabId: 999 }, { tab: { id: 11, url: "https://www.bilibili.com/video/BV1pAWA63Et8/" } }, (value) => { panelContext = value; });
assert.equal(panelContext.tabId, 11, "嵌入面板只能连接其实际所在的标签页");
assert.equal(panelContext.kind, "video");
onMessage({ type: "DOWNLOAD_CONTEXT" }, { tab: { id: 13, url: "https://space.bilibili.com/1790439/" } }, (value) => { panelContext = value; });
assert.equal(panelContext.kind, "uploader");
onMessage({ type: "DOWNLOAD_CONTEXT" }, { tab: { id: 15, url: "https://example.com/" } }, (value) => { panelContext = value; });
assert.equal(panelContext.ok, false);

const manifest = JSON.parse(await readFile(new URL("../extension/manifest.json", import.meta.url)));
assert.deepEqual(manifest.content_scripts[0].js, ["uploader-selection.js", "download-content.js"]);
assert.ok(manifest.content_scripts[0].matches.includes("https://space.bilibili.com/*"));
assert.deepEqual(manifest.web_accessible_resources[0].resources, ["download.html", "batch-download.html", "icons/logo.svg"]);
console.log("下载自检通过：当前分 P、清晰度、音轨标签、完整分段、CDN 地址、下载请求和投稿入口分流。");
