-- Meu Treino Pro: armazenamento individual por conta
-- Execute este arquivo no SQL Editor do seu projeto Supabase.

create table if not exists public.user_workout_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_workout_data enable row level security;

drop policy if exists "Cada pessoa pode ler seus próprios dados" on public.user_workout_data;
create policy "Cada pessoa pode ler seus próprios dados"
  on public.user_workout_data
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Cada pessoa pode criar seus próprios dados" on public.user_workout_data;
create policy "Cada pessoa pode criar seus próprios dados"
  on public.user_workout_data
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Cada pessoa pode atualizar seus próprios dados" on public.user_workout_data;
create policy "Cada pessoa pode atualizar seus próprios dados"
  on public.user_workout_data
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.user_workout_data to authenticated;

create or replace function public.set_user_workout_data_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_workout_data_updated_at on public.user_workout_data;
create trigger set_user_workout_data_updated_at
before update on public.user_workout_data
for each row execute function public.set_user_workout_data_updated_at();
