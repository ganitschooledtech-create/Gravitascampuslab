"use client";

/**
 * Learner-side renderers for every block type.
 * Interactive players call `submit(response)`; grading happens on the server.
 */
import { useMemo, useState, useTransition } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { PublicBlock } from "@/lib/blocks/registry";
import { submitWorkAction } from "@/app/learn/lessons/[id]/actions";
import { Markdown } from "./markdown";

export type Reveal = { correct?: string[]; perBlank?: Record<string, boolean>; answers?: Record<string, string>; order?: string[]; pairs?: Record<string, string>; answer?: string } | undefined;
export type PlayerProps = {
  block: PublicBlock;
  lessonId: string;
  saved?: any;
  locked: boolean; // already completed → show saved answer read-only
  reveal?: Reveal;
  busy: boolean;
  submit: (response: unknown) => void;
};

// ── Display blocks ─────────────────────────────────────────────────────────
export function HeadingView({ block }: PlayerProps) {
  const C = block.content;
  return C.level === 3 ? <h3 className="text-xl">{C.text}</h3> : <h2 className="text-2xl text-indigo-brand">{C.text}</h2>;
}

export function RichTextView({ block }: PlayerProps) {
  return <Markdown>{block.content.markdown}</Markdown>;
}

const calloutStyle = {
  tip: ["💡", "border-electric bg-electric/5", "Tip"],
  warning: ["⚠️", "border-sun bg-sun/10", "Warning"],
  remember: ["📌", "border-indigo-brand bg-indigo-brand/5", "Remember this"],
} as const;
export function CalloutView({ block }: PlayerProps) {
  const [icon, cls, fallback] = calloutStyle[block.content.variant as keyof typeof calloutStyle];
  return (
    <aside className={clsx("rounded-2xl border-l-4 p-4", cls)} aria-label={block.content.title || fallback}>
      <p className="font-heading text-lg"><span aria-hidden>{icon} </span>{block.content.title || fallback}</p>
      <Markdown>{block.content.markdown}</Markdown>
    </aside>
  );
}

export function ImageView({ block }: PlayerProps) {
  const C = block.content;
  return (
    <figure>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={C.src} alt={C.alt} loading="lazy" decoding="async" className="mx-auto max-h-[420px] rounded-2xl" />
      {C.caption && <figcaption className="mt-2 text-center text-sm text-muted">{C.caption}</figcaption>}
    </figure>
  );
}

