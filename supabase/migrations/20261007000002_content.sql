-- ════════════════════════════════════════════════════════════════════════════
-- 0002 CONTENT: Program → Level → Module → Lesson → Blocks, versions, reviews
-- ════════════════════════════════════════════════════════════════════════════

create table app.programs (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name               text not null check (length(name) between 2 and 120),
  tagline            text,
  description        text not null default '',
  audience           text not null check (audience in ('school', 'adult')),
  cover_media_id     uuid,
  languages          text[] not null default '{en}',
  visibility         text not null default 'draft' check (visibility in ('draft', 'private', 'public')),
  pass_mark          int not null default 50 check (pass_mark between 0 and 100),
  unlock_rule        text not null default 'sequential' check (unlock_rule in ('sequential', 'open')),
  prerequisites      jsonb not null default '[]',
  pricing            jsonb not null default '{}',     -- filled in Phase 3 (products/payments)
  ai_settings        jsonb not null default '{}',     -- Phase 2
  marketing          jsonb not null default '{}',     -- outcomes, duration, FAQ for public page
  translations       jsonb not null default '{}',     -- {"kn": {"name": "...", "description": "..."}}
  certificate_template_id uuid,
  is_template        boolean not null default false,
  archived_at        timestamptz,
  created_by         uuid references app.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger programs_updated before update on app.programs for each row execute function app.set_updated_at();

alter table app.role_assignments
  add constraint role_assignments_program_fk foreign key (program_id) references app.programs(id) on delete cascade;

create table app.levels (
  id           uuid primary key default gen_random_uuid(),
  program_id   uuid not null references app.programs(id) on delete cascade,
  position     int not null,
  name         text not null,
  slug         text not null check (slug ~ '^[a-z0-9-]{1,60}$'),
  description  text not null default '',
  badge_name   text,
  pass_mark    int check (pass_mark between 0 and 100),   -- null → program pass mark
  translations jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (program_id, slug)
);
create index levels_program_idx on app.levels(program_id, position);
create trigger levels_updated before update on app.levels for each row execute function app.set_updated_at();

create table app.modules (
  id           uuid primary key default gen_random_uuid(),
  level_id     uuid not null references app.levels(id) on delete cascade,
  program_id   uuid not null references app.programs(id) on delete cascade,  -- denormalised for fast RLS
  position     int not null,
  title        text not null,
  description  text not null default '',
  translations jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index modules_level_idx on app.modules(level_id, position);
create trigger modules_updated before update on app.modules for each row execute function app.set_updated_at();

create table app.lessons (
  id                    uuid primary key default gen_random_uuid(),
  module_id             uuid not null references app.modules(id) on delete cascade,
  level_id              uuid not null references app.levels(id) on delete cascade,
  program_id            uuid not null references app.programs(id) on delete cascade,
  position              int not null,
  title                 text not null,
  summary               text not null default '',
  status                text not null default 'draft' check (status in ('draft', 'in_review', 'published', 'archived')),
  has_unpublished_changes boolean not null default true,
  free_navigation       boolean not null default false,
  is_assessment         boolean not null default false,   -- its score decides level pass/unlock
  estimated_minutes     int,
  ai_settings           jsonb not null default '{}',
  translations          jsonb not null default '{}',
  published_version_id  uuid,
  created_by            uuid references app.users(id) on delete set null,
  updated_by            uuid references app.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index lessons_module_idx on app.lessons(module_id, position);
create index lessons_program_idx on app.lessons(program_id);
create trigger lessons_updated before update on app.lessons for each row execute function app.set_updated_at();

create table app.lesson_blocks (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references app.lessons(id) on delete cascade,
  program_id  uuid not null references app.programs(id) on delete cascade,
  position    int not null,
  type        text not null check (type ~ '^[a-z_]{2,40}$'),
  content     jsonb not null default '{}',   -- what the learner sees
  answer_key  jsonb not null default '{}',   -- correct answers, hidden tests: NEVER sent to learners
  settings    jsonb not null default '{}',   -- points, required, ai mode …
  source_reusable_id uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index lesson_blocks_lesson_idx on app.lesson_blocks(lesson_id, position);
create trigger lesson_blocks_updated before update on app.lesson_blocks for each row execute function app.set_updated_at();

create table app.lesson_versions (
  id            uuid primary key default gen_random_uuid(),
  lesson_id     uuid not null references app.lessons(id) on delete cascade,
  program_id    uuid not null references app.programs(id) on delete cascade,
  version_no    int not null,
  snapshot      jsonb not null,    -- {title, summary, free_navigation, is_assessment, blocks:[{id,type,content,answer_key,settings}]}
  note          text,
  published_by  uuid references app.users(id) on delete set null,
  published_at  timestamptz not null default now(),
  unique (lesson_id, version_no)
);
alter table app.lessons add constraint lessons_published_version_fk
  foreign key (published_version_id) references app.lesson_versions(id) on delete set null;

create table app.content_reviews (
  id            uuid primary key default gen_random_uuid(),
  lesson_id     uuid not null references app.lessons(id) on delete cascade,
  program_id    uuid not null references app.programs(id) on delete cascade,
  requested_by  uuid references app.users(id) on delete set null,
  requested_at  timestamptz not null default now(),
  request_note  text,
  decided_by    uuid references app.users(id) on delete set null,
  decided_at    timestamptz,
  decision      text check (decision in ('approved', 'changes_requested')),
  decision_note text
);
create index content_reviews_open_idx on app.content_reviews(program_id) where decided_at is null;

create table app.reusable_blocks (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid references app.programs(id) on delete cascade,  -- null = shared across programs
  title       text not null,
  type        text not null,
  content     jsonb not null default '{}',
  answer_key  jsonb not null default '{}',
  settings    jsonb not null default '{}',
  created_by  uuid references app.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger reusable_blocks_updated before update on app.reusable_blocks for each row execute function app.set_updated_at();

-- ── Keep denormalised program_id / level_id consistent ─────────────────────
create or replace function app.fill_module_parent() returns trigger language plpgsql as $$
begin
  select program_id into strict new.program_id from app.levels where id = new.level_id;
  return new;
end $$;
create trigger modules_parent before insert or update of level_id on app.modules
  for each row execute function app.fill_module_parent();

create or replace function app.fill_lesson_parent() returns trigger language plpgsql as $$
begin
  select level_id, program_id into strict new.level_id, new.program_id from app.modules where id = new.module_id;
  return new;
end $$;
create trigger lessons_parent before insert or update of module_id on app.lessons
  for each row execute function app.fill_lesson_parent();

create or replace function app.fill_block_parent() returns trigger language plpgsql as $$
begin
  select program_id into strict new.program_id from app.lessons where id = new.lesson_id;
  return new;
end $$;
create trigger lesson_blocks_parent before insert or update of lesson_id on app.lesson_blocks
  for each row execute function app.fill_block_parent();

-- Editing a block marks its lesson as having unpublished changes.
create or replace function app.touch_lesson_on_block_change() returns trigger
language plpgsql security definer set search_path = app, pg_temp as $$
begin
  update app.lessons set has_unpublished_changes = true, updated_by = app.uid()
   where id = coalesce(new.lesson_id, old.lesson_id) and not has_unpublished_changes;
  return null;
end $$;
create trigger lesson_blocks_touch after insert or update or delete on app.lesson_blocks
  for each row execute function app.touch_lesson_on_block_change();

-- ── Workflow guard: Authors cannot publish ─────────────────────────────────
-- Applies to every request made as app_user, so it cannot be bypassed from the UI or API.
create or replace function app.guard_lesson_status() returns trigger
language plpgsql set search_path = app, pg_temp as $$
begin
  if current_user = 'app_user'
     and (new.status in ('published', 'archived') or new.published_version_id is distinct from old.published_version_id)
     and (new.status is distinct from old.status or new.published_version_id is distinct from old.published_version_id)
     and not app.has_perm('content.publish', new.program_id) then
    raise exception 'You do not have permission to publish in this program' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger lessons_status_guard before update on app.lessons
  for each row execute function app.guard_lesson_status();

-- ── Audit ──────────────────────────────────────────────────────────────────
create trigger audit_programs after insert or update or delete on app.programs for each row execute function app.audit_trigger();
create trigger audit_levels after insert or update or delete on app.levels for each row execute function app.audit_trigger();
create trigger audit_modules after insert or update or delete on app.modules for each row execute function app.audit_trigger();
create trigger audit_lessons after insert or update or delete on app.lessons for each row execute function app.audit_trigger();
create trigger audit_lesson_blocks after insert or update or delete on app.lesson_blocks for each row execute function app.audit_trigger();
create trigger audit_lesson_versions after insert or update or delete on app.lesson_versions for each row execute function app.audit_trigger();
create trigger audit_content_reviews after insert or update or delete on app.content_reviews for each row execute function app.audit_trigger();
create trigger audit_reusable_blocks after insert or update or delete on app.reusable_blocks for each row execute function app.audit_trigger();
