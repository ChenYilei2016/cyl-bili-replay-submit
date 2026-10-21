import { parseDownloadInfo, selectMediaUrl } from "./video-download.js";

export function mountVideoDownloader(adapter) {
  const element = (id) => document.getElementById(id);
  let source = null;
  let busy = false;
  const notify = (message, tone = "info") => {
    element("notice").textContent = message;
    element("notice").className = `notice ${tone}`;
    element("notice").hidden = !message;
  };
  const run = async (operation) => {
    if (busy) return;
    busy = true;
    document.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    try { await operation(); }
    catch (error) { notify(error.message, "error"); }
    finally {
      busy = false;
      document.querySelectorAll("button").forEach((button) => { button.disabled = false; });
    }
  };
  const addButton = (container, label, operation) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button secondary";
    button.textContent = label;
    button.disabled = busy;
    button.addEventListener("click", () => run(operation));
    container.append(button);
  };
  const save = async (file, prefix = "") => {
    await adapter.download(source, file);
    notify(`${prefix}已交给浏览器保存：${file.label}。下载进度请查看 Chrome 下载列表。`, "success");
  };
  const renderFiles = (id, files, emptyMessage) => {
    const container = element(id);
    container.replaceChildren();
    for (const file of files) addButton(container, file.label, () => save(file));
    if (!files.length) {
      const hint = document.createElement("p");
      hint.className = "field-help";
      hint.textContent = emptyMessage;
      container.append(hint);
    }
  };
  const downloadCombined = async (quality) => {
    const data = await adapter.load({ quality, source });
    const { videosWithAudio } = parseDownloadInfo(data.combined);
    if (!videosWithAudio.length) throw new Error("B 站没有返回带声音的视频文件，可以选择下方独立视频和音频。");
    const prefix = data.combined.quality !== quality ? `B 站实际返回 ${videosWithAudio[0].label}。` : "";
    if (videosWithAudio.length === 1) {
      element("combinedParts").hidden = true;
      await save(videosWithAudio[0], prefix);
    } else {
      renderFiles("combinedParts", videosWithAudio);
      element("combinedParts").hidden = false;
      notify(`${prefix}此清晰度分为 ${videosWithAudio.length} 个文件，请逐个保存下方各段。`);
    }
  };
  const refresh = async () => {
    notify("正在读取当前视频和可下载的清晰度…");
    const data = await adapter.load();
    source = data.source;
    const options = parseDownloadInfo(data.combined, data.separated);
    element("videoTitle").textContent = source.title;
    element("videoMeta").textContent = `${source.bvid} · P${source.pageNumber} · ${source.part}`;
    element("sourceLink").href = source.pageUrl;
    const cover = selectMediaUrl({ url: source.cover });
    element("videoCover").hidden = !cover;
    if (cover) element("videoCover").src = cover;
    element("saveCover").hidden = !cover;
    const combined = element("combinedOptions");
    combined.replaceChildren();
    if (options.videosWithAudio.length) {
      for (const item of options.qualities) addButton(combined, item.label, () => downloadCombined(item.quality));
    } else {
      renderFiles("combinedOptions", [], "B 站暂未提供带声音的视频文件，可分别保存下方的视频和音频。");
    }
    element("combinedParts").hidden = true;
    renderFiles("videoOptions", options.videos, "当前账号没有可用的独立视频轨。");
    renderFiles("audioOptions", options.audios, "当前视频没有可用的独立音频轨。");
    notify((data.errors || []).join("；"), data.errors?.length ? "error" : "info");
  };
  element("refreshButton").addEventListener("click", () => run(refresh));
  element("saveCover").addEventListener("click", () => run(() => {
    const url = selectMediaUrl({ url: source.cover });
    const extension = new URL(url).pathname.match(/\.(jpe?g|png|webp)$/i)?.[1].toLowerCase() || "jpg";
    return save({ url, kind: "cover", label: "视频封面", extension });
  }));
  run(refresh);
  return { isRunning: () => busy, notify };
}
