import {
  compareRiskLevel,
  createAbortError,
  formatReviewComment,
  getRiskColor,
  getRiskLabel,
  normalizeRiskLevel,
  REVIEW_PREFIX,
  summarizeByRisk
} from "./utils.js";

const REVIEW_CACHE_KEY = "contractLens.latestReviews";
const COMMENT_SYNC_BATCH_SIZE = 20;

export async function applyReviewComments(reviews, options = {}) {
  const { signal, onProgress } = options;

  if (!Array.isArray(reviews) || !reviews.length) {
    cacheReviews([]);
    return [];
  }

  ensureWordReady();

  const sortedReviews = [...reviews].sort((a, b) => a.paragraphIndex - b.paragraphIndex);
  const inserted = [];

  await Word.run(async (context) => {
    const paragraphs = context.document.body.paragraphs;
    paragraphs.load("items/text");
    await context.sync();

    const pendingInserted = [];
    let pendingOperations = 0;

    for (let index = 0; index < sortedReviews.length; index += 1) {
      if (signal?.aborted) {
        throw createAbortError();
      }

      const review = sortedReviews[index];
      if (review.paragraphIndex < 0 || review.paragraphIndex >= paragraphs.items.length) {
        continue;
      }

      const paragraph = paragraphs.items[review.paragraphIndex];
      const range = paragraph.getRange("Whole");
      range.insertComment(formatReviewComment(review));
      range.font.highlightColor = getRiskColor(review.riskLevel);

      pendingInserted.push({
        ...review,
        paragraphText: paragraph.text || "",
        riskLabel: getRiskLabel(review.riskLevel)
      });
      pendingOperations += 1;

      onProgress?.({
        stage: "comment",
        percent: Math.round(((index + 1) / sortedReviews.length) * 100),
        message: `正在写入批注 ${index + 1}/${sortedReviews.length}...`
      });

      if (pendingOperations >= COMMENT_SYNC_BATCH_SIZE) {
        await context.sync();
        inserted.push(...pendingInserted);
        pendingInserted.length = 0;
        pendingOperations = 0;
      }
    }

    if (pendingOperations > 0) {
      if (signal?.aborted) {
        throw createAbortError();
      }
      await context.sync();
      inserted.push(...pendingInserted);
    }
  });

  cacheReviews(inserted);
  return inserted;
}

export async function clearAiComments() {
  ensureWordReady();

  let removedCount = 0;

  await Word.run(async (context) => {
    const comments = context.document.body.getRange("Whole").getComments();
    comments.load("items/content");
    await context.sync();

    comments.items.forEach((comment) => {
      if ((comment.content || "").includes(REVIEW_PREFIX)) {
        comment.delete();
        removedCount += 1;
      }
    });

    await context.sync();
  });

  cacheReviews([]);
  return removedCount;
}

export function filterReviewsByRisk(reviews, riskLevel) {
  if (!riskLevel || riskLevel === "all") {
    return sortReviewsForDisplay(reviews);
  }

  const filtered = (reviews || []).filter((review) => normalizeRiskLevel(review.riskLevel) === riskLevel);
  return sortReviewsForDisplay(filtered);
}

export function getReviewSummary(reviews) {
  return summarizeByRisk(reviews || []);
}

export function getCachedReviews() {
  try {
    const value = localStorage.getItem(REVIEW_CACHE_KEY);
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? sortReviewsForDisplay(parsed) : [];
  } catch (_error) {
    return [];
  }
}

function sortReviewsForDisplay(reviews) {
  return [...(reviews || [])].sort((a, b) => {
    if (a.paragraphIndex !== b.paragraphIndex) {
      return a.paragraphIndex - b.paragraphIndex;
    }
    return compareRiskLevel(a.riskLevel, b.riskLevel);
  });
}

function cacheReviews(reviews) {
  localStorage.setItem(REVIEW_CACHE_KEY, JSON.stringify(reviews || []));
}

function ensureWordReady() {
  if (typeof Word === "undefined") {
    throw new Error("当前环境不是 Word 插件上下文，无法写入批注。");
  }
}
