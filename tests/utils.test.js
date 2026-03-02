import { describe, expect, it } from "vitest";
import { getRiskColor, parseReviewResponse } from "../src/taskpane/utils.js";

describe("utils.parseReviewResponse", () => {
  it("parses normal json payload", () => {
    const raw = JSON.stringify({
      reviews: [
        {
          paragraphIndex: 0,
          issue: "issue",
          suggestion: "suggestion",
          riskLevel: "high",
          legalBasis: "law"
        }
      ]
    });
    const result = parseReviewResponse(raw);
    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0].riskLevel).toBe("high");
  });

  it("parses fenced json payload", () => {
    const raw = [
      "```json",
      "{",
      "  \"reviews\": [",
      "    {",
      "      \"paragraphIndex\": 2,",
      "      \"issue\": \"issue\",",
      "      \"suggestion\": \"suggestion\",",
      "      \"riskLevel\": \"critical\",",
      "      \"legalBasis\": \"law\"",
      "    }",
      "  ]",
      "}",
      "```"
    ].join("\n");

    const result = parseReviewResponse(raw);
    expect(result.reviews[0].paragraphIndex).toBe(2);
    expect(result.reviews[0].riskLevel).toBe("critical");
  });

  it("filters invalid review rows", () => {
    const raw = JSON.stringify({
      reviews: [
        { paragraphIndex: -1, issue: "bad" },
        {
          paragraphIndex: 1,
          issue: "ok",
          suggestion: "ok",
          riskLevel: "unknown",
          legalBasis: "law"
        }
      ]
    });

    const result = parseReviewResponse(raw);
    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0].riskLevel).toBe("low");
  });
});

describe("utils.getRiskColor", () => {
  it("maps risk level to color", () => {
    expect(getRiskColor("critical")).toBe("#FF0000");
    expect(getRiskColor("high")).toBe("#FF8C00");
    expect(getRiskColor("medium")).toBe("#FFD700");
    expect(getRiskColor("low")).toBe("#1E90FF");
  });
});
