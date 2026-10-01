export const NAMING_HISTORY_LIMIT = 20;

export const namingHistoryKey = (accountId) => `naming-history:${accountId}`;

export function normalizeNamingHistory(records) {
  const seen = new Set();
  const history = [];
  const valid = records.filter((item) => typeof item?.title === "string" && item.title.trim()
    && item.title.length <= 80 && typeof item.template === "string" && item.template.trim());
  for (const item of valid.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))) {
    const title = item.title.trim();
    const key = JSON.stringify([title, item.template]);
    if (seen.has(key)) continue;
    seen.add(key);
    history.push({ title, template: item.template, lastUsed: item.lastUsed || 0 });
    if (history.length === NAMING_HISTORY_LIMIT) break;
  }
  return history;
}

export function rememberNaming(history, options, lastUsed = Date.now()) {
  return normalizeNamingHistory([{ title: options.title, template: options.template, lastUsed }, ...history]);
}

export function namingHistoryFromJobs(jobs, accountId, history = []) {
  const records = [...history];
  for (const [key, job] of Object.entries(jobs)) {
    if (!key.startsWith(`job:${accountId}:`) || job?.source?.accountId !== accountId || !job.options) continue;
    records.push({ title: job.options.title, template: job.options.template, lastUsed: job.updatedAt || 0 });
  }
  return normalizeNamingHistory(records);
}

export async function loadNamingHistory(storage, accountId) {
  const key = namingHistoryKey(accountId);
  const saved = await storage.get(key);
  if (Array.isArray(saved[key])) return normalizeNamingHistory(saved[key]);
  let history = [];
  // 只首次迁移旧队列；有 getKeys 时按账号每批读取 50 条，不全量加载队列内容。
  if (typeof storage.getKeys === "function") {
    const keys = (await storage.getKeys()).filter((item) => item.startsWith(`job:${accountId}:`));
    for (let offset = 0; offset < keys.length; offset += 50) {
      history = namingHistoryFromJobs(await storage.get(keys.slice(offset, offset + 50)), accountId, history);
    }
  } else {
    // Chrome 120–129 无 getKeys；本扩展 storage.local 上限 10 MiB，只做一次兼容迁移。
    history = namingHistoryFromJobs(await storage.get(null), accountId);
  }
  await storage.set({ [key]: history });
  return history;
}
