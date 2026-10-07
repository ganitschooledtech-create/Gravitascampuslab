# Architecture decisions (plain language)

These update the original proposal (`01-architecture-proposal.md`) where we learned something while building.

## D1. The app talks to plain PostgreSQL, not Supabase-only APIs
**Decision:** All data access goes through `lib/db` using the standard `postgres` driver. We do **not** use Supabase's auto-generated REST API or `supabase-js` for data.
**Why:** You asked for an architecture that can move from Supabase to AWS easily. Supabase is "PostgreSQL + extras"; if we only use the PostgreSQL part, moving means changing one connection string.
**Trade-off:** We write SQL ourselves instead of using Supabase's client helpers. That's slightly more code, but it's clearer and fully portable.

## D2. Security rules (RLS) live in the database, written in standard SQL
Every table has Row Level Security. For each user request the server switches to the restricted role `app_user` and sets `app.user_id`; policies call `app.has_perm(...)`. These are standard PostgreSQL features, so they work identically on AWS RDS. Supabase-specific functions such as `auth.uid()` are not used.

## D3. Our own login system instead of Supabase Auth
**Decision:** Sessions, passwords, school PINs, magic links and password resets are implemented in `lib/auth` and stored in our tables.
**Why:**
1. **Portability:** no user migration is needed when moving to AWS.
2. **School PIN login:** school code + username + 6-digit PIN with lockout is not a Supabase Auth feature. Faking it with hidden emails adds complexity.
3. **Testability:** the whole login flow is covered by automated tests on a plain database.

**Safety measures:** argon2id hashing (OWASP parameters), random 256-bit session tokens stored only as SHA-256 hashes, httpOnly/SameSite cookies, lockout and per-IP rate limits, single-use expiring email tokens, generic error messages (no account probing), and short 8-hour sessions for shared lab computers.
**Later option:** if you ever want Google/Microsoft "Sign in with…", we add an OAuth provider into the same session system.

## D4. Tables live in schema `app`, not `public`
Supabase automatically exposes the `public` schema over its REST API. Keeping our tables in `app` means nothing is reachable except through our server. This is defence in depth.

## D5. Files use the S3 protocol
Supabase Storage supports the S3 protocol, so we use the AWS S3 SDK from day one. Moving later means changing the endpoint and keys only. Learner uploads are private and served only after a permission check. Course media is served by link.

## D6. Answer keys never leave the server
Correct answers live in `answer_key`, which learners can't read (RLS). The database function `app.learner_lesson()` strips them before sending a lesson. Grading runs on the server. Sorting and matching items are shuffled when a lesson is published, so the correct order isn't visible.

## D7. Lessons are versioned snapshots
Publishing freezes the draft into `lesson_versions`, and learners always see the published snapshot. Authors can keep editing safely. Rollback re-publishes an older snapshot and restores it as the draft.

## D8. Case-insensitive identifiers are stored normalised
We first used the `citext` extension. On plain PostgreSQL it needs the extension on the search path, which differs between Supabase and AWS. Emails, usernames and slugs are now stored in **lowercase** and school codes in **UPPERCASE**, enforced by database checks. This works on any PostgreSQL with no extension.

## D9. Rate limiting in PostgreSQL
A small counters table instead of Redis keeps the stack simple. At around 100+ requests/second we can switch `lib/security/rate-limit.ts` to Redis (Upstash or ElastiCache) without touching callers.

## D10. Next.js "Cache Components" mode is off
Nearly every page is personalised (it reads the login cookie), so the new experimental caching mode would add complexity for little gain. We can enable it later for the public website (Phase 3), where caching matters most.
