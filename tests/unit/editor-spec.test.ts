import { describe, expect, it } from "vitest";
import { EDITOR_SPECS, defaultBlock, fromModel, toModel } from "@/lib/blocks/editor-spec";
import { blockTypeList, validateBlock } from "@/lib/blocks/registry";

describe("block editor forms", () => {
  it("every block type has a valid default (so 'Add block' never creates broken content)", () => {
    for (const t of blockTypeList) {
      const { content, answerKey } = defaultBlock(t);
      const v = validateBlock(t, content, answerKey);
      expect(v.ok, `${t}: ${!v.ok && v.error}`).toBe(true);
    }
  });
  it("form model round-trips: stored → form → stored is unchanged", () => {
    for (const t of blockTypeList) {
      const a = defaultBlock(t);
      const v = validateBlock(t, a.content, a.answerKey);
      if (!v.ok) continue;
      const back = fromModel(t, toModel(t, v.content, v.answerKey));
      const v2 = validateBlock(t, back.content, back.answerKey);
      expect(v2.ok && JSON.stringify(v2.content), t).toBe(JSON.stringify(v.content));
      expect(v2.ok && JSON.stringify(v2.answerKey), t).toBe(JSON.stringify(v.answerKey));
    }
  });
  it("MCQ tick-boxes become the answer key", () => {
    const { content, answerKey } = fromModel("mcq", { question: "Q", multiple: true, explanation: "", options: [{ text: "A", correct: true }, { text: "B", correct: false }, { text: "C", correct: true, feedback: "yes" }] });
    expect(content.options.map((o: any) => o.id)).toEqual(["a", "b", "c"]);
    expect(answerKey.correct).toEqual(["a", "c"]);
    expect(answerKey.optionFeedback).toEqual({ c: "yes" });
  });
  it("covers every block type", () => {
    expect(Object.keys(EDITOR_SPECS).sort()).toEqual([...blockTypeList].sort());
  });
});
