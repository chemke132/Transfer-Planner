-- Feedback table — anyone can INSERT, only service_role can read/edit.
-- Run this in Supabase SQL editor (one-time).

create table if not exists feedback (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  message text not null check (char_length(message) between 1 and 5000),
  contact text check (contact is null or char_length(contact) <= 200),
  page text,
  setup jsonb,
  user_agent text
);

alter table feedback enable row level security;

-- Anyone (anon, including not-logged-in browsers) can submit feedback.
drop policy if exists "anon can insert feedback" on feedback;
create policy "anon can insert feedback"
  on feedback for insert
  to anon
  with check (true);

-- No SELECT policy for anon → users can't read other people's feedback.
-- service_role bypasses RLS, so dashboard / scraper scripts can still read all.

-- Optional: rate-limit via a unique constraint on (message, contact) within
-- a short window. Skipped for MVP — abuse is unlikely with friend-only sharing.
