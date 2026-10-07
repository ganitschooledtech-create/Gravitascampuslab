# Gravitas Campus Platform — Architecture Proposal (v0.1, for approval)

Status: **DRAFT — awaiting founder approval. No application code has been written yet.**

This document covers, in order:

1. Key decisions in plain language
2. Database schema (tables, relationships)
3. Permission model and Row Level Security (RLS)
4. Folder structure
5. Pages / routes per role
6. Phased plan with exit criteria
7. Trade-offs where I need your choice

---

## 1. Key decisions (plain language)

| Decision | What I recommend | Why |
|---|---|---|
| One app or several | **One Next.js app** with the public site, learner area, and admin studio in separate route groups | One codebase and one deploy are cheaper and simpler. The groups stay apart, so the public site stays fast. |
| Where permissions live | **In the database**, checked by Postgres functions that RLS policies call | Even a bug in the UI cannot leak data, because the database itself refuses the request. |
| School learner login (code + username + PIN) | Every learner is a real Supabase Auth user. School learners get a **hidden internal login ID** (e.g. `u_8f3k2@learners.gravitas.internal`) that never receives email. Their PIN is the password. Login goes through **our own server route**, which checks lockout first. | We get Supabase's secure sessions, and RLS works the same way for every user. Children never need an email. The lockout check runs on the server, so it cannot be bypassed. |
| Content blocks storage | Each block is a row with a `type` and a `content` JSON field validated by a schema (Zod) per block type | New block types can be added without changing the database. Validation stops malformed content. |
| Versioning | Lessons are edited as a **draft**. Publishing takes a **snapshot** into `lesson_versions`, and learners always read the published snapshot. | Authors can keep editing without breaking what learners see. Rollback = re-publish an old snapshot. |
| Contest answers / correct answers | Correct answers and hidden test cases are **never sent to the browser**. Grading runs on the server. | Stops cheating through the browser's developer tools. |
| AI | `/lib/ai/` with a `Provider` interface: `MockProvider` (default in dev) and `OpenAIProvider`. Every call goes through one server pipeline: **permission → consent → contest AI-off → limits → PII filter → moderation → model → moderation → log**. | One pipeline means every safety check always runs. Providers can be swapped later. |
| Multi-language | `next-intl` with `/en/...` and `/kn/...` URLs from day one. Content tables get a `translations` JSON per field where needed. | Kannada can be added later without restructuring. |
| Money | Store amounts in **paise (integers)**. Razorpay webhook is the source of truth for "paid". | Avoids rounding errors and fake "paid" signals sent from the browser. |

---

## 2. Database schema

Conventions: every table has `id uuid pk`, `created_at`, `updated_at`; soft-delete (`deleted_at`) where history matters; **RLS enabled on every table**.

### 2.1 Identity & organisation
| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `user_id → auth.users`, `account_type` (school_learner / adult_learner / staff), `first_name`, `last_name`, `display_name`, `phone?`, `locale`, `status` (active/suspended/deleted) | One row per person. |
| `schools` | `name`, `code` (unique, used at login), `city`, `district`, `board?`, `contact_name`, `contact_phone`, `active` | |
| `school_learners` | `user_id`, `school_id`, `username` (unique per school), `class`, `section`, `pin_hash_set_at`, `failed_attempts`, `locked_until` | Extra details for minors only. No email or phone stored. |
| `guardian_consents` | `learner_id`, `guardian_name`, `relationship`, `method` (paper/form/phone), `consent_date`, `participation`, `media`, `ai_use` (booleans), `recorded_by`, `evidence_file?`, `revoked_at?` | Full history kept. The latest row is the one that applies. |
| `login_attempts` | `school_id`, `username`, `ip_hash`, `success`, `at` | Used for PIN lockout and rate limiting. |

### 2.2 Roles & permissions
| Table | Key columns | Notes |
|---|---|---|
| `permissions` | `key` (e.g. `content.edit`, `content.publish`, `blog.publish`, `ai.review_chats`) , `description`, `scope_type` (global/program/school/cohort) | Fixed list, seeded by migration. |
| `roles` | `name`, `description`, `is_system` | System roles + your custom roles. |
| `role_permissions` | `role_id`, `permission_key` | The "tick boxes". |
| `role_assignments` | `user_id`, `role_id`, `program_id?`, `school_id?`, `cohort_id?`, `event_id?` | **Scoping happens here.** Example: Author + program_id = Python. A role with no scope is global. |

