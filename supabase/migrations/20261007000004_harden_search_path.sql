-- 0004 Hardening (from Supabase security advisor): pin search_path on helper/trigger functions
-- so they can't be tricked by objects in other schemas. sessions/auth_tokens/rate_limits/login_attempts
-- intentionally have RLS enabled with NO policies: only the server's privileged code may touch them.
alter function app.uid() set search_path = app, pg_temp;
alter function app.set_updated_at() set search_path = app, pg_temp;
alter function app.fill_module_parent() set search_path = app, pg_temp;
alter function app.fill_lesson_parent() set search_path = app, pg_temp;
alter function app.fill_block_parent() set search_path = app, pg_temp;
