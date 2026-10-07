import { describe, expect, it } from "vitest";
import { can, canAnywhere, isSuperAdmin, type Assignment } from "@/lib/permissions";

const a = (permissions: string[], scope: Partial<Assignment> = {}): Assignment => ({ permissions, programId: null, schoolId: null, cohortId: null, eventId: null, ...scope });

describe("permission checks (mirror of app.has_perm)", () => {
  it("super admin can do everything", () => {
    const sa = [a(["*"])];
    expect(can(sa, "content.publish", { programId: "p1" })).toBe(true);
    expect(isSuperAdmin(sa)).toBe(true);
  });
  it("program-scoped role only applies to that program", () => {
    const author = [a(["content.edit"], { programId: "python" })];
    expect(can(author, "content.edit", { programId: "python" })).toBe(true);
    expect(can(author, "content.edit", { programId: "ai-explorer" })).toBe(false);
    expect(can(author, "content.edit")).toBe(false);
    expect(canAnywhere(author, "content.edit")).toBe(true);
  });
  it("author cannot publish", () => {
    expect(can([a(["content.view", "content.edit"], { programId: "p" })], "content.publish", { programId: "p" })).toBe(false);
  });
  it("school-scoped coordinator sees only their school", () => {
    const c = [a(["school.view_learners"], { schoolId: "s1" })];
    expect(can(c, "school.view_learners", { schoolId: "s1" })).toBe(true);
    expect(can(c, "school.view_learners", { schoolId: "s2" })).toBe(false);
  });
  it("program-scoped '*' is not a super admin", () => {
    expect(isSuperAdmin([a(["*"], { programId: "p" })])).toBe(false);
  });
  it("cohort/event scoped roles are not used by program checks", () => {
    expect(can([a(["progress.view"], { cohortId: "c" })], "progress.view", { programId: "p" })).toBe(false);
  });
});
