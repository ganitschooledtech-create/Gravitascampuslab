/**
 * Permission checks in TypeScript — an exact mirror of the database function app.has_perm().
 * Used to show/hide menus and to fail fast in server actions. The DATABASE remains the
 * real gatekeeper (RLS), so a mistake here can hide a button but never leak data.
 */
export type Assignment = {
  permissions: string[];
  programId: string | null;
  schoolId: string | null;
  cohortId: string | null;
  eventId: string | null;
};

export type Scope = { programId?: string | null; schoolId?: string | null };

const grants = (a: Assignment, perm: string) => a.permissions.includes("*") || a.permissions.includes(perm);

/** Same rule as SQL: an assignment scoped to program X only counts when checking program X. */
export function can(assignments: Assignment[], perm: string, scope: Scope = {}): boolean {
  return assignments.some(
    (a) =>
      grants(a, perm) &&
      a.cohortId === null &&
      a.eventId === null &&
      (a.programId === null || a.programId === (scope.programId ?? null)) &&
      (a.schoolId === null || a.schoolId === (scope.schoolId ?? null)),
  );
}

/** True if the permission is held in ANY scope (e.g. to show the "Programs" menu at all). */
export function canAnywhere(assignments: Assignment[], perm: string): boolean {
  return assignments.some((a) => grants(a, perm));
}

export function isSuperAdmin(assignments: Assignment[]): boolean {
  return assignments.some(
    (a) => a.permissions.includes("*") && !a.programId && !a.schoolId && !a.cohortId && !a.eventId,
  );
}

/** Program ids where a permission is held (null in the list = all programs). */
export function programsWith(assignments: Assignment[], perm: string): (string | null)[] {
  return assignments.filter((a) => grants(a, perm) && !a.cohortId && !a.eventId && !a.schoolId).map((a) => a.programId);
}

export const isStaff = (assignments: Assignment[]) => assignments.length > 0;
