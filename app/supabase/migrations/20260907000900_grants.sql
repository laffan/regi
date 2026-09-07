-- Explicit grants. A hosted Supabase project would hand most of these out
-- through default privileges; stating them keeps the schema portable and makes
-- it obvious that RLS, not table privilege, is what does the gatekeeping.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on
  public.profiles,
  public.user_modules,
  public.entries,
  public.meal_items,
  public.saved_meals,
  public.books,
  public.goals,
  public.log_drafts,
  public.log_draft_rows,
  public.connections,
  public.connection_shares
to authenticated;

grant select on public.modules, public.food_cache to authenticated;

grant select on
  public.daily_module_totals,
  public.published_series,
  public.entry_feed,
  public.my_connections
to authenticated;

grant usage, select on all sequences in schema public to authenticated;

grant execute on function
  public.approve_draft(uuid),
  public.discard_draft(uuid),
  public.log_meal(text, jsonb, timestamptz, public.entry_source),
  public.log_saved_meal(uuid, timestamptz),
  public.save_meal_from_entry(uuid, text, uuid[]),
  public.request_connection(text),
  public.respond_to_connection(uuid, boolean),
  public.set_module_share(uuid, text, boolean),
  public.shares_module(uuid, uuid, text),
  public.shares_anything(uuid, uuid)
to authenticated;

-- Only the edge functions (service role) write nutrition matches.
grant insert, update on public.food_cache to service_role;
grant usage, select on sequence public.food_cache_id_seq to service_role;
