-- Local development seed (runs after migrations on `npx supabase start` / `npx supabase db reset`).
-- Creates a local admin login:  admin@example.com / password123
-- This only exists in your local Supabase. On the live project, create the user in the dashboard.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
  'admin@example.com', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
where not exists (select 1 from auth.users where email = 'admin@example.com');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now(), now()
from auth.users u
where u.email = 'admin@example.com'
  and not exists (select 1 from auth.identities i where i.user_id = u.id);
