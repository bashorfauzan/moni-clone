-- Add app tables to the Supabase Realtime publication.
-- Run this once in the Supabase SQL editor after the schema exists.

begin;

alter publication supabase_realtime add table public."Owner";
alter publication supabase_realtime add table public."Account";
alter publication supabase_realtime add table public."Activity";
alter publication supabase_realtime add table public."Transaction";
alter publication supabase_realtime add table public."NotificationInbox";
alter publication supabase_realtime add table public."Budget";
alter publication supabase_realtime add table public."Target";

commit;
