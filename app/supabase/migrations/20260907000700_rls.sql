-- Row level security. The rule everywhere: you own your rows, and a connection
-- reads a row only if you granted them that row's module.

alter table public.profiles          enable row level security;
alter table public.modules           enable row level security;
alter table public.user_modules      enable row level security;
alter table public.entries           enable row level security;
alter table public.meal_items        enable row level security;
alter table public.saved_meals       enable row level security;
alter table public.books             enable row level security;
alter table public.goals             enable row level security;
alter table public.log_drafts        enable row level security;
alter table public.log_draft_rows    enable row level security;
alter table public.connections       enable row level security;
alter table public.connection_shares enable row level security;
alter table public.food_cache        enable row level security;

-- ── catalog ─────────────────────────────────────────────────────────────────
create policy modules_read on public.modules
  for select to authenticated using (true);

-- ── profiles ────────────────────────────────────────────────────────────────
-- Yourself, plus anyone you have a connection with (pending included, so a
-- request shows a name rather than a bare id).
create policy profiles_read on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.connections c
       where (c.requester_id = auth.uid() and c.addressee_id = profiles.id)
          or (c.addressee_id = auth.uid() and c.requester_id = profiles.id)
    )
  );

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ── activation ──────────────────────────────────────────────────────────────
create policy user_modules_read on public.user_modules
  for select to authenticated
  using (user_id = auth.uid() or public.shares_anything(user_id, auth.uid()));

create policy user_modules_write on public.user_modules
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── entries and their module tables ─────────────────────────────────────────
create policy entries_read on public.entries
  for select to authenticated
  using (user_id = auth.uid() or public.shares_module(user_id, auth.uid(), module_slug));

create policy entries_write on public.entries
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy meal_items_read on public.meal_items
  for select to authenticated
  using (user_id = auth.uid() or public.shares_module(user_id, auth.uid(), 'calories'));

create policy meal_items_write on public.meal_items
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy books_read on public.books
  for select to authenticated
  using (user_id = auth.uid() or public.shares_module(user_id, auth.uid(), 'reading'));

create policy books_write on public.books
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Saved meals are a personal shortcut, never shared.
create policy saved_meals_own on public.saved_meals
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy goals_read on public.goals
  for select to authenticated
  using (user_id = auth.uid() or public.shares_module(user_id, auth.uid(), module_slug));

create policy goals_write on public.goals
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── drafts are private until approved ───────────────────────────────────────
create policy log_drafts_own on public.log_drafts
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy log_draft_rows_own on public.log_draft_rows
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── sharing ─────────────────────────────────────────────────────────────────
create policy connections_read on public.connections
  for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

create policy connections_request on public.connections
  for insert to authenticated
  with check (requester_id = auth.uid());

-- The addressee accepts or declines; the requester cancels or revokes.
create policy connections_respond on public.connections
  for update to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid())
  with check (requester_id = auth.uid() or addressee_id = auth.uid());

create policy connections_delete on public.connections
  for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

create policy connection_shares_read on public.connection_shares
  for select to authenticated
  using (
    exists (
      select 1 from public.connections c
       where c.id = connection_shares.connection_id
         and (c.requester_id = auth.uid() or c.addressee_id = auth.uid())
    )
  );

-- You may only grant your own modules, and only on a connection you are in.
create policy connection_shares_write on public.connection_shares
  for all to authenticated
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.connections c
       where c.id = connection_shares.connection_id
         and (c.requester_id = auth.uid() or c.addressee_id = auth.uid())
    )
  )
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.connections c
       where c.id = connection_shares.connection_id
         and (c.requester_id = auth.uid() or c.addressee_id = auth.uid())
    )
  );

-- ── food cache ──────────────────────────────────────────────────────────────
-- Readable by anyone signed in (it is public nutrition data); only the edge
-- functions, which use the service role, write to it.
create policy food_cache_read on public.food_cache
  for select to authenticated using (true);
