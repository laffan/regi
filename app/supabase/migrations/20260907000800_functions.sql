-- Writes that have to happen together. These run as the caller, so RLS still
-- decides what each one may touch.

-- Approve a reviewed draft: every row becomes an entry in its owning module,
-- calorie rows carry their items across, and the draft closes. All or nothing.
create or replace function public.approve_draft(p_draft_id uuid)
returns setof uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  r        public.log_draft_rows%rowtype;
  new_id   uuid;
  item     jsonb;
  idx      int;
  d_status public.draft_status;
begin
  select status into d_status
    from public.log_drafts
   where id = p_draft_id and user_id = auth.uid()
   for update;

  if d_status is null then
    raise exception 'draft not found';
  end if;
  if d_status <> 'pending' then
    raise exception 'draft already %', d_status;
  end if;

  for r in
    select * from public.log_draft_rows
     where draft_id = p_draft_id and user_id = auth.uid()
     order by position
  loop
    insert into public.entries
      (user_id, module_slug, occurred_at, value, unit, label, note, payload, source)
    values
      (auth.uid(), r.module_slug, r.occurred_at, r.value, r.unit, r.label,
       nullif(r.payload ->> 'note', ''),
       r.payload - 'items' - 'note',
       'log')
    returning id into new_id;

    idx := 0;
    for item in select * from jsonb_array_elements(coalesce(r.payload -> 'items', '[]'::jsonb))
    loop
      insert into public.meal_items
        (entry_id, user_id, name, portion, kcal, match_source, match_ref, position)
      values
        (new_id, auth.uid(),
         item ->> 'name',
         nullif(item ->> 'portion', ''),
         coalesce((item ->> 'kcal')::numeric, 0),
         coalesce(nullif(item ->> 'match_source', '')::public.food_source, 'manual'),
         nullif(item ->> 'match_ref', ''),
         idx);
      idx := idx + 1;
    end loop;

    return next new_id;
  end loop;

  update public.log_drafts
     set status = 'approved', resolved_at = now()
   where id = p_draft_id and user_id = auth.uid();
end;
$$;

create or replace function public.discard_draft(p_draft_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.log_drafts
     set status = 'discarded', resolved_at = now()
   where id = p_draft_id and user_id = auth.uid() and status = 'pending';
$$;

-- A meal and its priced items in one write. `p_items` is
-- [{name, portion, kcal, match_source, match_ref}].
create or replace function public.log_meal(
  p_label       text,
  p_items       jsonb,
  p_occurred_at timestamptz default now(),
  p_source      public.entry_source default 'manual'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_id uuid;
  item   jsonb;
  idx    int := 0;
begin
  insert into public.entries (user_id, module_slug, occurred_at, value, unit, label, source)
  values (auth.uid(), 'calories', p_occurred_at, 0, 'kcal', p_label, p_source)
  returning id into new_id;

  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into public.meal_items
      (entry_id, user_id, name, portion, kcal, match_source, match_ref, position)
    values
      (new_id, auth.uid(),
       item ->> 'name',
       nullif(item ->> 'portion', ''),
       coalesce((item ->> 'kcal')::numeric, 0),
       coalesce(nullif(item ->> 'match_source', '')::public.food_source, 'manual'),
       nullif(item ->> 'match_ref', ''),
       idx);
    idx := idx + 1;
  end loop;

  return new_id;
end;
$$;

-- One tap from a saved meal: copy its items in, and count the use.
create or replace function public.log_saved_meal(
  p_saved_meal_id uuid,
  p_occurred_at   timestamptz default now()
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  sm     public.saved_meals%rowtype;
  new_id uuid;
begin
  select * into sm from public.saved_meals
   where id = p_saved_meal_id and user_id = auth.uid();

  if sm.id is null then
    raise exception 'saved meal not found';
  end if;

  new_id := public.log_meal(sm.name, sm.items, p_occurred_at, 'saved_meal');

  update public.saved_meals set uses = uses + 1 where id = sm.id;
  return new_id;
end;
$$;

-- Save a logged meal — or a single item from it — for one-tap entry later.
create or replace function public.save_meal_from_entry(
  p_entry_id uuid,
  p_name     text,
  p_item_ids uuid[] default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_id uuid;
  items  jsonb;
  detail text;
  total  numeric;
begin
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'name', mi.name, 'portion', mi.portion, 'kcal', mi.kcal,
      'match_source', mi.match_source, 'match_ref', mi.match_ref) order by mi.position), '[]'::jsonb),
    string_agg(mi.name || coalesce(' ' || mi.portion, ''), ' · ' order by mi.position),
    coalesce(sum(mi.kcal), 0)
  into items, detail, total
  from public.meal_items mi
  where mi.entry_id = p_entry_id
    and mi.user_id = auth.uid()
    and (p_item_ids is null or mi.id = any (p_item_ids));

  insert into public.saved_meals (user_id, name, detail, kcal, items)
  values (auth.uid(), p_name, detail, total, items)
  returning id into new_id;

  return new_id;
end;
$$;

-- ── sharing ─────────────────────────────────────────────────────────────────
create or replace function public.request_connection(p_email text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  target uuid;
  conn   uuid;
begin
  select id into target from public.find_person(p_email);
  if target is null then
    raise exception 'no account for %', p_email;
  end if;

  select id into conn
    from public.connections
   where (requester_id = auth.uid() and addressee_id = target)
      or (requester_id = target and addressee_id = auth.uid());

  if conn is not null then
    return conn;
  end if;

  insert into public.connections (requester_id, addressee_id)
  values (auth.uid(), target)
  returning id into conn;

  return conn;
end;
$$;

create or replace function public.respond_to_connection(p_connection_id uuid, p_accept boolean)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.connections
     set status = case when p_accept then 'active'::public.connection_status
                       else 'declined'::public.connection_status end,
         responded_at = now()
   where id = p_connection_id
     and addressee_id = auth.uid()
     and status = 'pending';
$$;

create or replace function public.set_module_share(
  p_connection_id uuid,
  p_module_slug   text,
  p_granted       boolean
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_granted then
    insert into public.connection_shares (connection_id, owner_id, module_slug)
    values (p_connection_id, auth.uid(), p_module_slug)
    on conflict do nothing;
  else
    delete from public.connection_shares
     where connection_id = p_connection_id
       and owner_id = auth.uid()
       and module_slug = p_module_slug;
  end if;
end;
$$;
