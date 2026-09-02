-- =========================================================
-- CONVIDADOS — SCHEMA SUPABASE (v3: múltiplos dias + horário de volta)
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em "Run".
-- Pode rodar por cima de uma versão anterior sem problema — ele remove
-- as tabelas/funções antigas antes de recriar tudo (isso apaga as
-- respostas de presença já dadas, mas a lista de convidados é
-- recriada igual, então ninguém perde o acesso).
-- =========================================================

create extension if not exists "pgcrypto";

-- 0) LIMPA UMA VERSÃO ANTERIOR (se existir)
drop view if exists public.guests_public;
drop function if exists public.create_guest(text, text, date, time, date, time);
drop function if exists public.get_guest_by_token(uuid);
drop function if exists public.update_guest_by_token(uuid, text, text, date, time, date, time);
drop function if exists public.get_guest_by_phone(text);
drop function if exists public.submit_rsvp(text, text, time);
drop function if exists public.submit_rsvp(text, boolean, boolean, boolean, time, time);
drop function if exists public.get_attendance_summary();
drop function if exists public.get_guests_by_day(text);
drop function if exists public.normalize_phone(text);
drop table if exists public.guests cascade;

-- =========================================================
-- 1) NORMALIZAÇÃO DE TELEFONE
-- Aceita "+55 81 9 7346-237", "997346237" ou "97346237" e sempre
-- devolve os 8 dígitos finais (o "9" inicial do celular é opcional).
-- =========================================================
create or replace function public.normalize_phone(p_raw text)
returns text
language plpgsql
immutable
as $$
declare
  v_digits text;
begin
  v_digits := regexp_replace(coalesce(p_raw, ''), '\D', '', 'g');
  if left(v_digits, 4) = '5581' then
    v_digits := substring(v_digits from 5);
  elsif left(v_digits, 2) = '81' and length(v_digits) > 9 then
    v_digits := substring(v_digits from 3);
  end if;
  if length(v_digits) = 9 then
    v_digits := substring(v_digits from 2);
  end if;
  return v_digits;
end;
$$;

-- =========================================================
-- 2) TABELA — lista fechada de convidados
-- =========================================================
create table public.guests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  day_saturday boolean not null default false,
  day_sunday boolean not null default false,
  day_monday boolean not null default false,
  arrival_time time,
  departure_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.guests enable row level security;
revoke all on public.guests from anon, authenticated;
-- (sem policies -> ninguém acessa a tabela direto; só pelas funções abaixo)

-- =========================================================
-- 3) SEED — a lista de convidados
-- Troque/adicione linhas aqui se a lista mudar.
-- =========================================================
insert into public.guests (name, phone) values
  ('André',   public.normalize_phone('96496804')),
  ('Fabi',    public.normalize_phone('97309133')),
  ('Favu',    public.normalize_phone('99591775')),
  ('Jubs',    public.normalize_phone('99546657')),
  ('Jéss',    public.normalize_phone('89240589')),
  ('Thullyo', public.normalize_phone('92427637')),
  ('Yana',    public.normalize_phone('97965989')),
  ('Mary',    public.normalize_phone('98816242')),
  ('Guigo',   public.normalize_phone('997346237'))
on conflict (phone) do nothing;

-- =========================================================
-- 4) RPC — login / buscar convidado pelo telefone
-- =========================================================
create or replace function public.get_guest_by_phone(p_phone text)
returns table (
  id uuid, name text,
  day_saturday boolean, day_sunday boolean, day_monday boolean,
  arrival_time time, departure_time time
)
language sql
security definer
set search_path = public
as $$
  select id, name, day_saturday, day_sunday, day_monday, arrival_time, departure_time
  from public.guests
  where phone = public.normalize_phone(p_phone);
$$;

revoke all on function public.get_guest_by_phone from public;
grant execute on function public.get_guest_by_phone to anon, authenticated;

-- =========================================================
-- 5) RPC — confirmar / atualizar presença (múltiplos dias + 2 horários)
-- =========================================================
create or replace function public.submit_rsvp(
  p_phone text,
  p_day_saturday boolean,
  p_day_sunday boolean,
  p_day_monday boolean,
  p_arrival_time time,
  p_departure_time time
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.guests
  set day_saturday = coalesce(p_day_saturday, false),
      day_sunday = coalesce(p_day_sunday, false),
      day_monday = coalesce(p_day_monday, false),
      arrival_time = p_arrival_time,
      departure_time = p_departure_time,
      updated_at = now()
  where phone = public.normalize_phone(p_phone)
  returning guests.id into v_id;

  if v_id is null then
    raise exception 'convidado não encontrado';
  end if;

  return query select v_id;
end;
$$;

revoke all on function public.submit_rsvp from public;
grant execute on function public.submit_rsvp to anon, authenticated;

-- =========================================================
-- 6) RPC — resumo agregado (sem nomes, seguro para todo mundo ver)
-- =========================================================
create or replace function public.get_attendance_summary()
returns table (total bigint, saturday bigint, sunday bigint, monday bigint)
language sql
security definer
set search_path = public
as $$
  select
    count(*) filter (where day_saturday or day_sunday or day_monday) as total,
    count(*) filter (where day_saturday) as saturday,
    count(*) filter (where day_sunday) as sunday,
    count(*) filter (where day_monday) as monday
  from public.guests;
$$;

revoke all on function public.get_attendance_summary from public;
grant execute on function public.get_attendance_summary to anon, authenticated;

-- =========================================================
-- 7) RPC — quem confirmou num dia específico (nome + horários, sem telefone)
-- O front-end decide se mostra o horário de chegada, de saída ou "Dia todo",
-- comparando esse dia com o primeiro e o último dia marcados pelo convidado.
-- =========================================================
create or replace function public.get_guests_by_day(p_day text)
returns table (
  name text,
  day_saturday boolean, day_sunday boolean, day_monday boolean,
  arrival_time time, departure_time time
)
language sql
security definer
set search_path = public
as $$
  select name, day_saturday, day_sunday, day_monday, arrival_time, departure_time
  from public.guests
  where
    case p_day
      when 'saturday' then day_saturday
      when 'sunday' then day_sunday
      when 'monday' then day_monday
      else false
    end
  order by name;
$$;

revoke all on function public.get_guests_by_day from public;
grant execute on function public.get_guests_by_day to anon, authenticated;

-- =========================================================
-- FIM. Você terá:
--   - tabela  public.guests                  (bloqueada para acesso direto)
--   - função  public.get_guest_by_phone(...)      (login)
--   - função  public.submit_rsvp(...)             (confirmar/atualizar presença)
--   - função  public.get_attendance_summary()     (contagem por dia, sem nomes)
--   - função  public.get_guests_by_day(...)       (nomes + horários por dia)
-- =========================================================
