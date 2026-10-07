# Phase 1 report: Core

## What was built

### Accounts & security
- **Two login types:**
  - School students: school code + username + 6-digit PIN, with no email or phone needed.
  - Adults and team: email + password, magic link, or password reset.
- **Lockouts and limits:**
  - 5 wrong PINs lock the account for 15 minutes. A trainer or admin can unlock it and issue a new PIN.
  - Passwords lock after 8 failures.
  - Each network has an attempt limit.
- **Granular roles stored in the database:** 10 built-in roles, plus custom roles made by ticking permissions. A role can be limited to one program or one school; for example, the Author is AI-Explorer-only.
- **Database-enforced security (RLS) on every table:**
  - An Author cannot publish, even by calling the server directly.
  - Learners can never read answer keys.
  - Only a Super Admin can grant Super Admin.
- **Full audit log** of every team change (who, what, when, before → after).

### Content
- **Program → Level → Module → Lesson → Blocks**, all created from the Studio with no code. Programs can be cloned and saved as templates.
- **Block editor** with a simple form for each block type:
  - Drag-and-drop reordering, duplicate, a reusable block library, and "Preview as learner".
  - Block types: heading, rich text, callouts, image, video, file, key terms, MCQ/multi-select, fill-in-the-blank, short answer, drag-and-drop sorting, drag-and-drop matching, flashcards, Prompt Builder, Try-It launcher, reflection/assignment/project with rubric, checklist and walkthrough.
- **Workflow:** draft → in review → published, with version history and one-click rollback.
- **Media library** with folders, search and alt text. Uploads are type-checked, max 10 MB.

### Learning
- **Learner dashboard, level map** (locked levels shown with how to unlock them), and a **step-by-step lesson player** that:
  - shows a progress bar and autosaves after every block;
  - blocks skipping ahead unless "free navigation" is on;
  - gives instant feedback with explanations;
  - lets learners retry, but only the first attempt's score counts.
- **Automatic level unlocking:** completing the level test with ≥ pass mark (default 50%) unlocks the next level. Admins can unlock manually per learner.
- **Submissions** (text, link, file, screenshot), graded by staff with the rubric.

### Platform
- Health check, nightly cleanup job, Docker image (AWS-ready), and GitHub Actions CI.
- **Tests:** 59 unit/database tests and 7 browser tests covering permissions, RLS, grading, unlocking, lockout and per-role flows.

## How to test it as each role
Start the app (see README), then:

| Role | Log in as | Try this |
|---|---|---|
| **Super Admin** | `superadmin@gravitas.test` / `Gravitas@2026` | Studio → Programs → create a program → add a module and a lesson → add blocks → **Publish**. Then Schools → add a learner (note the one-time PIN) → open a private window and log in as that student. Team & roles → create a custom role. Audit log → see every change. |
| **Content Author** | `author@gravitas.test` | Only *AI Explorer Quest* is visible. Edit a block in "What is AI?" → **Send for review**. Note there is no Publish button. |
| **Content Reviewer** | `reviewer@gravitas.test` | Review queue → open the lesson → **Publish** (or **Request changes**). Version history → **Roll back**. |
| **Program Manager** | `pm@gravitas.test` | Program → Learners tab → enroll `DEMO01/diya.s`. Submissions → grade a reflection. |
| **School Coordinator** | `coordinator@gravitas.test` | Schools → sees only Gravitas Demo School's learners. |
| **Trainer** | `trainer@gravitas.test` | Schools → sees the school's learners. (The live lab view comes in Phase 2.) |
| **School learner** | `/school-login` → `DEMO01` / `aarav.k` / `482913` | Level map → "What is AI?" → work through 14 steps → "Your first prompt" (level test) → Level 2 *Prompt Ninja* unlocks. Try a wrong PIN 5 times on `diya.s` to see the lockout. |
| **Adult learner** | `learner@gravitas.test` | Python Professional → "Hello, Python". |

## Known limitations (honest list)
1. **Supabase project:** the connector can't see your new "Gravitas campus" organization yet, so migrations haven't been applied there (see "Next steps").
2. **Blocks deferred by plan:**
   - Prompt Lab (needs the AI assistant) comes in Phase 2.
   - Python (Pyodide) and SQL (sql.js) exercises come in Phase 4.
   - The Python lesson has a placeholder note where its exercise will go.
3. **Bulk CSV student import, printable PDF login slips and consent records** are Phase 2. Today, students are added one at a time.
4. **Rich text is Markdown** (bold, lists, links, tables). This keeps pages light on slow school internet. A visual editor can come with the blog editor in Phase 3.
5. **Kannada:** the language structure is in place, with only a few strings translated. Full UI and content translations are Phase 4 (you'll supply translations).
6. **Sample video:** the seeded YouTube link couldn't be verified from the build environment. Replace it with your own video.
7. **"Preview as learner":** uploading to a submission or Try-It block inside preview shows an error, because preview never saves. All other blocks work in preview.
8. **Email** prints to the server log until you add a Resend API key and a verified domain.
9. **Content-Security-Policy header** comes with the Phase 4 hardening pass. The other security headers are already on.

## What comes next
**Before Phase 2:**
1. Re-authorize the Supabase connector to include the "Gravitas campus" organization. I'll then create `gravitas-campus-test` (Mumbai), apply migrations, load demo data and check Supabase's security advisor.
2. Deploy the test project to Vercel so you can click through it on your phone or laptop.

**Phase 2: lab delivery and AI:**
- Cohorts/batches, bulk CSV import with PDF login slips, and parental consent records.
- Trainer live lab view and session codes.
- Events and contests: randomised question banks, server timers, integrity logging, blind judging, results and leaderboards.
- The Gravitas AI Assistant (Practice Chat and Prompt Lab), with moderation, a personal-information filter, contest AI-off enforcement, cost limits and supervision logs.
