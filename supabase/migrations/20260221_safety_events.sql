create table if not exists public.safety_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid null,
  session_id text null,
  source text not null check (source in ('user_input', 'assistant_output', 'cta_click', 'cta_dismiss')),
  level text not null check (level in ('elevated', 'immediate')),
  trigger text null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_safety_events_created_at on public.safety_events (created_at desc);
create index if not exists idx_safety_events_user_id_created_at on public.safety_events (user_id, created_at desc);
create index if not exists idx_safety_events_session_id on public.safety_events (session_id);
