export const MAX_SEGMENT_SECONDS = 7200;
export const DEFAULT_TEMPLATE = "{title} · {date} · 第 {index}/{total} 段";

export function formatTime(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  return [Math.floor(value / 3600), Math.floor(value / 60) % 60, value % 60]
    .map((part) => String(part).padStart(2, "0")).join(":");
}

export function replayDate(timestamp) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(timestamp * 1000));
}

export function normalizeTimeline(source) {
  const intervals = source.intervals.map(({ start, end }) => {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start) {
      throw new Error("官方回放时间轴格式发生变化，请在 B 站页面核对。");
    }
    return { start: Math.max(start, source.start), end: Math.min(end, source.end) };
  }).filter(({ start, end }) => end > start).sort((a, b) => a.start - b.start);
  const merged = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  }
  if (!merged.length) throw new Error("回放尚未生成、已经过期，或没有可投稿的视频。");
  return merged;
}

export function createPlan(source, options) {
  const { minutes, title, template = DEFAULT_TEMPLATE, intervalSeconds = 15, withDanmaku = false } = options;
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) throw new Error("每段时长需要是 1–120 分钟的整数。");
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 5 || intervalSeconds > 300) throw new Error("投稿间隔需要是 5–300 秒的整数。");
  if (!title.trim()) throw new Error("请填写回放标题。");
  if (withDanmaku && !source.canPublishDanmaku) throw new Error("当前账号未开放弹幕同步。");
  if (source.hasRestrictedContent) throw new Error("官方标记此回放含受限内容，请先在官方剪辑页处理。");
  const timeline = normalizeTimeline(source);
  const segments = [];
  let cursor = timeline[0].start;
  const end = timeline.at(-1).end;
  while (cursor < end) {
    const nextInterval = timeline.find((item) => item.end > cursor);
    cursor = Math.max(cursor, nextInterval.start);
    const limit = Math.min(cursor + minutes * 60, end);
    const covered = timeline.filter((item) => item.start < limit && item.end > cursor);
    const segmentEnd = Math.min(limit, covered.at(-1).end);
    segments.push({
      index: segments.length + 1, start: cursor, end: segmentEnd,
      duration: covered.reduce((sum, item) => sum + Math.min(item.end, segmentEnd) - Math.max(item.start, cursor), 0),
      enabled: true, status: "pending", error: ""
    });
    cursor = segmentEnd;
  }
  const date = replayDate(source.start);
  for (const segment of segments) {
    const values = {
      title: title.trim(), date, index: String(segment.index).padStart(2, "0"),
      total: String(segments.length).padStart(2, "0"),
      start: formatTime(segment.start - source.start), end: formatTime(segment.end - source.start)
    };
    segment.title = template.replace(/\{([^{}]+)\}/g, (_, key) => {
      if (!(key in values)) throw new Error(`不支持的标题变量：{${key}}`);
      return values[key];
    });
    validateSegment(segment, source);
  }
  return {
    version: 1, source, options: { minutes, title: title.trim(), template, intervalSeconds, withDanmaku },
    segments, status: "ready", updatedAt: Date.now(), lastAttemptAt: 0
  };
}

export function validateSegment(segment, source) {
  if (!segment.title.trim() || segment.title.length > 80) throw new Error(`第 ${segment.index} 段标题需要为 1–80 个字符，请缩短标题。`);
  if (!Number.isSafeInteger(segment.start) || !Number.isSafeInteger(segment.end)
      || segment.start < source.start || segment.end > source.end
      || segment.end <= segment.start || segment.end - segment.start > MAX_SEGMENT_SECONDS) {
    throw new Error(`第 ${segment.index} 段时间范围无效或超过两小时。`);
  }
}

export function recoverJob(job) {
  const recovered = structuredClone(job);
  for (const segment of recovered.segments) {
    if (segment.status === "submitting") {
      segment.status = "uncertain";
      segment.error = "上次提交被中断，结果待核对。请先查看 B 站已发布片段，再确认此段状态。";
    }
  }
  if (recovered.status === "running") recovered.status = "paused";
  return recovered;
}

function wait(milliseconds, signal) {
  return new Promise((resolve) => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}

export class SubmissionQueue {
  constructor({ job, submit, save, changed = () => {}, sleep = wait }) {
    this.job = job;
    this.submit = submit;
    this.save = save;
    this.changed = changed;
    this.sleep = sleep;
    this.running = false;
    this.stopping = false;
  }

  pause() {
    this.stopping = true;
    this.waitController?.abort();
    this.changed();
  }

  async persist() {
    this.job.updatedAt = Date.now();
    await this.save(structuredClone(this.job));
    this.changed();
  }

  async run() {
    if (this.running) throw new Error("队列已在运行。");
    if (this.job.segments.some((item) => item.enabled && ["uncertain", "failed", "submitting"].includes(item.status))) {
      throw new Error("请先处理失败或待核对的片段。");
    }
    const pending = this.job.segments.filter((item) => item.enabled && item.status === "pending");
    if (!pending.length) throw new Error("没有等待投稿的片段。");
    for (const segment of pending) validateSegment(segment, this.job.source);
    this.running = true;
    this.stopping = false;
    this.job.status = "running";
    this.changed();
    try {
      await this.persist();
      // ponytail: 一个工作台串行投稿；出现多账号并行需求时再按账号拆队列。
      for (const segment of pending) {
        if (this.stopping) break;
        const delay = this.job.options.intervalSeconds * 1000 - (Date.now() - this.job.lastAttemptAt);
        if (delay > 0) {
          this.waitController = new AbortController();
          await this.sleep(delay, this.waitController.signal);
        }
        if (this.stopping) break;
        segment.status = "submitting";
        segment.error = "";
        this.job.lastAttemptAt = Date.now();
        try {
          // 先落盘，再发 POST；中途关页时恢复为待核对，不会自动重投。
          await this.persist();
        } catch (error) {
          segment.status = "pending";
          throw new Error(`无法保存投稿进度，已停止：${error.message}`);
        }
        try {
          await this.submit(segment, this.job.source, this.job.options);
          segment.status = "submitted";
          segment.submittedAt = Date.now();
          segment.confirmation = "api";
        } catch (error) {
          segment.status = ["rejected", "preflight"].includes(error.kind) ? "failed" : "uncertain";
          segment.error = error.message || "提交结果待核对。";
          this.stopping = true;
        }
        await this.persist();
      }
      this.job.status = this.job.segments.some((item) => item.enabled && item.status !== "submitted") ? "paused" : "completed";
      await this.persist();
    } finally {
      if (this.job.status === "running") this.job.status = "paused";
      this.running = false;
      this.waitController = null;
      this.changed();
    }
  }
}
