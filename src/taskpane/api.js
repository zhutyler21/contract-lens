import {
  API_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
  RETRY_TIMES,
  createAbortError,
  logError,
  parseReviewResponse,
  waitForDelay
} from "./utils.js";
import { generateMockReviews } from "./mock.js";

const LOG_PREFIX = "[ContractLens][api]";

export async function callReviewApi(paragraphs, settings, options = {}) {
  const { mockMode = false, signal, onAttempt } = options;

  if (mockMode) {
    console.info(LOG_PREFIX, "mockMode=true，使用本地模拟审核结果。", {
      paragraphCount: Array.isArray(paragraphs) ? paragraphs.length : 0
    });
    return generateMockReviews(paragraphs, { signal });
  }

  if (!settings.apiKey) {
    throw new Error("缺少 API Key，请先保存配置或开启测试模式。");
  }

  const timeoutMs = resolveTimeoutMs(settings);
  const retryTimes = resolveRetryTimes(settings);
  const totalAttempts = retryTimes + 1;
  let lastError = null;

  console.info(LOG_PREFIX, "开始调用审核 API。", {
    apiUrl: settings?.apiUrl,
    modelName: settings?.modelName,
    paragraphCount: Array.isArray(paragraphs) ? paragraphs.length : 0,
    timeoutMs,
    retryTimes,
    totalAttempts
  });

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    onAttempt?.(attempt, totalAttempts);
    const startedAt = Date.now();
    console.info(LOG_PREFIX, `第 ${attempt}/${totalAttempts} 次请求开始。`);

    try {
      const result = await requestReview(paragraphs, settings, { signal, timeoutMs });
      console.info(LOG_PREFIX, `第 ${attempt}/${totalAttempts} 次请求成功。`, {
        durationMs: Date.now() - startedAt,
        reviewCount: Array.isArray(result?.reviews) ? result.reviews.length : 0
      });
      return result;
    } catch (error) {
      if (signal?.aborted || error.name === "AbortError") {
        console.warn(LOG_PREFIX, "请求被用户取消。");
        throw createAbortError();
      }

      lastError = error;
      console.warn(LOG_PREFIX, `第 ${attempt}/${totalAttempts} 次请求失败。`, {
        durationMs: Date.now() - startedAt,
        name: error?.name || "Error",
        message: error?.message || String(error),
        retryable: shouldRetry(error)
      });
      if (!shouldRetry(error) || attempt >= totalAttempts) {
        break;
      }

      const delayMs = getRetryDelayMs(attempt);
      logError(
        `审核 API 调用失败（第 ${attempt} 次）`,
        `${error.message || String(error)}；${delayMs}ms 后重试`
      );
      await waitForDelay(delayMs, signal);
    }
  }

  console.error(LOG_PREFIX, "审核 API 最终失败。", {
    name: lastError?.name || "Error",
    message: lastError?.message || "审核 API 调用失败。"
  });
  throw lastError || new Error("审核 API 调用失败。");
}

async function requestReview(paragraphs, settings, { signal, timeoutMs }) {
  console.info(LOG_PREFIX, "发送 HTTP 请求。", {
    apiUrl: settings?.apiUrl,
    modelName: settings?.modelName,
    timeoutMs,
    paragraphCount: Array.isArray(paragraphs) ? paragraphs.length : 0
  });

  const response = await fetchWithTimeout(settings.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.modelName,
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: settings.prompt
        },
        {
          role: "user",
          content: buildUserPrompt(paragraphs)
        }
      ]
    })
  }, timeoutMs, signal);

  console.info(LOG_PREFIX, "收到 HTTP 响应。", {
    status: response.status,
    ok: response.ok
  });

  if (!response.ok) {
    const responseText = await response.text();
    console.warn(LOG_PREFIX, "HTTP 非 2xx 响应。", {
      status: response.status,
      bodyPreview: responseText.slice(0, 200)
    });
    const error = new Error(`HTTP ${response.status}: ${responseText.slice(0, 200)}`);
    error.name = "HttpError";
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  const content = extractContent(payload);
  console.info(LOG_PREFIX, "响应 JSON 已解析。", {
    contentType: Array.isArray(content) ? "array" : typeof content,
    contentLength: typeof content === "string" ? content.length : undefined
  });
  const parsed = parseReviewResponse(content);
  console.info(LOG_PREFIX, "模型响应结构解析完成。", {
    reviewCount: Array.isArray(parsed?.reviews) ? parsed.reviews.length : 0
  });
  return parsed;
}

