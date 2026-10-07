import { afterAll, describe, expect, it } from "vitest";
import { asUser, programId, sql, userId } from "./helpers";

afterAll(() => sql.end());

describe("RLS: secrets are never readable by app users", () => {
  it("password/PIN hashes cannot be selected even for your own row", async () => {
    const me = await userId("superadmin@gravitas.test");
    await expect(asUser(me, (tx) => tx`select password_hash from app.users where id = ${me}`)).rejects.toThrow(/permission denied/);
  });
  it("sessions and auth tokens are invisible", async () => {
    const me = await userId("superadmin@gravitas.test");
    await expect(asUser(me, (tx) => tx`select * from app.sessions`)).rejects.toThrow(/permission denied/);
    await expect(asUser(me, (tx) => tx`select * from app.auth_tokens`)).rejects.toThrow(/permission denied/);
  });
});

describe("RLS: program-scoped roles", () => {
  it("author in AI Explorer can see its draft blocks but not Python's", async () => {
    const author = await userId("author@gravitas.test");
    const aiq = await programId("ai-explorer-quest"), py = await programId("python-professional");
    const rows = await asUser(author, (tx) => tx`select distinct program_id from app.lesson_blocks`);
    expect(rows.map((r) => r.programId)).toEqual([aiq]);
    expect(rows.map((r) => r.programId)).not.toContain(py);
  });
  it("author can edit blocks in their program but cannot publish", async () => {
    const author = await userId("author@gravitas.test");
    const [lesson] = await sql`select id from app.lessons where title = 'What is AI?'`;
    await asUser(author, async (tx) => {
      const r = await tx`update app.lessons set title = 'What is AI? (edited)' where id = ${lesson.id} returning id`;
      expect(r.length).toBe(1);
    });
    await expect(
      asUser(author, (tx) => tx`update app.lessons set status = 'draft', published_version_id = null where id = ${lesson.id}`),
    ).rejects.toThrow(/permission to publish/);
  });
  it("author cannot write to Python lessons (row silently invisible)", async () => {
    const author = await userId("author@gravitas.test");
    const [lesson] = await sql`select id from app.lessons where title = 'Hello, Python'`;
    const r = await asUser(author, (tx) => tx`update app.lessons set title = 'hacked' where id = ${lesson.id} returning id`);
    expect(r.length).toBe(0);
  });
  it("reviewer can publish a version in their program", async () => {
    const reviewer = await userId("reviewer@gravitas.test");
    const aiq = await programId("ai-explorer-quest");
    const [lesson] = await sql`select id from app.lessons where title = 'What is AI?'`;
    await asUser(reviewer, async (tx) => {
      await tx`insert into app.lesson_versions (lesson_id, program_id, version_no, snapshot, published_by)
               values (${lesson.id}, ${aiq}, 99, '{"blocks":[]}', ${reviewer})`;
    });
  });
});

describe("RLS: privilege escalation is blocked", () => {
  it("non-super-admin with team.manage cannot grant Super Admin", async () => {
    // Give the program manager team.manage via a custom role (as system), then try to escalate.
    const pm = await userId("pm@gravitas.test");
    await sql`insert into app.roles (key, name) values ('team_lead_test', 'Team lead test') on conflict do nothing`;
    const [role] = await sql`select id from app.roles where key = 'team_lead_test'`;
    await sql`insert into app.role_permissions (role_id, permission_key) values (${role.id}, 'team.manage') on conflict do nothing`;
    await sql`insert into app.role_assignments (user_id, role_id) values (${pm}, ${role.id}) on conflict do nothing`;
    const [sa] = await sql`select id from app.roles where key = 'super_admin'`;
    await expect(asUser(pm, (tx) => tx`insert into app.role_assignments (user_id, role_id) values (${pm}, ${sa.id})`)).rejects.toThrow(/Only a Super Admin/);
    await expect(asUser(pm, (tx) => tx`insert into app.role_permissions (role_id, permission_key) values (${role.id}, '*')`)).rejects.toThrow(/Only a Super Admin/);
    await sql`delete from app.role_assignments where role_id = ${role.id}`;
    await sql`delete from app.roles where id = ${role.id}`;
  });
});

