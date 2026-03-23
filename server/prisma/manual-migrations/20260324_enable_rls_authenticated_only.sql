-- RLS baseline for current schema.
-- This blocks anonymous access while allowing any signed-in user to use the app.
-- NOTE: this is NOT per-user isolation yet because the schema does not link rows to auth.users.

begin;

alter table public."Owner" enable row level security;
alter table public."Account" enable row level security;
alter table public."Activity" enable row level security;
alter table public."Transaction" enable row level security;
alter table public."NotificationInbox" enable row level security;
alter table public."Budget" enable row level security;
alter table public."Target" enable row level security;

alter table public."Owner" force row level security;
alter table public."Account" force row level security;
alter table public."Activity" force row level security;
alter table public."Transaction" force row level security;
alter table public."NotificationInbox" force row level security;
alter table public."Budget" force row level security;
alter table public."Target" force row level security;

drop policy if exists owner_authenticated_select on public."Owner";
drop policy if exists owner_authenticated_insert on public."Owner";
drop policy if exists owner_authenticated_update on public."Owner";
drop policy if exists owner_authenticated_delete on public."Owner";

create policy owner_authenticated_select on public."Owner"
for select to authenticated
using (true);

create policy owner_authenticated_insert on public."Owner"
for insert to authenticated
with check (true);

create policy owner_authenticated_update on public."Owner"
for update to authenticated
using (true)
with check (true);

create policy owner_authenticated_delete on public."Owner"
for delete to authenticated
using (true);

drop policy if exists account_authenticated_select on public."Account";
drop policy if exists account_authenticated_insert on public."Account";
drop policy if exists account_authenticated_update on public."Account";
drop policy if exists account_authenticated_delete on public."Account";

create policy account_authenticated_select on public."Account"
for select to authenticated
using (true);

create policy account_authenticated_insert on public."Account"
for insert to authenticated
with check (true);

create policy account_authenticated_update on public."Account"
for update to authenticated
using (true)
with check (true);

create policy account_authenticated_delete on public."Account"
for delete to authenticated
using (true);

drop policy if exists activity_authenticated_select on public."Activity";
drop policy if exists activity_authenticated_insert on public."Activity";
drop policy if exists activity_authenticated_update on public."Activity";
drop policy if exists activity_authenticated_delete on public."Activity";

create policy activity_authenticated_select on public."Activity"
for select to authenticated
using (true);

create policy activity_authenticated_insert on public."Activity"
for insert to authenticated
with check (true);

create policy activity_authenticated_update on public."Activity"
for update to authenticated
using (true)
with check (true);

create policy activity_authenticated_delete on public."Activity"
for delete to authenticated
using (true);

drop policy if exists transaction_authenticated_select on public."Transaction";
drop policy if exists transaction_authenticated_insert on public."Transaction";
drop policy if exists transaction_authenticated_update on public."Transaction";
drop policy if exists transaction_authenticated_delete on public."Transaction";

create policy transaction_authenticated_select on public."Transaction"
for select to authenticated
using (true);

create policy transaction_authenticated_insert on public."Transaction"
for insert to authenticated
with check (true);

create policy transaction_authenticated_update on public."Transaction"
for update to authenticated
using (true)
with check (true);

create policy transaction_authenticated_delete on public."Transaction"
for delete to authenticated
using (true);

drop policy if exists notification_authenticated_select on public."NotificationInbox";
drop policy if exists notification_authenticated_insert on public."NotificationInbox";
drop policy if exists notification_authenticated_update on public."NotificationInbox";
drop policy if exists notification_authenticated_delete on public."NotificationInbox";

create policy notification_authenticated_select on public."NotificationInbox"
for select to authenticated
using (true);

create policy notification_authenticated_insert on public."NotificationInbox"
for insert to authenticated
with check (true);

create policy notification_authenticated_update on public."NotificationInbox"
for update to authenticated
using (true)
with check (true);

create policy notification_authenticated_delete on public."NotificationInbox"
for delete to authenticated
using (true);

drop policy if exists budget_authenticated_select on public."Budget";
drop policy if exists budget_authenticated_insert on public."Budget";
drop policy if exists budget_authenticated_update on public."Budget";
drop policy if exists budget_authenticated_delete on public."Budget";

create policy budget_authenticated_select on public."Budget"
for select to authenticated
using (true);

create policy budget_authenticated_insert on public."Budget"
for insert to authenticated
with check (true);

create policy budget_authenticated_update on public."Budget"
for update to authenticated
using (true)
with check (true);

create policy budget_authenticated_delete on public."Budget"
for delete to authenticated
using (true);

drop policy if exists target_authenticated_select on public."Target";
drop policy if exists target_authenticated_insert on public."Target";
drop policy if exists target_authenticated_update on public."Target";
drop policy if exists target_authenticated_delete on public."Target";

create policy target_authenticated_select on public."Target"
for select to authenticated
using (true);

create policy target_authenticated_insert on public."Target"
for insert to authenticated
with check (true);

create policy target_authenticated_update on public."Target"
for update to authenticated
using (true)
with check (true);

create policy target_authenticated_delete on public."Target"
for delete to authenticated
using (true);

commit;
