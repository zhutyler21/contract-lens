import { applyReviewComments, clearAiComments, filterReviewsByRisk, getCachedReviews, getReviewSummary } from "./comment.js";
import { loadSettings, saveSettings, validateSettings } from "./config.js";
import { exportReviewReport } from "./export.js";
import { reviewContract } from "./reviewer.js";
import { getRiskLabel } from "./utils.js";

const LOG_PREFIX = "[ContractLens][taskpane]";
const DEFAULT_STATUS_STEPS = Object.freeze({
  current: "待命",
  next: "点击“审核全文”或“审核选中内容”开始审核"
});
const TIMEOUT_SECONDS_DIVISOR = 1000;

const state = {
  settings: null,
  reviews: [],
  reviewing: false,
  mockMode: false,
  abortController: null,
  lastScope: "all",
  lastTotalCharacters: 0
};

const elements = {};
const OFFICE_THEME_ATTRIBUTE = "data-office-theme";

function setThemeMode(mode) {
  const normalizedMode = mode === "dark" ? "dark" : "light";
  document.documentElement.setAttribute(OFFICE_THEME_ATTRIBUTE, normalizedMode);
}

function parseColorToRgb(colorValue) {
  const value = String(colorValue || "").trim();
  if (!value) {
    return null;
  }

  const hexMatch = value.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return {
        r: Number.parseInt(hex[0] + hex[0], 16),
        g: Number.parseInt(hex[1] + hex[1], 16),
        b: Number.parseInt(hex[2] + hex[2], 16)
      };
    }
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16)
    };
  }

  const rgbMatch = value.match(
    /^rgb\(\s*([01]?\d?\d|2[0-4]\d|25[0-5])\s*,\s*([01]?\d?\d|2[0-4]\d|25[0-5])\s*,\s*([01]?\d?\d|2[0-4]\d|25[0-5])\s*\)$/i
  );
  if (!rgbMatch) {
    return null;
  }

  return {
    r: Number.parseInt(rgbMatch[1], 10),
    g: Number.parseInt(rgbMatch[2], 10),
    b: Number.parseInt(rgbMatch[3], 10)
  };
}

function isDarkColor(colorValue) {
  const rgb = parseColorToRgb(colorValue);
  if (!rgb) {
    return false;
  }

  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance < 0.5;
}

function applyOfficeTheme() {
  const officeTheme = Office?.context?.officeTheme;
  if (!officeTheme) {
    return;
  }

  const backgroundColor = officeTheme.bodyBackgroundColor || officeTheme.controlBackgroundColor;
  setThemeMode(isDarkColor(backgroundColor) ? "dark" : "light");
}

function initializeThemeSync() {
  if (typeof Office !== "undefined" && Office.context?.officeTheme) {
    applyOfficeTheme();
    Office.context.officeTheme.addHandlerAsync?.(Office.EventType.OfficeThemeChanged, () => {
      applyOfficeTheme();
    });
    return;
  }

  const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
  setThemeMode(mediaQuery?.matches ? "dark" : "light");
  if (!mediaQuery) {
    return;
  }

  const handleMediaChange = (event) => {
    setThemeMode(event.matches ? "dark" : "light");
  };

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", handleMediaChange);
  } else if (typeof mediaQuery.addListener === "function") {
    mediaQuery.addListener(handleMediaChange);
  }
}

function collectElements() {
  const ids = [
    "apiUrl",
    "apiKey",
    "modelName",
    "timeoutSec",
    "retryTimes",
    "prompt",
    "saveSettingsBtn",
    "reviewAllBtn",
    "reviewSelectionBtn",
    "mockModeToggle",
    "progressWrap",
    "progressBar",
    "progressText",
    "progressDetail",
    "cancelBtn",
    "riskFilter",
    "summaryText",
    "reviewList",
    "exportReportBtn",
    "clearCommentsBtn",
    "statusText",
    "statusCurrentStep",
    "statusNextStep",
    "errorText"
  ];

  ids.forEach((id) => {
    elements[id] = document.getElementById(id);
  });
}