### 2.3 Programs & content
| Table | Key columns |
|---|---|
| `programs` | `slug`, `name`, `description`, `audience` (school/adult), `cover_media_id`, `languages[]`, `visibility` (draft/private/public), `pass_mark` (default 50), `unlock_rule` (sequential/free), `prerequisites` jsonb, `ai_settings` jsonb, `certificate_template_id`, `marketing` jsonb (outcomes, FAQ, duration, syllabus overrides), `is_template` |
| `levels` (Track/Level) | `program_id`, `position`, `name`, `slug`, `badge_id?`, `pass_mark?` (overrides program), `unlock_assessment` (event_id or lesson_id) |
| `modules` | `level_id`, `position`, `title` |
| `lessons` | `module_id`, `position`, `title`, `slug`, `status` (draft/in_review/published), `free_navigation` bool, `ai_settings` jsonb, `published_version_id?` |
| `lesson_blocks` | `lesson_id`, `position`, `type`, `content` jsonb, `answer_key` jsonb (**never readable by learners**), `settings` jsonb, `reusable_block_id?` |
| `reusable_blocks` | `program_id?`, `type`, `content`, `answer_key`, `title` — the "block library" |
| `lesson_versions` | `lesson_id`, `version_no`, `snapshot` jsonb, `published_by`, `published_at`, `note` |
| `review_requests` | `entity_type`, `entity_id`, `requested_by`, `reviewer_id?`, `status`, `comments` |
| `cohorts` | `program_id`, `name`, `school_id?`, `trainer_id?`, `start_date`, `end_date`, `schedule` jsonb, `capacity`, `ai_settings` jsonb |
| `cohort_members` | `cohort_id`, `learner_id` |
| `enrollments` | `learner_id`, `program_id`, `cohort_id?`, `level_id?` (null = whole program), `status` (pending_payment/active/completed/cancelled), `source` (self/bulk/admin) |
| `level_unlocks` | `learner_id`, `level_id`, `unlocked_at`, `reason` (passed/override/default), `override_by?`, `override_note?` |

### 2.4 Learning progress
| Table | Key columns |
|---|---|
| `lesson_progress` | `learner_id`, `lesson_id`, `version_id`, `current_block_position`, `status`, `percent`, `completed_at` |
| `block_responses` | `learner_id`, `block_id`, `version_id`, `response` jsonb, `is_correct?`, `score?`, `attempts`, `updated_at` (autosave target) |
| `submissions` | `learner_id`, `block_id` or `round_id`, `kind` (link/file/screenshot/text), `payload`, `status`, `final_score?` |
| `grades` | `submission_id`, `grader_id`, `rubric_scores` jsonb, `total`, `feedback`, `source` (human/ai_suggested), `confirmed_by?` |
| `rubrics` | `program_id`, `name`, `criteria` jsonb (name, max, descriptors) |

### 2.5 Lab sessions & events (Phase 2)
| Table | Key columns |
|---|---|
| `lab_sessions` | `cohort_id` or `event_id`, `school_id`, `trainer_id`, `code` (short, rotating), `opens_at`, `closes_at`, `status` |
| `attendance` | `lab_session_id`, `learner_id`, `status`, `marked_by` |
| `events` | `program_id?`, `level_id?`, `season_id?`, `type` (contest/workshop/hackathon/finale/webinar), `title`, `starts_at`, `ends_at`, `venue`, `in_school_lab` bool, `capacity`, `price_paise`, `registration_form` jsonb, `results_published_at?`, `tie_breakers` jsonb |
| `event_schools` | `event_id`, `school_id` |
| `event_registrations` | `event_id`, `learner_id`, `status`, `form_answers` |
| `seasons` | `program_id`, `name`, `year` |
| `rounds` | `event_id`, `position`, `type` (mcq/prompt/code/project), `duration_sec`, `ai_mode` (off/limited/on), `ai_limit`, `question_count`, `bank_filters` jsonb, `rubric_id?`, `judges_per_submission` (1/2), `requires_session_code` |
| `question_banks` / `questions` | `program_id`, `topic`, `difficulty`, `type`, `stem`, `options` jsonb, `answer_key` jsonb (server-only), `explanation` |
| `attempts` | `round_id`, `learner_id`, `started_at`, `server_deadline`, `extra_seconds`, `status` (active/paused/submitted/auto_submitted/invalidated), `invalidated_reason?`, `question_order` jsonb, `session_token` (one active session) |
| `attempt_answers` | `attempt_id`, `question_id`, `answer`, `is_correct`, `score`, `saved_at` |
| `integrity_events` | `attempt_id`, `kind` (tab_switch/blur/paste/reconnect), `at`, `meta` |
| `judge_assignments` | `submission_id`, `judge_id`, `status` — the judge sees an anonymous code, never a name |
| `results` | `event_id`, `learner_id`, `total`, `rank_overall`, `rank_school`, `tiebreak` jsonb, `qualified` |

