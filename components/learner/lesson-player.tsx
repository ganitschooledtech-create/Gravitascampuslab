"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { PLAYERS, type Reveal } from "@/components/blocks/players";
import { Markdown } from "@/components/blocks/markdown";
import { ProgressBar } from "@/components/ui/progress";
import { submitBlockAction } from "@/app/learn/lessons/[id]/actions";
import type { LearnerLesson } from "@/lib/learning/service";

const INTERACTIVE = new Set(["mcq", "fill_blank", "short_answer", "sort", "match", "prompt_builder", "try_it", "checklist", "submission"]);
const QUESTIONS = new Set(["mcq", "fill_blank", "sort", "match", "short_answer"]);

type Result = { feedback: string; explanation?: string; reveal?: Reveal; isCorrect: boolean | null; error?: string };

/**
 * Step-by-step lesson player: one block at a time, progress bar, autosave after every block.
 * Skipping ahead is blocked here AND on the server, unless the lesson allows free navigation.
 */
export function LessonPlayer({ lesson }: { lesson: LearnerLesson }) {
  const blocks = lesson.blocks;
  const [completed, setCompleted] = useState<Set<string>>(new Set(lesson.progress?.completedBlockIds ?? []));
  const firstOpen = blocks.findIndex((b) => !completed.has(b.id));
  const [idx, setIdx] = useState(firstOpen < 0 ? 0 : firstOpen);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [saved, setSaved] = useState<Record<string, unknown>>(Object.fromEntries(Object.entries(lesson.responses).map(([k, v]) => [k, v.response])));
  const [error, setError] = useState<string>();
  const [finished, setFinished] = useState<{ levelMessage?: string } | null>(firstOpen < 0 && blocks.length > 0 ? {} : null);
  const [pending, start] = useTransition();
  const headingRef = useRef<HTMLDivElement>(null);
  const doneMessage = useRef<string | undefined>(undefined);

  const block = blocks[idx];
  const frontier = (() => { const i = blocks.findIndex((b) => !completed.has(b.id)); return i < 0 ? blocks.length : i; })();
  const canVisit = (i: number) => lesson.freeNavigation || i <= frontier;
  const isDone = block ? completed.has(block.id) : false;
  const interactive = block ? INTERACTIVE.has(block.type) : false;

  useEffect(() => { headingRef.current?.focus(); }, [idx]);

  function send(response: unknown, advance: boolean) {
    if (!block) return;
    setError(undefined);
    start(async () => {
      const r = await submitBlockAction(lesson.id, block.id, response);
      if (!r.ok) { setError(r.error); return; }
      const o = r.outcome;
      if (o.error) { setResults((s) => ({ ...s, [block.id]: { feedback: o.feedback, isCorrect: null, error: o.error } })); return; }
      setSaved((s) => ({ ...s, [block.id]: response }));
      setCompleted((s) => new Set(s).add(block.id));
      if (interactive) setResults((s) => ({ ...s, [block.id]: { feedback: o.feedback, explanation: o.explanation, reveal: o.reveal as Reveal, isCorrect: o.isCorrect } }));
      if (o.lessonCompleted) doneMessage.current = o.levelMessage ?? doneMessage.current;
      if (advance) {
        if (idx < blocks.length - 1) setIdx((i) => i + 1);
        else if (o.lessonCompleted) setFinished({ levelMessage: doneMessage.current });
      }
    });
  }

  function next() {
    if (!block) return;
    if (!interactive && !isDone) return send({ viewed: true }, true);
    if (idx === blocks.length - 1) {
      if (blocks.every((b) => completed.has(b.id))) setFinished({ levelMessage: doneMessage.current });
      return;
    }
    setIdx(idx + 1);
  }

  if (finished) {
    return (
      <div className="card mx-auto max-w-xl text-center">
        <p className="text-6xl" aria-hidden>🎉</p>
        <h1 className="mt-2 text-3xl text-indigo-brand">Lesson complete!</h1>
        <p className="mt-2 text-muted">{lesson.title}</p>
        {finished.levelMessage && <p className="mt-4 rounded-xl bg-sun/15 p-3 font-bold text-indigo-brand">{finished.levelMessage}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href={`/learn/programs/${lesson.programSlug}`} className="btn-accent no-underline">Back to level map</Link>
          <button type="button" className="btn-ghost" onClick={() => { setFinished(null); setIdx(0); }}>Review this lesson</button>
        </div>
      </div>
    );
  }
  if (!block) return <div className="card">This lesson has no content yet.</div>;

  const Player = PLAYERS[block.type];
  const result = results[block.id];
  const pct = (completed.size / blocks.length) * 100;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-muted">
          <Link href={`/learn/programs/${lesson.programSlug}`}>{lesson.programName}</Link> · {lesson.levelName}
        </p>
        <h1 className="text-2xl text-indigo-brand">{lesson.title}</h1>
        <ProgressBar value={pct} label="Lesson progress" />
        <p className="text-xs text-muted">Step {idx + 1} of {blocks.length} · {completed.size} done · saved automatically</p>
      </div>

      <nav aria-label="Lesson steps" className="flex flex-wrap gap-1">
        {blocks.map((b, i) => (
          <button key={b.id} type="button" disabled={!canVisit(i)} onClick={() => setIdx(i)}
            aria-label={`Step ${i + 1}${completed.has(b.id) ? " (done)" : ""}`} aria-current={i === idx ? "step" : undefined}
            className={clsx("h-3 w-6 rounded-full transition", i === idx ? "bg-electric" : completed.has(b.id) ? "bg-sun" : "bg-line", !canVisit(i) && "cursor-not-allowed opacity-50")} />
        ))}
      </nav>

      <section className="card min-h-64" aria-live="polite">
        <div ref={headingRef} tabIndex={-1} className="outline-none">
          {Player ? (
            <Player key={block.id} block={block} lessonId={lesson.id} saved={saved[block.id]} busy={pending}
              locked={isDone && !QUESTIONS.has(block.type)} reveal={result?.reveal} submit={(r) => send(r, false)} />
          ) : (
            <p className="text-muted">This step can&apos;t be shown.</p>
          )}
        </div>
        {result && (
          <div role="status" className={clsx("mt-4 rounded-xl p-3", result.error ? "bg-red-50 text-bad" : result.isCorrect === false ? "bg-sun/15" : "bg-green-50")}>
            <p className="font-bold">{result.feedback}</p>
            {result.explanation && !result.error && <div className="mt-1 text-sm"><Markdown>{result.explanation}</Markdown></div>}
            {result.isCorrect === false && <p className="mt-1 text-xs text-muted">You can try again to learn — your first attempt is the one that counts.</p>}
          </div>
        )}
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 font-semibold text-bad">{error} <button type="button" className="underline" onClick={() => setError(undefined)}>Dismiss</button></p>}
      </section>

      <div className="flex items-center justify-between gap-2">
        <button type="button" className="btn-ghost" disabled={idx === 0 || pending} onClick={() => setIdx(idx - 1)}>← Back</button>
        {(!interactive || isDone || lesson.freeNavigation) && (
          <button type="button" className="btn-accent" disabled={pending} onClick={next}>
            {pending ? "Saving…" : idx === blocks.length - 1 && (isDone || !interactive) ? "Finish ✓" : "Next →"}
          </button>
        )}
      </div>
    </div>
  );
}
