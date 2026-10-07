-- ════════════════════════════════════════════════════════════════════════════
-- 0003 LEARNING, MEDIA, and RLS for content + learning
-- ════════════════════════════════════════════════════════════════════════════

create table app.enrollments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references app.users(id) on delete cascade,
  program_id   uuid not null references app.programs(id) on delete cascade,
  status       text not null default 'active' check (status in ('pending_payment', 'active', 'completed', 'cancelled')),
  source       text not null default 'admin' check (source in ('self', 'admin', 'bulk', 'payment')),
  created_by   uuid references app.users(id) on delete set null,
  enrolled_at  timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, program_id)
);
create index enrollments_program_idx on app.enrollments(program_id);
create trigger enrollments_updated before update on app.enrollments for each row execute function app.set_updated_at();

create table app.level_unlocks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references app.users(id) on delete cascade,
  level_id     uuid not null references app.levels(id) on delete cascade,
  program_id   uuid not null references app.programs(id) on delete cascade,
  reason       text not null check (reason in ('default', 'passed', 'override', 'open')),
  note         text,
  unlocked_by  uuid references app.users(id) on delete set null,
  unlocked_at  timestamptz not null default now(),
  unique (user_id, level_id)
);
create index level_unlocks_user_idx on app.level_unlocks(user_id, program_id);

