/**
 * Level unlocking rules (pure, unit-tested).
 *
 * A level is PASSED when:
 *   - it has assessment lessons → all of them completed AND combined score ≥ pass mark %
 *   - otherwise                 → every published lesson in the level is completed
 * Passing level N unlocks level N+1 (sequential programs). Open programs unlock everything on enrollment.
 */
import { percent } from "@/lib/blocks/grade";

export type LessonState = { isAssessment: boolean; completed: boolean; score: number; maxScore: number };

export function levelResult(lessons: LessonState[], passMark: number): { passed: boolean; scorePct: number | null; reason: string } {
  if (!lessons.length) return { passed: false, scorePct: null, reason: "No published lessons yet" };
  const assessments = lessons.filter((l) => l.isAssessment);
  if (assessments.length) {
    if (!assessments.every((a) => a.completed)) return { passed: false, scorePct: null, reason: "Assessment not finished" };
    const score = assessments.reduce((s, a) => s + a.score, 0);
    const max = assessments.reduce((s, a) => s + a.maxScore, 0);
    const pct = percent(score, max);
    return pct >= passMark
      ? { passed: true, scorePct: pct, reason: `Scored ${pct}% (pass mark ${passMark}%)` }
      : { passed: false, scorePct: pct, reason: `Scored ${pct}% — need ${passMark}% to pass` };
  }
  const done = lessons.every((l) => l.completed);
  return { passed: done, scorePct: null, reason: done ? "All lessons completed" : "Lessons remaining" };
}

export function nextLevelId(levels: { id: string; position: number }[], currentLevelId: string): string | null {
  const sorted = [...levels].sort((a, b) => a.position - b.position);
  const i = sorted.findIndex((l) => l.id === currentLevelId);
  return i >= 0 && i + 1 < sorted.length ? sorted[i + 1].id : null;
}

export const effectivePassMark = (levelPassMark: number | null | undefined, programPassMark: number) => levelPassMark ?? programPassMark;