function bindEvents() {
  elements.saveSettingsBtn.addEventListener("click", handleSaveSettings);
  elements.reviewAllBtn.addEventListener("click", () => startReview("all"));
  elements.reviewSelectionBtn.addEventListener("click", () => startReview("selection"));
  elements.cancelBtn.addEventListener("click", handleCancelReview);
  elements.riskFilter.addEventListener("change", renderReviewList);
  elements.exportReportBtn.addEventListener("click", handleExportReport);
  elements.clearCommentsBtn.addEventListener("click", handleClearComments);
  elements.mockModeToggle.addEventListener("change", handleMockToggle);
  elements.reviewList.addEventListener("click", handleReviewListClick);
}

async function initialize() {
  collectElements();
  bindEvents();

  state.settings = await loadSettings();
  state.reviews = getCachedReviews();

  fillSettingsForm(state.settings);
  state.mockMode = Boolean(state.settings?.mockMode);
  renderReviewList();
  renderSummary();
  setStatus("就绪", "info", DEFAULT_STATUS_STEPS);

  await consumeRibbonAction();
}

function fillSettingsForm(settings) {
  const timeoutMs = Number.parseInt(settings.timeoutMs, 10);
  const timeoutSec = Number.isInteger(timeoutMs) ? Math.round(timeoutMs / TIMEOUT_SECONDS_DIVISOR) : "";
  elements.apiUrl.value = settings.apiUrl || "";
  elements.apiKey.value = settings.apiKey || "";
  elements.modelName.value = settings.modelName || "";
  elements.timeoutSec.value = String(timeoutSec);
  elements.retryTimes.value = String(settings.retryTimes ?? "");
  elements.mockModeToggle.checked = Boolean(settings.mockMode);
  elements.prompt.value = settings.prompt || "";
}

function readSettingsFromForm() {
  const timeoutSecRaw = elements.timeoutSec.value.trim();
  const timeoutSec = Number.parseInt(timeoutSecRaw, 10);
  const timeoutMs = Number.isInteger(timeoutSec) ? String(timeoutSec * TIMEOUT_SECONDS_DIVISOR) : timeoutSecRaw;

  return {
    ...(state.settings || {}),
    apiUrl: elements.apiUrl.value.trim(),
    apiKey: elements.apiKey.value.trim(),
    modelName: elements.modelName.value.trim(),
    timeoutMs,
    retryTimes: elements.retryTimes.value.trim(),
    mockMode: elements.mockModeToggle.checked,
    prompt: elements.prompt.value.trim()
  };
}

function setStatusSteps(currentStep = DEFAULT_STATUS_STEPS.current, nextStep = DEFAULT_STATUS_STEPS.next) {
  elements.statusCurrentStep.textContent = `当前步骤：${currentStep || DEFAULT_STATUS_STEPS.current}`;
  elements.statusNextStep.textContent = `下一步骤：${nextStep || DEFAULT_STATUS_STEPS.next}`;
}

function setStatus(message, kind = "info", steps = null) {
  elements.statusText.textContent = message;
  elements.statusText.className = `status ${kind}`;
  if (steps) {
    setStatusSteps(steps.current, steps.next);
  }
}

function setReviewStepHints(stage, percent = 0) {
  const normalizedPercent = Number(percent) || 0;

  if (stage === "prepare") {
    setStatusSteps("读取文档段落", "校验文本并提交审核请求");
    return;
  }

  if (stage === "api") {
    if (normalizedPercent < 40) {
      setStatusSteps("提交审核请求", "等待模型返回结果");
      return;
    }

    if (normalizedPercent < 60) {
      setStatusSteps("等待模型返回结果", "解析审核结果");
      return;
    }

    setStatusSteps("解析审核结果", "写入 Word 批注");
    return;
  }

  if (stage === "comment") {
    const boundedPercent = Math.max(0, Math.min(100, Math.round(normalizedPercent)));
    setStatusSteps(`写入 Word 批注（${boundedPercent}%）`, boundedPercent >= 100 ? "刷新列表并生成汇总" : "继续写入剩余批注");
    return;
  }

  setStatusSteps("处理中", "请稍候");
}

