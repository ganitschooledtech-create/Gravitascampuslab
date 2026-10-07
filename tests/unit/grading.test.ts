import { describe, expect, it } from "vitest";
import { gradeBlock } from "@/lib/blocks/grade";
import { validateBlock } from "@/lib/blocks/registry";

const mcq = { question: "Q", multiple: false, options: [{ id: "a", text: "A" }, { id: "b", text: "B" }] };

describe("MCQ", () => {
  it("correct single answer earns points", () => {
    const r = gradeBlock("mcq", mcq, { correct: ["b"], explanation: "because" }, { points: 2 }, { selected: ["b"] });
    expect(r).toMatchObject({ completed: true, isCorrect: true, score: 2, maxScore: 2, explanation: "because" });
  });
  it("wrong answer earns 0 but completes", () => {
    expect(gradeBlock("mcq", mcq, { correct: ["b"] }, {}, { selected: ["a"] })).toMatchObject({ completed: true, isCorrect: false, score: 0 });
  });
  it("rejects multiple selections on single choice and unknown options", () => {
    expect(gradeBlock("mcq", mcq, { correct: ["b"] }, {}, { selected: ["a", "b"] }).error).toBeTruthy();
    expect(gradeBlock("mcq", mcq, { correct: ["b"] }, {}, { selected: ["zzz"] }).error).toBeTruthy();
    expect(gradeBlock("mcq", mcq, { correct: ["b"] }, {}, {}).completed).toBe(false);
  });
  it("multi-select needs the exact set", () => {
    const c = { ...mcq, multiple: true, options: [...mcq.options, { id: "c", text: "C" }] };
    expect(gradeBlock("mcq", c, { correct: ["a", "c"] }, {}, { selected: ["c", "a"] }).isCorrect).toBe(true);
    expect(gradeBlock("mcq", c, { correct: ["a", "c"] }, {}, { selected: ["a"] }).isCorrect).toBe(false);
  });
});

describe("fill in the blank", () => {
  const content = { text: "AI is Artificial [[1]] and learns from [[2]]." };
  const key = { blanks: { "1": ["Intelligence"], "2": ["data", "examples"] }, caseSensitive: false };
  it("is case/space/punctuation tolerant and gives partial credit", () => {
    expect(gradeBlock("fill_blank", content, key, { points: 2 }, { answers: { "1": " intelligence. ", "2": "EXAMPLES" } })).toMatchObject({ isCorrect: true, score: 2 });
    expect(gradeBlock("fill_blank", content, key, { points: 2 }, { answers: { "1": "intelligence", "2": "magic" } })).toMatchObject({ isCorrect: false, score: 1 });
  });
  it("requires every blank", () => {
    expect(gradeBlock("fill_blank", content, key, {}, { answers: { "1": "x" } }).error).toBeTruthy();
  });
});

describe("sorting and matching", () => {
  it("sort must contain every item; exact order is correct", () => {
    const c = { prompt: "p", items: [{ id: "a", text: "A" }, { id: "b", text: "B" }, { id: "c", text: "C" }] };
    expect(gradeBlock("sort", c, { order: ["a", "b", "c"] }, {}, { order: ["a", "b", "c"] }).isCorrect).toBe(true);
    expect(gradeBlock("sort", c, { order: ["a", "b", "c"] }, {}, { order: ["b", "a", "c"] }).isCorrect).toBe(false);
    expect(gradeBlock("sort", c, { order: ["a", "b", "c"] }, {}, { order: ["a", "a", "c"] }).error).toBeTruthy();
  });
  it("match gives partial credit", () => {
    const r = gradeBlock("match", {}, { pairs: { l1: "r1", l2: "r2" } }, { points: 2 }, { pairs: { l1: "r1", l2: "r1" } });
    expect(r).toMatchObject({ isCorrect: false, score: 1 });
  });
});

describe("practice blocks", () => {
  it("prompt builder requires all four parts with enough words and checklist ticked", () => {
    const c = { instructions: "i", minWordsPerField: 3, checklist: [{ id: "c1", text: "no personal info" }] };
    const full = { role: "You are a teacher", task: "Create five questions now", context: "I am in class nine", format: "A numbered list please" };
    expect(gradeBlock("prompt_builder", c, {}, {}, { ...full, checked: ["c1"] }).completed).toBe(true);
    expect(gradeBlock("prompt_builder", c, {}, {}, { ...full, role: "teacher", checked: ["c1"] }).error).toMatch(/Role/);
    expect(gradeBlock("prompt_builder", c, {}, {}, { ...full, checked: [] }).error).toMatch(/checklist/);
  });
  it("try-it requires proof only when configured, and proof links must be http(s)", () => {
    expect(gradeBlock("try_it", { proof: "required" }, {}, {}, { done: true }).error).toBeTruthy();
    expect(gradeBlock("try_it", { proof: "optional" }, {}, {}, { done: true }).completed).toBe(true);
    expect(gradeBlock("try_it", { proof: "optional" }, {}, {}, { done: true, proofUrl: "javascript:alert(1)" }).error).toBeTruthy();
  });
  it("checklist requires every item", () => {
    const c = { items: [{ id: "a", text: "A" }, { id: "b", text: "B" }] };
    expect(gradeBlock("checklist", c, {}, {}, { checked: ["a"] }).completed).toBe(false);
    expect(gradeBlock("checklist", c, {}, {}, { checked: ["a", "b"] }).completed).toBe(true);
  });
  it("non-interactive blocks complete on view and carry no points", () => {
    expect(gradeBlock("rich_text", { markdown: "x" }, {}, { points: 5 }, {})).toMatchObject({ completed: true, maxScore: 0 });
  });
});

describe("authoring validation", () => {
  it("rejects MCQ whose correct answer is not an option", () => {
    expect(validateBlock("mcq", mcq, { correct: ["z"] }).ok).toBe(false);
  });
  it("rejects fill-blank missing an answer for a blank", () => {
    expect(validateBlock("fill_blank", { text: "A [[1]] B [[2]]" }, { blanks: { "1": ["x"] } }).ok).toBe(false);
  });
  it("requires alt text on images", () => {
    expect(validateBlock("image", { src: "/a.png", alt: "" }, {}).ok).toBe(false);
  });
  it("rejects javascript: links", () => {
    expect(validateBlock("try_it", { title: "t", steps: ["s"], toolName: "x", toolUrl: "javascript:alert(1)" }, {}).ok).toBe(false);
  });
});
