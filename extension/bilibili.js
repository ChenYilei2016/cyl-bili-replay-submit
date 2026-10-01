import { loadNamingHistory, namingHistoryKey, rememberNaming } from "./naming-history.js";

// 在用户点击扩展授权的 B 站页中运行。登录凭据只在该页内使用，不返回给扩展。
export async function requestInPage(action, payload = {}) {
  const failure = (message, kind = "preflight") => ({ ok: false, error: { message, kind } });
  const pageUrl = new URL(location.href);
  if (pageUrl.origin !== "https://live.bilibili.com" || pageUrl.pathname !== "/web-cut/quick-publish.html") {
    return failure("请在自己的直播回放列表点击「投片段」，再点击扩展图标。");
  }
  if (pageUrl.searchParams.has("anchor_id") || pageUrl.searchParams.has("anchor_Id") || pageUrl.searchParams.has("uid")) {
    return failure("当前版本仅支持自己的主播回放，请从直播中心进入。");
  }
  const cookieValue = (name) => document.cookie.split(";").map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) || "";
  const accountId = cookieValue("DedeUserID");
  if (!/^\d+$/.test(accountId)) return failure("请先在 B 站网页登录自己的账号。");
  const liveKey = pageUrl.searchParams.get("live_key") || "";
  const start = Number(pageUrl.searchParams.get("start_time"));
  const end = Number(pageUrl.searchParams.get("end_time"));
  if (!/^\d+$/.test(liveKey) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start <= 0 || end <= start) {
    return failure("当前页面的回放参数不完整，请重新从「投片段」进入。");
  }
  const base = "https://api.live.bilibili.com/xlive/app-blink/v1/anchorVideo/";
  const get = async (endpoint, params) => {
    const url = new URL(base + endpoint);
    url.search = new URLSearchParams({ ...params, web_location: "444.194" });
    const response = await fetch(url, { credentials: "include", signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`B 站读取失败（HTTP ${response.status}），请检查网络或登录状态。`);
    const result = await response.json();
    if (result.code !== 0) throw new Error(`B 站读取失败：${result.message || result.msg || result.code}`);
    return result.data;
  };
  if (action === "inspect") {
    try {
      const [stream, settings] = await Promise.all([
        get("GetSliceStream", { live_key: liveKey, start_time: String(start), end_time: String(end) }),
        get("AnchorGetSettings", { live_key: liveKey })
      ]);
      if (!Array.isArray(stream?.list)) return failure("官方回放接口格式发生变化，请更新工具。");
      const cover = pageUrl.searchParams.get("cover") || "";
      if (cover) {
        const coverUrl = new URL(cover);
        if (coverUrl.protocol !== "https:" || !coverUrl.hostname.endsWith(".hdslb.com")) return failure("回放封面地址格式不受支持，请从官方列表重新打开。");
      }
      return { ok: true, data: {
        accountId, liveKey, start, end, cover, pageUrl: pageUrl.href,
        intervals: stream.list.map((item) => ({ start: item.start_time, end: item.end_time })),
        hasRestrictedContent: Array.isArray(stream.ban_list) ? stream.ban_list.length > 0 : Boolean(stream.ban_list),
        canPublishDanmaku: Number(settings?.is_sync_danmaku_publish) === 1
      } };
    } catch (error) { return failure(error.message); }
  }
  if (!["submit", "captureCover", "uploadCover"].includes(action)) return failure("不支持的操作。");
  const { source, segment, withDanmaku } = payload;
  if (!source || source.accountId !== accountId || source.liveKey !== liveKey || source.start !== start || source.end !== end) {
    return failure("B 站账号或回放页已改变，队列已停止。请恢复原账号和原回放页。");
  }
  if (action === "captureCover") {
    const video = Array.from(document.querySelectorAll(".section-selector-player-wrapper video"))
      .find((item) => item.getClientRects().length && item.readyState >= 2 && item.videoWidth > 0 && item.videoHeight > 0);
    if (!video) return failure("请先在官方回放页播放到想要的画面并暂停，再回来截取。");
    try {
      // 与官方「使用当前帧」一致：保持原比例，补黑边生成 1600×900 JPEG。
      const canvas = document.createElement("canvas");
      canvas.width = 1600;
      canvas.height = 900;
      const context = canvas.getContext("2d");
      const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
      const width = video.videoWidth * scale;
      const height = video.videoHeight * scale;
      context.fillStyle = "black";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
      if (dataUrl.length > 2 * 1024 * 1024) return failure("这张截图超过 2 MiB，请换一个画面再试。");
      return { ok: true, data: { dataUrl } };
    } catch {
      return failure("浏览器未能读取这帧画面，请在官方回放页重新播放几秒并暂停后再试。");
    }
  }
  const csrf = cookieValue("bili_jct");
  if (!csrf) return failure("登录状态已失效，请在 B 站重新登录后继续。");
  if (action === "uploadCover") {
    const { dataUrl } = payload;
    if (typeof dataUrl !== "string" || dataUrl.length > 2 * 1024 * 1024
        || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(dataUrl)) {
      return failure("封面截图无效，请重新从回放截取画面。");
    }
    try {
      const blob = await fetch(dataUrl).then((response) => response.blob());
      const body = new FormData();
      body.append("bucket", "live");
      body.append("file", blob, "replay-cover.jpg");
      const url = new URL("https://api.bilibili.com/x/upload/web/image");
      url.searchParams.set("csrf", csrf);
      const response = await fetch(url, { method: "POST", credentials: "include", body, signal: AbortSignal.timeout(60000) });
      if (!response.ok) return failure(`封面上传失败（HTTP ${response.status}），尚未提交视频。`);
      const result = await response.json();
      if (result.code !== 0 || typeof result.data?.location !== "string" || !result.data.location) {
        return failure(`B 站封面上传失败：${result.message || result.msg || result.code}，尚未提交视频。`);
      }
      const location = new URL(result.data.location, pageUrl.origin);
      if (location.protocol === "http:") location.protocol = "https:";
      if (location.protocol !== "https:" || !location.hostname.endsWith(".hdslb.com")) return failure("官方封面地址格式发生变化，尚未提交视频。");
      return { ok: true, data: { url: location.href } };
    } catch {
      return failure("封面上传连接中断或超时，尚未提交视频。请稍后重试。");
    }
  }
  if (!segment || !Number.isSafeInteger(segment.start) || !Number.isSafeInteger(segment.end)
      || segment.start < start || segment.end > end || segment.end <= segment.start || segment.end - segment.start > 7200
      || typeof segment.title !== "string" || !segment.title.trim() || segment.title.length > 80) {
    return failure("片段标题或时间范围无效，未发送投稿请求。");
  }
  if (source.hasRestrictedContent || (withDanmaku && !source.canPublishDanmaku)) return failure("当前回放或弹幕权限不允许此操作。");
  const coverUrl = payload.coverUrl ?? source.cover;
  if (coverUrl) {
    try {
      const cover = new URL(coverUrl);
      if (cover.protocol !== "https:" || !cover.hostname.endsWith(".hdslb.com")) return failure("投稿封面地址无效，未发送投稿请求。");
    } catch { return failure("投稿封面地址无效，未发送投稿请求。"); }
  }
  try {
    const body = new URLSearchParams({
      live_key: liveKey, start_ts: String(segment.start), end_ts: String(segment.end),
      av_title: segment.title.trim(), av_cover: coverUrl, av_highlight: "0",
      with_subtitle: "0", with_danmaku: withDanmaku ? "1" : "0", with_reserve: "0", csrf
    });
    const response = await fetch(base + "AnchorPublishVideoSlice", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
      signal: AbortSignal.timeout(60000)
    });
    if (!response.ok) return failure(`投稿返回 HTTP ${response.status}，结果待核对。请查看 B 站已发布片段。`, "uncertain");
    const result = await response.json();
    if (result.code === 0) return { ok: true, data: { accepted: true } };
    if (typeof result.code !== "number") return failure("官方响应格式发生变化，投稿结果待核对。", "uncertain");
    return failure(`B 站拒绝投稿：${result.message || result.msg || result.code}（${result.code}）。请在官方页面处理后重试。`, "rejected");
  } catch {
    return failure("投稿连接中断或超时，结果待核对。请先查看 B 站已发布片段，避免重复投稿。", "uncertain");
  }
}

