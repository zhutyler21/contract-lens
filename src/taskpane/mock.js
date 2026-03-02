import { waitForDelay } from "./utils.js";

const MOCK_TEMPLATES = [
  {
    issue: "合同标的物描述不够具体，交付标准存在争议风险。",
    suggestion: "补充标的物规格、验收标准、交付形式和附件清单。",
    riskLevel: "medium",
    legalBasis: "《民法典》第470条，合同内容应明确标的、数量、质量等。"
  },
  {
    issue: "付款条款未明确分期节点和发票条件，履约执行风险较高。",
    suggestion: "明确每笔付款触发条件、付款时点、发票类型与违约责任。",
    riskLevel: "high",
    legalBasis: "《民法典》第509条，当事人应按约全面履行义务。"
  },
  {
    issue: "争议解决条款缺失，发生争议时管辖路径不明确。",
    suggestion: "增加争议解决条款，明确仲裁机构或法院管辖地。",
    riskLevel: "critical",
    legalBasis: "《民法典》第577条及《仲裁法》相关规定。"
  },
  {
    issue: "知识产权归属与许可范围表述模糊，存在成果归属争议。",
    suggestion: "明确知识产权归属、许可边界、源码与文档权利范围。",
    riskLevel: "high",
    legalBasis: "《民法典》第841条，技术成果归属应在合同中约定。"
  }
];

export async function generateMockReviews(paragraphs, { signal, delayMs = 900 } = {}) {
  await waitForDelay(delayMs, signal);

  const reviews = [];
  const nonEmptyParagraphs = paragraphs.filter((paragraph) => paragraph.text.trim().length > 0);
  const upperBound = Math.min(nonEmptyParagraphs.length, 4);

  for (let index = 0; index < upperBound; index += 1) {
    const paragraph = nonEmptyParagraphs[index];
    const template = MOCK_TEMPLATES[index % MOCK_TEMPLATES.length];
    reviews.push({
      paragraphIndex: paragraph.index,
      issue: template.issue,
      suggestion: template.suggestion,
      riskLevel: template.riskLevel,
      legalBasis: template.legalBasis
    });
  }

  return { reviews };
}
