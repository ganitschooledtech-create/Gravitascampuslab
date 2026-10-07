/**
 * Block library: one definition per block type.
 *
 *  content    → what the learner sees (validated with zod)
 *  answerKey  → correct answers; stays on the server, never sent to the browser
 *  interactive→ whether the learner must respond before moving on
 *
 * Adding a new block type = add a definition here + an Editor and a Player component.
 * No database change is needed.
 */
import { z } from "zod";

const id = z.string().min(1).max(40);
const text = (max = 2000) => z.string().trim().max(max);
const md = z.string().max(20000);
const url = z.string().trim().max(1000).refine((u) => u === "" || /^https?:\/\//i.test(u) || u.startsWith("/"), "Must be a web link");

export const BLOCK_TYPES = {
  heading: {
    label: "Heading",
    group: "Text",
    interactive: false,
    content: z.object({ text: text(200).min(1), level: z.union([z.literal(2), z.literal(3)]).default(2) }),
    answerKey: z.object({}).default({}),
  },
  rich_text: {
    label: "Rich text",
    group: "Text",
    interactive: false,
    content: z.object({ markdown: md.min(1) }),
    answerKey: z.object({}).default({}),
  },
  callout: {
    label: "Callout (tip / warning / remember)",
    group: "Text",
    interactive: false,
    content: z.object({ variant: z.enum(["tip", "warning", "remember"]), title: text(120).default(""), markdown: md.min(1) }),
    answerKey: z.object({}).default({}),
  },
  image: {
    label: "Image",
    group: "Media",
    interactive: false,
    content: z.object({ src: url.min(1), alt: text(300).min(1, "Alt text is required for accessibility"), caption: text(300).default("") }),
    answerKey: z.object({}).default({}),
  },
  video: {
    label: "Video embed",
    group: "Media",
    interactive: false,
    content: z.object({ url: url.min(1), title: text(200).min(1) }),
    answerKey: z.object({}).default({}),
  },
  file: {
    label: "Downloadable file",
    group: "Media",
    interactive: false,
    content: z.object({ url: url.min(1), fileName: text(200).min(1), description: text(500).default("") }),
    answerKey: z.object({}).default({}),
  },
  key_terms: {
    label: "Key terms table",
    group: "Text",
    interactive: false,
    content: z.object({
      title: text(120).default("Key terms"),
      terms: z.array(z.object({ term: text(120).min(1), definition: text(600).min(1), link: url.default("") })).min(1).max(50),
    }),
    answerKey: z.object({}).default({}),
  },
  mcq: {
    label: "Multiple choice / multi-select",
    group: "Questions",
    interactive: true,
    content: z.object({
      question: text(1000).min(1),
      multiple: z.boolean().default(false),
      options: z.array(z.object({ id, text: text(400).min(1) })).min(2).max(8),
    }),
    answerKey: z.object({
      correct: z.array(id).min(1),
      explanation: text(1500).default(""),
      optionFeedback: z.record(z.string(), z.string()).default({}),
    }),
  },
  fill_blank: {
    label: "Fill in the blank",
    group: "Questions",
    interactive: true,
    // Text with blanks like: "AI stands for [[1]] intelligence."
    content: z.object({ text: text(2000).min(1).refine((t) => /\[\[\w+\]\]/.test(t), "Add at least one blank like [[1]]") }),
    answerKey: z.object({
      blanks: z.record(z.string(), z.array(z.string().min(1)).min(1)),
      caseSensitive: z.boolean().default(false),
      explanation: text(1500).default(""),
    }),
  },
  short_answer: {
    label: "Short answer",
    group: "Questions",
    interactive: true,
    content: z.object({ question: text(1000).min(1), placeholder: text(200).default(""), minWords: z.number().int().min(0).max(500).default(0) }),
    // Leave "acceptable" empty for open answers (completion only).
    answerKey: z.object({ acceptable: z.array(z.string().min(1)).default([]), explanation: text(1500).default("") }),
  },
  sort: {
    label: "Drag-and-drop sorting",
    group: "Questions",
    interactive: true,
    content: z.object({ prompt: text(1000).min(1), items: z.array(z.object({ id, text: text(300).min(1) })).min(2).max(12) }),
    answerKey: z.object({ order: z.array(id).min(2), explanation: text(1500).default("") }),
  },
  match: {
    label: "Drag-and-drop matching",
    group: "Questions",
    interactive: true,
    content: z.object({
      prompt: text(1000).min(1),
      left: z.array(z.object({ id, text: text(300).min(1) })).min(2).max(10),
      right: z.array(z.object({ id, text: text(300).min(1) })).min(2).max(10),
    }),
    answerKey: z.object({ pairs: z.record(z.string(), z.string()), explanation: text(1500).default("") }),
  },
  flashcards: {
    label: "Flashcards",
    group: "Practice",
    interactive: false,
    content: z.object({ cards: z.array(z.object({ front: text(300).min(1), back: text(800).min(1) })).min(1).max(40) }),
    answerKey: z.object({}).default({}),
  },
  prompt_builder: {
    label: "Prompt Builder (Role · Task · Context · Format)",
    group: "Practice",
    interactive: true,
    content: z.object({
      instructions: text(1500).min(1),
      scenario: text(1500).default(""),
      hints: z.object({ role: text(300).default(""), task: text(300).default(""), context: text(300).default(""), format: text(300).default("") }).default({ role: "", task: "", context: "", format: "" }),
      minWordsPerField: z.number().int().min(1).max(50).default(3),
      checklist: z.array(z.object({ id, text: text(300).min(1) })).max(10).default([]),
    }),
    answerKey: z.object({}).default({}),
  },
  try_it: {
    label: "Try It launcher",
    group: "Practice",
    interactive: true,
    content: z.object({
      title: text(200).min(1),
      steps: z.array(text(500).min(1)).min(1).max(20),
      toolName: text(100).min(1),
      toolUrl: url.min(1),
      proof: z.enum(["none", "optional", "required"]).default("none"),
    }),
    answerKey: z.object({}).default({}),
  },
  submission: {
    label: "Reflection / assignment / project",
    group: "Assessment",
    interactive: true,
    content: z.object({
      kind: z.enum(["reflection", "assignment", "project"]),
      prompt: text(3000).min(1),
      accepts: z.array(z.enum(["text", "link", "file", "screenshot"])).min(1),
      rubric: z.array(z.object({ criterion: text(200).min(1), description: text(600).default(""), maxPoints: z.number().int().min(1).max(100) })).max(10).default([]),
    }),
    answerKey: z.object({}).default({}),
  },
  checklist: {
    label: "Checklist",
    group: "Practice",
    interactive: true,
    content: z.object({ title: text(200).default(""), items: z.array(z.object({ id, text: text(300).min(1) })).min(1).max(30) }),
    answerKey: z.object({}).default({}),
  },
  walkthrough: {
    label: "Step-by-step walkthrough",
    group: "Practice",
    interactive: false,
    content: z.object({ steps: z.array(z.object({ title: text(200).min(1), markdown: md.default(""), image: url.default("") })).min(1).max(30) }),
    answerKey: z.object({}).default({}),
  },
} as const;

export type BlockType = keyof typeof BLOCK_TYPES;
export const blockTypeList = Object.keys(BLOCK_TYPES) as BlockType[];
export const isBlockType = (t: string): t is BlockType => t in BLOCK_TYPES;

export const blockSettingsSchema = z.object({
  points: z.number().int().min(0).max(100).default(1),
  required: z.boolean().default(true),
});
export type BlockSettings = z.infer<typeof blockSettingsSchema>;

/** Validates authoring input. Returns parsed data or a readable error. */
export function validateBlock(type: string, content: unknown, answerKey: unknown) {
  if (!isBlockType(type)) return { ok: false as const, error: `Unknown block type "${type}"` };
  const def = BLOCK_TYPES[type];
  const c = def.content.safeParse(content);
  if (!c.success) return { ok: false as const, error: c.error.issues.map((i) => `${i.path.join(".") || "content"}: ${i.message}`).join("; ") };
  const a = def.answerKey.safeParse(answerKey ?? {});
  if (!a.success) return { ok: false as const, error: a.error.issues.map((i) => `answer ${i.path.join(".")}: ${i.message}`).join("; ") };
  const cross = crossCheck(type, c.data as Record<string, unknown>, a.data as Record<string, unknown>);
  if (cross) return { ok: false as const, error: cross };
  return { ok: true as const, content: c.data, answerKey: a.data };
}

/** Rules that span content and answer key (e.g. correct option must exist). */
function crossCheck(type: BlockType, c: Record<string, any>, a: Record<string, any>): string | null {
  if (type === "mcq") {
    const ids = new Set(c.options.map((o: { id: string }) => o.id));
    if (new Set(ids).size !== c.options.length) return "Option ids must be unique";
    if (!a.correct.every((x: string) => ids.has(x))) return "Correct answer must be one of the options";
    if (!c.multiple && a.correct.length !== 1) return "Single-choice questions need exactly one correct option";
  }
  if (type === "fill_blank") {
    const blanks = [...c.text.matchAll(/\[\[(\w+)\]\]/g)].map((m) => m[1]);
    const missing = blanks.filter((b) => !a.blanks[b]);
    if (missing.length) return `Add accepted answers for blank(s): ${missing.join(", ")}`;
  }
  if (type === "sort") {
    const ids = c.items.map((i: { id: string }) => i.id).sort().join();
    if ([...a.order].sort().join() !== ids) return "Correct order must contain every item exactly once";
  }
  if (type === "match") {
    const L = new Set(c.left.map((x: { id: string }) => x.id)), R = new Set(c.right.map((x: { id: string }) => x.id));
    for (const l of L) if (!a.pairs[l as string] || !R.has(a.pairs[l as string])) return "Every left item needs a matching right item";
  }
  return null;
}

/** Learner-facing block shape (answer key removed). */
export type PublicBlock = { id: string; type: BlockType; content: any; settings: BlockSettings };