export function jobKey(source) {
  return `job:${source.accountId}:${source.liveKey}`;
}

export function chromeAdapter(tabId) {
  const call = async (action, payload) => {
    let results;
    try {
      results = await chrome.scripting.executeScript({
        target: { tabId }, world: "MAIN", func: requestInPage, args: [action, payload]
      });
    } catch {
      const error = new Error("无法连接原回放页。请保持该页打开，点击该页上的扩展图标重新连接。");
      error.kind = action === "submit" ? "uncertain" : "preflight";
      throw error;
    }
    const result = results[0]?.result;
    if (!result?.ok) {
      const error = new Error(result?.error?.message || "没有收到操作结果，请核对 B 站记录。");
      error.kind = result?.error?.kind || "uncertain";
      throw error;
    }
    return result.data;
  };
  return {
    inspect: () => call("inspect", {}),
    submit: (segment, source, options) => call("submit", { segment, source, withDanmaku: options.withDanmaku, coverUrl: options.coverUrl }),
    captureCover: (source) => call("captureCover", { source }),
    uploadCover: (source, dataUrl) => call("uploadCover", { source, dataUrl }),
    openSource: async () => {
      const tab = await chrome.tabs.update(tabId, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    },
    load: async (source) => (await chrome.storage.local.get(jobKey(source)))[jobKey(source)],
    save: async (job) => chrome.storage.local.set({ [jobKey(job.source)]: job }),
    loadNamingHistory: (source) => loadNamingHistory(chrome.storage.local, source.accountId),
    savePlan: async (job) => {
      const history = rememberNaming(await loadNamingHistory(chrome.storage.local, job.source.accountId), job.options);
      await chrome.storage.local.set({ [jobKey(job.source)]: job, [namingHistoryKey(job.source.accountId)]: history });
      return history;
    },
    lock: (callback) => navigator.locks.request("cyl-bili-replay-submit", { ifAvailable: true }, (lock) => {
      if (!lock) throw new Error("另一个工作台正在投稿，请先暂停那个队列。");
      return callback();
    })
  };
}
