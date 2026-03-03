import { API_TIMEOUT_MS, MAX_TIMEOUT_MS, MIN_TIMEOUT_MS, RETRY_TIMES, logError } from "./utils.js";

const SETTINGS_STORAGE_KEY = "contractLens.settings";
const SESSION_API_KEY_KEY = "contractLens.sessionApiKey";
const LEGACY_DEFAULT_API_URL = "https://api.openai.com/v1/chat/completions";
const API_URL_DEFAULT_VERSION = 2;
const MIN_TIMEOUT_SECONDS = Math.round(MIN_TIMEOUT_MS / 1000);
const MAX_TIMEOUT_SECONDS = Math.round(MAX_TIMEOUT_MS / 1000);

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
  apiUrl: "https://api.psylabs.top/v1/chat/completions",
  apiKey: "",
  modelName: "gpt-5-mini",
  mockMode: false,
  commentAuthor: "AI合同审核助手",
  prompt: DEFAULT_PROMPT,
  timeoutMs: API_TIMEOUT_MS,
  retryTimes: RETRY_TIMES
});

export async function loadSettings() {
  const fileSettings = await readSettingsFile();
  const localSettings = readLocalSettings();
  const { settings: migratedLocalSettings, changed: apiUrlMigrated } = migrateLegacyDefaultApiUrl(localSettings);
  const apiKey = readSessionApiKey();
  const settings = sanitizeSettings({
    ...DEFAULT_SETTINGS,
    ...fileSettings,
    ...migratedLocalSettings,
    apiKey
  });

  if (apiUrlMigrated) {
    persistLocalSettings(settings);
  }

  return settings;
}

export function saveSettings(inputSettings) {
  const settings = sanitizeSettings(inputSettings);
  const { apiKey, ...persistedSettings } = settings;

  writeSessionApiKey(apiKey);
  persistLocalSettings(persistedSettings);

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
    errors.push("系统提示词不能为空。");
  }

  if (requireApiKey && !String(rawSettings.apiKey || "").trim()) {
    errors.push("API Key 不能为空（关闭测试模式后必须提供）。");
  }

  if (rawSettings.timeoutMs !== undefined) {
    const timeoutMs = Number.parseInt(rawSettings.timeoutMs, 10);
    if (!Number.isInteger(timeoutMs) || timeoutMs < MIN_TIMEOUT_MS || timeoutMs > MAX_TIMEOUT_MS) {
      errors.push(`请求超时配置无效（应在 ${MIN_TIMEOUT_SECONDS}-${MAX_TIMEOUT_SECONDS} 秒）。`);
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
    mockMode: normalizeBoolean(inputSettings.mockMode, DEFAULT_SETTINGS.mockMode),
    commentAuthor: String(inputSettings.commentAuthor || DEFAULT_SETTINGS.commentAuthor).trim(),
    prompt: String(inputSettings.prompt || DEFAULT_SETTINGS.prompt).trim(),
    timeoutMs: normalizeInteger(inputSettings.timeoutMs, DEFAULT_SETTINGS.timeoutMs, {
      min: MIN_TIMEOUT_MS,
      max: MAX_TIMEOUT_MS
    }),
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

function persistLocalSettings(settings) {
  try {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...settings,
        apiUrlVersion: API_URL_DEFAULT_VERSION
      })
    );
  } catch (error) {
    logError("保存本地配置失败", error?.message || String(error));
  }
}

function migrateLegacyDefaultApiUrl(localSettings = {}) {
  const apiUrl = String(localSettings.apiUrl || "").trim();
  const apiUrlVersion = Number.parseInt(localSettings.apiUrlVersion, 10);
  const hasNewVersionTag = Number.isInteger(apiUrlVersion) && apiUrlVersion >= API_URL_DEFAULT_VERSION;
  const shouldMigrate = !hasNewVersionTag && apiUrl === LEGACY_DEFAULT_API_URL;

  if (!shouldMigrate) {
    return {
      settings: localSettings,
      changed: false
    };
  }

  return {
    settings: {
      ...localSettings,
      apiUrl: DEFAULT_SETTINGS.apiUrl,
      apiUrlVersion: API_URL_DEFAULT_VERSION
    },
    changed: true
  };
}

function normalizeInteger(value, fallback, { min, max }) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

function normalizeBoolean(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return fallback;
}
