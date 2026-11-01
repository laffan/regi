-- Accounts are created with time_zone 'UTC' and nothing ever changed it, so in
-- California an entry logged after 5 pm landed on tomorrow's calendar day and
-- the dashboard's "today" did not see it. Clients now report the browser's or
-- phone's zone; when the account was still on the untouched default, the
-- entries already logged are re-dated in the new zone as well.

create or replace function public.set_time_zone(p_tz text)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_tz text;
begin
  -- Rejects a name Postgres does not know before anything is written.
  perform now() at time zone p_tz;

  select time_zone into current_tz from public.profiles where id = auth.uid();
  if current_tz is null or current_tz = p_tz then
    return false;
  end if;

  update public.profiles set time_zone = p_tz where id = auth.uid();

  -- Only a never-set zone re-dates history: someone travelling keeps the days
  -- they logged where they logged them.
  if current_tz = 'UTC' then
    update public.entries
       set local_date = (occurred_at at time zone p_tz)::date
     where user_id = auth.uid();
  end if;

  return true;
end;
$$;

grant execute on function public.set_time_zone(text) to authenticated;
