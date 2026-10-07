-- ════════════════════════════════════════════════════════════════════════════
-- 0001 FOUNDATION
-- Portable PostgreSQL (15+). Runs unchanged on Supabase, AWS RDS/Aurora, or local.
--
-- Security model (plain language):
--   * All application tables live in schema `app` (NOT `public`), so Supabase's
--     auto-generated REST API cannot see them. Only our server talks to the DB.
--   * The server connects with a privileged login, but for every user request it
--     switches to the restricted role `app_user` and sets `app.user_id`.
--     Row Level Security (RLS) policies then decide what that user may see/change.
--   * Privileged server code (login, grading) runs without switching role and is
--     kept to a small, audited set of functions.
-- ════════════════════════════════════════════════════════════════════════════


do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin noinherit;
  end if;
  -- The login role used by the server must be able to `SET ROLE app_user`.
  execute format('grant app_user to %I', current_user);
  if exists (select 1 from pg_roles where rolname = 'postgres') and current_user <> 'postgres' then
    execute 'grant app_user to postgres';
  end if;
end $$;

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to app_user;

-- ── Request context helpers ────────────────────────────────────────────────
-- The server sets these per transaction:  set_config('app.user_id', '<uuid>', true)
create or replace function app.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function app.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ── Users & authentication ─────────────────────────────────────────────────
create table app.users (
  id                 uuid primary key default gen_random_uuid(),
  login_kind         text not null check (login_kind in ('email', 'school_pin')),
  email              text unique check (email = lower(email)),
  password_hash      text,                       -- argon2id; for school learners this is the PIN hash
  first_name         text not null check (length(first_name) between 1 and 80),
  last_name          text not null default '' check (length(last_name) <= 80),
  display_name       text,
  phone              text,
  locale             text not null default 'en' check (locale in ('en', 'kn')),
  status             text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  email_verified_at  timestamptz,
  last_login_at      timestamptz,
  failed_login_count int not null default 0,
  locked_until       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint email_users_have_email check (login_kind <> 'email' or email is not null),
  constraint school_users_have_no_email check (login_kind <> 'school_pin' or email is null)
);
create trigger users_updated before update on app.users for each row execute function app.set_updated_at();

create table app.sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references app.users(id) on delete cascade,
  token_hash    text not null unique,            -- sha256 of the cookie token; raw token never stored
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  ip_hash       text,
  user_agent    text
);
create index sessions_user_idx on app.sessions(user_id);

create table app.auth_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app.users(id) on delete cascade,
  purpose     text not null check (purpose in ('magic_link', 'password_reset', 'email_verify')),
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index auth_tokens_user_idx on app.auth_tokens(user_id);

-- Fixed-window counters used for rate limiting (works without Redis; swap later if needed).
create table app.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (key, window_start)
);

create table app.login_attempts (
  id         bigint generated always as identity primary key,
  identifier text not null,                      -- email, or "<school_code>/<username>"
  success    boolean not null,
  ip_hash    text,
  reason     text,
  at         timestamptz not null default now()
);
create index login_attempts_identifier_idx on app.login_attempts(identifier, at desc);