### 2.6 AI assistant (Phase 2/4)
| Table | Key columns |
|---|---|
| `ai_settings_versions` | `scope` (global/program/mode), `program_id?`, `mode`, `model`, `temperature`, `max_tokens`, `system_prompt`, `version_no`, `created_by` |
| `ai_conversations` | `learner_id`, `program_id`, `lesson_id?`, `block_id?`, `event_id?`, `round_id?`, `mode`, `started_at` |
| `ai_messages` | `conversation_id`, `role`, `content`, `moderation` jsonb, `blocked_reason?`, `tokens_in`, `tokens_out`, `cost_micro_usd`, `model` |
| `prompt_lab_attempts` | `learner_id`, `block_id` or `round_id`, `role_text`, `task_text`, `context_text`, `format_text`, `completeness` jsonb, `response_message_id`, `attempt_no`, `rubric_scores?` |
| `ai_usage_daily` | `date`, `learner_id`, `program_id`, `school_id`, `event_id`, `messages`, `tokens`, `cost` (rolled-up totals for dashboards and limits) |
| `ai_limits` | `scope` (learner_default/program/event/platform_month), `scope_id?`, `max_messages`, `max_tokens`, `max_cost` |
| `moderation_queue` | `message_id`, `learner_id`, `reason`, `status` (open/dismissed/warned/suspended), `handled_by`, `note` |
| `ai_suspensions` | `learner_id`, `until?`, `reason`, `by` |

### 2.7 Gamification, certificates (Phase 3)
`badges`, `learner_badges`, `xp_ledger` (learner, amount, reason, source_id), `certificate_templates`, `certificates` (`public_code` unique, learner, program/level/event, issued_at, revoked_at, pdf_path).

### 2.8 Public site, blog, business (Phase 3)
`pages` (about, privacy, terms — editable, versioned), `blog_posts` (status draft/in_review/scheduled/published, `publish_at`, SEO fields, `translations`), `blog_categories`, `blog_tags`, `blog_post_tags`, `author_profiles`, `enquiries` (pipeline stage, notes, `follow_up_at`, `assigned_to`), `enquiry_notes`, `products` (program/level/bundle, price, GST rate), `coupons`, `orders`, `order_items`, `payments` (razorpay ids, status, offline receipt no.), `installment_plans`, `invoices` (GST number series, PDF), `gst_settings`.

### 2.9 Platform
`media` (folder, path, mime, size, alt_text, uploaded_by), `media_folders`, `announcements` (+ `announcement_targets`: all/program/cohort/school/class), `feature_flags`, `settings` (branding, retention days), `audit_log` (actor, action, entity, entity_id, before jsonb, after jsonb, ip_hash, at) — written by **database triggers** so nothing can skip it, `data_deletion_requests`.

### 2.10 Relationships at a glance
```
programs ─< levels ─< modules ─< lessons ─< lesson_blocks
    │          │                    └─< lesson_versions
    │          └─< events (contests) ─< rounds ─< attempts ─< attempt_answers
    ├─< cohorts ─< cohort_members >─ profiles
    ├─< enrollments >─ profiles
    └─< role_assignments >─ roles ─< role_permissions
schools ─< school_learners ─ profiles ─< guardian_consents
profiles ─< ai_conversations ─< ai_messages
```

---

## 3. Permission model & RLS

