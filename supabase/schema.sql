create extension if not exists pgcrypto;

create table if not exists public.members (
  id text primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('income', 'expense')),
  date date not null,
  title text not null,
  amount integer not null check (amount >= 0),
  member_id text references public.members(id),
  category text not null,
  note text,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id text,
  action text not null,
  target_table text,
  target_id text,
  created_at timestamptz not null default now()
);

insert into public.members (id, name)
values
  ('member-tsai', '蔡'),
  ('member-chen', '陳'),
  ('member-lin', '林')
on conflict (id) do update set name = excluded.name;

alter table public.members enable row level security;
alter table public.transactions enable row level security;
alter table public.audit_logs enable row level security;

create policy "Authenticated users can read members"
  on public.members for select
  to authenticated
  using (true);

create policy "Authenticated users can read transactions"
  on public.transactions for select
  to authenticated
  using (true);

create policy "Authenticated users can write transactions"
  on public.transactions for insert
  to authenticated
  with check (true);

create policy "Authenticated users can read audit logs"
  on public.audit_logs for select
  to authenticated
  using (true);
