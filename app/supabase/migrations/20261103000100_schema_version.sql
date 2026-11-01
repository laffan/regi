-- The client asks which schema it is talking to, so a database that missed a
-- migration says so on screen instead of quietly dropping data. (The first
-- feedback round's macros vanished on approval for exactly that reason: a
-- hosted database still running the original approve_draft.)
--
-- Bump the returned value in any migration the web client depends on, and
-- EXPECTED_SCHEMA in web/src/lib/schema.ts with it.

create or replace function public.schema_version()
returns text
language sql
stable
as $$
  select '20261103000100'::text;
$$;

grant execute on function public.schema_version() to anon, authenticated;
