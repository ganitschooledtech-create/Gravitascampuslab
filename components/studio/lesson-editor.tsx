"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { BLOCK_TYPES, type BlockType } from "@/lib/blocks/registry";
import { EDITOR_SPECS, toModel } from "@/lib/blocks/editor-spec";
import { FieldsEditor } from "./fields-editor";
import * as A from "@/app/studio/programs/[id]/lessons/[lessonId]/actions";

export type EditorBlock = { id: string; type: BlockType; content: any; answerKey: any; settings: { points?: number; required?: boolean } };
export type EditorProps = {
  programId: string;
  lesson: { id: string; title: string; summary: string; status: string; freeNavigation: boolean; isAssessment: boolean; estimatedMinutes: number | null; hasUnpublishedChanges: boolean };
  blocks: EditorBlock[];
  versions: { id: string; versionNo: number; publishedAt: string; note: string | null; publisher: string | null; live: boolean }[];
  openReview: { note: string | null; by: string | null } | null;
  lastDecision: { decision: string; note: string | null } | null;
  library: { id: string; title: string; type: string }[];
  canEdit: boolean;
  canPublish: boolean;
};

type Msg = { ok: boolean; error?: string; message?: string; id?: string } | null;

export function LessonEditor(p: EditorProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [order, setOrder] = useState(p.blocks.map((b) => b.id));
  const [open, setOpen] = useState<string | null>(null);
  const [addType, setAddType] = useState<BlockType>("rich_text");
  const [note, setNote] = useState("");
  const byId = Object.fromEntries(p.blocks.map((b) => [b.id, b]));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  // Keep local order in sync after server refreshes (add/delete/duplicate).
  const serverIds = p.blocks.map((b) => b.id).join();
  const [lastServer, setLastServer] = useState(serverIds);
  if (serverIds !== lastServer) { setLastServer(serverIds); setOrder(p.blocks.map((b) => b.id)); }

  const act = (fn: () => Promise<Msg>, after?: (r: NonNullable<Msg>) => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r?.ok) { after?.(r); router.refresh(); }
    });

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const next = arrayMove(order, order.indexOf(String(e.active.id)), order.indexOf(String(e.over.id)));
    setOrder(next);
    act(() => A.reorderBlocksAction(p.programId, p.lesson.id, next));
  };
  const move = (i: number, d: number) => {
    const next = arrayMove(order, i, i + d);
    setOrder(next);
    act(() => A.reorderBlocksAction(p.programId, p.lesson.id, next));
  };

  const groups = Object.entries(BLOCK_TYPES).reduce<Record<string, [string, string][]>>((g, [k, v]) => ((g[v.group] ??= []).push([k, v.label]), g), {});

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Link href={`/studio/programs/${p.programId}`} className="text-sm">← Program structure</Link>
            <h1 className="text-2xl">{p.lesson.title}</h1>
          </div>
          <Link href={`/studio/programs/${p.programId}/lessons/${p.lesson.id}/preview`} className="btn-ghost no-underline" target="_blank">👁 Preview as learner</Link>
        </div>
        {msg && <p role={msg.ok ? "status" : "alert"} className={clsx("rounded-xl p-3 text-sm font-semibold", msg.ok ? "bg-green-50 text-ok" : "bg-red-50 text-bad")}>{msg.ok ? msg.message : msg.error}</p>}
        {p.lastDecision?.decision === "changes_requested" && p.lesson.status !== "in_review" && (
          <p className="rounded-xl bg-sun/15 p-3 text-sm"><b>Reviewer asked for changes:</b> {p.lastDecision.note}</p>
        )}

        <LessonSettings p={p} disabled={!p.canEdit || pending} onSave={(d) => act(() => A.saveLessonSettingsAction(p.programId, p.lesson.id, d))} />

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <ol className="space-y-2" aria-label="Blocks">
              {order.map((id, i) => byId[id] && (
                <BlockRow key={id} block={byId[id]} index={i} count={order.length} isOpen={open === id} canEdit={p.canEdit} busy={pending}
                  onToggle={() => setOpen(open === id ? null : id)} onMove={(d) => move(i, d)}
                  onSave={(model, settings) => act(() => A.saveBlockAction(p.programId, p.lesson.id, id, byId[id].type, model, settings))}
                  onDelete={() => act(() => A.deleteBlockAction(p.programId, p.lesson.id, id))}
                  onDuplicate={() => act(() => A.duplicateBlockAction(p.programId, p.lesson.id, id))}
                  onLibrary={(title) => act(() => A.saveToLibraryAction(p.programId, p.lesson.id, id, title))} />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
        {order.length === 0 && <p className="card text-muted">No blocks yet. Add your first block below.</p>}

        {p.canEdit && (
          <div className="card flex flex-wrap items-end gap-2">
            <div className="flex-1"><label className="label" htmlFor="addType">Add a block</label>
              <select id="addType" className="input" value={addType} onChange={(e) => setAddType(e.target.value as BlockType)}>
                {Object.entries(groups).map(([g, items]) => <optgroup key={g} label={g}>{items.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>)}
              </select></div>
            <button className="btn-primary" disabled={pending} onClick={() => act(() => A.addBlockAction(p.programId, p.lesson.id, addType, order.length), (r) => r.id && setOpen(r.id))}>+ Add block</button>
            {p.library.length > 0 && (
              <div className="flex-1"><label className="label" htmlFor="lib">…or insert from block library</label>
                <select id="lib" className="input" defaultValue="" onChange={(e) => e.target.value && act(() => A.insertFromLibraryAction(p.programId, p.lesson.id, e.target.value))}>
                  <option value="">Choose a saved block…</option>{p.library.map((l) => <option key={l.id} value={l.id}>{l.title} ({l.type})</option>)}
                </select></div>
            )}
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <section className="card space-y-3">
          <h2 className="text-lg">Workflow</h2>
          <p className="text-sm">Status: <b>{p.lesson.status.replace("_", " ")}</b>{p.lesson.hasUnpublishedChanges && p.lesson.status === "published" && " · has unpublished edits"}</p>
          {p.openReview && <p className="rounded-lg bg-cream p-2 text-sm">Review requested by {p.openReview.by ?? "an author"}{p.openReview.note && `: “${p.openReview.note}”`}</p>}
          <label className="label" htmlFor="note">Note (optional)</label>
          <textarea id="note" className="input min-h-16 text-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed? / feedback for the author" />
          <div className="flex flex-wrap gap-2">
            {p.canEdit && p.lesson.status !== "in_review" && <button className="btn-ghost btn-sm" disabled={pending} onClick={() => act(() => A.submitForReviewAction(p.programId, p.lesson.id, note), () => setNote(""))}>Send for review</button>}
            {p.canPublish && <button className="btn-accent btn-sm" disabled={pending} onClick={() => act(() => A.publishAction(p.programId, p.lesson.id, note), () => setNote(""))}>Publish</button>}
            {p.canPublish && p.lesson.status === "in_review" && <button className="btn-ghost btn-sm" disabled={pending} onClick={() => act(() => A.requestChangesAction(p.programId, p.lesson.id, note), () => setNote(""))}>Request changes</button>}
          </div>
          {!p.canPublish && <p className="text-xs text-muted">Authors can’t publish. A Reviewer will check and publish your lesson.</p>}
        </section>
        <section className="card">
          <h2 className="mb-2 text-lg">Version history</h2>
          {p.versions.length === 0 ? <p className="text-sm text-muted">Not published yet.</p> : (
            <ol className="space-y-2 text-sm">
              {p.versions.map((v) => (
                <li key={v.id} className="flex items-start justify-between gap-2 border-b border-line pb-2">
                  <span><b>v{v.versionNo}</b>{v.live && <span className="badge ml-1 bg-green-100 text-ok">live</span>}<br />
                    <span className="text-xs text-muted">{new Date(v.publishedAt).toLocaleString("en-IN")} · {v.publisher ?? "—"}</span>
                    {v.note && <span className="block text-xs">{v.note}</span>}</span>
                  {p.canPublish && !v.live && <button className="btn-ghost btn-sm" disabled={pending} onClick={() => confirm(`Make version ${v.versionNo} live again? Your current draft will be replaced by it.`) && act(() => A.rollbackAction(p.programId, p.lesson.id, v.id))}>Roll back</button>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </div>
  );
}

function LessonSettings({ p, disabled, onSave }: { p: EditorProps; disabled: boolean; onSave: (d: unknown) => void }) {
  const [s, setS] = useState({ title: p.lesson.title, summary: p.lesson.summary, free_navigation: p.lesson.freeNavigation, is_assessment: p.lesson.isAssessment, estimated_minutes: p.lesson.estimatedMinutes });
  return (
    <details className="card">
      <summary className="cursor-pointer font-heading text-lg">Lesson settings</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="ls-title">Title</label><input id="ls-title" className="input" value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} /></div>
        <div><label className="label" htmlFor="ls-min">Estimated minutes</label><input id="ls-min" type="number" className="input" value={s.estimated_minutes ?? ""} onChange={(e) => setS({ ...s, estimated_minutes: e.target.value ? Number(e.target.value) : null })} /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="ls-sum">Summary</label><textarea id="ls-sum" className="input" value={s.summary} onChange={(e) => setS({ ...s, summary: e.target.value })} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.free_navigation} onChange={(e) => setS({ ...s, free_navigation: e.target.checked })} /> Free navigation (learners may skip ahead)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.is_assessment} onChange={(e) => setS({ ...s, is_assessment: e.target.checked })} /> Level test (score decides if the next level unlocks)</label>
      </div>
      <button className="btn-primary btn-sm mt-3" disabled={disabled} onClick={() => onSave(s)}>Save settings</button>
    </details>
  );
}

function BlockRow(props: {
  block: EditorBlock; index: number; count: number; isOpen: boolean; canEdit: boolean; busy: boolean;
  onToggle: () => void; onMove: (d: number) => void; onSave: (model: unknown, settings: unknown) => void;
  onDelete: () => void; onDuplicate: () => void; onLibrary: (title: string) => void;
}) {
  const { block: b, index, count, isOpen, canEdit, busy } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: b.id, disabled: !canEdit });
  const spec = EDITOR_SPECS[b.type];
  const [model, setModel] = useState(() => toModel(b.type, b.content, b.answerKey));
  const [settings, setSettings] = useState({ points: b.settings?.points ?? 1, required: b.settings?.required ?? true });
  const def = BLOCK_TYPES[b.type];
  const summary = String(b.content?.text ?? b.content?.question ?? b.content?.title ?? b.content?.prompt ?? b.content?.instructions ?? b.content?.markdown ?? "").slice(0, 80);
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={clsx("rounded-2xl border bg-white", isDragging ? "z-10 border-electric shadow-lg" : "border-line")}>
      <div className="flex items-center gap-2 p-3">
        {canEdit && <button type="button" {...attributes} {...listeners} className="cursor-grab touch-none text-xl text-muted" aria-label={`Drag block ${index + 1}`}>⠿</button>}
        <span className="badge bg-cream text-ink">{index + 1}</span>
        <button type="button" onClick={props.onToggle} className="flex-1 text-left" aria-expanded={isOpen}>
          <span className="font-bold">{def.label}</span> <span className="text-sm text-muted">{summary}</span>
        </button>
        {canEdit && <span className="flex gap-1">
          <button type="button" className="btn-ghost btn-sm" aria-label="Move block up" disabled={index === 0 || busy} onClick={() => props.onMove(-1)}>↑</button>
          <button type="button" className="btn-ghost btn-sm" aria-label="Move block down" disabled={index === count - 1 || busy} onClick={() => props.onMove(1)}>↓</button>
        </span>}
      </div>
      {isOpen && (
        <div className="border-t border-line p-4">
          <fieldset disabled={!canEdit}>
            <FieldsEditor fields={spec.fields} value={model} onChange={setModel} idPrefix={b.id} />
            {def.interactive && (
              <div className="mt-3 flex flex-wrap gap-4 rounded-xl bg-cream p-3 text-sm">
                <label className="flex items-center gap-2">Points <input type="number" min={0} max={100} className="input w-20 py-1" value={settings.points} onChange={(e) => setSettings({ ...settings, points: Number(e.target.value) })} /></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={settings.required} onChange={(e) => setSettings({ ...settings, required: e.target.checked })} /> Required to finish the lesson</label>
              </div>
            )}
          </fieldset>
          {canEdit && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-primary btn-sm" disabled={busy} onClick={() => props.onSave(model, settings)}>Save block</button>
              <button className="btn-ghost btn-sm" disabled={busy} onClick={props.onDuplicate}>Duplicate</button>
              <button className="btn-ghost btn-sm" disabled={busy} onClick={() => { const t = prompt("Name for the block library:", def.label); if (t) props.onLibrary(t); }}>Save to library</button>
              <button className="btn-ghost btn-sm text-bad" disabled={busy} onClick={() => confirm("Delete this block?") && props.onDelete()}>Delete</button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
