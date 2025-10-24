-- 20251023_rls_enable.sql
-- Enable Row Level Security and add minimal owner-based policies for user-scoped tables.
-- This migration assumes auth.uid() is available on requests (via Supabase Auth or a trusted proxy).

-- journal_entries
alter table if exists journal_entries enable row level security;
create policy if not exists "journal_owner_select"
  on journal_entries for select
  using (user_id = auth.uid());
create policy if not exists "journal_owner_insert"
  on journal_entries for insert
  with check (user_id = auth.uid());
create policy if not exists "journal_owner_update"
  on journal_entries for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy if not exists "journal_owner_delete"
  on journal_entries for delete
  using (user_id = auth.uid());
create index if not exists idx_journal_user_created on journal_entries(user_id, created_at desc);

-- daily_mood
alter table if exists daily_mood enable row level security;
create policy if not exists "daily_mood_owner_select"
  on daily_mood for select
  using (user_id = auth.uid());
create policy if not exists "daily_mood_owner_upsert"
  on daily_mood for insert
  with check (user_id = auth.uid());
create policy if not exists "daily_mood_owner_update"
  on daily_mood for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy if not exists "daily_mood_owner_delete"
  on daily_mood for delete
  using (user_id = auth.uid());
create index if not exists idx_daily_mood_user_date on daily_mood(user_id, date desc);

-- calendar_events
alter table if exists calendar_events enable row level security;
create policy if not exists "calendar_events_owner_select"
  on calendar_events for select
  using (user_id = auth.uid());
create policy if not exists "calendar_events_owner_insert"
  on calendar_events for insert
  with check (user_id = auth.uid());
create policy if not exists "calendar_events_owner_update"
  on calendar_events for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy if not exists "calendar_events_owner_delete"
  on calendar_events for delete
  using (user_id = auth.uid());
create index if not exists idx_calendar_events_user_date on calendar_events(user_id, date desc);

-- chat_sessions
alter table if exists chat_sessions enable row level security;
create policy if not exists "chat_sessions_owner_select"
  on chat_sessions for select
  using (user_id = auth.uid());
create policy if not exists "chat_sessions_owner_insert"
  on chat_sessions for insert
  with check (user_id = auth.uid());
create policy if not exists "chat_sessions_owner_update"
  on chat_sessions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy if not exists "chat_sessions_owner_delete"
  on chat_sessions for delete
  using (user_id = auth.uid());
create index if not exists idx_chat_sessions_user_started on chat_sessions(user_id, started_at desc);

-- chat_messages
alter table if exists chat_messages enable row level security;
create policy if not exists "chat_messages_owner_select"
  on chat_messages for select
  using (user_id = auth.uid());
create policy if not exists "chat_messages_owner_insert"
  on chat_messages for insert
  with check (user_id = auth.uid());
create policy if not exists "chat_messages_owner_update"
  on chat_messages for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy if not exists "chat_messages_owner_delete"
  on chat_messages for delete
  using (user_id = auth.uid());
create index if not exists idx_chat_messages_user_created on chat_messages(user_id, created_at desc);

-- plans
alter table if exists plans enable row level security;
create policy if not exists "plans_owner_select"
  on plans for select
  using (user_id = auth.uid());
create policy if not exists "plans_owner_insert"
  on plans for insert
  with check (user_id = auth.uid());
create policy if not exists "plans_owner_update"
  on plans for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy if not exists "plans_owner_delete"
  on plans for delete
  using (user_id = auth.uid());
create index if not exists idx_plans_user_created on plans(user_id, created_at desc);

-- reports
alter table if exists reports enable row level security;
create policy if not exists "reports_owner_select"
  on reports for select
  using (user_id = auth.uid());
create policy if not exists "reports_owner_insert"
  on reports for insert
  with check (user_id = auth.uid());
create policy if not exists "reports_owner_update"
  on reports for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy if not exists "reports_owner_delete"
  on reports for delete
  using (user_id = auth.uid());
create index if not exists idx_reports_user_created on reports(user_id, created_at desc);

-- roleplay
alter table if exists roleplay enable row level security;
create policy if not exists "roleplay_owner_select"
  on roleplay for select
  using (user_id = auth.uid());
create policy if not exists "roleplay_owner_insert"
  on roleplay for insert
  with check (user_id = auth.uid());
create policy if not exists "roleplay_owner_update"
  on roleplay for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy if not exists "roleplay_owner_delete"
  on roleplay for delete
  using (user_id = auth.uid());
create index if not exists idx_roleplay_user_created on roleplay(user_id, created_at desc);

-- ufm
alter table if exists ufm enable row level security;
create policy if not exists "ufm_owner_select"
  on ufm for select
  using (user_id = auth.uid());
create policy if not exists "ufm_owner_insert"
  on ufm for insert
  with check (user_id = auth.uid());
create policy if not exists "ufm_owner_update"
  on ufm for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy if not exists "ufm_owner_delete"
  on ufm for delete
  using (user_id = auth.uid());
create index if not exists idx_ufm_user_created on ufm(user_id, created_at desc);

-- Optional: legacy CamelCase tables (best-effort if they exist)
-- DailyMood, JournalEntry, ChatSession, ChatMessage, Plan, Report, Roleplay, Ufm
alter table if exists "JournalEntry" enable row level security;
create policy if not exists "JournalEntry_owner_select"
  on "JournalEntry" for select using ("userId" = auth.uid());
create policy if not exists "JournalEntry_owner_insert"
  on "JournalEntry" for insert with check ("userId" = auth.uid());
create policy if not exists "JournalEntry_owner_update"
  on "JournalEntry" for update using ("userId" = auth.uid()) with check ("userId" = auth.uid());
create policy if not exists "JournalEntry_owner_delete"
  on "JournalEntry" for delete using ("userId" = auth.uid());

alter table if exists "DailyMood" enable row level security;
create policy if not exists "DailyMood_owner_select"
  on "DailyMood" for select using ("userId" = auth.uid());
create policy if not exists "DailyMood_owner_insert"
  on "DailyMood" for insert with check ("userId" = auth.uid());
create policy if not exists "DailyMood_owner_update"
  on "DailyMood" for update using ("userId" = auth.uid()) with check ("userId" = auth.uid());
create policy if not exists "DailyMood_owner_delete"
  on "DailyMood" for delete using ("userId" = auth.uid());

alter table if exists "ChatSession" enable row level security;
create policy if not exists "ChatSession_owner_select"
  on "ChatSession" for select using ("userId" = auth.uid());
create policy if not exists "ChatSession_owner_insert"
  on "ChatSession" for insert with check ("userId" = auth.uid());
create policy if not exists "ChatSession_owner_update"
  on "ChatSession" for update using ("userId" = auth.uid()) with check ("userId" = auth.uid());
create policy if not exists "ChatSession_owner_delete"
  on "ChatSession" for delete using ("userId" = auth.uid());

alter table if exists "ChatMessage" enable row level security;
create policy if not exists "ChatMessage_owner_select"
  on "ChatMessage" for select using ("userId" = auth.uid());
create policy if not exists "ChatMessage_owner_insert"
  on "ChatMessage" for insert with check ("userId" = auth.uid());
create policy if not exists "ChatMessage_owner_update"
  on "ChatMessage" for update using ("userId" = auth.uid()) with check ("userId" = auth.uid());
create policy if not exists "ChatMessage_owner_delete"
  on "ChatMessage" for delete using ("userId" = auth.uid());

-- End of migration
