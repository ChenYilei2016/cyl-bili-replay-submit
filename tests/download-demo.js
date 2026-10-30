(() => {
  const top = window.parent === window;
  const makeEvent = () => {
    const listeners = new Set();
    return { addListener: (listener) => listeners.add(listener), removeListener: (listener) => listeners.delete(listener),
      emit: (...args) => [...listeners].forEach((listener) => listener(...args)) };
  };
  const broker = top ? { content: makeEvent(), ui: makeEvent(), created: makeEvent(), changed: makeEvent(), items: new Map(), downloadId: 0 } : window.parent.cylDownloadDemo;
  if (top) window.cylDownloadDemo = broker;
  const profile = () => /^\/\d+(?:\/upload\/video)?\/?$/.test((top ? window : window.parent).location.pathname);
  window.chrome = {
    runtime: {
      id: "local-demo",
      getURL: (path) => `/tests/panel/${path}`,
      onMessage: top ? broker.content : broker.ui,
      sendMessage: async (message) => {
        if (message.type === "DOWNLOAD_CONTEXT") return { ok: true, tabId: 1, kind: profile() ? "uploader" : "video", uploaderId: "1790439" };
        if (message.type === "UP_SELECTION_CHANGED") broker.ui.emit({ type: "BATCH_SELECTION_CHANGED", tabId: 1, videos: message.videos });
        return { ok: true };
      }
    },
    tabs: { sendMessage: async (tabId, message) => {
      let response;
      broker.content.emit(message, {}, (value) => { response = value; });
      return response;
    } },
    declarativeNetRequest: { updateSessionRules: async () => {} },
    downloads: { onCreated: broker.created, onChanged: broker.changed, search: async ({ id }) => broker.items.has(id) ? [broker.items.get(id)] : [] },
    scripting: { executeScript: async ({ func, args }) => {
      if (func.name === "startDownloadInPage") {
        const id = ++broker.downloadId;
        broker.items.set(id, { id, url: args[1], state: "in_progress" });
        broker.created.emit({ id, url: args[1], state: "in_progress" });
        setTimeout(() => {
          broker.items.set(id, { id, url: args[1], state: "complete" });
          broker.changed.emit({ id, state: { current: "complete" } });
        }, 200);
        return [{ result: { ok: true } }];
      }
      const options = args[0] || {};
      const bvid = options.bvid || options.source?.bvid || "BV1DEMO11111";
      const source = options.source || { bvid, cid: `${bvid}1`, pageNumber: 1, title: `演示视频 ${bvid.slice(-2)} · 当前分 P 下载`, part: "第一 P", pageUrl: `https://www.bilibili.com/video/${bvid}/?p=1`, ...(profile() ? { uploaderId: "1790439" } : {}) };
      if (profile() && options.bvid) return [{ result: { ok: true, data: { source,
        parts: Array.from({ length: bvid.endsWith("11111") ? 2 : 1 }, (_, index) => ({ cid: `${bvid}${index + 1}`, pageNumber: index + 1, part: `第 ${index + 1} P` }))
      } } }];
      const file = `https://cdn.bilivideo.com/upgcxcode/${source.cid}.mp4`;
      return [{ result: { ok: true, data: { source, errors: [],
        combined: { quality: options.quality || 64, format: "mp4720", accept_quality: [64, 16], accept_description: ["高清 720P", "流畅 360P"], durl: [{ url: file }] },
        separated: { accept_quality: [64, 32, 16], accept_description: ["高清 720P", "清晰 480P", "流畅 360P"], dash: {
          video: [{ id: 64, codecs: "avc1", bandwidth: 400000, baseUrl: file }, { id: 32, codecs: "avc1", bandwidth: 200000, baseUrl: file }],
          audio: [{ id: 30280, codecs: "mp4a.40.2", bandwidth: 192000, baseUrl: file }, { id: 30216, codecs: "mp4a.40.2", bandwidth: 64000, baseUrl: file }]
        } }
      } } }];
    } }
  };
  if (!top) return;
  const isProfile = profile();
  document.getElementById("previewTitle").textContent = isProfile ? "球磨川 · UP 投稿视频演示" : "当前视频 · 右上角原位下载演示";
  document.getElementById("previewDescription").textContent = isProfile ? "在封面勾选、全选当前页，或切到下一页继续选择，再从右上角开始下载。" : "点击右上角「下载视频」，下载选项直接在本页面展开。";
  document.getElementById("previewPagination").hidden = !isProfile;
  document.getElementById("previewPlayer").hidden = isProfile;
  let page = 0;
  const renderCards = () => {
    document.getElementById("previewCards").innerHTML = isProfile ? Array.from({ length: 6 }, (_, index) => {
      const number = page * 6 + index + 1;
      const bvid = `BV1DEMO${String(number).repeat(5)}`;
      return `<article class="bili-video-card"><div class="bili-video-card__cover"><a href="https://www.bilibili.com/video/${bvid}/">${String(number).padStart(2, "0")}</a></div><div class="bili-video-card__title"><a href="https://www.bilibili.com/video/${bvid}/">演示视频 ${number} · ${number === 1 ? "包含两个分 P" : "带声音的视频"}</a></div></article>`;
    }).join("") : "";
  };
  renderCards();
  document.getElementById("previewCards").addEventListener("click", (event) => { if (event.target.closest("a")) event.preventDefault(); });
  document.getElementById("nextPreviewPage").addEventListener("click", () => { page = (page + 1) % 2; history.pushState(null, "", `?pn=${page + 1}`); renderCards(); });
  (async () => {
    for (const name of ["uploader-selection.js", "download-content.js"]) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = `/extension/${name}`;
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
      });
    }
  })();
})();
