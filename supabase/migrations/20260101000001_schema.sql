-- Core schema for the HR recruiting app.
-- Safe to run more than once (uses IF NOT EXISTS / OR REPLACE everywhere).

create extension if not exists citext;

-- Shared trigger: keep updated_at fresh.
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- settings (single row, id = 1)
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  id                     int primary key default 1 check (id = 1),
  company_name           text not null default 'Your Company',
  logo_url               text,
  brand_color            text not null default '#2563eb',
  sender_name            text not null default 'HR Team',
  sender_email           text not null default '',
  reply_domain           text not null default '',
  signature              text not null default '',
  tone                   text not null default 'warm, friendly and professional',
  followup_days          int  not null default 3  check (followup_days between 1 and 60),
  max_followups          int  not null default 2  check (max_followups between 0 and 10),
  daily_send_limit       int  not null default 100 check (daily_send_limit between 0 and 300),
  outreach_batch_size    int  not null default 20 check (outreach_batch_size between 1 and 200),
  auto_send              boolean not null default false,
  checker_pass_mark      int  not null default 8  check (checker_pass_mark between 0 and 10),
  hr_digest_email        text,
  default_interview_link text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------
create table if not exists public.jobs (
  id                      uuid primary key default gen_random_uuid(),
  title                   text not null check (length(trim(title)) > 0),
  status                  text not null default 'open' check (status in ('open', 'paused', 'closed')),
  jd                      text not null default '',
  location                text,
  work_mode               text check (work_mode in ('onsite', 'remote', 'hybrid')),
  salary_range            text,
  must_mention            text,
  tone                    text,
  screening_questions     text,
  interview_link          text,
  prompt_outreach         text,
  prompt_interview_invite text,
  prompt_followup         text,
  prompt_feedback         text,
  reply_notes             text,
  feedback_criteria       text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists jobs_status_idx on public.jobs (status);

-- ---------------------------------------------------------------------------
-- candidates
-- ---------------------------------------------------------------------------
create table if not exists public.candidates (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null check (length(trim(name)) > 0),
  email                   citext not null unique,
  phone                   text,
  job_id                  uuid references public.jobs (id) on delete set null,
  stage                   text not null default 'new' check (stage in (
                            'new', 'contacted', 'interested', 'interview_invited', 'interviewed', 'feedback_sent',
                            'not_interested', 'question_pending', 'reschedule_requested', 'needs_hr',
                            'link_missing', 'paused', 'hired', 'rejected')),
  source                  text,
  profile_notes           text,
  interview_link_override text,
  hr_notes                text,
  decision                text check (decision in ('move_forward', 'not_selected', 'on_hold')),
  followup_count          int not null default 0,
  last_contacted_at       timestamptz,
  last_reply_at           timestamptz,
  do_not_email            boolean not null default false,
  -- Used in the Reply-To address (<token>@reply-domain) so replies can be matched.
  reply_token             text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists candidates_job_idx on public.candidates (job_id);
create index if not exists candidates_stage_idx on public.candidates (stage);

-- ---------------------------------------------------------------------------
-- templates (email formats). job_id null = global.
-- ---------------------------------------------------------------------------
create table if not exists public.templates (
  id               uuid primary key default gen_random_uuid(),
  type             text not null check (type in ('outreach', 'interview_invite', 'followup', 'feedback', 'reply', 'digest')),
  job_id           uuid references public.jobs (id) on delete cascade,
  name             text not null default '',
  format           text not null default 'html' check (format in ('html', 'text')),
  subject_template text not null default '{{subject}}',
  body_template    text not null,
  is_default       boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- Only one active (default) template per type per scope.
create unique index if not exists templates_one_default_idx
  on public.templates (type, coalesce(job_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_default;

-- ---------------------------------------------------------------------------
-- prompts: HR-edited global prompts. A missing row means "use the built-in default".
-- ---------------------------------------------------------------------------
create table if not exists public.prompts (
  type         text primary key check (type in (
                 'outreach', 'interview_invite', 'followup', 'feedback', 'classify_reply',
                 'reply_interested', 'reply_not_interested', 'reply_question', 'reply_reschedule', 'reply_other',
                 'checker', 'jd_doc', 'feedback_doc')),
  instructions text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- messages: full conversation history
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  candidate_id     uuid references public.candidates (id) on delete cascade,
  direction        text not null check (direction in ('in', 'out')),
  from_email       text,
  to_email         text,
  subject          text,
  body_text        text,
  body_html        text,
  category         text,
  outbox_id        uuid,
  external_id      text,
  raw              jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists messages_candidate_idx on public.messages (candidate_id, created_at desc);
create unique index if not exists messages_external_id_idx on public.messages (external_id) where external_id is not null;

-- ---------------------------------------------------------------------------
-- outbox: every email the system wants to send
-- ---------------------------------------------------------------------------
create table if not exists public.outbox (
  id                 uuid primary key default gen_random_uuid(),
  candidate_id       uuid not null references public.candidates (id) on delete cascade,
  job_id             uuid references public.jobs (id) on delete set null,
  type               text not null check (type in ('outreach', 'interview_invite', 'followup', 'feedback', 'reply')),
  to_email           text not null,
  subject            text not null default '',
  body               text not null default '',
  html               text not null default '',
  text               text not null default '',
  interview_link     text,
  reply_category     text,
  in_reply_to        uuid references public.messages (id) on delete set null,
  status             text not null default 'draft' check (status in (
                       'draft', 'needs_review', 'link_missing', 'approved', 'sending', 'sent', 'failed', 'rejected')),
  approved           boolean not null default false,
  approved_at        timestamptz,
  checker_score      numeric(3, 1),
  checker_issues     jsonb not null default '[]'::jsonb,
  rewrite_count      int not null default 0,
  edited_by_hr       boolean not null default false,
  claimed_at         timestamptz,
  sent_at            timestamptz,
  brevo_message_id   text,
  attempts           int not null default 0,
  error              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists outbox_status_idx on public.outbox (status, created_at);
create index if not exists outbox_candidate_idx on public.outbox (candidate_id);
create index if not exists outbox_sent_at_idx on public.outbox (sent_at) where status = 'sent';
-- One open draft per candidate per type, so re-running a scheduled job never makes duplicates.
create unique index if not exists outbox_one_open_per_type_idx
  on public.outbox (candidate_id, type)
  where status in ('draft', 'needs_review', 'link_missing', 'approved', 'sending');

-- ---------------------------------------------------------------------------
-- documents: AI-drafted JDs and feedback documents
-- ---------------------------------------------------------------------------
create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  type         text not null check (type in ('jd', 'feedback')),
  title        text not null default '',
  job_id       uuid references public.jobs (id) on delete set null,
  candidate_id uuid references public.candidates (id) on delete set null,
  notes        text not null default '',
  content      text not null default '',
  status       text not null default 'draft' check (status in ('draft', 'final')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- suppression: never email these addresses
-- ---------------------------------------------------------------------------
create table if not exists public.suppression (
  email      citext primary key,
  reason     text not null check (reason in ('bounce', 'unsubscribe', 'manual')),
  details    text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- activity_log: every automated and HR action
-- ---------------------------------------------------------------------------
create table if not exists public.activity_log (
  id         uuid primary key default gen_random_uuid(),
  actor      text not null default 'system',
  action     text not null,
  entity     text,
  entity_id  text,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_created_idx on public.activity_log (created_at desc);
create index if not exists activity_action_idx on public.activity_log (action);

-- ---------------------------------------------------------------------------
-- ai_usage: requests per day per model
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage (
  date     date not null,
  model    text not null,
  requests int  not null default 0,
  primary key (date, model)
);

-- ---------------------------------------------------------------------------
-- mail_log: every email handed to the mail provider (or the mock)
-- ---------------------------------------------------------------------------
create table if not exists public.mail_log (
  id          uuid primary key default gen_random_uuid(),
  to_email    text not null,
  subject     text not null,
  html        text,
  text        text,
  kind        text not null default 'candidate',
  mock        boolean not null default false,
  provider_id text,
  created_at  timestamptz not null default now()
);
create index if not exists mail_log_created_idx on public.mail_log (created_at desc);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['settings', 'jobs', 'candidates', 'templates', 'prompts', 'outbox', 'documents'] loop
    execute format('drop trigger if exists %I_updated_at on public.%I', t, t);
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- The single settings row.
insert into public.settings (id) values (1) on conflict (id) do nothing;