export function embedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}?dnt=1`;
  return null;
}

/** Video loads only when clicked — saves bandwidth on slow school internet. */
export function VideoView({ block }: PlayerProps) {
  const [play, setPlay] = useState(false);
  const src = embedUrl(block.content.url);
  if (!src) return <a href={block.content.url} target="_blank" rel="noopener noreferrer" className="btn-ghost">▶ Watch: {block.content.title}</a>;
  return (
    <div className="aspect-video w-full overflow-hidden rounded-2xl bg-indigo-brand">
      {play ? (
        <iframe src={`${src}&autoplay=1`} title={block.content.title} className="h-full w-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
      ) : (
        <button type="button" onClick={() => setPlay(true)} className="flex h-full w-full flex-col items-center justify-center gap-2 text-white">
          <span aria-hidden className="grid h-16 w-16 place-items-center rounded-full bg-sun text-3xl text-indigo-brand">▶</span>
          <span className="font-heading text-lg">{block.content.title}</span>
          <span className="text-xs text-white/70">Click to load the video</span>
        </button>
      )}
    </div>
  );
}

export function FileView({ block }: PlayerProps) {
  return (
    <a href={block.content.url} download className="card flex items-center gap-3 no-underline hover:border-sun">
      <span aria-hidden className="text-3xl">📄</span>
      <span><span className="block font-bold">{block.content.fileName}</span><span className="text-sm text-muted">{block.content.description}</span></span>
      <span className="ml-auto btn-sm btn-ghost">Download</span>
    </a>
  );
}

export function KeyTermsView({ block }: PlayerProps) {
  return (
    <div>
      <h3 className="mb-2 text-lg">{block.content.title}</h3>
      <table className="data-table rounded-xl bg-white">
        <thead><tr><th scope="col">Term</th><th scope="col">Meaning</th></tr></thead>
        <tbody>
          {block.content.terms.map((t: any, i: number) => (
            <tr key={i}>
              <th scope="row" className="font-bold text-ink">{t.link ? <a href={t.link} target="_blank" rel="noopener noreferrer">{t.term}</a> : t.term}</th>
              <td>{t.definition}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FlashcardsView({ block }: PlayerProps) {
  const cards = block.content.cards as { front: string; back: string }[];
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const c = cards[i];
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? `Answer: ${c.back}. Click to see question.` : `Question: ${c.front}. Click to flip.`}
        className={clsx("grid min-h-44 w-full max-w-md place-items-center rounded-3xl border-2 p-6 text-center font-heading text-xl transition", flipped ? "border-electric bg-electric text-white" : "border-sun bg-white text-indigo-brand")}
      >
        {flipped ? c.back : c.front}
      </button>
      <p className="text-sm text-muted">Card {i + 1} of {cards.length} · tap the card to flip</p>
      <div className="flex gap-2">
        <button type="button" className="btn-ghost btn-sm" disabled={i === 0} onClick={() => { setI(i - 1); setFlipped(false); }}>← Previous card</button>
        <button type="button" className="btn-ghost btn-sm" disabled={i === cards.length - 1} onClick={() => { setI(i + 1); setFlipped(false); }}>Next card →</button>
      </div>
    </div>
  );
}

export function WalkthroughView({ block }: PlayerProps) {
  return (
    <ol className="space-y-3">
      {block.content.steps.map((s: any, i: number) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sun font-bold text-indigo-brand">{i + 1}</span>
          <div><p className="font-bold">{s.title}</p>{s.markdown && <Markdown>{s.markdown}</Markdown>}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {s.image && <img src={s.image} alt="" loading="lazy" className="mt-2 max-h-64 rounded-lg" />}</div>
        </li>
      ))}
    </ol>
  );
}

// ── Questions ──────────────────────────────────────────────────────────────
function CheckButton({ busy, disabled, onClick, label = "Check answer" }: { busy: boolean; disabled?: boolean; onClick: () => void; label?: string }) {
  return <button type="button" className="btn-primary" onClick={onClick} disabled={busy || disabled}>{busy ? "Checking…" : label}</button>;
}

export function McqView({ block, saved, locked, reveal, busy, submit }: PlayerProps) {
  const C = block.content;
  const [sel, setSel] = useState<string[]>(saved?.selected ?? []);
  const toggle = (id: string) => setSel((s) => (C.multiple ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id]));
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 font-heading text-xl">{C.question}{C.multiple && <span className="ml-2 text-sm text-muted">(choose all that apply)</span>}</legend>
      {C.options.map((o: any) => {
        const right = reveal?.correct?.includes(o.id);
        const chosen = sel.includes(o.id);
        return (
          <label key={o.id} className={clsx("flex cursor-pointer items-center gap-3 rounded-xl border-2 bg-white p-3 transition",
            reveal ? (right ? "border-ok bg-green-50" : chosen ? "border-bad bg-red-50" : "border-line") : chosen ? "border-electric" : "border-line hover:border-electric/50")}>
            <input type={C.multiple ? "checkbox" : "radio"} name={block.id} checked={chosen} onChange={() => toggle(o.id)} disabled={locked && !!reveal} className="h-5 w-5 accent-[#3D6BFF]" />
            <span>{o.text}</span>
            {reveal && right && <span className="ml-auto text-ok" aria-label="correct answer">✔</span>}
          </label>
        );
      })}
      {!reveal && <CheckButton busy={busy} disabled={!sel.length} onClick={() => submit({ selected: sel })} />}
    </fieldset>
  );
}

export function FillBlankView({ block, saved, reveal, busy, submit }: PlayerProps) {
  const parts = useMemo(() => (block.content.text as string).split(/(\[\[\w+\]\])/g), [block.content.text]);
  const [ans, setAns] = useState<Record<string, string>>(saved?.answers ?? {});
  return (
    <div className="space-y-4">
      <p className="text-lg leading-loose">
        {parts.map((p, i) => {
          const m = p.match(/^\[\[(\w+)\]\]$/);
          if (!m) return <span key={i}>{p}</span>;
          const k = m[1], ok = reveal?.perBlank?.[k];
          return (
            <span key={i} className="inline-flex flex-col align-middle">
              <input aria-label={`Blank ${k}`} value={ans[k] ?? ""} onChange={(e) => setAns({ ...ans, [k]: e.target.value })} disabled={!!reveal}
                className={clsx("mx-1 w-36 rounded-lg border-b-4 bg-white px-2 py-0.5 text-center", reveal ? (ok ? "border-ok" : "border-bad") : "border-sun")} />
              {reveal && !ok && <span className="text-center text-xs text-ok">{reveal.answers?.[k]}</span>}
            </span>
          );
        })}
      </p>
      {!reveal && <CheckButton busy={busy} onClick={() => submit({ answers: ans })} />}
    </div>
  );
}

export function ShortAnswerView({ block, saved, reveal, locked, busy, submit }: PlayerProps) {
  const [t, setT] = useState<string>(saved?.text ?? "");
  return (
    <div className="space-y-3">
      <label className="block font-heading text-xl" htmlFor={`sa-${block.id}`}>{block.content.question}</label>
      <textarea id={`sa-${block.id}`} className="input min-h-24" value={t} onChange={(e) => setT(e.target.value)} placeholder={block.content.placeholder} disabled={locked} maxLength={5000} />
      {reveal?.answer && <p className="text-sm text-ok">Sample answer: <b>{reveal.answer}</b></p>}
      {!locked && <CheckButton busy={busy} disabled={!t.trim()} onClick={() => submit({ text: t })} label="Submit answer" />}
    </div>
  );
}

function SortableRow({ id, children, index, count, move, disabled }: { id: string; children: React.ReactNode; index: number; count: number; move: (from: number, to: number) => void; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx("flex items-center gap-2 rounded-xl border-2 bg-white p-3", isDragging ? "z-10 border-electric shadow-lg" : "border-line")}>
      <button type="button" {...attributes} {...listeners} className="cursor-grab touch-none px-1 text-xl text-muted" aria-label="Drag to reorder" disabled={disabled}>⠿</button>
      <span className="flex-1">{children}</span>
      <span className="flex gap-1">
        <button type="button" className="btn-ghost btn-sm" aria-label="Move up" disabled={disabled || index === 0} onClick={() => move(index, index - 1)}>↑</button>
        <button type="button" className="btn-ghost btn-sm" aria-label="Move down" disabled={disabled || index === count - 1} onClick={() => move(index, index + 1)}>↓</button>
      </span>
    </li>
  );
}

function useSortableList(initial: string[]) {
  const [order, setOrder] = useState(initial);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) setOrder((o) => arrayMove(o, o.indexOf(String(e.active.id)), o.indexOf(String(e.over!.id))));
  };
  const move = (from: number, to: number) => setOrder((o) => arrayMove(o, from, to));
  return { order, sensors, onDragEnd, move };
}

export function SortView({ block, saved, reveal, busy, submit }: PlayerProps) {
  const items = block.content.items as { id: string; text: string }[];
  const { order, sensors, onDragEnd, move } = useSortableList(saved?.order ?? items.map((i) => i.id));
  const text = (id: string) => items.find((i) => i.id === id)?.text;
  return (
    <div className="space-y-3">
      <p className="font-heading text-xl">{block.content.prompt}</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ol className="space-y-2">
            {order.map((id, i) => (
              <SortableRow key={id} id={id} index={i} count={order.length} move={move} disabled={!!reveal}>
                {text(id)} {reveal && (reveal.order?.[i] === id ? <span className="text-ok">✔</span> : <span className="text-bad">✘</span>)}
              </SortableRow>
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      {reveal?.order && <p className="text-sm text-muted">Correct order: {reveal.order.map(text).join(" → ")}</p>}
      {!reveal && <CheckButton busy={busy} onClick={() => submit({ order })} />}
    </div>
  );
}

/** Matching: the left column is fixed; drag the right column so each row lines up with its match. */
export function MatchView({ block, saved, reveal, busy, submit }: PlayerProps) {
  const left = block.content.left as { id: string; text: string }[];
  const right = block.content.right as { id: string; text: string }[];
  const initial = saved?.pairs ? left.map((l) => saved.pairs[l.id]) : right.map((r) => r.id);
  const { order, sensors, onDragEnd, move } = useSortableList(initial);
  const rtext = (id: string) => right.find((r) => r.id === id)?.text;
  const pairs = Object.fromEntries(left.map((l, i) => [l.id, order[i]]));
  return (
    <div className="space-y-3">
      <p className="font-heading text-xl">{block.content.prompt}</p>
      <p className="text-sm text-muted">Drag the right-hand cards (or use ↑ ↓) so each one sits next to its match.</p>
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
        <ol className="space-y-2">
          {left.map((l) => <li key={l.id} className="flex min-h-[58px] items-center rounded-xl bg-indigo-brand p-3 font-bold text-white">{l.text}</li>)}
        </ol>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <ol className="space-y-2">
              {order.map((id, i) => (
                <SortableRow key={id} id={id} index={i} count={order.length} move={move} disabled={!!reveal}>
                  {rtext(id)} {reveal && (reveal.pairs?.[left[i]?.id] === id ? <span className="text-ok">✔</span> : <span className="text-bad">✘</span>)}
                </SortableRow>
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      </div>
      {!reveal && <CheckButton busy={busy} onClick={() => submit({ pairs })} />}
    </div>
  );
}

// ── Practice ───────────────────────────────────────────────────────────────
const RTCF = [
  ["role", "Role", "Who should the AI act as?"],
  ["task", "Task", "What exactly should it do?"],
  ["context", "Context", "What background does it need?"],
  ["format", "Format", "How should the answer look?"],
] as const;

export function PromptBuilderView({ block, saved, locked, busy, submit }: PlayerProps) {
  const C = block.content;
  const [v, setV] = useState<Record<string, string>>({ role: saved?.role ?? "", task: saved?.task ?? "", context: saved?.context ?? "", format: saved?.format ?? "" });
  const [checked, setChecked] = useState<string[]>(saved?.checked ?? []);
  const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  const combined = RTCF.map(([k, label]) => (v[k].trim() ? `${label}: ${v[k].trim()}` : "")).filter(Boolean).join("\n");
  return (
    <div className="space-y-4">
      <p className="font-heading text-xl">{C.instructions}</p>
      {C.scenario && <p className="rounded-xl bg-cream p-3"><b>Scenario:</b> {C.scenario}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {RTCF.map(([k, label, help]) => {
          const ok = words(v[k]) >= C.minWordsPerField;
          return (
            <div key={k}>
              <label className="label" htmlFor={`${block.id}-${k}`}>{ok ? "✅" : "⬜"} {label} <span className="font-normal text-muted">— {help}</span></label>
              <textarea id={`${block.id}-${k}`} className="input min-h-20" value={v[k]} placeholder={C.hints?.[k] || ""} disabled={locked} maxLength={2000}
                onChange={(e) => setV({ ...v, [k]: e.target.value })} />
            </div>
          );
        })}
      </div>
      {combined && (
        <div>
          <p className="label">Your combined prompt</p>
          <pre className="whitespace-pre-wrap rounded-xl bg-indigo-brand p-3 text-sm text-cream">{combined}</pre>
        </div>
      )}
      {C.checklist?.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="label">Checklist</legend>
          {C.checklist.map((c: any) => (
            <label key={c.id} className="flex items-center gap-2">
              <input type="checkbox" className="h-5 w-5 accent-[#3D6BFF]" checked={checked.includes(c.id)} disabled={locked}
                onChange={(e) => setChecked(e.target.checked ? [...checked, c.id] : checked.filter((x) => x !== c.id))} />
              {c.text}
            </label>
          ))}
        </fieldset>
      )}
      {!locked && <CheckButton busy={busy} onClick={() => submit({ ...v, checked })} label="Check my prompt" />}
    </div>
  );
}

export function ChecklistView({ block, saved, locked, busy, submit }: PlayerProps) {
  const [checked, setChecked] = useState<string[]>(saved?.checked ?? []);
  return (
    <fieldset className="space-y-2">
      {block.content.title && <legend className="mb-2 font-heading text-xl">{block.content.title}</legend>}
      {block.content.items.map((c: any) => (
        <label key={c.id} className="flex items-center gap-3 rounded-xl border border-line bg-white p-3">
          <input type="checkbox" className="h-5 w-5 accent-[#3D6BFF]" checked={checked.includes(c.id)} disabled={locked}
            onChange={(e) => setChecked(e.target.checked ? [...checked, c.id] : checked.filter((x) => x !== c.id))} />
          {c.text}
        </label>
      ))}
      {!locked && <CheckButton busy={busy} onClick={() => submit({ checked })} label="Done" />}
    </fieldset>
  );
}

function UploadOrLink({ lessonId, blockId, kinds, onDone }: { lessonId: string; blockId: string; kinds: string[]; onDone: (info: { url?: string; file?: boolean }) => void }) {
  const [kind, setKind] = useState(kinds[0]);
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const label: Record<string, string> = { text: "✍️ Write", link: "🔗 Link", file: "📎 File", screenshot: "🖼️ Screenshot" };
  return (
    <form
      className="space-y-3"
      action={(fd) => start(async () => {
        fd.set("lessonId", lessonId); fd.set("blockId", blockId); fd.set("kind", kind);
        const r = await submitWorkAction(fd);
        if (!r.ok) setErr(r.error); else { setErr(undefined); onDone({ url: String(fd.get("url") ?? "") || undefined, file: kind === "file" || kind === "screenshot" }); }
      })}
    >
      {kinds.length > 1 && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How do you want to submit?">
          {kinds.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={clsx("btn-sm btn", kind === k ? "bg-electric text-white" : "btn-ghost")}>{label[k]}</button>
          ))}
        </div>
      )}
      {kind === "text" && <textarea name="text" className="input min-h-32" maxLength={10000} aria-label="Your answer" required />}
      {kind === "link" && <input name="url" type="url" className="input" placeholder="https://…" aria-label="Link" required />}
      {(kind === "file" || kind === "screenshot") && (
        <input name="file" type="file" className="input" aria-label="Choose file" required
          accept={kind === "screenshot" ? "image/png,image/jpeg,image/webp" : ".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.docx,.pptx,.xlsx"} />
      )}
      {err && <p role="alert" className="text-sm font-semibold text-bad">{err}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Uploading…" : "Submit"}</button>
    </form>
  );
}

export function TryItView({ block, lessonId, saved, locked, busy, submit }: PlayerProps) {
  const C = block.content;
  const [done, setDone] = useState<boolean>(!!saved?.done);
  const [proofUrl, setProofUrl] = useState<string>(saved?.proofUrl ?? "");
  const [proofFile, setProofFile] = useState<boolean>(!!saved?.proofFileKey);
  return (
    <div className="space-y-4">
      <p className="font-heading text-xl">🚀 {C.title}</p>
      <ol className="list-decimal space-y-1 pl-6">{C.steps.map((s: string, i: number) => <li key={i}>{s}</li>)}</ol>
      <a href={C.toolUrl} target="_blank" rel="noopener noreferrer" className="btn-accent no-underline">Open {C.toolName} ↗</a>
      {C.proof !== "none" && !locked && (
        <details className="rounded-xl border border-line bg-white p-3" open={C.proof === "required"}>
          <summary className="cursor-pointer font-bold">Add proof {C.proof === "optional" && "(optional)"}</summary>
          <div className="mt-3 space-y-3">
            <input type="url" className="input" placeholder="Paste a link (https://…)" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} aria-label="Proof link" />
            <p className="text-sm text-muted">…or upload a screenshot:</p>
            {proofFile ? <p className="text-sm text-ok">✅ Screenshot uploaded</p> :
              <UploadOrLink lessonId={lessonId} blockId={block.id} kinds={["screenshot"]} onDone={() => setProofFile(true)} />}
          </div>
        </details>
      )}
      <label className="flex items-center gap-2 font-bold">
        <input type="checkbox" className="h-5 w-5 accent-[#3D6BFF]" checked={done} disabled={locked} onChange={(e) => setDone(e.target.checked)} /> I did it!
      </label>
      {!locked && <CheckButton busy={busy} disabled={!done} label="Mark as done" onClick={() => submit({ done, proofUrl: proofUrl.trim() || undefined, proofFileKey: proofFile ? "uploaded" : undefined })} />}
    </div>
  );
}

export function SubmissionView({ block, lessonId, locked, busy, submit }: PlayerProps) {
  const C = block.content;
  const [sent, setSent] = useState(locked);
  const title = { reflection: "🪞 Reflection", assignment: "📝 Assignment", project: "🛠️ Project" }[C.kind as string];
  return (
    <div className="space-y-4">
      <p className="text-sm font-bold uppercase tracking-wide text-sun-dark">{title}</p>
      <Markdown>{C.prompt}</Markdown>
      {C.rubric?.length > 0 && (
        <details className="rounded-xl bg-cream p-3">
          <summary className="cursor-pointer font-bold">How this will be marked</summary>
          <ul className="mt-2 list-disc pl-6 text-sm">{C.rubric.map((r: any, i: number) => <li key={i}><b>{r.criterion}</b> ({r.maxPoints} pts){r.description && ` — ${r.description}`}</li>)}</ul>
        </details>
      )}
      {sent ? (
        <p className="rounded-xl bg-green-50 p-3 font-semibold text-ok">✅ Submitted. Your trainer will review it.</p>
      ) : (
        <UploadOrLink lessonId={lessonId} blockId={block.id} kinds={C.accepts} onDone={() => { setSent(true); submit({}); }} />
      )}
      {sent && !locked && <CheckButton busy={busy} onClick={() => submit({})} label="Continue" />}
    </div>
  );
}

export const PLAYERS: Record<string, (p: PlayerProps) => React.ReactNode> = {
  heading: HeadingView, rich_text: RichTextView, callout: CalloutView, image: ImageView, video: VideoView, file: FileView,
  key_terms: KeyTermsView, flashcards: FlashcardsView, walkthrough: WalkthroughView,
  mcq: McqView, fill_blank: FillBlankView, short_answer: ShortAnswerView, sort: SortView, match: MatchView,
  prompt_builder: PromptBuilderView, try_it: TryItView, checklist: ChecklistView, submission: SubmissionView,
};
