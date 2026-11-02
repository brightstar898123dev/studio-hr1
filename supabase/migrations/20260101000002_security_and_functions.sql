-- Row Level Security and database functions.
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- RLS: only signed-in users may read or write. Anonymous visitors get nothing.
-- The app server connects with the database owner role, which bypasses RLS;
-- these policies protect the tables from the public (anon) API key.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'settings', 'jobs', 'candidates', 'templates', 'prompts', 'messages', 'outbox',
    'documents', 'suppression', 'activity_log', 'ai_usage', 'mail_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "authenticated can read" on public.%I', t);
    execute format('drop policy if exists "authenticated can write" on public.%I', t);
    execute format('create policy "authenticated can read" on public.%I for select to authenticated using (true)', t);
    execute format(
      'create policy "authenticated can write" on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- claim_outbox_for_send: the ONLY way an email moves to 'sending'.
--
-- * A transaction-level advisory lock serialises claims, so two runs can never
--   both pass the daily-limit check at the same time.
-- * The UPDATE ... WHERE status = 'approved' RETURNING makes the claim atomic:
--   if two workers try the same row, only one gets it back.
-- Returns the claimed row, or nothing (already claimed, not approved, or the
-- daily limit is reached).
-- ---------------------------------------------------------------------------
create or replace function public.claim_outbox_for_send(p_id uuid, p_daily_limit int, p_tz text)
returns setof public.outbox
language plpgsql
as $$
declare
  day_start timestamptz := (date_trunc('day', now() at time zone p_tz)) at time zone p_tz;
  used int;
begin
  perform pg_advisory_xact_lock(hashtext('outbox_send_claim'));

  select count(*) into used
  from public.outbox
  where (status = 'sent' and sent_at >= day_start)
     or (status = 'sending' and claimed_at >= day_start);

  if used >= p_daily_limit then
    return;
  end if;

  return query
    update public.outbox
       set status = 'sending', claimed_at = now(), attempts = attempts + 1, error = null
     where id = p_id and status = 'approved'
    returning *;
end $$;

-- How many emails were sent (or are being sent) today in the given time zone.
create or replace function public.sent_today_count(p_tz text)
returns int
language sql
stable
as $$
  select count(*)::int
  from public.outbox
  where (status = 'sent' and sent_at >= (date_trunc('day', now() at time zone p_tz)) at time zone p_tz)
     or (status = 'sending' and claimed_at >= (date_trunc('day', now() at time zone p_tz)) at time zone p_tz);
$$;

-- Count one AI request and return today's total across all models.
create or replace function public.bump_ai_usage(p_date date, p_model text)
returns int
language plpgsql
as $$
declare total int;
begin
  insert into public.ai_usage (date, model, requests) values (p_date, p_model, 1)
  on conflict (date, model) do update set requests = public.ai_usage.requests + 1;
  select coalesce(sum(requests), 0)::int into total from public.ai_usage where date = p_date;
  return total;
end $$;

-- These functions are for the app server only.
revoke all on function public.claim_outbox_for_send(uuid, int, text) from public;
revoke all on function public.sent_today_count(text) from public;
revoke all on function public.bump_ai_usage(date, text) from public;