### 3.1 How a check works
One Postgres function answers every question:

```sql
has_perm(perm text, program uuid default null, school uuid default null, cohort uuid default null) returns boolean
```
It returns true if the current user has a role assignment that grants `perm` and the assignment is either **global** or **matches the scope**. Super Admin = a role holding the special `*` permission.

Example policies (simplified):
- `lessons` SELECT for staff: `has_perm('content.view', program_of_lesson(id))`.
- `lessons` SELECT for learners: only when published **and** the learner is enrolled **and** the level is unlocked.
- `lessons` UPDATE: `has_perm('content.edit', …)`. Changing `status` to `published` additionally needs `content.publish`. A trigger enforces this, so an Author cannot publish even through the API.
- `lesson_blocks.answer_key`: learners have **no column access**. Learners read a database view without answer keys, and grading uses server-only functions.
- `school_learners`: School Coordinator sees rows where `has_perm('school.view_learners', school => school_id)`.
- `ai_messages`: learner sees own; Trainer sees learners in cohorts/schools they're assigned to; Super Admin sees all.
- Judges read `submissions` only through a view that hides learner identity.

### 3.2 System roles → permission keys (summary)
| Role | Scope | Main permissions |
|---|---|---|
| Super Admin | global | `*` |
| Program Manager | program | program.manage, cohort.manage, enrollment.manage, event.manage, reports.view |
| Content Author | program | content.view, content.edit, media.upload, review.request |
| Content Reviewer | program | content.view, content.edit, content.publish, content.rollback |
| Blog Writer | global | blog.write |
| Blog Editor | global | blog.write, blog.edit_any, blog.publish |
| Trainer / Volunteer | cohort / school / event | lab.run, attendance.mark, lab.unlock, progress.view, ai.review_chats, grading.assigned |
| Judge | event | grading.blind_assigned |
| School Coordinator | school | school.view_learners, school.view_results, school.print_slips |
| Finance / Front Desk | global | enquiry.manage, enrollment.manage, payment.manage, invoice.manage |
| Learner | self | (implicit — own rows only) |

### 3.3 Where code runs with elevated rights
Only these server-side paths use the Supabase **service key**: the PIN login route, the Razorpay webhook, grading, the AI pipeline's logging, and scheduled jobs. Each one checks permissions explicitly and writes to the audit log.

---

## 4. Folder structure

```
/
├─ app/
│  ├─ [locale]/
│  │  ├─ (public)/            home, programs, events, blog, about, contact, verify, privacy, terms
│  │  ├─ (auth)/              login (adult), school-login, magic-link, reset
│  │  ├─ (learner)/learn/     dashboard, programs/[slug], lesson player, contests, passport, certificates
│  │  └─ (studio)/studio/     admin: programs, content, cohorts, schools, events, grading, blog, ai, finance, settings
│  └─ api/                    ai/chat (streaming), auth/school-login, razorpay/webhook, cron/*
├─ components/
│  ├─ ui/                     buttons, inputs, dialogs (shadcn/ui style)
│  ├─ blocks/                 one folder per block type: Editor.tsx, Player.tsx, schema.ts, grade.ts
│  └─ studio/, learner/, public/
├─ lib/
│  ├─ supabase/               server/browser/admin clients
│  ├─ auth/                   session helpers, PIN login, lockout
│  ├─ permissions/            perm keys, `can()` helper mirroring DB `has_perm`
│  ├─ ai/                     provider interface, openai.ts, mock.ts, pipeline.ts, pii.ts, moderation.ts, limits.ts
│  ├─ content/                versioning, unlock rules, progress
│  ├─ contests/               timers, randomisation, scoring, tie-breakers
│  ├─ payments/               razorpay, invoices, GST
│  └─ validation/             zod schemas
├─ messages/                  en.json, kn.json
├─ supabase/
│  ├─ migrations/             numbered SQL files (schema + RLS)
│  ├─ seed.sql                demo data
│  └─ tests/                  pgTAP tests for RLS
├─ tests/                     unit (Vitest) and e2e (Playwright)
├─ docs/                      this proposal, role guides
├─ .env.example
└─ README.md
```

---

## 5. Pages / routes per role

