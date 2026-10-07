import { describe, expect, it } from "vitest";
import { effectivePassMark, levelResult, nextLevelId } from "@/lib/content/unlock";
import { shuffleAwayFrom } from "@/lib/content/shuffle";

describe("level pass rules", () => {
  it("assessment score at or above pass mark passes (default 50)", () => {
    expect(levelResult([{ isAssessment: true, completed: true, score: 5, maxScore: 10 }], 50).passed).toBe(true);
    expect(levelResult([{ isAssessment: true, completed: true, score: 4.9, maxScore: 10 }], 50).passed).toBe(false);
  });
  it("unfinished assessment does not pass", () => {
    expect(levelResult([{ isAssessment: true, completed: false, score: 10, maxScore: 10 }], 50).passed).toBe(false);
  });
  it("without assessments, all lessons must be completed", () => {
    expect(levelResult([{ isAssessment: false, completed: true, score: 0, maxScore: 0 }, { isAssessment: false, completed: false, score: 0, maxScore: 0 }], 50).passed).toBe(false);
  });
  it("non-assessment lessons do not affect the score", () => {
    const r = levelResult([{ isAssessment: false, completed: false, score: 0, maxScore: 10 }, { isAssessment: true, completed: true, score: 6, maxScore: 10 }], 60);
    expect(r).toMatchObject({ passed: true, scorePct: 60 });
  });
  it("next level follows position order; last level has none", () => {
    const lv = [{ id: "b", position: 1 }, { id: "a", position: 0 }, { id: "c", position: 2 }];
    expect(nextLevelId(lv, "a")).toBe("b");
    expect(nextLevelId(lv, "c")).toBeNull();
  });
  it("level pass mark overrides program pass mark", () => {
    expect(effectivePassMark(70, 50)).toBe(70);
    expect(effectivePassMark(null, 50)).toBe(50);
  });
});

describe("shuffle", () => {
  it("never presents sorting items in the correct order", () => {
    for (let i = 0; i < 50; i++) {
      const items = [{ id: "a" }, { id: "b" }];
      expect(shuffleAwayFrom(items, ["a", "b"], "seed" + i).map((x) => x.id)).toEqual(["b", "a"]);
    }
  });
});
