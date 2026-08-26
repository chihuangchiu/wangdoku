-- WangDoKu multiplayer v1
-- Run once in Supabase Dashboard → SQL Editor.

create table if not exists public.match_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  puzzle jsonb not null,
  solution jsonb not null,
  host_id text not null check (char_length(host_id) between 12 and 128),
  guest_id text,
  status text not null default 'waiting' check (status in ('waiting', 'countdown', 'playing', 'finished')),
  started_at timestamptz,
  winner_id text,
  host_score integer not null default 0 check (host_score between 0 and 4),
  guest_score integer not null default 0 check (guest_score between 0 and 4),
  moves jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists match_rooms_code_idx on public.match_rooms (code);

-- The table is private. The browser only receives safe views through RPCs.
alter table public.match_rooms enable row level security;
revoke all on table public.match_rooms from anon, authenticated;

create or replace function public.match_room_view(r public.match_rooms)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', r.id,
    'code', r.code,
    'puzzle', r.puzzle,
    'host_id', r.host_id,
    'guest_id', r.guest_id,
    'status', r.status,
    'started_at', r.started_at,
    'winner_id', r.winner_id,
    'host_score', r.host_score,
    'guest_score', r.guest_score,
    'moves', r.moves,
    'updated_at', r.updated_at
  )
$$;

create or replace function public.create_match(
  p_code text,
  p_puzzle jsonb,
  p_solution jsonb,
  p_host_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r public.match_rooms;
begin
  if p_code !~ '^[A-Z0-9]{6}$' then raise exception 'Invalid room code'; end if;
  if jsonb_typeof(p_puzzle) <> 'object' or jsonb_typeof(p_solution) <> 'array' then raise exception 'Invalid puzzle'; end if;
  insert into public.match_rooms (code, puzzle, solution, host_id)
  values (p_code, p_puzzle, p_solution, p_host_id)
  returning * into r;
  return public.match_room_view(r);
end;
$$;

create or replace function public.join_match(p_code text, p_player_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r public.match_rooms;
begin
  select * into r from public.match_rooms where code = upper(p_code) for update;
  if not found then raise exception 'Room not found'; end if;
  if r.status <> 'waiting' and r.guest_id is distinct from p_player_id then raise exception 'Match already started'; end if;
  if r.host_id = p_player_id then return public.match_room_view(r); end if;
  if r.guest_id is not null and r.guest_id <> p_player_id then raise exception 'Room is full'; end if;
  update public.match_rooms
    set guest_id = p_player_id, status = 'countdown', started_at = now() + interval '3 seconds', updated_at = now()
    where id = r.id
    returning * into r;
  return public.match_room_view(r);
end;
$$;

create or replace function public.get_match(p_code text, p_player_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r public.match_rooms;
begin
  select * into r from public.match_rooms where code = upper(p_code);
  if not found then raise exception 'Room not found'; end if;
  if p_player_id <> r.host_id and p_player_id is distinct from r.guest_id then raise exception 'Not a player in this room'; end if;
  if r.status = 'countdown' and r.started_at <= now() then
    update public.match_rooms set status = 'playing', updated_at = now() where id = r.id returning * into r;
  end if;
  return public.match_room_view(r);
end;
$$;

create or replace function public.play_match_move(
  p_code text,
  p_player_id text,
  p_row integer,
  p_col integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r public.match_rooms;
declare key text := p_row::text || ',' || p_col::text;
declare expected_col integer;
declare is_host boolean;
declare next_score integer;
begin
  select * into r from public.match_rooms where code = upper(p_code) for update;
  if not found then raise exception 'Room not found'; end if;
  if p_player_id <> r.host_id and p_player_id is distinct from r.guest_id then raise exception 'Not a player in this room'; end if;
  if r.status = 'countdown' and r.started_at <= now() then r.status := 'playing'; end if;
  if r.status <> 'playing' then raise exception 'Match has not started'; end if;
  if p_row < 0 or p_col < 0 or p_row >= jsonb_array_length(r.solution) or p_col >= jsonb_array_length(r.solution) then raise exception 'Invalid cell'; end if;
  if r.moves ? key then return public.match_room_view(r); end if;

  is_host := p_player_id = r.host_id;
  expected_col := (r.solution ->> p_row)::integer;
  if expected_col <> p_col then
    update public.match_rooms
      set status = 'finished', winner_id = case when is_host then r.guest_id else r.host_id end,
          updated_at = now()
      where id = r.id returning * into r;
    return public.match_room_view(r);
  end if;

  next_score := case when is_host then r.host_score + 1 else r.guest_score + 1 end;
  update public.match_rooms
    set moves = r.moves || jsonb_build_object(key, p_player_id),
        host_score = case when is_host then next_score else r.host_score end,
        guest_score = case when is_host then r.guest_score else next_score end,
        status = case when next_score >= 4 then 'finished' else 'playing' end,
        winner_id = case when next_score >= 4 then p_player_id else null end,
        updated_at = now()
    where id = r.id returning * into r;
  return public.match_room_view(r);
end;
$$;

create or replace function public.leave_match(p_code text, p_player_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.match_rooms
  where code = upper(p_code) and host_id = p_player_id and status = 'waiting';
end;
$$;

grant execute on function public.create_match(text, jsonb, jsonb, text) to anon, authenticated;
grant execute on function public.join_match(text, text) to anon, authenticated;
grant execute on function public.get_match(text, text) to anon, authenticated;
grant execute on function public.play_match_move(text, text, integer, integer) to anon, authenticated;
grant execute on function public.leave_match(text, text) to anon, authenticated;