function buildUserPrompt(paragraphs) {
  return [
    "请审核以下合同段落，并仅返回 JSON（字段：reviews）。",
    "段落数据：",
    JSON.stringify(paragraphs, null, 2)
  ].join("\n");
}

function extractContent(payload) {
  return payload?.choices?.[0]?.message?.content || "{}";
}

async function fetchWithTimeout(url, init, timeoutMs, signal) {
  if (signal?.aborted) {
    throw createAbortError();
  }

  const controller = new AbortController();
  return new Promise((resolve, reject) => {
    let timeoutId = null;
    let settled = false;

    const settle = (handler, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      handler(value);
    };

    const onAbort = () => {
      console.warn(LOG_PREFIX, "收到取消信号，终止请求。");
      controller.abort();
      settle(reject, createAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    timeoutId = setTimeout(() => {
      console.warn(LOG_PREFIX, `请求超时（>${timeoutMs / 1000} 秒），已中止。`);
      controller.abort();
      const timeoutError = new Error(`请求超时（>${timeoutMs / 1000}秒）`);
      timeoutError.name = "TimeoutError";
      settle(reject, timeoutError);
    }, timeoutMs);

    fetch(url, {
      ...init,
      signal: controller.signal
    })
      .then((response) => {
        settle(resolve, response);
      })
      .catch((error) => {
        if (signal?.aborted) {
          settle(reject, createAbortError());
          return;
        }

        if (error?.name === "AbortError" || controller.signal.aborted) {
          const timeoutError = new Error(`请求超时（>${timeoutMs / 1000}秒）`);
          timeoutError.name = "TimeoutError";
          settle(reject, timeoutError);
          return;
        }

        if (error instanceof TypeError) {
          settle(reject, createNetworkError(url, error));
          return;
        }

        settle(reject, error);
      });
  });
}

function shouldRetry(error) {
  if (!error) {
    return false;
  }

  if (error.name === "NetworkError") {
    return true;
  }

  if (error.name === "TimeoutError") {
    return true;
  }

  if (error.name === "HttpError") {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }

  return error instanceof TypeError;
}

function getRetryDelayMs(attempt) {
  const exponentialDelay = RETRY_BASE_DELAY_MS * (2 ** (attempt - 1));
  const jitter = Math.floor(Math.random() * 200);
  return Math.min(RETRY_MAX_DELAY_MS, exponentialDelay + jitter);
}

function resolveRetryTimes(settings) {
  const value = Number.parseInt(settings?.retryTimes, 10);
  if (!Number.isInteger(value)) {
    return RETRY_TIMES;
  }
  return Math.min(Math.max(value, 0), 5);
}

function resolveTimeoutMs(settings) {
  const value = Number.parseInt(settings?.timeoutMs, 10);
  if (!Number.isInteger(value)) {
    return API_TIMEOUT_MS;
  }
  return Math.min(Math.max(value, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
}

function createNetworkError(url, error) {
  const safeUrl = sanitizeUrlForMessage(url);
  const originalMessage = String(error?.message || "Network request failed");
  const hint = originalMessage.toLowerCase().includes("failed to fetch")
    ? "可能被浏览器/Office Web 的安全策略（CSP/CORS）拦截，或被代理/防火墙中断。"
    : "请检查网络、代理/VPN、防火墙和 API 地址是否可达。";

  const networkError = new Error(
    `无法连接审核 API（${safeUrl}）。${hint} 原始错误：${originalMessage}`
  );
  networkError.name = "NetworkError";
  networkError.url = safeUrl;
  networkError.cause = error;
  return networkError;
}

function sanitizeUrlForMessage(url) {
  const value = String(url || "").trim();
  if (!value) {
    return "未知地址";
  }

  try {
    const parsed = new URL(value, globalThis.location?.origin);
    return `${parsed.origin}${parsed.pathname}`;
  } catch (_error) {
    return value;
  }
}
