import { compareRiskLevel, getRiskLabel, summarizeByRisk } from "./utils.js";

export function exportReviewReport(reviews, metadata = {}) {
  const now = new Date();
  const {
    modelName = "unknown-model",
    scope = "all",
    totalCharacters = 0
  } = metadata;

  const sortedReviews = [...(reviews || [])].sort((a, b) => {
    const riskOrder = compareRiskLevel(a.riskLevel, b.riskLevel);
    if (riskOrder !== 0) {
      return riskOrder;
    }
    return a.paragraphIndex - b.paragraphIndex;
  });

  const summary = summarizeByRisk(sortedReviews);

  const lines = [
    "Word 合同审核报告",
    "",
    `生成时间：${now.toLocaleString("zh-CN")}`,
    `审核范围：${scope === "selection" ? "选中内容" : "全文"}`,
    `模型：${modelName}`,
    `审核字数：${totalCharacters}`,
    "",
    "统计汇总",
    `总问题数：${summary.total}`,
    `严重：${summary.critical}`,
    `高：${summary.high}`,
    `中：${summary.medium}`,
    `低：${summary.low}`,
    "",
    "批注详情"
  ];

  if (!sortedReviews.length) {
    lines.push("无问题。");
  } else {
    sortedReviews.forEach((review, index) => {
      lines.push("");
      lines.push(`${index + 1}. 段落 #${review.paragraphIndex + 1} | 风险：${getRiskLabel(review.riskLevel)}`);
      lines.push(`问题：${review.issue || "未提供"}`);
      lines.push(`建议：${review.suggestion || "未提供"}`);
      lines.push(`法律依据：${review.legalBasis || "未提供"}`);
      if (review.paragraphText) {
        lines.push(`原文片段：${review.paragraphText.slice(0, 160)}`);
      }
    });
  }

  const content = lines.join("\n");
  const blob = new Blob(["\ufeff", content], { type: "text/plain;charset=utf-8" });
  const fileName = `contract-review-report-${formatTime(now)}.txt`;
  const objectUrl = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);

  return fileName;
}

function formatTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}
