import { afterAll, describe, expect, it } from "vitest";
import { loginWithPassword, loginWithPin, createAuthToken, consumeAuthToken, generatePin } from "@/lib/auth/service";
import { getLearnerLesson, submitBlock, createSubmission } from "@/lib/learning/service";
import { db } from "@/lib/db";
import { sql, userId } from "./helpers";

afterAll(async () => { await sql.end(); await db().end(); });

describe("adult login", () => {
  it("accepts the right password and rejects a wrong one with a generic message", async () => {
    expect(await loginWithPassword("Learner@Gravitas.test", "Gravitas@2026", "1.1.1.1")).toMatchObject({ ok: true });
    const bad = await loginWithPassword("learner@gravitas.test", "nope", "1.1.1.1");
    const unknown = await loginWithPassword("nobody@gravitas.test", "nope", "1.1.1.1");
    expect(bad).toEqual(unknown); // no account probing
  });
});

describe("school PIN login & lockout", () => {
  it("logs in with school code + username + PIN (case-insensitive code/username)", async () => {
    const r0 = await loginWithPin("demo01", "Diya.S", "615204", "2.2.2.2");
    expect(r0).toMatchObject({ ok: true });
  });
  it("locks the account after 5 wrong PINs — even the right PIN is then refused", async () => {
    for (let i = 0; i < 5; i++) expect((await loginWithPin("DEMO01", "diya.s", "000000", "3.3.3.3")).ok).toBe(false);
    const r = await loginWithPin("DEMO01", "diya.s", "615204", "3.3.3.3");
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toMatch(/Too many wrong PINs/);
    await sql`update app.users set locked_until = null, failed_login_count = 0 where id = ${await userId("diya.s")}`;
  });
  it("rejects malformed PINs without touching the database", async () => {
    expect((await loginWithPin("DEMO01", "diya.s", "12ab56", "4.4.4.4")).ok).toBe(false);
  });
  it("generated PINs are 6 digits and never trivial", () => {
    for (let i = 0; i < 500; i++) {
      const p = generatePin();
      expect(p).toMatch(/^\d{6}$/);
      expect(p).not.toMatch(/^(\d)\1{5}$|^123456$/);
    }
  });
});

describe("magic link tokens", () => {
  it("are single use", async () => {
    const t = await createAuthToken("learner@gravitas.test", "magic_link", 15);
    expect(t).not.toBeNull();
    expect(await consumeAuthToken(t!.token, "magic_link")).toBe(t!.userId);
    expect(await consumeAuthToken(t!.token, "magic_link")).toBeNull();
  });
  it("are not issued for school learners or unknown emails", async () => {
    expect(await createAuthToken("nobody@gravitas.test", "magic_link", 15)).toBeNull();
  });
});

describe("learning flow: complete Level 1 → Level 2 unlocks", () => {
  it("full journey for a school learner", async () => {
    const kid = await userId("aarav.k");
    const [l1] = await sql`select id from app.lessons where title like 'What is AI?%'`;
    const [l2] = await sql`select id from app.lessons where title = 'Your first prompt'`;
    const lesson = await getLearnerLesson(kid, l1.id);
    expect(lesson).not.toBeNull();
    expect(JSON.stringify(lesson)).not.toContain("answer_key");

    // Cannot skip ahead
    await expect(submitBlock(kid, l1.id, lesson!.blocks[3].id, { viewed: true })).rejects.toThrow(/earlier steps/);

    // Answer everything in lesson 1 using the (server-side) answer keys
    const keys = await sql`select id, type, answer_key from app.lesson_blocks where lesson_id = ${l1.id}`;
    const key = (id: string) => keys.find((k) => k.id === id)!.answerKey;
    for (const b of lesson!.blocks) {
      const k = key(b.id);
      const resp =
        b.type === "mcq" ? { selected: k.correct } :
        b.type === "fill_blank" ? { answers: Object.fromEntries(Object.entries(k.blanks).map(([n, v]: any) => [n, v[0]])) } :
        b.type === "sort" ? { order: k.order } :
        b.type === "match" ? { pairs: k.pairs } : { viewed: true };
      const r = await submitBlock(kid, l1.id, b.id, resp);
      expect(r.error).toBeUndefined();
    }

    // Lesson 2 (assessment): wrong final MCQ → 0/2 for it, but other blocks give points
    const lesson2 = await getLearnerLesson(kid, l2.id);
    let last: Awaited<ReturnType<typeof submitBlock>> | undefined;
    for (const b of lesson2!.blocks) {
      let resp: any = { viewed: true };
      if (b.type === "short_answer") resp = { text: "prompt" };
      if (b.type === "prompt_builder") resp = { role: "You are a teacher", task: "Make five quiz questions", context: "I am in class nine", format: "Numbered list with answers", checked: ["c1", "c2"] };
      if (b.type === "try_it") resp = { done: true };
      if (b.type === "checklist") resp = { checked: ["k1", "k2", "k3"] };
      if (b.type === "mcq") resp = { selected: ["d"] };
      if (b.type === "submission") await createSubmission(kid, l2.id, b.id, { kind: "text", bodyText: "AI can help me revise; I must check facts." });
      last = await submitBlock(kid, l2.id, b.id, resp);
      expect(last.error).toBeUndefined();
    }
    expect(last!.lessonCompleted).toBe(true);
    expect(last!.levelUnlocked).toBeTruthy();
    const [ninja] = await sql`select id from app.levels where name = 'Prompt Ninja'`;
    expect(last!.levelUnlocked).toBe(ninja.id);
  });

  it("retrying a question cannot raise the first score", async () => {
    const kid = await userId("diya.s");
    const [l1] = await sql`select id from app.lessons where title like 'What is AI?%'`;
    const lesson = await getLearnerLesson(kid, l1.id);
    for (const b of lesson!.blocks) {
      if (b.type === "mcq") {
        await submitBlock(kid, l1.id, b.id, { selected: ["a"] }); // wrong first
        const [k] = await sql`select answer_key from app.lesson_blocks where id = ${b.id}`;
        await submitBlock(kid, l1.id, b.id, { selected: k.answerKey.correct }); // right second
        const [resp] = await sql`select score::float, attempts from app.block_responses where user_id = ${kid} and block_id = ${b.id}`;
        expect(resp.score).toBe(0);
        expect(resp.attempts).toBe(2);
        break;
      }
      await submitBlock(kid, l1.id, b.id, { viewed: true });
    }
  });

  it("a learner not enrolled cannot submit", async () => {
    const adult = await userId("learner@gravitas.test");
    const [l1] = await sql`select id from app.lessons where title like 'What is AI?%'`;
    await expect(submitBlock(adult, l1.id, "00000000-0000-4000-8000-000000000000", {})).rejects.toThrow(/access/);
  });
});
