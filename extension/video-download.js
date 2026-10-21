// 在点击图标授权的普通视频页执行，登录凭据只由 B 站网页使用。
export async function requestVideoInPage({ quality = 64, source: expectedSource } = {}) {
  try {
    const pageUrl = new URL(location.href);
    const match = pageUrl.pathname.match(/^\/video\/(BV[\da-zA-Z]+|av\d+)\/?$/);
    if (pageUrl.protocol !== "https:" || !["www.bilibili.com", "bilibili.com"].includes(pageUrl.hostname) || !match) {
      throw new Error("请在 B 站普通视频播放页点击扩展图标。");
    }
    const pageNumber = Number(pageUrl.searchParams.get("p") || 1);
    if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || !Number.isInteger(quality) || quality < 1) {
      throw new Error("视频分 P 或清晰度参数无效，请重新打开视频。");
    }
    const get = async (path, params) => {
      const url = new URL(path, "https://api.bilibili.com");
      url.search = new URLSearchParams(params);
      const response = await fetch(url, { credentials: "include", signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`B 站读取失败（HTTP ${response.status}）。`);
      const result = await response.json();
      if (result.code !== 0) throw new Error(`B 站读取失败：${result.message || result.msg || result.code}`);
      const data = result.data || result.result;
      if (!data) throw new Error("B 站未返回视频信息，请刷新后重试。");
      return data;
    };
    const identifier = match[1].startsWith("BV") ? { bvid: match[1] } : { aid: match[1].slice(2) };
    const video = await get("/x/web-interface/view", identifier);
    const part = video.pages?.[pageNumber - 1];
    if (!part?.cid || !video.bvid) throw new Error("当前分 P 不存在，请重新选择视频分 P。");
    const source = {
      bvid: video.bvid, cid: String(part.cid), pageNumber, title: video.title, part: part.part,
      cover: String(video.pic || "").replace(/^http:/, "https:"), pageUrl: `${pageUrl.origin}${pageUrl.pathname}?p=${pageNumber}`
    };
    if (expectedSource && (expectedSource.bvid !== source.bvid || expectedSource.cid !== source.cid)) {
      throw new Error("原视频页已切换视频或分 P，请先点击「重新读取」。");
    }
    const params = { bvid: source.bvid, cid: source.cid, qn: String(quality), fourk: "1" };
    if (expectedSource) {
      return { ok: true, data: { source, combined: await get("/x/player/playurl", { ...params, otype: "json" }) } };
    }
    const results = await Promise.allSettled([
      get("/x/player/playurl", { ...params, otype: "json" }),
      get("/x/player/playurl", { ...params, fnver: "0", fnval: "16", voice_balance: "1" })
    ]);
    const errors = results.flatMap((result, index) => result.status === "rejected"
      ? [`${index === 0 ? "带声音的视频" : "独立音视频"}：${result.reason.message}`] : []);
    return { ok: true, data: {
      source, combined: results[0].status === "fulfilled" ? results[0].value : null,
      separated: results[1].status === "fulfilled" ? results[1].value : null, errors
    } };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export function selectMediaUrl(stream) {
  const candidates = [stream?.url, stream?.baseUrl, stream?.base_url, ...[].concat(stream?.backupUrl || stream?.backup_url || [])];
  const urls = candidates.flatMap((value) => {
    try {
      const url = new URL(value);
      const supported = ["bilivideo.com", "bilivideo.cn", "hdslb.com"]
        .some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
      return supported && ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? [url] : [];
    } catch { return []; }
  });
  // 优先用标准 HTTPS CDN，避免部分网络无法连接的 P2P 节点和特殊端口。
  return (urls.find((url) => url.protocol === "https:" && !url.port) || urls[0])?.href || "";
}

export function parseDownloadInfo(combined, separated) {
  const qualityLabel = (data, quality) => {
    const index = data?.accept_quality?.indexOf(quality) ?? -1;
    return data?.accept_description?.[index] || `清晰度 ${quality}`;
  };
  const qualities = (combined?.accept_quality || []).map((quality) => ({ quality, label: qualityLabel(combined, quality) }));
  const parts = combined?.durl || [];
  const videosWithAudio = parts.map((part, index) => ({
    url: selectMediaUrl(part), kind: "video-audio", quality: combined.quality, index: index + 1,
    label: qualityLabel(combined, combined.quality) + (parts.length > 1 ? ` · 第 ${index + 1}/${parts.length} 段` : ""),
    extension: combined.format?.startsWith("flv") ? "flv" : "mp4"
  }));
  if (videosWithAudio.some((file) => !file.url)) throw new Error("视频包含无法识别的下载地址，请重新读取，避免只保存部分视频。");

  const streams = separated?.dash;
  const byQuality = new Map();
  const videoStreams = [...(streams?.video || [])].sort((left, right) =>
    Number(right.codecs?.startsWith("avc")) - Number(left.codecs?.startsWith("avc")) || right.bandwidth - left.bandwidth);
  for (const stream of videoStreams) {
    const url = selectMediaUrl(stream);
    if (url && !byQuality.has(stream.id)) byQuality.set(stream.id, {
      url, kind: "video", quality: stream.id, label: qualityLabel(separated, stream.id), extension: "mp4"
    });
  }
  const audioGroups = [
    { streams: streams?.audio || [], name: "" },
    { streams: streams?.flac?.audio ? [streams.flac.audio] : [], name: "FLAC 无损" },
    { streams: streams?.dolby?.audio || [], name: "杜比音频" }
  ];
  const byAudioId = new Map();
  for (const group of audioGroups) {
    for (const stream of group.streams) {
      const url = selectMediaUrl(stream);
      if (!url) continue;
      const encoding = group.name || (stream.codecs?.startsWith("mp4a") ? "AAC" : stream.codecs || "音频");
      const bitrate = stream.bandwidth ? ` · ${Math.round(stream.bandwidth / 1000)} kbps` : "";
      byAudioId.set(stream.id, {
        url, kind: "audio", quality: stream.id, label: encoding + bitrate,
        extension: (stream.mimeType || stream.mime_type) === "audio/flac" ? "flac" : "m4a"
      });
    }
  }
  return { qualities, videosWithAudio, videos: [...byQuality.values()].sort((a, b) => b.quality - a.quality),
    audios: [...byAudioId.values()].sort((a, b) => b.quality - a.quality) };
}

export function downloadFilename(source, file) {
  const title = Array.from(String(source.title || source.bvid).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")).slice(0, 50).join("").trim();
  return `${title}_${source.bvid}_P${source.pageNumber}_${file.kind}-${file.quality || 0}${file.index ? `-${file.index}` : ""}.${file.extension}`;
}

function startDownloadInPage(source, mediaUrl) {
  const current = new URL(location.href);
  const expected = new URL(source.pageUrl);
  if (!["https://www.bilibili.com", "https://bilibili.com"].includes(current.origin)
      || current.origin !== expected.origin
      || current.pathname.replace(/\/$/, "") !== expected.pathname.replace(/\/$/, "")
      || Number(current.searchParams.get("p") || 1) !== source.pageNumber) {
    return { ok: false, error: "原视频页已切换视频或分 P，请先点击「重新读取」。" };
  }
  // 从 B 站页面导航到 CDN，浏览器自然携带其来源，避免扩展下载请求丢失 Referer。
  const link = document.createElement("a");
  link.href = mediaUrl;
  link.target = "_blank";
  link.rel = "noopener";
  link.referrerPolicy = "strict-origin-when-cross-origin";
  document.body.append(link);
  link.click();
  link.remove();
  return { ok: true };
}

export function chromeVideoDownloadAdapter(tabId) {
  return {
    load: async (options = {}) => {
      let results;
      try {
        results = await chrome.scripting.executeScript({
          target: { tabId }, world: "MAIN", func: requestVideoInPage, args: [options]
        });
      } catch {
        throw new Error("无法连接原视频页。请在视频页再次点击扩展图标。");
      }
      const result = results[0]?.result;
      if (!result?.ok) throw new Error(result?.error || "没有收到视频信息，请重新读取。");
      return result.data;
    },
    download: async (source, file) => {
      const url = selectMediaUrl({ url: file.url });
      if (!url) throw new Error("下载地址无效，请重新读取视频信息。");
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [1],
        addRules: [{
          id: 1, priority: 1,
          action: { type: "modifyHeaders", responseHeaders: [{
            header: "Content-Disposition", operation: "set",
            value: `attachment; filename*=UTF-8''${encodeURIComponent(downloadFilename(source, file))}`
          }] },
          condition: { urlFilter: `|${url}|`, resourceTypes: ["main_frame"] }
        }]
      });
      let results;
      try {
        results = await chrome.scripting.executeScript({
          target: { tabId }, world: "MAIN", func: startDownloadInPage, args: [source, url]
        });
      } catch {
        throw new Error("无法在原视频页启动下载，请在 B 站视频页再次点击扩展图标。");
      }
      const result = results[0]?.result;
      if (!result?.ok) throw new Error(result?.error || "未能启动下载，请重新读取视频。");
    }
  };
}