create table app.lesson_progress (
  user_id             uuid not null references app.users(id) on delete cascade,
  lesson_id           uuid not null references app.lessons(id) on delete cascade,
  program_id          uuid not null references app.programs(id) on delete cascade,
  version_id          uuid references app.lesson_versions(id) on delete set null,
  current_position    int not null default 0,
  completed_block_ids uuid[] not null default '{}',
  status              text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  score               numeric(8,2) not null default 0,
  max_score           numeric(8,2) not null default 0,
  started_at          timestamptz not null default now(),
  completed_at        timestamptz,
  updated_at          timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create index lesson_progress_program_idx on app.lesson_progress(program_id, user_id);
create trigger lesson_progress_updated before update on app.lesson_progress for each row execute function app.set_updated_at();

create table app.block_responses (
  user_id     uuid not null references app.users(id) on delete cascade,
  block_id    uuid not null,                     -- block id inside the published snapshot
  lesson_id   uuid not null references app.lessons(id) on delete cascade,
  program_id  uuid not null references app.programs(id) on delete cascade,
  version_id  uuid references app.lesson_versions(id) on delete set null,
  response    jsonb not null default '{}',
  is_correct  boolean,
  score       numeric(8,2),
  max_score   numeric(8,2),
  attempts    int not null default 0,
  completed   boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (user_id, block_id)
);
create index block_responses_lesson_idx on app.block_responses(lesson_id, user_id);
create trigger block_responses_updated before update on app.block_responses for each row execute function app.set_updated_at();

create table app.submissions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references app.users(id) on delete cascade,
  block_id      uuid not null,
  lesson_id     uuid not null references app.lessons(id) on delete cascade,
  program_id    uuid not null references app.programs(id) on delete cascade,
  kind          text not null check (kind in ('text', 'link', 'file', 'screenshot')),
  body_text     text,
  url           text,
  file_key      text,
  file_name     text,
  status        text not null default 'submitted' check (status in ('submitted', 'graded', 'returned')),
  rubric_scores jsonb,
  score         numeric(8,2),
  max_score     numeric(8,2),
  feedback      text,
  graded_by     uuid references app.users(id) on delete set null,
  graded_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index submissions_program_status_idx on app.submissions(program_id, status);
create index submissions_user_idx on app.submissions(user_id);
create trigger submissions_updated before update on app.submissions for each row execute function app.set_updated_at();

-- ── Media library ──────────────────────────────────────────────────────────
create table app.media_folders (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references app.media_folders(id) on delete cascade,
  name        text not null check (length(name) between 1 and 80),
  created_by  uuid references app.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique nulls not distinct (parent_id, name)
);

create table app.media (
  id           uuid primary key default gen_random_uuid(),
  folder_id    uuid references app.media_folders(id) on delete set null,
  storage_key  text not null unique,
  file_name    text not null,
  mime_type    text not null,
  size_bytes   bigint not null check (size_bytes >= 0),
  alt_text     text not null default '',
  tags         text[] not null default '{}',
  uploaded_by  uuid references app.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index media_folder_idx on app.media(folder_id) where deleted_at is null;
create index media_search_idx on app.media using gin (to_tsvector('simple', file_name || ' ' || alt_text));

alter table app.programs add constraint programs_cover_fk foreign key (cover_media_id) references app.media(id) on delete set null;

-- ── Enrollment → unlock first level automatically ──────────────────────────
create or replace function app.on_enrollment_active() returns trigger
language plpgsql security definer set search_path = app, pg_temp as $$
declare rule text;
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    select unlock_rule into rule from app.programs where id = new.program_id;
    insert into app.level_unlocks (user_id, level_id, program_id, reason)
    select new.user_id, l.id, l.program_id, case when rule = 'open' then 'open' else 'default' end
      from app.levels l
     where l.program_id = new.program_id
       and (rule = 'open' or l.position = (select min(position) from app.levels where program_id = new.program_id))
    on conflict (user_id, level_id) do nothing;
  end if;
  return new;
end $$;
create trigger enrollments_unlock after insert or update of status on app.enrollments
  for each row execute function app.on_enrollment_active();

-- ── Learner access helpers ─────────────────────────────────────────────────
create or replace function app.is_enrolled(p_program uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (select 1 from app.enrollments
                  where user_id = app.uid() and program_id = p_program and status in ('active', 'completed'))
$$;

create or replace function app.can_view_program(p_program uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (select 1 from app.programs where id = p_program and visibility = 'public' and archived_at is null)
      or app.has_perm('content.view', p_program)
      or app.has_perm('program.manage', p_program)
      or app.is_enrolled(p_program)
$$;

create or replace function app.can_learn_lesson(p_lesson uuid) returns boolean
language sql stable security definer set search_path = app, pg_temp as $$
  select exists (
    select 1 from app.lessons ls
     where ls.id = p_lesson
       and ls.published_version_id is not null
       and app.is_enrolled(ls.program_id)
       and exists (select 1 from app.level_unlocks u where u.user_id = app.uid() and u.level_id = ls.level_id)
  )
$$;

-- Published lesson for a learner — answer keys stripped INSIDE the database.
create or replace function app.learner_lesson(p_lesson uuid) returns jsonb
language plpgsql stable security definer set search_path = app, pg_temp as $$
declare snap jsonb; vid uuid;
begin
  if not (app.can_learn_lesson(p_lesson) or app.has_perm('content.view', (select program_id from app.lessons where id = p_lesson))) then
    return null;
  end if;
  select v.id, v.snapshot into vid, snap
    from app.lessons ls join app.lesson_versions v on v.id = ls.published_version_id
   where ls.id = p_lesson;
  if snap is null then return null; end if;
  return jsonb_set(snap, '{blocks}', coalesce((
           select jsonb_agg(b - 'answer_key' order by ord)
             from jsonb_array_elements(snap -> 'blocks') with ordinality as t(b, ord)), '[]'::jsonb))
         || jsonb_build_object('version_id', vid);
end $$;

grant execute on function app.is_enrolled(uuid), app.can_view_program(uuid), app.can_learn_lesson(uuid), app.learner_lesson(uuid) to app_user;

-- ── RLS: content ───────────────────────────────────────────────────────────
alter table app.programs        enable row level security;
alter table app.levels          enable row level security;
alter table app.modules         enable row level security;
alter table app.lessons         enable row level security;
alter table app.lesson_blocks   enable row level security;
alter table app.lesson_versions enable row level security;
alter table app.content_reviews enable row level security;
alter table app.reusable_blocks enable row level security;

grant select, insert, update, delete on app.programs to app_user;
create policy programs_select on app.programs for select to app_user using (app.can_view_program(id));
create policy programs_insert on app.programs for insert to app_user with check (app.has_perm('program.create'));
create policy programs_update on app.programs for update to app_user
  using (app.has_perm('program.manage', id)) with check (app.has_perm('program.manage', id));
create policy programs_delete on app.programs for delete to app_user using (app.has_perm('program.delete', id));

grant select, insert, update, delete on app.levels to app_user;
create policy levels_select on app.levels for select to app_user using (app.can_view_program(program_id));
create policy levels_write on app.levels for all to app_user
  using (app.has_perm('program.manage', program_id) or app.has_perm('content.edit', program_id))
  with check (app.has_perm('program.manage', program_id) or app.has_perm('content.edit', program_id));

grant select, insert, update, delete on app.modules to app_user;
create policy modules_select on app.modules for select to app_user using (app.can_view_program(program_id));
create policy modules_write on app.modules for all to app_user
  using (app.has_perm('content.edit', program_id)) with check (app.has_perm('content.edit', program_id));

-- Learners may see lesson *metadata* (for the course outline) once it has been published.
grant select, insert, update, delete on app.lessons to app_user;
create policy lessons_select on app.lessons for select to app_user using (
  app.has_perm('content.view', program_id)
  or (published_version_id is not null and app.is_enrolled(program_id))
);
create policy lessons_insert on app.lessons for insert to app_user with check (app.has_perm('content.edit', program_id));
create policy lessons_update on app.lessons for update to app_user
  using (app.has_perm('content.edit', program_id) or app.has_perm('content.publish', program_id))
  with check (app.has_perm('content.edit', program_id) or app.has_perm('content.publish', program_id));
create policy lessons_delete on app.lessons for delete to app_user using (app.has_perm('content.publish', program_id));

-- Draft blocks and versions (which contain answer keys) are staff-only.
grant select, insert, update, delete on app.lesson_blocks to app_user;
create policy lesson_blocks_select on app.lesson_blocks for select to app_user using (app.has_perm('content.view', program_id));
create policy lesson_blocks_write on app.lesson_blocks for all to app_user
  using (app.has_perm('content.edit', program_id)) with check (app.has_perm('content.edit', program_id));

grant select, insert on app.lesson_versions to app_user;
create policy lesson_versions_select on app.lesson_versions for select to app_user using (app.has_perm('content.view', program_id));
create policy lesson_versions_insert on app.lesson_versions for insert to app_user with check (app.has_perm('content.publish', program_id));

grant select, insert, update on app.content_reviews to app_user;
create policy content_reviews_select on app.content_reviews for select to app_user using (app.has_perm('content.view', program_id));
create policy content_reviews_insert on app.content_reviews for insert to app_user
  with check (app.has_perm('content.edit', program_id) and requested_by = (select app.uid()));
create policy content_reviews_update on app.content_reviews for update to app_user
  using (app.has_perm('content.publish', program_id)) with check (app.has_perm('content.publish', program_id));

grant select, insert, update, delete on app.reusable_blocks to app_user;
create policy reusable_blocks_select on app.reusable_blocks for select to app_user using (
  (program_id is null and app.has_perm_anywhere('content.view')) or app.has_perm('content.view', program_id));
create policy reusable_blocks_write on app.reusable_blocks for all to app_user
  using ((program_id is null and app.has_perm_anywhere('content.edit')) or app.has_perm('content.edit', program_id))
  with check ((program_id is null and app.has_perm_anywhere('content.edit')) or app.has_perm('content.edit', program_id));

-- ── RLS: learning ──────────────────────────────────────────────────────────
alter table app.enrollments     enable row level security;
alter table app.level_unlocks   enable row level security;
alter table app.lesson_progress enable row level security;
alter table app.block_responses enable row level security;
alter table app.submissions     enable row level security;
alter table app.media_folders   enable row level security;
alter table app.media           enable row level security;

grant select, insert, update, delete on app.enrollments to app_user;
create policy enrollments_select on app.enrollments for select to app_user using (
  user_id = (select app.uid()) or app.has_perm('enrollments.view', program_id) or app.has_perm('progress.view', program_id)
  or exists (select 1 from app.school_learners sl where sl.user_id = enrollments.user_id
             and app.has_perm('school.view_learners', null, sl.school_id)));
create policy enrollments_write on app.enrollments for all to app_user
  using (app.has_perm('enrollments.manage', program_id)) with check (app.has_perm('enrollments.manage', program_id));

grant select, insert, update, delete on app.level_unlocks to app_user;
create policy level_unlocks_select on app.level_unlocks for select to app_user using (
  user_id = (select app.uid()) or app.has_perm('progress.view', program_id));
create policy level_unlocks_write on app.level_unlocks for all to app_user
  using (app.has_perm('progress.override', program_id))
  with check (app.has_perm('progress.override', program_id) and reason = 'override');

grant select, insert, update on app.lesson_progress to app_user;
create policy lesson_progress_select on app.lesson_progress for select to app_user using (
  user_id = (select app.uid()) or app.has_perm('progress.view', program_id)
  or exists (select 1 from app.school_learners sl where sl.user_id = lesson_progress.user_id
             and app.has_perm('school.view_results', null, sl.school_id)));
create policy lesson_progress_write on app.lesson_progress for insert to app_user
  with check (user_id = (select app.uid()) and app.can_learn_lesson(lesson_id));
create policy lesson_progress_update on app.lesson_progress for update to app_user
  using (user_id = (select app.uid())) with check (user_id = (select app.uid()) and app.can_learn_lesson(lesson_id));

grant select, insert, update on app.block_responses to app_user;
create policy block_responses_select on app.block_responses for select to app_user using (
  user_id = (select app.uid()) or app.has_perm('progress.view', program_id));
create policy block_responses_insert on app.block_responses for insert to app_user
  with check (user_id = (select app.uid()) and app.can_learn_lesson(lesson_id));
create policy block_responses_update on app.block_responses for update to app_user
  using (user_id = (select app.uid())) with check (user_id = (select app.uid()) and app.can_learn_lesson(lesson_id));

grant select, insert, update on app.submissions to app_user;
create policy submissions_select on app.submissions for select to app_user using (
  user_id = (select app.uid()) or app.has_perm('submissions.grade', program_id) or app.has_perm('progress.view', program_id));
create policy submissions_insert on app.submissions for insert to app_user
  with check (user_id = (select app.uid()) and app.can_learn_lesson(lesson_id) and status = 'submitted' and score is null);
create policy submissions_grade on app.submissions for update to app_user
  using (app.has_perm('submissions.grade', program_id)) with check (app.has_perm('submissions.grade', program_id));

grant select, insert, update, delete on app.media_folders to app_user;
create policy media_folders_select on app.media_folders for select to app_user using (app.has_perm_anywhere('media.view'));
create policy media_folders_write on app.media_folders for all to app_user
  using (app.has_perm_anywhere('media.manage')) with check (app.has_perm_anywhere('media.manage'));

grant select, insert, update on app.media to app_user;
create policy media_select on app.media for select to app_user using (app.has_perm_anywhere('media.view'));
create policy media_write on app.media for insert to app_user
  with check (app.has_perm_anywhere('media.manage') and uploaded_by = (select app.uid()));
create policy media_update on app.media for update to app_user
  using (app.has_perm_anywhere('media.manage')) with check (app.has_perm_anywhere('media.manage'));

-- ── Audit ──────────────────────────────────────────────────────────────────
create trigger audit_enrollments after insert or update or delete on app.enrollments for each row execute function app.audit_trigger();
create trigger audit_level_unlocks after insert or update or delete on app.level_unlocks for each row execute function app.audit_trigger();
create trigger audit_submissions after update or delete on app.submissions for each row execute function app.audit_trigger();
create trigger audit_media after insert or update or delete on app.media for each row execute function app.audit_trigger();
create trigger audit_media_folders after insert or update or delete on app.media_folders for each row execute function app.audit_trigger();
