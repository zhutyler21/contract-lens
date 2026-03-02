export const MAX_CHARACTERS = 30000;
export const API_TIMEOUT_MS = 45000;
export const RETRY_TIMES = 2;
export const RETRY_BASE_DELAY_MS = 500;
export const RETRY_MAX_DELAY_MS = 5000;
export const REVIEW_PREFIX = "[AI审核]";

const ERROR_LOG_KEY = "wordContractReviewer.errorLogs";

export const RISK_META = Object.freeze({
  critical: { label: "严重", color: "#FF0000", rank: 0 },
  high: { label: "高", color: "#FF8C00", rank: 1 },
  medium: { label: "中", color: "#FFD700", rank: 2 },
  low: { label: "低", color: "#1E90FF", rank: 3 }
});

export function normalizeRiskLevel(riskLevel) {
  const normalized = String(riskLevel || "").trim().toLowerCase();
  return RISK_META[normalized] ? normalized : "low";
}

export function getRiskLabel(riskLevel) {
  const normalized = normalizeRiskLevel(riskLevel);
  return RISK_META[normalized].label;
}

export function getRiskColor(riskLevel) {
  const normalized = normalizeRiskLevel(riskLevel);
  return RISK_META[normalized].color;
}

export function compareRiskLevel(a, b) {
  const rankA = RISK_META[normalizeRiskLevel(a)].rank;
  const rankB = RISK_META[normalizeRiskLevel(b)].rank;
  return rankA - rankB;
}

export function sumCharacters(paragraphs) {
  return paragraphs.reduce((sum, paragraph) => sum + (paragraph.text || "").length, 0);
}

export function waitForDelay(delayMs, signal) {
  if (signal?.aborted) {
    throw createAbortError();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);

    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function formatReviewComment(review) {
  const normalizedRisk = normalizeRiskLevel(review.riskLevel);
  const riskLabel = getRiskLabel(normalizedRisk);
  const riskPriority = {
    critical: "P0",
    high: "P1",
    medium: "P2",
    low: "P3"
  }[normalizedRisk];

  const lines = [
    REVIEW_PREFIX,
    `【风险等级】${riskLabel} (${normalizedRisk.toUpperCase()}) | 优先级：${riskPriority}`,
    "",
    "【问题描述】",
    review.issue || "未提供",
    "",
    "【修改建议】",
    review.suggestion || "未提供",
    "",
    "【法律依据】",
    review.legalBasis || "未提供"
  ];
  return lines.join("\n");
}

export function parseReviewResponse(rawContent) {
  const payload = extractJsonPayload(rawContent);
  const result = Array.isArray(payload.reviews) ? payload.reviews : [];
  const reviews = result
    .map((item) => sanitizeReview(item))
    .filter((item) => item !== null);
  return { reviews };
}

function extractJsonPayload(rawContent) {
  if (rawContent && typeof rawContent === "object") {
    return rawContent;
  }

  if (typeof rawContent !== "string") {
    throw new Error("API 返回内容不是合法 JSON。");
  }

  let value = rawContent.trim();

  if (value.startsWith("```")) {
    value = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start >= 0 && end > start) {
    value = value.slice(start, end + 1);
  }

  try {
    return JSON.parse(value);
  } catch (_error) {
    throw new Error("解析 API JSON 响应失败。");
  }
}

function sanitizeReview(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const paragraphIndex = Number.parseInt(item.paragraphIndex, 10);
  if (!Number.isInteger(paragraphIndex) || paragraphIndex < 0) {
    return null;
  }

  return {
    paragraphIndex,
    issue: String(item.issue || "").trim(),
    suggestion: String(item.suggestion || "").trim(),
    riskLevel: normalizeRiskLevel(item.riskLevel),
    legalBasis: String(item.legalBasis || "").trim()
  };
}

export function summarizeByRisk(reviews) {
  const summary = {
    total: reviews.length,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  };

  reviews.forEach((review) => {
    summary[normalizeRiskLevel(review.riskLevel)] += 1;
  });

  return summary;
}

export function logError(message, details = "") {
  const entry = {
    time: new Date().toISOString(),
    message: String(message || "Unknown error"),
    details: String(details || "")
  };

  try {
    const history = JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || "[]");
    history.unshift(entry);
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(history.slice(0, 50)));
  } catch (_error) {
    // Ignore local storage errors for runtime safety.
  }

  console.error("[word-contract-reviewer]", entry);
}

export function createAbortError() {
  const error = new Error("操作已取消。");
  error.name = "AbortError";
  return error;
}
