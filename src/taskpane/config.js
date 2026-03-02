import { API_TIMEOUT_MS, RETRY_TIMES, logError } from "./utils.js";

const SETTINGS_STORAGE_KEY = "wordContractReviewer.settings";
const SESSION_API_KEY_KEY = "wordContractReviewer.sessionApiKey";

export const DEFAULT_PROMPT = [
  "你是一位专业的合同审核专家。请仔细审核以下合同段落，识别潜在的法律风险、不合理条款和需要改进的地方。",
  "请严格返回 JSON：",
  "{",
  "  \"reviews\": [",
  "    {",
  "      \"paragraphIndex\": 0,",
  "      \"issue\": \"问题描述\",",
  "      \"suggestion\": \"修改建议\",",
  "      \"riskLevel\": \"critical|high|medium|low\",",
  "      \"legalBasis\": \"法律依据\"",
  "    }",
  "  ]",
  "}",
  "重点关注：权利义务、违约责任、争议解决、知识产权、保密、付款、合同期限与终止、不可抗力。",
  "如果段落没有问题，可不返回该段落。"
].join("\n");

export const DEFAULT_SETTINGS = Object.freeze({
  apiUrl: "https://api.openai.com/v1/chat/completions",
  apiKey: "",
  modelName: "gpt-5-mini",
  commentAuthor: "AI合同审核助手",
  prompt: DEFAULT_PROMPT,
  timeoutMs: API_TIMEOUT_MS,
  retryTimes: RETRY_TIMES
});

export async function loadSettings() {
  const fileSettings = await readSettingsFile();
  const localSettings = readLocalSettings();
  const apiKey = readSessionApiKey();
  return sanitizeSettings({
    ...DEFAULT_SETTINGS,
    ...fileSettings,
    ...localSettings,
    apiKey
  });
}

export function saveSettings(inputSettings) {
  const settings = sanitizeSettings(inputSettings);
  const { apiKey, ...persistedSettings } = settings;

  writeSessionApiKey(apiKey);

  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(persistedSettings));
  } catch (error) {
    logError("保存本地配置失败", error?.message || String(error));
  }

  return settings;
}

export function validateSettings(settings, { requireApiKey = true } = {}) {
  const rawSettings = settings || {};
  const errors = [];

  if (!String(rawSettings.apiUrl || "").trim()) {
    errors.push("API 地址不能为空。");
  }

  if (!String(rawSettings.modelName || "").trim()) {
    errors.push("模型名称不能为空。");
  }

  if (!String(rawSettings.prompt || "").trim()) {
    errors.push("审核 Prompt 不能为空。");
  }

  if (requireApiKey && !String(rawSettings.apiKey || "").trim()) {
    errors.push("API Key 不能为空（关闭测试模式后必须提供）。");
  }

  if (rawSettings.timeoutMs !== undefined) {
    const timeoutMs = Number.parseInt(rawSettings.timeoutMs, 10);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 5000 || timeoutMs > 180000) {
      errors.push("请求超时配置无效（应在 5000-180000 毫秒）。");
    }
  }

  if (rawSettings.retryTimes !== undefined) {
    const retryTimes = Number.parseInt(rawSettings.retryTimes, 10);
    if (!Number.isInteger(retryTimes) || retryTimes < 0 || retryTimes > 5) {
      errors.push("重试次数配置无效（应在 0-5）。");
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function sanitizeSettings(inputSettings = {}) {
  return {
    apiUrl: String(inputSettings.apiUrl || DEFAULT_SETTINGS.apiUrl).trim(),
    apiKey: String(inputSettings.apiKey || "").trim(),
    modelName: String(inputSettings.modelName || DEFAULT_SETTINGS.modelName).trim(),
    commentAuthor: String(inputSettings.commentAuthor || DEFAULT_SETTINGS.commentAuthor).trim(),
    prompt: String(inputSettings.prompt || DEFAULT_SETTINGS.prompt).trim(),
    timeoutMs: normalizeInteger(inputSettings.timeoutMs, DEFAULT_SETTINGS.timeoutMs, { min: 5000, max: 180000 }),
    retryTimes: normalizeInteger(inputSettings.retryTimes, DEFAULT_SETTINGS.retryTimes, { min: 0, max: 5 })
  };
}

function readLocalSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const settingsWithoutApiKey = { ...parsed };
    delete settingsWithoutApiKey.apiKey;
    return settingsWithoutApiKey;
  } catch (error) {
    logError("读取本地配置失败", error?.message || String(error));
    return {};
  }
}

async function readSettingsFile() {
  try {
    const response = await fetch("/config/settings.json", { cache: "no-store" });
    if (!response.ok) {
      if (response.status !== 404) {
        logError("读取 settings.json 失败", `HTTP ${response.status}`);
      }
      return {};
    }
    return await response.json();
  } catch (error) {
    logError("读取 settings.json 失败", error?.message || String(error));
    return {};
  }
}

function readSessionApiKey() {
  try {
    const storage = globalThis?.sessionStorage;
    if (!storage) {
      return "";
    }
    return String(storage.getItem(SESSION_API_KEY_KEY) || "").trim();
  } catch (_error) {
    return "";
  }
}

function writeSessionApiKey(apiKey) {
  try {
    const storage = globalThis?.sessionStorage;
    if (!storage) {
      return;
    }

    if (apiKey) {
      storage.setItem(SESSION_API_KEY_KEY, apiKey);
    } else {
      storage.removeItem(SESSION_API_KEY_KEY);
    }
  } catch (_error) {
    // Ignore session storage errors for runtime safety.
  }
}

function normalizeInteger(value, fallback, { min, max }) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}
