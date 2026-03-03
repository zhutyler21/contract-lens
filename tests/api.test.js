import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/taskpane/utils.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    logError: vi.fn(),
    waitForDelay: vi.fn().mockResolvedValue(undefined)
  };
});

vi.mock("../src/taskpane/mock.js", () => ({
  generateMockReviews: vi.fn()
}));

import * as utils from "../src/taskpane/utils.js";
import { generateMockReviews } from "../src/taskpane/mock.js";
import { callReviewApi } from "../src/taskpane/api.js";

const baseSettings = {
  apiUrl: "https://api.openai.com/v1/chat/completions",
  apiKey: "sk-test",
  modelName: "gpt-5-mini",
  prompt: "请审核合同。",
  timeoutMs: 5000,
  retryTimes: 2
};

const sampleParagraphs = [
  {
    index: 0,
    text: "甲方应在30日内付款。"
  }
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("api.callReviewApi", () => {
  it("retries on retryable HTTP errors and returns parsed reviews", async () => {
    const fetchMock = globalThis.fetch;
    fetchMock.mockResolvedValueOnce(createErrorResponse(429, "Too Many Requests"));
    fetchMock.mockResolvedValueOnce(createSuccessResponse({
      reviews: [
        {
          paragraphIndex: 0,
          issue: "付款期限偏长",
          suggestion: "将付款期限调整为15日",
          riskLevel: "high",
          legalBasis: "《民法典》第509条"
        }
      ]
    }));
    const onAttempt = vi.fn();

    const result = await callReviewApi(sampleParagraphs, baseSettings, { onAttempt });

    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0].riskLevel).toBe("high");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(utils.waitForDelay).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenNthCalledWith(1, 1, 3);
    expect(onAttempt).toHaveBeenNthCalledWith(2, 2, 3);
  });

  it("does not retry on non-retryable HTTP errors", async () => {
    const fetchMock = globalThis.fetch;
    fetchMock.mockResolvedValueOnce(createErrorResponse(400, "Bad Request"));

    await expect(callReviewApi(sampleParagraphs, baseSettings)).rejects.toThrow("HTTP 400");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(utils.waitForDelay).not.toHaveBeenCalled();
  });

  it("uses mock generator when mockMode is enabled", async () => {
    const signal = { aborted: false };
    const mockResult = {
      reviews: [
        {
          paragraphIndex: 0,
          issue: "示例问题",
          suggestion: "示例建议",
          riskLevel: "low",
          legalBasis: "示例法条"
        }
      ]
    };

    generateMockReviews.mockResolvedValueOnce(mockResult);

    const result = await callReviewApi(sampleParagraphs, { ...baseSettings, apiKey: "" }, {
      mockMode: true,
      signal
    });

    expect(result).toEqual(mockResult);
    expect(generateMockReviews).toHaveBeenCalledTimes(1);
    expect(generateMockReviews).toHaveBeenCalledWith(sampleParagraphs, { signal });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("fails with timeout when fetch hangs and respects retry limit", async () => {
    vi.useFakeTimers();
    const fetchMock = globalThis.fetch;
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const onAttempt = vi.fn();

    const resultPromise = callReviewApi(sampleParagraphs, {
      ...baseSettings,
      timeoutMs: 5000,
      retryTimes: 1
    }, { onAttempt });

    const rejectionAssertion = expect(resultPromise).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(12000);
    await rejectionAssertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onAttempt).toHaveBeenNthCalledWith(1, 1, 2);
    expect(onAttempt).toHaveBeenNthCalledWith(2, 2, 2);
  });

  it("wraps transport errors as NetworkError with actionable message", async () => {
    const fetchMock = globalThis.fetch;
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    let capturedError;
    try {
      await callReviewApi(sampleParagraphs, {
        ...baseSettings,
        retryTimes: 0
      });
    } catch (error) {
      capturedError = error;
    }

    expect(capturedError).toMatchObject({ name: "NetworkError" });
    expect(capturedError.message).toContain("无法连接审核 API");
    expect(capturedError.message).toContain("CSP/CORS");
  });
});

function createErrorResponse(status, message) {
  return {
    ok: false,
    status,
    text: vi.fn().mockResolvedValue(message)
  };
}

function createSuccessResponse(content) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(content)
          }
        }
      ]
    })
  };
}
