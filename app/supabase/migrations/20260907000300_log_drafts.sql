-- Text in, parsed on the server, reviewed, then approved. Nothing reaches a
-- module without passing review, so the parse lands here first.

create type public.draft_status as enum ('pending', 'approved', 'discarded');

create table public.log_drafts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  raw_text    text not null,
  status      public.draft_status not null default 'pending',
  parser      text not null default 'fallback',
  parse_error text,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create index log_drafts_user_idx on public.log_drafts (user_id, status, created_at desc);

create table public.log_draft_rows (
  id          uuid primary key default gen_random_uuid(),
  draft_id    uuid not null references public.log_drafts (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  module_slug text not null references public.modules (slug),
  label       text,
  value       numeric,
  unit        text,
  occurred_at timestamptz not null default now(),
  payload     jsonb not null default '{}'::jsonb,
  match_note  text,
  position    int not null default 0
);

comment on column public.log_draft_rows.match_note is
  'What the parser leaned on, shown beside the row: "USDA · 2 matches", "current book assumed".';
comment on column public.log_draft_rows.payload is
  'Calories rows carry {"items":[{name,portion,kcal,match_source,match_ref}]}; reading rows {"book_id","end_page"}.';

create index log_draft_rows_draft_idx on public.log_draft_rows (draft_id, position);
