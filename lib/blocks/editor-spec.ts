/**
 * Author-friendly form definitions for every block type.
 *
 * Authors edit a simple "model" (e.g. options with a ✓ correct tick-box); fromModel()
 * converts it into the stored { content, answerKey }, and toModel() converts back.
 * The server re-validates everything with the zod schemas in registry.ts.
 */
import type { BlockType } from "./registry";

export type Field =
  | { k: string; t: "text" | "textarea" | "markdown" | "url" | "number" | "checkbox"; label: string; help?: string }
  | { k: string; t: "select"; label: string; options: [string, string][]; help?: string }
  | { k: string; t: "multi"; label: string; options: [string, string][]; help?: string }
  | { k: string; t: "strings"; label: string; help?: string }
  | { k: string; t: "list"; label: string; item: Field[]; help?: string; addLabel?: string };

type Model = Record<string, any>;
type Spec = { fields: Field[]; defaults: Model; toModel?: (c: any, a: any) => Model; fromModel?: (m: Model) => { content: any; answerKey: any } };

const lines = (v: unknown): string[] => (Array.isArray(v) ? v : String(v ?? "").split("\n")).map((s) => String(s).trim()).filter(Boolean);
const withIds = (arr: string[], p: string) => arr.map((text, i) => ({ id: `${p}${i + 1}`, text }));
const letters = "abcdefgh";

