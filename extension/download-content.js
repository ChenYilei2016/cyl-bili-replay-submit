(() => {
  const hostId = "cyl-bili-video-download";
  const logoUrl = chrome.runtime.getURL("icons/logo.svg");
  document.getElementById(hostId)?.remove();
  const host = document.createElement("div");
  host.id = hostId;
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      :host { all: initial; position: fixed; top: 88px; right: 20px; z-index: 2147483647; font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; color: #172b3e; }
      :host([hidden]), [hidden] { display: none !important; }
      * { box-sizing: border-box; }
      button { font: inherit; cursor: pointer; }
      button:focus-visible { outline: 3px solid #79d9f7; outline-offset: 3px; }
      .trigger { display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 15px; border: 1px solid #cce9f4; border-radius: 20px; background: #fff; color: #007ca8; font-weight: 600; box-shadow: 0 3px 14px #172b3e16; }
      .trigger:hover, .trigger[aria-expanded="true"] { background: #eaf8fd; }
      .brand-logo { display: block; width: 22px; height: 22px; flex-shrink: 0; border-radius: 6px; }
      .panel { position: absolute; top: 48px; right: 0; display: flex; flex-direction: column; width: min(440px, calc(100vw - 32px)); height: min(650px, calc(100dvh - 156px)); border: 1px solid #dfe8ee; border-radius: 12px; background: #fff; box-shadow: 0 12px 40px #172b3e29; overflow: hidden; }
      .heading { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; padding: 13px 16px; border-bottom: 1px solid #e8edf1; }
      .heading strong { font-size: 14px; font-weight: 650; }
      .heading-brand { display: flex; align-items: center; gap: 9px; }
      .selection-tools { padding: 10px 14px; border-bottom: 1px solid #e8edf1; }
      .selection-tools button { padding: 5px 9px; margin-right: 8px; border: 1px solid #d9e7ed; border-radius: 5px; background: #fff; color: #007ca8; font-size: 12px; }
      .selection-tools p { margin: 8px 0 0; color: #617d8d; font-size: 11px; line-height: 1.5; }
      .close { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: #657c8f; font-size: 22px; line-height: 1; }
      .close:hover { background: #f0f5f8; }
      iframe { display: block; flex: 1; width: 100%; min-height: 0; border: 0; background: #fff; }
      @media (max-width: 600px) { :host { top: 76px; right: 12px; } .panel { width: calc(100vw - 24px); height: calc(100dvh - 144px); } }
    </style>
    <button class="trigger" type="button" aria-expanded="false" aria-controls="downloadPanel">
      <img class="brand-logo" src="${logoUrl}" alt=""><span id="triggerLabel">下载视频</span>
    </button>
    <section id="downloadPanel" class="panel" role="dialog" aria-label="视频下载" hidden>
      <div class="heading"><div class="heading-brand"><img class="brand-logo" src="${logoUrl}" alt=""><strong>回放接力 · 视频下载</strong></div><button class="close" type="button" aria-label="关闭下载面板">×</button></div>
      <div id="selectionTools" class="selection-tools" hidden><button id="selectPage" type="button">全选当前页</button><button id="clearSelection" type="button">清空已选</button><p id="selectionHint">在视频封面勾选，支持跨页选择，最多 100 个。</p></div>
    </section>`;
  const trigger = root.querySelector(".trigger");
  const panel = root.getElementById("downloadPanel");
  const close = root.querySelector(".close");
  let frame = null;
  let loadedPage = "";
  let selection = null;

  const currentPage = () => {
    const uploader = location.pathname.match(/^\/(\d+)(?:\/(?:upload(?:\/video)?|video))?\/?$/);
    if (uploader) return `uploader:${uploader[1]}`;
    if (!/^\/video\/(?:BV[\da-zA-Z]+|av\d+)\/?$/.test(location.pathname)) return "";
    return `${location.pathname}?p=${new URL(location.href).searchParams.get("p") || "1"}`;
  };
  const syncPage = () => {
    const page = currentPage();
    const isUploader = page.startsWith("uploader:");
    host.hidden = !page;
    root.getElementById("selectionTools").hidden = !isUploader;
    root.querySelector(".heading strong").textContent = isUploader ? "回放接力 · UP 视频批量下载" : "回放接力 · 视频下载";
    root.getElementById("triggerLabel").textContent = isUploader ? `下载已选（${selection?.videos().length || 0}）` : "下载视频";
    selection?.scan();
    if (!page) {
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    } else if (frame && !panel.hidden && loadedPage !== page) {
      loadedPage = page;
      frame.src = chrome.runtime.getURL(`${isUploader ? "batch-download.html" : "download.html"}?embedded=1&source=${encodeURIComponent(page)}`);
    }
  };
  selection = globalThis.createUploaderVideoSelection((videos, error) => {
    if (currentPage().startsWith("uploader:")) root.getElementById("triggerLabel").textContent = `下载已选（${videos.length}）`;
    root.getElementById("selectionHint").textContent = error || "在视频封面勾选，支持跨页选择，最多 100 个。";
  });
  root.getElementById("selectPage").addEventListener("click", () => selection.selectPage());
  root.getElementById("clearSelection").addEventListener("click", () => selection.clear());
  const setOpen = (open) => {
    if (open && !currentPage()) return;
    panel.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
    if (open) {
      if (!frame) {
        frame = document.createElement("iframe");
        frame.title = "B站视频下载选项";
        panel.append(frame);
      }
      syncPage();
      close.focus();
    }
  };
  trigger.addEventListener("click", () => setOpen(panel.hidden));
  close.addEventListener("click", () => { setOpen(false); trigger.focus(); });
  document.addEventListener("pointerdown", (event) => {
    if (!panel.hidden && !event.composedPath().includes(host)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) { setOpen(false); trigger.focus(); }
  });
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "GET_SELECTED_VIDEOS") {
      sendResponse({ videos: selection.videos() });
      return;
    }
    if (message.type !== "TOGGLE_VIDEO_DOWNLOAD") return;
    syncPage();
    setOpen(panel.hidden);
    sendResponse({ ok: true });
  });
  window.addEventListener("popstate", syncPage);
  // 分 P 和选集也可能用 pushState 切换；只检查 URL，未展开时不读取视频接口。
  const timer = setInterval(() => {
    if (!host.isConnected) { clearInterval(timer); return; }
    if (document.visibilityState !== "hidden") syncPage();
  }, 1000);
  document.body.append(host);
  syncPage();
})();
