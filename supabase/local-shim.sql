-- NOT a migration. Only used when the database is NOT Supabase
-- (PGlite in MOCK_DB mode, or a plain Postgres in tests).
-- Supabase already has these roles; this file creates stand-ins so the
-- RLS policies in supabase/migrations can be applied anywhere.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to authenticated, service_role;
alter default privileges in schema public grant select on tables to anon;
