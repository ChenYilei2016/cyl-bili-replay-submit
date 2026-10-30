globalThis.createUploaderVideoSelection = (onChange) => {
  const selected = new Map();
  const controls = new WeakMap();
  let activeUploader = "";
  const uploader = () => location.pathname.match(/^\/(\d+)(?:\/(?:upload(?:\/video)?|video))?\/?$/)?.[1] || "";
  const publish = (error = "") => {
    const videos = [...selected.values()];
    onChange(videos, error);
    if (!error) chrome.runtime.sendMessage({ type: "UP_SELECTION_CHANGED", videos }).catch(() => {});
  };
  const scan = () => {
    const upId = uploader();
    if (upId !== activeUploader) {
      activeUploader = upId;
      selected.clear();
      publish();
    }
    if (!upId) return [];
    const videos = new Map();
    for (const card of document.querySelectorAll(".bili-video-card")) {
      const link = card.querySelector('a[href*="/video/BV"]');
      const cover = card.querySelector(".bili-video-card__cover");
      if (!link || !cover) continue;
      const bvid = new URL(link.href, location.href).pathname.match(/^\/video\/(BV[\da-zA-Z]+)\/?$/)?.[1];
      if (!bvid) continue;
      const video = { bvid, title: (card.querySelector(".bili-video-card__title")?.textContent.trim() || bvid).slice(0, 160) };
      videos.set(bvid, video);
      let control = controls.get(card);
      if (!control?.host.isConnected || control.bvid !== bvid) {
        control?.host.remove();
        cover.querySelector("[data-cyl-bili-pick]")?.remove();
        const host = document.createElement("span");
        host.setAttribute("data-cyl-bili-pick", bvid);
        host.style.cssText = "position:absolute;top:8px;left:8px;z-index:20";
        const root = host.attachShadow({ mode: "open" });
        root.innerHTML = `<style>
          label { display:flex;align-items:center;gap:5px;padding:5px 7px;border-radius:5px;background:#ffffffed;color:#17475b;font:12px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;box-shadow:0 1px 5px #0002;cursor:pointer; }
          input { width:15px;height:15px;margin:0;accent-color:#007ca8;cursor:pointer; }
        </style><label><input type="checkbox">选择下载</label>`;
        const input = root.querySelector("input");
        input.setAttribute("aria-label", `选择下载：${video.title}`);
        host.addEventListener("click", (event) => event.stopPropagation());
        input.addEventListener("change", () => {
          if (input.checked && !selected.has(bvid) && selected.size >= 100) {
            input.checked = false;
            input.setCustomValidity("一次最多选择 100 个视频，请分批下载。");
            input.reportValidity();
            return;
          }
          input.setCustomValidity("");
          if (input.checked) selected.set(bvid, video);
          else selected.delete(bvid);
          scan();
          publish();
        });
        cover.style.position = "relative";
        cover.append(host);
        control = { bvid, host, input };
        controls.set(card, control);
      }
      control.input.checked = selected.has(bvid);
    }
    return [...videos.values()];
  };
  return {
    scan,
    videos: () => [...selected.values()],
    selectPage: () => {
      const videos = scan();
      if (!videos.length) return publish("当前列表尚未加载出视频，请稍后再试。");
      if (selected.size + videos.filter((video) => !selected.has(video.bvid)).length > 100) {
        return publish("一次最多选择 100 个视频，请分批下载。");
      }
      for (const video of videos) selected.set(video.bvid, video);
      scan();
      publish();
    },
    clear: () => { selected.clear(); scan(); publish(); }
  };
};
