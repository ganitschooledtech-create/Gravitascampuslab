/**
 * Server-side grading for interactive blocks. Pure functions → fully unit-tested.
 * The browser sends only the learner's response; the answer key never leaves the server.
 */
import { BLOCK_TYPES, blockSettingsSchema, isBlockType } from "./registry";

export type GradeResult = {
  completed: boolean;          // learner may move on
  isCorrect: boolean | null;   // null = not auto-gradable (open answer, practice)
  score: number;
  maxScore: number;
  feedback: string;            // short message shown to learner
  explanation?: string;        // shown after answering
  reveal?: unknown;            // safe-to-show correct answer, after the attempt
  error?: string;              // validation problem with the response (not completed)
};

const norm = (s: string, caseSensitive = false) => {
  const t = s.normalize("NFKC").trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
  return caseSensitive ? t : t.toLowerCase();
};
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("\u0000") === [...b].sort().join("\u0000");

export function gradeBlock(type: string, content: any, answerKey: any, settingsRaw: unknown, response: any): GradeResult {
  if (!isBlockType(type)) return { completed: false, isCorrect: null, score: 0, maxScore: 0, feedback: "", error: "Unknown block" };
  const settings = blockSettingsSchema.parse(settingsRaw ?? {});
  const def = BLOCK_TYPES[type];
  const points = def.interactive ? settings.points : 0;
  const r = response ?? {};
  const fail = (error: string): GradeResult => ({ completed: false, isCorrect: null, score: 0, maxScore: points, feedback: error, error });

  switch (type) {
    case "mcq": {
      const selected: string[] = Array.isArray(r.selected) ? r.selected.map(String) : [];
      if (!selected.length) return fail("Choose an answer first.");
      const valid = new Set(content.options.map((o: { id: string }) => o.id));
      if (!selected.every((s) => valid.has(s))) return fail("Invalid option.");
      if (!content.multiple && selected.length > 1) return fail("Choose only one answer.");
      const ok = sameSet(selected, answerKey.correct);
      const fb = selected.map((s) => answerKey.optionFeedback?.[s]).filter(Boolean).join(" ");
      return {
        completed: true, isCorrect: ok, score: ok ? points : 0, maxScore: points,
        feedback: fb || (ok ? "Correct! 🎉" : "Not quite."), explanation: answerKey.explanation, reveal: { correct: answerKey.correct },
      };
    }
    case "fill_blank": {
      const answers: Record<string, string> = r.answers && typeof r.answers === "object" ? r.answers : {};
      const blanks = Object.keys(answerKey.blanks);
      if (blanks.some((b) => !String(answers[b] ?? "").trim())) return fail("Fill in every blank.");
      const perBlank = Object.fromEntries(
        blanks.map((b) => [b, answerKey.blanks[b].some((acc: string) => norm(acc, answerKey.caseSensitive) === norm(String(answers[b]), answerKey.caseSensitive))]),
      );
      const right = Object.values(perBlank).filter(Boolean).length;
      const ok = right === blanks.length;
      return {
        completed: true, isCorrect: ok, score: Math.round((points * right * 100) / blanks.length) / 100, maxScore: points,
        feedback: ok ? "All blanks correct! 🎉" : `${right} of ${blanks.length} blanks correct.`,
        explanation: answerKey.explanation, reveal: { perBlank, answers: Object.fromEntries(blanks.map((b) => [b, answerKey.blanks[b][0]])) },
      };
    }
    case "short_answer": {
      const t = String(r.text ?? "");
      if (!t.trim()) return fail("Write your answer first.");
      if (t.length > 5000) return fail("Answer is too long.");
      if (words(t) < (content.minWords ?? 0)) return fail(`Write at least ${content.minWords} words.`);
      if (!answerKey.acceptable?.length) {
        return { completed: true, isCorrect: null, score: points, maxScore: points, feedback: "Answer saved. ✅", explanation: answerKey.explanation };
      }
      const ok = answerKey.acceptable.some((a: string) => norm(a) === norm(t));
      return {
        completed: true, isCorrect: ok, score: ok ? points : 0, maxScore: points,
        feedback: ok ? "Correct! 🎉" : "Not quite.", explanation: answerKey.explanation, reveal: { answer: answerKey.acceptable[0] },
      };
    }
    case "sort": {
      const order: string[] = Array.isArray(r.order) ? r.order.map(String) : [];
      if (!sameSet(order, answerKey.order)) return fail("Arrange all the items.");
      const inPlace = order.filter((id, i) => answerKey.order[i] === id).length;
      const ok = inPlace === order.length;
      return {
        completed: true, isCorrect: ok, score: ok ? points : 0, maxScore: points,
        feedback: ok ? "Perfect order! 🎉" : `${inPlace} of ${order.length} items are in the right place.`,
        explanation: answerKey.explanation, reveal: { order: answerKey.order },
      };
    }
    case "match": {
      const pairs: Record<string, string> = r.pairs && typeof r.pairs === "object" ? r.pairs : {};
      const lefts = Object.keys(answerKey.pairs);
      if (lefts.some((l) => !pairs[l])) return fail("Match every item.");
      const right = lefts.filter((l) => pairs[l] === answerKey.pairs[l]).length;
      const ok = right === lefts.length;
      return {
        completed: true, isCorrect: ok, score: Math.round((points * right * 100) / lefts.length) / 100, maxScore: points,
        feedback: ok ? "All matched! 🎉" : `${right} of ${lefts.length} matches are correct.`,
        explanation: answerKey.explanation, reveal: { pairs: answerKey.pairs },
      };
    }
    case "prompt_builder": {
      const fields = ["role", "task", "context", "format"] as const;
      const min = content.minWordsPerField ?? 3;
      const missing = fields.filter((f) => words(String(r[f] ?? "")) < min);
      if (missing.length) return fail(`Add more detail to: ${missing.map((m) => m[0].toUpperCase() + m.slice(1)).join(", ")} (at least ${min} words each).`);
      if (fields.some((f) => String(r[f]).length > 2000)) return fail("One of the boxes is too long.");
      const checked: string[] = Array.isArray(r.checked) ? r.checked : [];
      const need = (content.checklist ?? []).map((c: { id: string }) => c.id);
      if (need.some((n: string) => !checked.includes(n))) return fail("Tick every item on the checklist to confirm.");
      return { completed: true, isCorrect: null, score: points, maxScore: points, feedback: "Great prompt structure! ✅ Role, Task, Context and Format are all there." };
    }
    case "try_it": {
      if (r.done !== true) return fail("Mark the activity as done.");
      const proof = String(r.proofUrl ?? r.proofFileKey ?? "").trim();
      if (content.proof === "required" && !proof) return fail("Add a screenshot or link as proof.");
      if (r.proofUrl && !/^https?:\/\//i.test(String(r.proofUrl))) return fail("Proof link must start with http:// or https://");
      return { completed: true, isCorrect: null, score: points, maxScore: points, feedback: "Nice work! ✅" };
    }
    case "checklist": {
      const checked: string[] = Array.isArray(r.checked) ? r.checked : [];
      const all = content.items.map((i: { id: string }) => i.id);
      if (!all.every((i: string) => checked.includes(i))) return fail("Tick every item to continue.");
      return { completed: true, isCorrect: null, score: points, maxScore: points, feedback: "All done! ✅" };
    }
    case "submission":
      // Graded by a person later; the block completes when a submission exists (checked by the caller).
      return r.submitted === true
        ? { completed: true, isCorrect: null, score: 0, maxScore: 0, feedback: "Submitted! Your trainer will review it. ✅" }
        : fail("Submit your work to continue.");
    default:
      // Non-interactive blocks complete when viewed.
      return { completed: true, isCorrect: null, score: 0, maxScore: 0, feedback: "" };
  }
}

/** Percentage helper used for level pass marks. */
export const percent = (score: number, max: number) => (max <= 0 ? 100 : Math.round((score / max) * 10000) / 100);
