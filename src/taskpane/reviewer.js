import { callReviewApi } from "./api.js";
import { MAX_CHARACTERS, createAbortError, logError, sumCharacters } from "./utils.js";

const LOG_PREFIX = "[word-contract-reviewer][reviewer]";

export async function reviewContract(options = {}) {
  const {
    scope = "all",
    settings,
    mockMode = false,
    startParagraphIndex = 0,
    signal,
    onProgress
  } = options;

  const startedAt = Date.now();
  console.info(LOG_PREFIX, "开始审核流程。", {
    scope,
    mockMode,
    startParagraphIndex
  });

  onProgress?.({
    stage: "prepare",
    percent: 5,
    message: "正在读取文档段落..."
  });

  const paragraphs = await collectParagraphs(scope);
  const candidateParagraphs = paragraphs
    .filter((paragraph) => paragraph.index >= startParagraphIndex)
    .filter((paragraph) => paragraph.text.trim().length > 0);

  console.info(LOG_PREFIX, "段落读取完成。", {
    totalParagraphs: paragraphs.length,
    candidateParagraphs: candidateParagraphs.length
  });

  if (!candidateParagraphs.length) {
    throw new Error(scope === "selection" ? "未检测到选中段落内容。" : "文档中没有可审核的段落。");
  }

  const totalCharacters = sumCharacters(candidateParagraphs);
  console.info(LOG_PREFIX, "待审核内容统计完成。", {
    totalCharacters,
    maxCharacters: MAX_CHARACTERS
  });
  if (totalCharacters > MAX_CHARACTERS) {
    throw new Error(`待审核内容为 ${totalCharacters} 字，超出限制 ${MAX_CHARACTERS} 字。`);
  }

  onProgress?.({
    stage: "api",
    percent: 30,
    message: `正在提交审核请求（${candidateParagraphs.length} 段，${totalCharacters} 字）...`
  });

  const response = await callReviewApi(candidateParagraphs, settings, {
    mockMode,
    signal,
    onAttempt: (attempt, total) => {
      console.info(LOG_PREFIX, "审核 API 进度。", { attempt, total });
      onProgress?.({
        stage: "api",
        percent: 35,
        message: `正在调用审核 API（${attempt}/${total}）...`
      });
    }
  });

  if (signal?.aborted) {
    throw createAbortError();
  }

  const paragraphIndexSet = new Set(candidateParagraphs.map((paragraph) => paragraph.index));
  const responseReviews = response.reviews || [];
  const validReviews = responseReviews.filter((review) => {
    if (!paragraphIndexSet.has(review.paragraphIndex)) {
      logError("返回的 paragraphIndex 超出范围", JSON.stringify(review));
      return false;
    }
    return true;
  });
  const droppedReviewCount = responseReviews.length - validReviews.length;
  if (droppedReviewCount > 0) {
    console.warn(LOG_PREFIX, "发现越界段落索引，已过滤。", {
      droppedReviewCount
    });
  }
  console.info(LOG_PREFIX, "审核结果校验完成。", {
    reviewCount: validReviews.length,
    durationMs: Date.now() - startedAt
  });

  onProgress?.({
    stage: "api",
    percent: 60,
    message: `审核响应解析完成，共 ${validReviews.length} 条问题。`
  });

  return {
    paragraphs: candidateParagraphs,
    reviews: validReviews,
    totalCharacters
  };
}

export async function collectParagraphs(scope = "all") {
  if (scope === "selection") {
    return readSelectedParagraphs();
  }
  return readAllParagraphs();
}

async function readAllParagraphs() {
  ensureWordReady();

  return Word.run(async (context) => {
    const paragraphs = context.document.body.paragraphs;
    paragraphs.load("items/text");
    await context.sync();

    return paragraphs.items.map((paragraph, index) => ({
      index,
      text: paragraph.text || ""
    }));
  });
}

async function readSelectedParagraphs() {
  ensureWordReady();

  return Word.run(async (context) => {
    const bodyParagraphs = context.document.body.paragraphs;
    const selectionParagraphs = context.document.getSelection().paragraphs;

    bodyParagraphs.load("items/text");
    selectionParagraphs.load("items/text");
    await context.sync();

    const allParagraphs = bodyParagraphs.items.map((paragraph, index) => ({
      index,
      text: paragraph.text || ""
    }));

    const indexQueueByText = new Map();
    allParagraphs.forEach((paragraph) => {
      const key = paragraph.text.trim();
      if (!indexQueueByText.has(key)) {
        indexQueueByText.set(key, []);
      }
      indexQueueByText.get(key).push(paragraph.index);
    });

    const selected = [];
    selectionParagraphs.items.forEach((paragraph) => {
      const key = (paragraph.text || "").trim();
      const queue = indexQueueByText.get(key);
      if (queue && queue.length > 0) {
        const index = queue.shift();
        selected.push({
          index,
          text: paragraph.text || ""
        });
      }
    });

    return selected;
  });
}

function ensureWordReady() {
  if (typeof Word === "undefined") {
    throw new Error("当前环境不是 Word 插件上下文，无法读取文档。");
  }
}