describe("RLS: learners", () => {
  it("school learner cannot read draft blocks or versions (answer keys)", async () => {
    const kid = await userId("aarav.k");
    expect((await asUser(kid, (tx) => tx`select * from app.lesson_blocks`)).length).toBe(0);
    expect((await asUser(kid, (tx) => tx`select * from app.lesson_versions`)).length).toBe(0);
  });
  it("learner_lesson() returns the lesson with answer keys stripped", async () => {
    const kid = await userId("aarav.k");
    const [lesson] = await sql`select id from app.lessons where title = 'What is AI?'`;
    const [r] = await asUser(kid, (tx) => tx`select app.learner_lesson(${lesson.id}) as snap`);
    expect(r.snap.blocks.length).toBeGreaterThan(5);
    expect(JSON.stringify(r.snap)).not.toContain("answer_key");
  });
  it("level 2 lesson is not available until level 1 is passed", async () => {
    const kid = await userId("diya.s");
    const [l2] = await sql`select id from app.levels where name = 'Prompt Ninja'`;
    const unlocked = await asUser(kid, (tx) => tx`select level_id from app.level_unlocks where user_id = ${kid}`);
    expect(unlocked.map((u) => u.levelId)).not.toContain(l2.id);
  });
  it("learner cannot unlock levels for themselves", async () => {
    const kid = await userId("aarav.k");
    const [l2] = await sql`select id, program_id from app.levels where name = 'Prompt Ninja'`;
    await expect(asUser(kid, (tx) => tx`insert into app.level_unlocks (user_id, level_id, program_id, reason) values (${kid}, ${l2.id}, ${l2.programId}, 'override')`)).rejects.toThrow(/row-level security/);
  });
  it("learner sees only their own progress; other learners' rows are hidden", async () => {
    const kid = await userId("aarav.k"), other = await userId("diya.s");
    const rows = await asUser(kid, (tx) => tx`select id from app.users`);
    expect(rows.map((r) => r.id)).not.toContain(other);
  });
  it("adult learner cannot see AI Explorer lessons (not enrolled)", async () => {
    const adult = await userId("learner@gravitas.test");
    const aiq = await programId("ai-explorer-quest");
    expect((await asUser(adult, (tx) => tx`select id from app.lessons where program_id = ${aiq}`)).length).toBe(0);
  });
});

describe("RLS: school coordinator sees only their school", () => {
  it("can see their school's learners but no other users' private data", async () => {
    const coord = await userId("coordinator@gravitas.test");
    const rows = await asUser(coord, (tx) => tx`select sl.username from app.school_learners sl`);
    expect(rows.map((r) => r.username).sort()).toEqual(["aarav.k", "diya.s"]);
    const adults = await asUser(coord, (tx) => tx`select id from app.users where email = 'learner@gravitas.test'`);
    expect(adults.length).toBe(0);
  });
});

describe("Audit log", () => {
  it("records who changed what, with before/after", async () => {
    const author = await userId("author@gravitas.test");
    const [lesson] = await sql`select id from app.lessons where title like 'What is AI?%'`;
    await sql.begin(async (tx) => {
      await tx`select set_config('app.user_id', ${author}, true)`;
      await tx.unsafe("set local role app_user");
      await tx`update app.lessons set summary = 'audit me' where id = ${lesson.id}`;
    });
    const [log] = await sql`select actor_id, before->>'summary' as b, after->>'summary' as a from app.audit_log
                            where table_name = 'lessons' and record_id = ${lesson.id} order by id desc limit 1`;
    expect(log.actorId).toBe(author);
    expect(log.a).toBe("audit me");
    expect(log.b).not.toBe("audit me");
  });
  it("audit log hides password hashes", async () => {
    const [r] = await sql`select count(*)::int as c from app.audit_log where table_name = 'users' and (after ? 'password_hash' or before ? 'password_hash')`;
    expect(r.c).toBe(0);
  });
});