-- ── Schools & school learners (minors) ────────────────────────────────────
create table app.schools (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  code           text not null unique check (code ~ '^[A-Z0-9-]{3,20}$'),   -- stored UPPERCASE
  city           text,
  district       text,
  board          text,
  contact_name   text,
  contact_phone  text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger schools_updated before update on app.schools for each row execute function app.set_updated_at();

create table app.school_learners (
  user_id     uuid primary key references app.users(id) on delete cascade,
  school_id   uuid not null references app.schools(id) on delete restrict,
  username    text not null check (username ~ '^[a-z0-9._-]{3,32}$'),
  class       text,
  section     text,
  pin_set_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (school_id, username)
);
create index school_learners_school_idx on app.school_learners(school_id);
create trigger school_learners_updated before update on app.school_learners for each row execute function app.set_updated_at();

-- ── Permissions & roles ────────────────────────────────────────────────────
create table app.permissions (
  key          text primary key,
  description  text not null,
  category     text not null,
  scope        text not null check (scope in ('global', 'program', 'school', 'cohort', 'event'))
);

create table app.roles (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique check (key ~ '^[a-z0-9_]{2,40}$'),
  name         text not null,
  description  text,
  is_system    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger roles_updated before update on app.roles for each row execute function app.set_updated_at();

create table app.role_permissions (
  role_id         uuid not null references app.roles(id) on delete cascade,
  permission_key  text not null references app.permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);

-- program/school/cohort/event columns scope a role. All null = global.
-- cohort_id and event_id get their foreign keys in the Phase 2 migration.
create table app.role_assignments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app.users(id) on delete cascade,
  role_id     uuid not null references app.roles(id) on delete cascade,
  program_id  uuid,
  school_id   uuid references app.schools(id) on delete cascade,
  cohort_id   uuid,
  event_id    uuid,
  created_by  uuid references app.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index role_assignments_unique on app.role_assignments
  (user_id, role_id, program_id, school_id, cohort_id, event_id) nulls not distinct;
create index role_assignments_user_idx on app.role_assignments(user_id);

-- ── Permission check functions (used by RLS) ───────────────────────────────
-- SECURITY DEFINER so they can read role tables regardless of the caller's RLS.
-- A scoped assignment (e.g. program = Python) only grants that permission
-- when the check is for that same program.
create or replace function app.has_perm(p text, p_program uuid default null, p_school uuid default null)
returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (
    select 1
    from app.role_assignments ra
    join app.role_permissions rp on rp.role_id = ra.role_id
    join app.users u on u.id = ra.user_id and u.status = 'active'
    where ra.user_id = app.uid()
      and (rp.permission_key = p or rp.permission_key = '*')
      and ra.cohort_id is null and ra.event_id is null
      and (ra.program_id is null or ra.program_id = p_program)
      and (ra.school_id  is null or ra.school_id  = p_school)
  )
$$;

-- True if the user holds the permission in ANY scope (used for menus / shared libraries).
create or replace function app.has_perm_anywhere(p text)
returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (
    select 1
    from app.role_assignments ra
    join app.role_permissions rp on rp.role_id = ra.role_id
    join app.users u on u.id = ra.user_id and u.status = 'active'
    where ra.user_id = app.uid() and (rp.permission_key = p or rp.permission_key = '*')
  )
$$;

create or replace function app.is_super_admin()
returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (
    select 1 from app.role_assignments ra
    join app.role_permissions rp on rp.role_id = ra.role_id
    where ra.user_id = app.uid() and rp.permission_key = '*'
      and ra.program_id is null and ra.school_id is null and ra.cohort_id is null and ra.event_id is null
  )
$$;

-- Prevent privilege escalation: only a Super Admin may grant a role containing '*'
-- or edit system roles' permissions.
-- NOT security definer: current_user must be the caller's role for the app_user check to work.
create or replace function app.guard_role_assignment() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if current_user = 'app_user' and not app.is_super_admin() then
    if exists (select 1 from app.role_permissions where role_id = new.role_id and permission_key = '*') then
      raise exception 'Only a Super Admin can assign the Super Admin role' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger role_assignments_guard before insert or update on app.role_assignments
  for each row execute function app.guard_role_assignment();

-- NOT security definer: current_user must be the caller's role for the app_user check to work.
create or replace function app.guard_role_permissions() returns trigger
language plpgsql set search_path = app, pg_temp as $$
declare r record;
begin
  if current_user = 'app_user' and not app.is_super_admin() then
    raise exception 'Only a Super Admin can change role permissions' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  return r;
end $$;
create trigger role_permissions_guard before insert or update or delete on app.role_permissions
  for each row execute function app.guard_role_permissions();

-- ── Settings, feature flags ────────────────────────────────────────────────
create table app.settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references app.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

create table app.feature_flags (
  key          text primary key,
  enabled      boolean not null default false,
  description  text not null,
  updated_by   uuid references app.users(id) on delete set null,
  updated_at   timestamptz not null default now()
);

-- ── Audit log (written by triggers; nobody can skip it) ────────────────────
create table app.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  action      text not null,               -- INSERT / UPDATE / DELETE or a custom verb (e.g. login, publish)
  table_name  text,
  record_id   text,
  before      jsonb,
  after       jsonb,
  meta        jsonb
);
create index audit_log_at_idx on app.audit_log(at desc);
create index audit_log_record_idx on app.audit_log(table_name, record_id);
create index audit_log_actor_idx on app.audit_log(actor_id, at desc);

create or replace function app.audit_trigger() returns trigger
language plpgsql security definer set search_path = app, pg_temp as $$
declare
  b jsonb; a jsonb; rid text;
begin
  if tg_op in ('UPDATE', 'DELETE') then b := to_jsonb(old) - 'password_hash'; end if;
  if tg_op in ('UPDATE', 'INSERT') then a := to_jsonb(new) - 'password_hash'; end if;
  if tg_op = 'UPDATE' and b = a then return new; end if;
  rid := coalesce(a ->> 'id', b ->> 'id', a ->> 'key', b ->> 'key', a ->> 'user_id', b ->> 'user_id');
  insert into app.audit_log(actor_id, action, table_name, record_id, before, after)
  values (app.uid(), tg_op, tg_table_name, rid, b, a);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- Explicit audit entries from server code (logins, publishes, exports).
create or replace function app.audit(p_action text, p_table text, p_record text, p_meta jsonb default null)
returns void
language sql security definer set search_path = app, pg_temp as $$
  insert into app.audit_log(actor_id, action, table_name, record_id, meta) values (app.uid(), p_action, p_table, p_record, p_meta);
$$;

create trigger audit_users after insert or update or delete on app.users for each row execute function app.audit_trigger();
create trigger audit_schools after insert or update or delete on app.schools for each row execute function app.audit_trigger();
create trigger audit_school_learners after insert or update or delete on app.school_learners for each row execute function app.audit_trigger();
create trigger audit_roles after insert or update or delete on app.roles for each row execute function app.audit_trigger();
create trigger audit_role_permissions after insert or update or delete on app.role_permissions for each row execute function app.audit_trigger();
create trigger audit_role_assignments after insert or update or delete on app.role_assignments for each row execute function app.audit_trigger();
create trigger audit_settings after insert or update or delete on app.settings for each row execute function app.audit_trigger();
create trigger audit_feature_flags after insert or update or delete on app.feature_flags for each row execute function app.audit_trigger();

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table app.users             enable row level security;
alter table app.sessions          enable row level security;
alter table app.auth_tokens       enable row level security;
alter table app.rate_limits       enable row level security;
alter table app.login_attempts    enable row level security;
alter table app.schools           enable row level security;
alter table app.school_learners   enable row level security;
alter table app.permissions       enable row level security;
alter table app.roles             enable row level security;
alter table app.role_permissions  enable row level security;
alter table app.role_assignments  enable row level security;
alter table app.settings          enable row level security;
alter table app.feature_flags     enable row level security;
alter table app.audit_log         enable row level security;
-- sessions, auth_tokens, rate_limits, login_attempts: no grants, no policies → app_user has zero access.

-- users: password_hash is never readable by app_user (column-level grant excludes it).
grant select (id, login_kind, email, first_name, last_name, display_name, phone, locale, status,
              email_verified_at, last_login_at, locked_until, created_at, updated_at) on app.users to app_user;
grant update (first_name, last_name, display_name, phone, locale, status) on app.users to app_user;
create policy users_select on app.users for select to app_user using (
  id = (select app.uid()) or app.has_perm('users.view') or app.has_perm('users.manage')
  or exists (select 1 from app.school_learners sl where sl.user_id = users.id
             and app.has_perm('school.view_learners', null, sl.school_id))
);
create policy users_update_self on app.users for update to app_user
  using (id = (select app.uid())) with check (id = (select app.uid()) and status = 'active');
create policy users_update_admin on app.users for update to app_user
  using (app.has_perm('users.manage')) with check (app.has_perm('users.manage'));

grant select, insert, update on app.schools to app_user;
create policy schools_select on app.schools for select to app_user using (
  app.has_perm('schools.view') or app.has_perm('schools.manage')
  or app.has_perm('school.view_learners', null, id)
  or exists (select 1 from app.school_learners sl where sl.user_id = (select app.uid()) and sl.school_id = schools.id)
);
create policy schools_write on app.schools for all to app_user
  using (app.has_perm('schools.manage')) with check (app.has_perm('schools.manage'));

grant select, insert, update, delete on app.school_learners to app_user;
create policy school_learners_select on app.school_learners for select to app_user using (
  user_id = (select app.uid()) or app.has_perm('users.view')
  or app.has_perm('school.view_learners', null, school_id)
);
create policy school_learners_write on app.school_learners for all to app_user
  using (app.has_perm('learners.manage', null, school_id)) with check (app.has_perm('learners.manage', null, school_id));

grant select on app.permissions to app_user;
create policy permissions_select on app.permissions for select to app_user using (true);

grant select, insert, update, delete on app.roles to app_user;
create policy roles_select on app.roles for select to app_user using (true);
create policy roles_write on app.roles for all to app_user
  using (app.has_perm('team.manage') and not is_system) with check (app.has_perm('team.manage') and not is_system);

grant select, insert, delete on app.role_permissions to app_user;
create policy role_permissions_select on app.role_permissions for select to app_user using (true);
create policy role_permissions_write on app.role_permissions for all to app_user
  using (app.has_perm('team.manage')) with check (app.has_perm('team.manage'));

grant select, insert, update, delete on app.role_assignments to app_user;
create policy role_assignments_select on app.role_assignments for select to app_user using (
  user_id = (select app.uid()) or app.has_perm('team.view') or app.has_perm('team.manage')
);
create policy role_assignments_write on app.role_assignments for all to app_user
  using (app.has_perm('team.manage')) with check (app.has_perm('team.manage'));

grant select, insert, update on app.settings to app_user;
create policy settings_select on app.settings for select to app_user using (true);
create policy settings_write on app.settings for all to app_user
  using (app.has_perm('settings.manage')) with check (app.has_perm('settings.manage'));

grant select, update on app.feature_flags to app_user;
create policy feature_flags_select on app.feature_flags for select to app_user using (true);
create policy feature_flags_write on app.feature_flags for update to app_user
  using (app.has_perm('settings.manage')) with check (app.has_perm('settings.manage'));

grant select on app.audit_log to app_user;
create policy audit_select on app.audit_log for select to app_user using (app.has_perm('audit.view'));

grant execute on function app.uid(), app.has_perm(text, uuid, uuid), app.has_perm_anywhere(text),
  app.is_super_admin(), app.audit(text, text, text, jsonb) to app_user;

-- ── Reference data: permissions & system roles ─────────────────────────────
insert into app.permissions (key, description, category, scope) values
  ('*',                     'Everything (Super Admin)',                              'platform', 'global'),
  ('team.view',             'View team members and roles',                           'team',     'global'),
  ('team.manage',           'Invite team, create roles, assign roles',               'team',     'global'),
  ('users.view',            'View all user accounts',                                'users',    'global'),
  ('users.manage',          'Edit, suspend, reset user accounts',                    'users',    'global'),
  ('settings.manage',       'Branding, feature flags, platform settings',            'platform', 'global'),
  ('audit.view',            'View the audit log',                                    'platform', 'global'),
  ('media.view',            'Browse the media library',                              'media',    'global'),
  ('media.manage',          'Upload and organise media',                             'media',    'global'),
  ('schools.view',          'View all schools',                                      'schools',  'global'),
  ('schools.manage',        'Create and edit schools',                               'schools',  'global'),
  ('program.create',        'Create new programs',                                   'programs', 'global'),
  ('program.manage',        'Edit program settings, structure, cohorts',             'programs', 'program'),
  ('program.delete',        'Archive / delete a program',                            'programs', 'program'),
  ('content.view',          'View draft content in the studio',                      'content',  'program'),
  ('content.edit',          'Create and edit lessons and blocks',                    'content',  'program'),
  ('content.publish',       'Review, publish and roll back content',                 'content',  'program'),
  ('enrollments.view',      'View enrollments',                                      'learners', 'program'),
  ('enrollments.manage',    'Enroll / unenroll learners',                            'learners', 'program'),
  ('progress.view',         'View learner progress and results',                     'learners', 'program'),
  ('progress.override',     'Unlock levels for a learner manually',                  'learners', 'program'),
  ('submissions.grade',     'Grade assignments and projects',                        'learners', 'program'),
  ('school.view_learners',  'View learners of a school',                             'schools',  'school'),
  ('school.view_results',   'View results of a school',                              'schools',  'school'),
  ('school.print_slips',    'Print login slips for a school',                        'schools',  'school'),
  ('learners.manage',       'Create learners, reset PINs, record consent',           'schools',  'school'),
  ('blog.write',            'Write blog drafts',                                     'blog',     'global'),
  ('blog.edit_any',         'Edit anyone''s blog posts',                             'blog',     'global'),
  ('blog.publish',          'Publish and schedule blog posts',                       'blog',     'global'),
  ('enquiry.manage',        'Manage enquiries / leads',                              'business', 'global'),
  ('payment.manage',        'Record and manage payments',                            'business', 'global'),
  ('invoice.manage',        'Create invoices',                                       'business', 'global'),
  ('ai.settings',           'Configure the AI assistant and budgets',                'ai',       'global'),
  ('ai.review_all',         'Review all AI chats and moderation queue',              'ai',       'global'),
  ('lab.run',               'Run live lab sessions',                                 'lab',      'cohort'),
  ('attendance.mark',       'Mark attendance',                                       'lab',      'cohort'),
  ('ai.review_chats',       'Review AI chats of assigned learners',                  'ai',       'cohort'),
  ('grading.assigned',      'Grade assigned submissions',                            'lab',      'cohort'),
  ('grading.blind',         'Blind-judge assigned contest submissions',              'events',   'event'),
  ('event.manage',          'Create and run events and contests',                    'events',   'program');

with r(key, name, description) as (values
  ('super_admin',        'Super Admin',            'Full control of the platform'),
  ('program_manager',    'Program Manager',        'Runs assigned programs, cohorts and enrollments'),
  ('content_author',     'Content Author',         'Writes lessons in assigned programs; cannot publish'),
  ('content_reviewer',   'Content Reviewer',       'Reviews and publishes content in assigned programs'),
  ('blog_writer',        'Blog Writer',            'Writes blog drafts'),
  ('blog_editor',        'Blog Editor',            'Edits, schedules and publishes blog posts'),
  ('trainer',            'Trainer / Volunteer',    'Runs lab sessions for assigned cohorts or schools'),
  ('judge',              'Judge',                  'Blind-grades assigned contest submissions'),
  ('school_coordinator', 'School Coordinator',     'Sees only their school''s learners and results'),
  ('finance',            'Finance / Front Desk',   'Enquiries, enrollments, payments, invoices')
)
insert into app.roles (key, name, description, is_system) select key, name, description, true from r;

insert into app.role_permissions (role_id, permission_key)
select r.id, p.key from app.roles r
join (values
  ('super_admin', '*'),
  ('program_manager', 'program.manage'), ('program_manager', 'content.view'), ('program_manager', 'enrollments.view'),
  ('program_manager', 'enrollments.manage'), ('program_manager', 'progress.view'), ('program_manager', 'event.manage'),
  ('program_manager', 'submissions.grade'), ('program_manager', 'media.view'), ('program_manager', 'media.manage'),
  ('content_author', 'content.view'), ('content_author', 'content.edit'), ('content_author', 'media.view'), ('content_author', 'media.manage'),
  ('content_reviewer', 'content.view'), ('content_reviewer', 'content.edit'), ('content_reviewer', 'content.publish'),
  ('content_reviewer', 'media.view'), ('content_reviewer', 'media.manage'),
  ('blog_writer', 'blog.write'), ('blog_writer', 'media.view'), ('blog_writer', 'media.manage'),
  ('blog_editor', 'blog.write'), ('blog_editor', 'blog.edit_any'), ('blog_editor', 'blog.publish'), ('blog_editor', 'media.view'), ('blog_editor', 'media.manage'),
  ('trainer', 'lab.run'), ('trainer', 'attendance.mark'), ('trainer', 'ai.review_chats'), ('trainer', 'grading.assigned'),
  ('trainer', 'progress.view'), ('trainer', 'school.view_learners'),
  ('judge', 'grading.blind'),
  ('school_coordinator', 'school.view_learners'), ('school_coordinator', 'school.view_results'), ('school_coordinator', 'school.print_slips'),
  ('finance', 'enquiry.manage'), ('finance', 'payment.manage'), ('finance', 'invoice.manage'),
  ('finance', 'enrollments.view'), ('finance', 'enrollments.manage'), ('finance', 'users.view')
) as m(role_key, perm) on m.role_key = r.key
join app.permissions p on p.key = m.perm;

insert into app.feature_flags (key, enabled, description) values
  ('ai_assistant', false, 'In-platform AI assistant (Phase 2)'),
  ('payments',     false, 'Online payments via Razorpay (Phase 3)'),
  ('kannada_ui',   false, 'Show the Kannada language option'),
  ('blog',         false, 'Public blog (Phase 3)'),
  ('contests',     false, 'Events and contests engine (Phase 2)');

insert into app.settings (key, value) values
  ('branding', '{"name":"Gravitas Campus","colors":{"indigo":"#1B1640","cream":"#FFF8EE","orange":"#FF8A1F","blue":"#3D6BFF"},"fonts":{"heading":"Fredoka","body":"Nunito"}}'),
  ('security', '{"pin_max_attempts":5,"pin_lockout_minutes":15,"password_max_attempts":8,"password_lockout_minutes":15,"session_days":14,"school_session_hours":8}'),
  ('retention', '{"login_attempts_days":90,"ai_chat_days":365,"inactive_learner_years":3}');