**Public:** `/`, `/programs`, `/programs/[slug]`, `/events`, `/events/[slug]`, `/blog`, `/blog/[slug]`, `/blog/category/[c]`, `/about`, `/contact`, `/verify/[code]`, `/privacy`, `/terms`, `/sitemap.xml` (all also under `/kn/`).

**Auth:** `/login` (adult), `/school-login` (school code + username + PIN), `/auth/callback`.

**Learner (`/learn`)**: dashboard · `/learn/programs/[slug]` (level map) · `/learn/lessons/[id]` (player) · `/learn/events/[id]` · `/learn/rounds/[id]` (contest player) · `/learn/ai` (Practice Chat) · `/learn/passport` · `/learn/certificates` · `/learn/payments`.

**Studio (`/studio`)**: every menu item is shown only if the user holds the permission.
| Area | Routes | Roles |
|---|---|---|
| Overview | `/studio` (dashboard adapts to role) | all staff |
| Programs | `/studio/programs`, `/[id]/settings`, `/[id]/structure`, `/[id]/lessons/[lid]/edit`, `/[id]/versions` | PM, Author, Reviewer |
| Review queue | `/studio/review` | Reviewer |
| Question banks | `/studio/programs/[id]/questions` | PM, Author |
| Cohorts & schools | `/studio/cohorts`, `/studio/schools`, `/studio/schools/[id]/learners` (bulk CSV, slips, consent) | PM, Coordinator (read) |
| Live lab | `/studio/lab/[sessionId]` | Trainer |
| Events | `/studio/events`, `/[id]/rounds`, `/[id]/monitor`, `/[id]/results` | PM, Super Admin |
| Grading | `/studio/grading` | Judge, Trainer |
| AI | `/studio/ai/settings`, `/studio/ai/chats`, `/studio/ai/moderation`, `/studio/ai/usage` | Super Admin, Trainer (chats) |
| Blog | `/studio/blog`, `/studio/blog/[id]` | Writer, Editor |
| Business | `/studio/enquiries`, `/studio/enrollments`, `/studio/payments`, `/studio/invoices`, `/studio/coupons` | Finance |
| Platform | `/studio/media`, `/studio/announcements`, `/studio/team` (roles), `/studio/audit`, `/studio/settings` (branding, flags, retention, pages) | Super Admin |

---

## 6. Phased plan

Each phase ends with: a demo you can click through, a "how to test as each role" guide, known limitations, and a stop for your review.

**Phase 1 — Core**
1. Project setup: Next.js, Tailwind (your palette + Fredoka/Nunito), Supabase CLI, lint, Vitest, Playwright, `.env.example`, README.
2. Migrations: identity, roles/permissions, programs → blocks, versions, progress, media, audit log + RLS + pgTAP tests.
3. Auth: adult email/password + magic link; school PIN login with lockout.
4. Team & roles screen (custom roles, scoped assignments).
5. Program builder (settings, levels, modules, lessons, clone/template).
6. Block editor (drag-drop reorder, preview) with blocks 1–8, 10, 13, 14.
7. Learner lesson player (step-by-step, progress bar, autosave, unlocking).
8. Review → publish workflow with version history & rollback.
9. Media library. Seed data for Phase 1.

**Phase 2 — Lab delivery & AI**: schools, cohorts, bulk CSV + PDF login slips, consent records, lab sessions & codes, trainer live view (Supabase Realtime), events/rounds, randomised MCQ contests with server timers & integrity logging, judging (blind, double-judge), results & leaderboards, seasons & qualifiers. AI pipeline: Practice Chat, Prompt Lab block, moderation, PII filter, logging, AI-off enforcement, limits, budget, review queue.

**Phase 3 — Public & business**: website & program pages, blog workflow + SEO + sitemap, enquiries pipeline, Razorpay (programs, levels, bundles, coupons, installments, offline payments), GST invoices, certificates + QR verify, XP, badges, passport, transactional email.

**Phase 4 — Advanced**: Tutor Hints, AI-assisted rubric grading, Pyodide & sql.js exercises, Kannada UI, PWA offline caching, full dashboards & CSV exports, performance tuning, full test coverage.

---

## 7. Trade-offs needing your decision
See the "Questions" list in the chat reply (also copied to `docs/02-open-questions.md` once answered).
