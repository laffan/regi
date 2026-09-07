-- Local-only stand-in for the parts of Supabase the migrations lean on, so the
-- schema can be applied to a plain Postgres and checked. Never run this against
-- a real Supabase project — it already has all of this.

create schema if not exists auth;

-- Column set trimmed to what the migrations and seed touch.
create table if not exists auth.users (
  instance_id        uuid,
  id                 uuid primary key default gen_random_uuid(),
  aud                text,
  role               text,
  email              text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data  jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists auth.identities (
  id              text,
  user_id         uuid references auth.users (id) on delete cascade,
  provider_id     text,
  provider        text,
  identity_data   jsonb not null default '{}'::jsonb,
  last_sign_in_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (provider, provider_id)
);

-- The request's user id. Tests set it with:  select set_config('request.jwt.claim.sub', '<uuid>', false);
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

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
end
$$;

-- Supabase grants these; the stub has to as well or every policy that calls
-- auth.uid() fails with "permission denied for schema auth".
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