function setError(message = "") {
  if (!message) {
    elements.errorText.textContent = "";
    elements.errorText.classList.add("hidden");
    return;
  }

  elements.errorText.textContent = message;
  elements.errorText.classList.remove("hidden");
}

function setProgress(percent, detail) {
  elements.progressWrap.classList.remove("hidden");
  elements.progressBar.value = percent;
  elements.progressText.textContent = `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
  elements.progressDetail.textContent = detail || "处理中...";
}

function resetProgress() {
  elements.progressBar.value = 0;
  elements.progressText.textContent = "0%";
  elements.progressDetail.textContent = "等待开始";
  elements.progressWrap.classList.add("hidden");
}

function setReviewing(reviewing) {
  state.reviewing = reviewing;
  elements.reviewAllBtn.disabled = reviewing;
  elements.reviewSelectionBtn.disabled = reviewing;
  elements.saveSettingsBtn.disabled = reviewing;
  elements.exportReportBtn.disabled = reviewing;
  elements.clearCommentsBtn.disabled = reviewing;
  elements.cancelBtn.disabled = !reviewing;
}

async function handleSaveSettings() {
  setError("");
  const formSettings = readSettingsFromForm();
  const validation = validateSettings(formSettings, { requireApiKey: !formSettings.mockMode });
  if (!validation.valid) {
    setError(validation.errors.join(" "));
    setStatus("配置校验失败。", "warning", {
      current: "检查配置项",
      next: "修正后重新保存"
    });
    return;
  }

  state.settings = saveSettings(formSettings);
  state.mockMode = Boolean(state.settings.mockMode);
  setStatus("配置已保存。", "success", {
    current: "配置保存完成",
    next: "可开始审核"
  });
}

async function startReview(scope) {
  if (state.reviewing) {
    return;
  }

  const startedAt = Date.now();
  setError("");
  const formSettings = readSettingsFromForm();
  const validation = validateSettings(formSettings, { requireApiKey: !formSettings.mockMode });
  if (!validation.valid) {
    setError(validation.errors.join(" "));
    setStatus("审核未开始。", "warning", {
      current: "配置校验失败",
      next: "修正配置后重新审核"
    });
    return;
  }

  state.settings = saveSettings(formSettings);
  state.mockMode = Boolean(state.settings.mockMode);
  state.lastScope = scope;
  state.abortController = new AbortController();
  setReviewing(true);
  setProgress(3, "准备审核...");
  setStatus("审核中...", "info", {
    current: "准备审核任务",
    next: "读取文档段落"
  });
  console.info(LOG_PREFIX, "用户触发审核。", {
    scope,
    mockMode: state.mockMode,
    apiUrl: state.settings?.apiUrl,
    modelName: state.settings?.modelName,
    timeoutMs: state.settings?.timeoutMs,
    retryTimes: state.settings?.retryTimes,
    hasApiKey: Boolean(state.settings?.apiKey)
  });

  try {
    let lastProgressStage = "";
    let lastProgressBucket = -1;
    const reviewResult = await reviewContract({
      scope,
      settings: state.settings,
      mockMode: state.mockMode,
      signal: state.abortController.signal,
      onProgress: ({ stage, percent, message }) => {
        setProgress(percent, message);
        setReviewStepHints(stage, percent);
        const bucket = Math.floor(Number(percent || 0) / 10) * 10;
        if (stage !== lastProgressStage || bucket !== lastProgressBucket) {
          lastProgressStage = stage || "";
          lastProgressBucket = bucket;
          console.info(LOG_PREFIX, "审核进度更新。", { stage, percent, message });
        }
      }
    });

    state.lastTotalCharacters = reviewResult.totalCharacters;
    console.info(LOG_PREFIX, "审核 API 阶段完成。", {
      paragraphCount: reviewResult.paragraphs?.length || 0,
      reviewCount: reviewResult.reviews?.length || 0,
      totalCharacters: reviewResult.totalCharacters
    });

    if (!reviewResult.reviews.length) {
      state.reviews = [];
      renderReviewList();
      renderSummary();
      setProgress(100, "审核完成，未发现问题。");
      setStatus("审核完成（未发现问题）。", "success", {
        current: "审核完成（未发现问题）",
        next: "可调整范围后再次审核"
      });
      console.info(LOG_PREFIX, "审核结束，无问题。", {
        durationMs: Date.now() - startedAt
      });
      return;
    }

    setProgress(65, "正在写入 Word 批注...");
    setStatusSteps("写入 Word 批注", "同步审核结果到列表");
    console.info(LOG_PREFIX, "开始写入 Word 批注。", {
      reviewCount: reviewResult.reviews.length
    });
    const insertedReviews = await applyReviewComments(reviewResult.reviews, {
      signal: state.abortController.signal,
      onProgress: ({ stage, percent, message }) => {
        setProgress(65 + percent * 0.35, message);
        setReviewStepHints(stage || "comment", percent);
      }
    });

    state.reviews = insertedReviews;
    renderReviewList();
    renderSummary();
    setProgress(100, `审核完成，共生成 ${insertedReviews.length} 条批注。`);
    setStatus(`审核完成，共 ${insertedReviews.length} 条问题。`, "success", {
      current: "审核完成",
      next: "可导出报告或定位段落"
    });
    console.info(LOG_PREFIX, "审核结束并写入批注完成。", {
      insertedCount: insertedReviews.length,
      durationMs: Date.now() - startedAt
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      setStatus("审核已取消。", "warning", {
        current: "审核已取消",
        next: "可重新发起审核"
      });
      console.warn(LOG_PREFIX, "审核被取消。", {
        durationMs: Date.now() - startedAt
      });
    } else {
      setStatus("审核失败。", "error", {
        current: "审核失败",
        next: "请检查配置后重试"
      });
      setError(error?.message || "未知错误");
      console.error(LOG_PREFIX, "审核失败。", {
        name: error?.name || "Error",
        message: error?.message || String(error),
        stack: error?.stack
      });
    }
  } finally {
    state.abortController = null;
    setReviewing(false);
    console.info(LOG_PREFIX, "审核流程结束（finally）。", {
      reviewing: state.reviewing,
      durationMs: Date.now() - startedAt
    });
  }
}

function handleCancelReview() {
  console.info(LOG_PREFIX, "用户点击取消审核。");
  state.abortController?.abort();
}

function handleMockToggle() {
  state.mockMode = elements.mockModeToggle.checked;
  if (state.mockMode) {
    setStatus("测试模式已开启。", "info", {
      current: "测试模式已开启",
      next: "可直接开始审核（不调用真实 API）"
    });
  } else {
    setStatus("测试模式已关闭。", "info", {
      current: "测试模式已关闭",
      next: "请确认 API 配置后开始审核"
    });
  }
}

async function handleClearComments() {
  if (state.reviewing) {
    return;
  }

  setError("");

  try {
    const removedCount = await clearAiComments();
    state.reviews = [];
    renderReviewList();
    renderSummary();
    setStatus(`已清除 ${removedCount} 条 AI 批注。`, "success", {
      current: "批注清理完成",
      next: "可重新发起审核"
    });
  } catch (error) {
    setStatus("清除失败。", "error", {
      current: "批注清理失败",
      next: "检查文档权限后重试"
    });
    setError(error?.message || "清除 AI 批注时出现未知错误");
  }
}

function handleExportReport() {
  if (!state.reviews.length) {
    setStatus("暂无可导出的审核结果。", "warning", {
      current: "导出被跳过",
      next: "请先执行审核生成结果"
    });
    return;
  }

  const fileName = exportReviewReport(state.reviews, {
    modelName: state.settings?.modelName,
    scope: state.lastScope,
    totalCharacters: state.lastTotalCharacters
  });

  setStatus(`报告已导出：${fileName}`, "success", {
    current: "报告导出完成",
    next: "可继续审核或清除批注"
  });
}

function renderSummary() {
  if (!state.reviews.length) {
    elements.summaryText.textContent = "暂无审核结果";
    return;
  }

  const summary = getReviewSummary(state.reviews);
  elements.summaryText.textContent = `共 ${summary.total} 条 | 严重 ${summary.critical} | 高 ${summary.high} | 中 ${summary.medium} | 低 ${summary.low}`;
}

function renderReviewList() {
  const filtered = filterReviewsByRisk(state.reviews, elements.riskFilter.value);
  elements.reviewList.innerHTML = "";

  if (!filtered.length) {
    const item = document.createElement("li");
    item.className = "review-item";
    item.textContent = "当前筛选条件下无结果。";
    elements.reviewList.appendChild(item);
    return;
  }

  filtered.forEach((review) => {
    const item = document.createElement("li");
    item.className = `review-item ${review.riskLevel}`;

    const head = document.createElement("div");
    head.className = "review-head";
    const paragraphMeta = document.createElement("span");
    paragraphMeta.textContent = `段落 #${review.paragraphIndex + 1}`;
    const riskLabel = document.createElement("span");
    riskLabel.textContent = getRiskLabel(review.riskLevel);
    head.appendChild(paragraphMeta);
    head.appendChild(riskLabel);

    const issue = document.createElement("p");
    issue.className = "review-issue";
    issue.textContent = review.issue || "未提供问题描述";

    const actions = document.createElement("div");
    actions.className = "review-actions";

    const locateBtn = document.createElement("button");
    locateBtn.type = "button";
    locateBtn.textContent = "定位";
    locateBtn.dataset.action = "locate";
    locateBtn.dataset.index = String(review.paragraphIndex);
    actions.appendChild(locateBtn);

    item.appendChild(head);
    item.appendChild(issue);
    item.appendChild(actions);
    elements.reviewList.appendChild(item);
  });
}