export const EDITOR_SPECS: Record<BlockType, Spec> = {
  heading: {
    fields: [{ k: "text", t: "text", label: "Heading text" }, { k: "level", t: "select", label: "Size", options: [["2", "Large"], ["3", "Medium"]] }],
    defaults: { text: "New heading", level: "2" },
    toModel: (c) => ({ ...c, level: String(c.level ?? 2) }),
    fromModel: (m) => ({ content: { text: m.text, level: Number(m.level) }, answerKey: {} }),
  },
  rich_text: { fields: [{ k: "markdown", t: "markdown", label: "Text", help: "**bold**, *italic*, - bullet lists, [link](https://…)" }], defaults: { markdown: "Write something here…" } },
  callout: {
    fields: [
      { k: "variant", t: "select", label: "Type", options: [["tip", "💡 Tip"], ["warning", "⚠️ Warning"], ["remember", "📌 Remember this"]] },
      { k: "title", t: "text", label: "Title (optional)" }, { k: "markdown", t: "markdown", label: "Text" },
    ],
    defaults: { variant: "tip", title: "", markdown: "A helpful tip." },
  },
  image: {
    fields: [{ k: "src", t: "url", label: "Image URL", help: "Upload in the Media library, then paste its link here." }, { k: "alt", t: "text", label: "Alt text (describe the image for screen readers)" }, { k: "caption", t: "text", label: "Caption (optional)" }],
    defaults: { src: "/seed/robot.svg", alt: "Describe the image", caption: "" },
  },
  video: { fields: [{ k: "url", t: "url", label: "YouTube or Vimeo link" }, { k: "title", t: "text", label: "Video title" }], defaults: { url: "https://www.youtube.com/watch?v=", title: "Video" } },
  file: { fields: [{ k: "url", t: "url", label: "File URL (from Media library)" }, { k: "fileName", t: "text", label: "File name shown to learners" }, { k: "description", t: "text", label: "Description" }], defaults: { url: "/", fileName: "Worksheet", description: "" } },
  key_terms: {
    fields: [{ k: "title", t: "text", label: "Title" }, { k: "terms", t: "list", label: "Terms", addLabel: "Add term", item: [{ k: "term", t: "text", label: "Term" }, { k: "definition", t: "textarea", label: "Meaning" }, { k: "link", t: "url", label: "Glossary link (optional)" }] }],
    defaults: { title: "Key terms", terms: [{ term: "Term", definition: "Meaning", link: "" }] },
  },
  mcq: {
    fields: [
      { k: "question", t: "textarea", label: "Question" },
      { k: "multiple", t: "checkbox", label: "Learners may choose more than one answer (multi-select)" },
      { k: "options", t: "list", label: "Options", addLabel: "Add option", item: [{ k: "text", t: "text", label: "Option" }, { k: "correct", t: "checkbox", label: "✓ Correct" }, { k: "feedback", t: "text", label: "Feedback if chosen (optional)" }] },
      { k: "explanation", t: "textarea", label: "Explanation (shown after answering)" },
    ],
    defaults: { question: "Your question?", multiple: false, options: [{ text: "Option A", correct: true, feedback: "" }, { text: "Option B", correct: false, feedback: "" }], explanation: "" },
    toModel: (c, a) => ({ question: c.question, multiple: c.multiple, explanation: a.explanation ?? "",
      options: c.options.map((o: any) => ({ text: o.text, correct: (a.correct ?? []).includes(o.id), feedback: a.optionFeedback?.[o.id] ?? "" })) }),
    fromModel: (m) => {
      const opts = (m.options ?? []).map((o: any, i: number) => ({ ...o, id: letters[i] ?? `o${i}` }));
      return {
        content: { question: m.question, multiple: !!m.multiple, options: opts.map((o: any) => ({ id: o.id, text: o.text })) },
        answerKey: { correct: opts.filter((o: any) => o.correct).map((o: any) => o.id), explanation: m.explanation ?? "",
          optionFeedback: Object.fromEntries(opts.filter((o: any) => o.feedback?.trim()).map((o: any) => [o.id, o.feedback.trim()])) },
      };
    },
  },
  fill_blank: {
    fields: [
      { k: "text", t: "textarea", label: "Sentence with blanks", help: "Mark each blank as [[1]], [[2]] … e.g. “AI stands for Artificial [[1]].”" },
      { k: "blanks", t: "list", label: "Accepted answers per blank", addLabel: "Add blank", item: [{ k: "name", t: "text", label: "Blank (e.g. 1)" }, { k: "answers", t: "text", label: "Accepted answers, separated by commas" }] },
      { k: "caseSensitive", t: "checkbox", label: "Capital letters matter" },
      { k: "explanation", t: "textarea", label: "Explanation" },
    ],
    defaults: { text: "AI stands for Artificial [[1]].", blanks: [{ name: "1", answers: "Intelligence" }], caseSensitive: false, explanation: "" },
    toModel: (c, a) => ({ text: c.text, caseSensitive: !!a.caseSensitive, explanation: a.explanation ?? "",
      blanks: Object.entries(a.blanks ?? {}).map(([name, v]) => ({ name, answers: (v as string[]).join(", ") })) }),
    fromModel: (m) => ({
      content: { text: m.text },
      answerKey: { caseSensitive: !!m.caseSensitive, explanation: m.explanation ?? "",
        blanks: Object.fromEntries((m.blanks ?? []).map((b: any) => [String(b.name).trim(), String(b.answers).split(",").map((s) => s.trim()).filter(Boolean)])) },
    }),
  },
  short_answer: {
    fields: [
      { k: "question", t: "textarea", label: "Question" }, { k: "placeholder", t: "text", label: "Placeholder (optional)" },
      { k: "minWords", t: "number", label: "Minimum words" },
      { k: "acceptable", t: "strings", label: "Accepted answers (one per line). Leave empty for an open answer." },
      { k: "explanation", t: "textarea", label: "Explanation / sample answer" },
    ],
    defaults: { question: "Your question?", placeholder: "", minWords: 0, acceptable: "", explanation: "" },
    toModel: (c, a) => ({ ...c, acceptable: (a.acceptable ?? []).join("\n"), explanation: a.explanation ?? "" }),
    fromModel: (m) => ({ content: { question: m.question, placeholder: m.placeholder ?? "", minWords: Number(m.minWords) || 0 }, answerKey: { acceptable: lines(m.acceptable), explanation: m.explanation ?? "" } }),
  },
  sort: {
    fields: [{ k: "prompt", t: "textarea", label: "Instruction" }, { k: "items", t: "strings", label: "Items in the CORRECT order (one per line) — learners see them shuffled" }, { k: "explanation", t: "textarea", label: "Explanation" }],
    defaults: { prompt: "Put these in order.", items: "First\nSecond\nThird", explanation: "" },
    toModel: (c, a) => {
      const byId = Object.fromEntries(c.items.map((i: any) => [i.id, i.text]));
      return { prompt: c.prompt, items: (a.order ?? []).map((id: string) => byId[id]).join("\n"), explanation: a.explanation ?? "" };
    },
    fromModel: (m) => { const items = withIds(lines(m.items), "s"); return { content: { prompt: m.prompt, items }, answerKey: { order: items.map((i) => i.id), explanation: m.explanation ?? "" } }; },
  },
  match: {
    fields: [{ k: "prompt", t: "textarea", label: "Instruction" }, { k: "pairs", t: "list", label: "Matching pairs (learners see the right side shuffled)", addLabel: "Add pair", item: [{ k: "left", t: "text", label: "Left" }, { k: "right", t: "text", label: "Matches with" }] }, { k: "explanation", t: "textarea", label: "Explanation" }],
    defaults: { prompt: "Match each item.", pairs: [{ left: "Cat", right: "Meow" }, { left: "Dog", right: "Woof" }], explanation: "" },
    toModel: (c, a) => ({ prompt: c.prompt, explanation: a.explanation ?? "", pairs: c.left.map((l: any) => ({ left: l.text, right: c.right.find((r: any) => r.id === a.pairs?.[l.id])?.text ?? "" })) }),
    fromModel: (m) => {
      const pairs = (m.pairs ?? []).filter((p: any) => p.left?.trim() || p.right?.trim());
      return {
        content: { prompt: m.prompt, left: pairs.map((p: any, i: number) => ({ id: `l${i + 1}`, text: p.left })), right: pairs.map((p: any, i: number) => ({ id: `r${i + 1}`, text: p.right })) },
        answerKey: { pairs: Object.fromEntries(pairs.map((_: any, i: number) => [`l${i + 1}`, `r${i + 1}`])), explanation: m.explanation ?? "" },
      };
    },
  },
  flashcards: { fields: [{ k: "cards", t: "list", label: "Cards", addLabel: "Add card", item: [{ k: "front", t: "text", label: "Front" }, { k: "back", t: "textarea", label: "Back" }] }], defaults: { cards: [{ front: "Question", back: "Answer" }] } },
  prompt_builder: {
    fields: [
      { k: "instructions", t: "textarea", label: "Instructions" }, { k: "scenario", t: "textarea", label: "Scenario (optional)" },
      { k: "hintRole", t: "text", label: "Hint for Role" }, { k: "hintTask", t: "text", label: "Hint for Task" }, { k: "hintContext", t: "text", label: "Hint for Context" }, { k: "hintFormat", t: "text", label: "Hint for Format" },
      { k: "minWordsPerField", t: "number", label: "Minimum words per box" },
      { k: "checklist", t: "strings", label: "Checklist the learner must tick (one per line)" },
    ],
    defaults: { instructions: "Build a prompt that…", scenario: "", hintRole: "", hintTask: "", hintContext: "", hintFormat: "", minWordsPerField: 3, checklist: "My prompt has no personal information" },
    toModel: (c) => ({ instructions: c.instructions, scenario: c.scenario, hintRole: c.hints?.role ?? "", hintTask: c.hints?.task ?? "", hintContext: c.hints?.context ?? "", hintFormat: c.hints?.format ?? "",
      minWordsPerField: c.minWordsPerField, checklist: (c.checklist ?? []).map((x: any) => x.text).join("\n") }),
    fromModel: (m) => ({ content: { instructions: m.instructions, scenario: m.scenario ?? "", minWordsPerField: Number(m.minWordsPerField) || 3,
      hints: { role: m.hintRole ?? "", task: m.hintTask ?? "", context: m.hintContext ?? "", format: m.hintFormat ?? "" }, checklist: withIds(lines(m.checklist), "c") }, answerKey: {} }),
  },
  try_it: {
    fields: [
      { k: "title", t: "text", label: "Activity title" }, { k: "steps", t: "strings", label: "Steps (one per line)" },
      { k: "toolName", t: "text", label: "Tool name" }, { k: "toolUrl", t: "url", label: "Tool link (opens in a new tab)" },
      { k: "proof", t: "select", label: "Proof (screenshot or link)", options: [["none", "Not needed"], ["optional", "Optional"], ["required", "Required"]] },
    ],
    defaults: { title: "Try it yourself", steps: "Open the tool\nTry it\nCome back and mark as done", toolName: "Tool", toolUrl: "https://", proof: "none" },
    toModel: (c) => ({ ...c, steps: c.steps.join("\n") }),
    fromModel: (m) => ({ content: { ...m, steps: lines(m.steps) }, answerKey: {} }),
  },
  submission: {
    fields: [
      { k: "kind", t: "select", label: "Type", options: [["reflection", "Reflection"], ["assignment", "Assignment"], ["project", "Project"]] },
      { k: "prompt", t: "markdown", label: "What should learners do?" },
      { k: "accepts", t: "multi", label: "Learners can submit", options: [["text", "Written answer"], ["link", "Link"], ["file", "File"], ["screenshot", "Screenshot"]] },
      { k: "rubric", t: "list", label: "Rubric (for grading)", addLabel: "Add criterion", item: [{ k: "criterion", t: "text", label: "Criterion" }, { k: "description", t: "text", label: "What good looks like" }, { k: "maxPoints", t: "number", label: "Max points" }] },
    ],
    defaults: { kind: "reflection", prompt: "Reflect on…", accepts: ["text"], rubric: [] },
    fromModel: (m) => ({ content: { ...m, rubric: (m.rubric ?? []).map((r: any) => ({ ...r, maxPoints: Number(r.maxPoints) || 1 })) }, answerKey: {} }),
  },
  checklist: {
    fields: [{ k: "title", t: "text", label: "Title" }, { k: "items", t: "strings", label: "Items (one per line)" }],
    defaults: { title: "Checklist", items: "First thing\nSecond thing" },
    toModel: (c) => ({ title: c.title, items: c.items.map((i: any) => i.text).join("\n") }),
    fromModel: (m) => ({ content: { title: m.title ?? "", items: withIds(lines(m.items), "k") }, answerKey: {} }),
  },
  walkthrough: {
    fields: [{ k: "steps", t: "list", label: "Steps", addLabel: "Add step", item: [{ k: "title", t: "text", label: "Step title" }, { k: "markdown", t: "markdown", label: "Details" }, { k: "image", t: "url", label: "Image URL (optional)" }] }],
    defaults: { steps: [{ title: "Step 1", markdown: "", image: "" }] },
  },
};

export function toModel(type: BlockType, content: any, answerKey: any): Model {
  const s = EDITOR_SPECS[type];
  return s.toModel ? s.toModel(content ?? {}, answerKey ?? {}) : { ...(content ?? {}) };
}
export function fromModel(type: BlockType, model: Model) {
  const s = EDITOR_SPECS[type];
  return s.fromModel ? s.fromModel(model) : { content: model, answerKey: {} };
}
export const defaultBlock = (type: BlockType) => fromModel(type, EDITOR_SPECS[type].defaults);
