-- Connections are per-module: granting Weight does not grant Calories, and a
-- grant can be withdrawn without dropping the connection.

create type public.connection_status as enum ('pending', 'active', 'declined', 'revoked');

create table public.connections (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status       public.connection_status not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  constraint connections_distinct check (requester_id <> addressee_id),
  constraint connections_unique_pair unique (requester_id, addressee_id)
);

create index connections_addressee_idx on public.connections (addressee_id, status);
create index connections_requester_idx on public.connections (requester_id, status);

create table public.connection_shares (
  connection_id uuid not null references public.connections (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  module_slug   text not null references public.modules (slug) on delete cascade,
  granted_at    timestamptz not null default now(),
  primary key (connection_id, owner_id, module_slug)
);

-- Security definer so RLS on `connections` cannot recurse into the policies
-- that call this.
create or replace function public.shares_module(p_owner uuid, p_viewer uuid, p_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.connections c
      join public.connection_shares s on s.connection_id = c.id
     where c.status = 'active'
       and s.owner_id = p_owner
       and s.module_slug = p_module
       and (
         (c.requester_id = p_owner and c.addressee_id = p_viewer) or
         (c.addressee_id = p_owner and c.requester_id = p_viewer)
       )
  );
$$;

create or replace function public.shares_anything(p_owner uuid, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.connections c
      join public.connection_shares s on s.connection_id = c.id
     where c.status = 'active'
       and s.owner_id = p_owner
       and (
         (c.requester_id = p_owner and c.addressee_id = p_viewer) or
         (c.addressee_id = p_owner and c.requester_id = p_viewer)
       )
  );
$$;

-- Adding a connection is "search by login email". Returning the id and name of
-- a non-connection is the minimum a request needs, so it goes through a
-- function rather than a readable profiles table.
create or replace function public.find_person(p_email text)
returns table (id uuid, email text, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.email, p.display_name
    from public.profiles p
   where lower(p.email) = lower(trim(p_email))
     and p.id <> auth.uid()
   limit 1;
$$;

revoke all on function public.find_person(text) from public;
grant execute on function public.find_person(text) to authenticated;