async function handleReviewListClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  if (target.dataset.action !== "locate") {
    return;
  }

  const paragraphIndex = Number.parseInt(target.dataset.index, 10);
  if (!Number.isInteger(paragraphIndex) || paragraphIndex < 0) {
    return;
  }

  try {
    await locateParagraph(paragraphIndex);
    setStatus(`已定位到段落 #${paragraphIndex + 1}。`, "info", {
      current: `定位到段落 #${paragraphIndex + 1}`,
      next: "可查看批注或定位下一条"
    });
  } catch (error) {
    setStatus("定位失败。", "error", {
      current: "定位失败",
      next: "请重试或检查文档结构"
    });
    setError(error?.message || "无法定位到段落");
  }
}

async function locateParagraph(paragraphIndex) {
  if (typeof Word === "undefined") {
    throw new Error("当前环境不是 Word 插件上下文。");
  }

  return Word.run(async (context) => {
    const paragraphs = context.document.body.paragraphs;
    paragraphs.load("items");
    await context.sync();

    if (paragraphIndex >= paragraphs.items.length) {
      throw new Error(`段落 #${paragraphIndex + 1} 不存在，文档结构可能已变化。`);
    }

    const paragraph = paragraphs.items[paragraphIndex];
    paragraph.getRange("Start").select();
    await context.sync();
  });
}

async function consumeRibbonAction() {
  if (typeof OfficeRuntime === "undefined" || !OfficeRuntime.storage) {
    return;
  }

  const action = await OfficeRuntime.storage.getItem("contractLens.pendingAction");
  if (!action) {
    return;
  }

  await OfficeRuntime.storage.removeItem("contractLens.pendingAction");

  if (action === "quickReview") {
    await startReview("all");
  }

  if (action === "clearAiComments") {
    await handleClearComments();
  }
}

function handleInitError(error) {
  const message = error?.message || String(error);
  if (elements.statusText) {
    setStatus("初始化失败。", "error", {
      current: "初始化失败",
      next: "刷新页面或检查 Office 环境"
    });
  }
  if (elements.errorText) {
    setError(message);
  }
  console.error(message);
}

if (typeof Office !== "undefined") {
  Office.onReady(() => {
    initializeThemeSync();
    initialize().catch(handleInitError);
  });
} else {
  window.addEventListener("DOMContentLoaded", () => {
    initializeThemeSync();
    initialize().catch(handleInitError);
    resetProgress();
  });
}
