-- =============================================================================
-- Pickleball Queue — Supabase schema, policies and server-side functions
--
-- Run this whole file once in the Supabase SQL editor (or `psql -f`).
-- It is idempotent-ish for a fresh project; to start over, drop the tables
-- and the pbq_private schema first (see README).
--
-- Security model
--   * The browser only uses the public "anon" key.
--   * Tables are READ-ONLY to the public (RLS select policies, no write grants).
--   * Every write goes through a SECURITY DEFINER function below. Organizer
--     functions require the session's organizer key; only its SHA-256 hash is
--     stored, in a table the public cannot read at all.
--   * Each function locks the session row (SELECT ... FOR UPDATE), so
--     simultaneous calls for the same session run one after another and the
--     queue can never be advanced twice by a double click.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

create schema if not exists pbq_private;
revoke all on schema pbq_private from public;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

-- Single-row settings table. Holds the bcrypt hash of the PIN required to
-- create sessions. Never readable by the public.
create table if not exists pbq_private.app_settings (
  id                 int primary key default 1 check (id = 1),
  creation_pin_hash  text not null
);

create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  name          text not null check (char_length(name) between 1 and 40),
  status        text not null default 'open' check (status in ('open', 'closed')),
  is_paused     boolean not null default false,
  round_count   int not null default 0,
  -- bumped on every change; clients subscribe to this row via Realtime
  version       bigint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists pbq_private.session_secrets (
  session_id      uuid primary key references public.sessions(id) on delete cascade,
  admin_key_hash  bytea not null
);

create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 24),
  name_key    text generated always as (lower(name)) stored,
  state       text not null default 'waiting' check (state in ('waiting', 'playing')),
  -- FIFO order. Lower = earlier. Playing players keep their position until the
  -- game ends, then they get new positions at the back.
  queue_pos   bigint not null,
  joined_at   timestamptz not null default now(),
  -- a name can only appear once per session (case-insensitive)
  constraint players_unique_name unique (session_id, name_key),
  -- no two players share a position (deferred so swaps work in one statement)
  constraint players_unique_pos unique (session_id, queue_pos) deferrable initially deferred
);
create index if not exists players_session_pos_idx on public.players (session_id, queue_pos);

create table if not exists pbq_private.player_tokens (
  player_id   uuid primary key references public.players(id) on delete cascade,
  token_hash  bytea not null
);

-- Basic game history: one row per round.
create table if not exists public.rounds (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.sessions(id) on delete cascade,
  round_number  int not null,
  player_names  text[] not null default '{}',
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  constraint rounds_unique_number unique (session_id, round_number)
);
-- at most ONE active (not ended) game per session — enforced by the database
create unique index if not exists rounds_one_active_idx
  on public.rounds (session_id) where ended_at is null;

-- -----------------------------------------------------------------------------
-- Access policies: public may read sessions/players/rounds, nothing else.
-- -----------------------------------------------------------------------------

alter table public.sessions enable row level security;
alter table public.players  enable row level security;
alter table public.rounds   enable row level security;
alter table pbq_private.app_settings    enable row level security;
alter table pbq_private.session_secrets enable row level security;
alter table pbq_private.player_tokens   enable row level security;

drop policy if exists "public read sessions" on public.sessions;
create policy "public read sessions" on public.sessions for select using (true);
drop policy if exists "public read players" on public.players;
create policy "public read players"  on public.players  for select using (true);
drop policy if exists "public read rounds" on public.rounds;
create policy "public read rounds"   on public.rounds   for select using (true);

revoke all on public.sessions, public.players, public.rounds from anon, authenticated;
grant select on public.sessions, public.players, public.rounds to anon, authenticated;
revoke all on all tables in schema pbq_private from anon, authenticated, public;

-- Realtime: broadcast changes of the sessions row (its version bumps on every
-- change, so clients only need this one subscription).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sessions'
     ) then
    alter publication supabase_realtime add table public.sessions;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Private helpers (not callable by the public)
-- -----------------------------------------------------------------------------

create or replace function pbq_private.fail(p_code text)
returns void language plpgsql as $$
begin
  raise exception using errcode = 'P0001', message = p_code;
end $$;

create or replace function pbq_private.random_token(p_bytes int)
returns text language sql volatile
set search_path = pg_catalog, extensions
as $$
  select translate(encode(extensions.gen_random_bytes(p_bytes), 'base64'), '+/=', '-_');
$$;

create or replace function pbq_private.hash_token(p_token text)
returns bytea language sql immutable
set search_path = pg_catalog, extensions
as $$
  select extensions.digest(coalesce(p_token, ''), 'sha256');
$$;

-- Locks and returns the session; fails if it does not exist.
create or replace function pbq_private.lock_session(p_code text)
returns public.sessions language plpgsql
set search_path = pg_catalog, public
as $$
declare v public.sessions;
begin
  select * into v from public.sessions where code = upper(btrim(p_code)) for update;
  if not found then perform pbq_private.fail('SESSION_NOT_FOUND'); end if;
  return v;
end $$;

-- Locks the session AND verifies the organizer key.
create or replace function pbq_private.lock_session_admin(p_code text, p_admin_key text)
returns public.sessions language plpgsql
set search_path = pg_catalog, public, pbq_private
as $$
declare v public.sessions;
begin
  v := pbq_private.lock_session(p_code);
  if not exists (
    select 1 from pbq_private.session_secrets s
    where s.session_id = v.id and s.admin_key_hash = pbq_private.hash_token(p_admin_key)
  ) then
    perform pbq_private.fail('NOT_AUTHORIZED');
  end if;
  return v;
end $$;

-- A game can't be ended within this many seconds of starting. This stops an
-- accidental double tap on "End game" (or "Start" then "End", which sit in
-- the same spot) from ending the game that just started.
create or replace function pbq_private.min_round_seconds()
returns int language sql immutable as $$ select 10 $$;

create or replace function pbq_private.bump(p_session_id uuid)
returns void language sql
set search_path = pg_catalog, public
as $$
  update public.sessions set version = version + 1, updated_at = now() where id = p_session_id;
$$;

create or replace function pbq_private.sync_round_names(p_session_id uuid)
returns void language sql
set search_path = pg_catalog, public
as $$
  update public.rounds r
     set player_names = coalesce((
           select array_agg(p.name order by p.queue_pos)
             from public.players p
            where p.session_id = p_session_id and p.state = 'playing'), '{}')
   where r.session_id = p_session_id and r.ended_at is null;
$$;

-- If a game is running with fewer than 4 players (someone left), pull the
-- next waiting players in from the front of the queue.
create or replace function pbq_private.fill_game(p_session_id uuid)
returns void language plpgsql
set search_path = pg_catalog, public, pbq_private
as $$
declare v_missing int;
begin
  if not exists (select 1 from public.rounds where session_id = p_session_id and ended_at is null) then
    return;
  end if;
  select 4 - count(*) into v_missing from public.players
   where session_id = p_session_id and state = 'playing';
  if v_missing > 0 then
    update public.players set state = 'playing'
     where id in (select id from public.players
                   where session_id = p_session_id and state = 'waiting'
                   order by queue_pos limit v_missing);
    perform pbq_private.sync_round_names(p_session_id);
  end if;
end $$;

-- Starts a game with the first 4 waiting players if allowed. Returns true if
-- a game was started.
create or replace function pbq_private.try_start(p_session public.sessions)
returns boolean language plpgsql
set search_path = pg_catalog, public, pbq_private
as $$
declare v_round int;
begin
  if p_session.status <> 'open' or p_session.is_paused then return false; end if;
  if exists (select 1 from public.rounds where session_id = p_session.id and ended_at is null) then
    return false;
  end if;
  if (select count(*) from public.players where session_id = p_session.id and state = 'waiting') < 4 then
    return false;
  end if;

  update public.players set state = 'playing'
   where id in (select id from public.players
                 where session_id = p_session.id and state = 'waiting'
                 order by queue_pos limit 4);

  update public.sessions set round_count = round_count + 1
   where id = p_session.id returning round_count into v_round;

  insert into public.rounds (session_id, round_number) values (p_session.id, v_round);
  perform pbq_private.sync_round_names(p_session.id);
  return true;
end $$;

-- Removes a player; if they were playing, the next waiting player fills in.
create or replace function pbq_private.remove_player(p_session_id uuid, p_player_id uuid)
returns void language plpgsql
set search_path = pg_catalog, public, pbq_private
as $$
begin
  delete from public.players where id = p_player_id and session_id = p_session_id;
  if found then
    perform pbq_private.fill_game(p_session_id);
    perform pbq_private.sync_round_names(p_session_id);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Public API — player functions
-- -----------------------------------------------------------------------------

-- Organizer creates a session with the creation PIN. Returns the session code
-- and the organizer key (shown only once; only its hash is stored).
create or replace function public.create_session(p_name text, p_pin text)
returns json language plpgsql security definer
set search_path = pg_catalog, public, pbq_private, extensions
as $$
declare
  v_hash  text;
  v_name  text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_code  text;
  v_key   text;
  v_id    uuid;
  v_alpha constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
begin
  select creation_pin_hash into v_hash from pbq_private.app_settings where id = 1;
  if v_hash is null then perform pbq_private.fail('PIN_NOT_CONFIGURED'); end if;
  if extensions.crypt(coalesce(p_pin, ''), v_hash) <> v_hash then
    perform pbq_private.fail('INVALID_PIN');
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    perform pbq_private.fail('INVALID_SESSION_NAME');
  end if;

  loop
    v_bytes := extensions.gen_random_bytes(6);
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(v_alpha, 1 + (get_byte(v_bytes, i) % length(v_alpha)), 1);
    end loop;
    exit when not exists (select 1 from public.sessions where code = v_code);
  end loop;

  v_key := pbq_private.random_token(24);
  insert into public.sessions (code, name) values (v_code, v_name) returning id into v_id;
  insert into pbq_private.session_secrets (session_id, admin_key_hash)
    values (v_id, pbq_private.hash_token(v_key));

  return json_build_object('code', v_code, 'admin_key', v_key);
end $$;

-- A player joins the back of the queue. Returns their id and a private token
-- (stored on their phone) that lets them leave later.
create or replace function public.join_queue(p_code text, p_name text)
returns json language plpgsql security definer
set search_path = pg_catalog, public, pbq_private
as $$
declare
  v_s     public.sessions;
  v_name  text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_pos   bigint;
  v_id    uuid;
  v_token text;
begin
  v_s := pbq_private.lock_session(p_code);
  if v_s.status <> 'open' then perform pbq_private.fail('SESSION_CLOSED'); end if;
  if char_length(v_name) < 1 or char_length(v_name) > 24 then
    perform pbq_private.fail('INVALID_NAME');
  end if;
  if exists (select 1 from public.players where session_id = v_s.id and name_key = lower(v_name)) then
    perform pbq_private.fail('NAME_TAKEN');
  end if;
  if (select count(*) from public.players where session_id = v_s.id) >= 40 then
    perform pbq_private.fail('SESSION_FULL');
  end if;

  select coalesce(max(queue_pos), 0) + 1 into v_pos from public.players where session_id = v_s.id;
  insert into public.players (session_id, name, queue_pos) values (v_s.id, v_name, v_pos)
    returning id into v_id;

  v_token := pbq_private.random_token(24);
  insert into pbq_private.player_tokens (player_id, token_hash)
    values (v_id, pbq_private.hash_token(v_token));

  perform pbq_private.fill_game(v_s.id);
  perform pbq_private.bump(v_s.id);
  return json_build_object('player_id', v_id, 'player_token', v_token);
end $$;

-- A player leaves (only with their own token). Leaving twice is a no-op.
create or replace function public.leave_queue(p_code text, p_player_id uuid, p_player_token text)
returns void language plpgsql security definer
set search_path = pg_catalog, public, pbq_private
as $$
declare v_s public.sessions;
begin
  v_s := pbq_private.lock_session(p_code);
  if not exists (select 1 from public.players where id = p_player_id and session_id = v_s.id) then
    return;
  end if;
  if not exists (
    select 1 from pbq_private.player_tokens
     where player_id = p_player_id and token_hash = pbq_private.hash_token(p_player_token)
  ) then
    perform pbq_private.fail('NOT_AUTHORIZED');
  end if;
  perform pbq_private.remove_player(v_s.id, p_player_id);
  perform pbq_private.bump(v_s.id);
end $$;

-- -----------------------------------------------------------------------------
-- Public API — organizer functions (all require the organizer key)
-- -----------------------------------------------------------------------------

create or replace function public.verify_organizer(p_code text, p_admin_key text)
returns boolean language plpgsql security definer stable
set search_path = pg_catalog, public, pbq_private
as $$
begin
  return exists (
    select 1 from public.sessions s
      join pbq_private.session_secrets k on k.session_id = s.id
     where s.code = upper(btrim(p_code)) and k.admin_key_hash = pbq_private.hash_token(p_admin_key)
  );
end $$;

create or replace function public.start_game(p_code text, p_admin_key text)
returns void language plpgsql security definer
set search_path = pg_catalog, public, pbq_private
as $$
declare v_s public.sessions;
begin
  v_s := pbq_private.lock_session_admin(p_code, p_admin_key);
  if v_s.status <> 'open' then perform pbq_private.fail('SESSION_CLOSED'); end if;
  if v_s.is_paused then perform pbq_private.fail('QUEUE_PAUSED'); end if;
  if exists (select 1 from public.rounds where session_id = v_s.id and ended_at is null) then
    perform pbq_private.fail('GAME_IN_PROGRESS');
  end if;
  if not pbq_private.try_start(v_s) then perform pbq_private.fail('NOT_ENOUGH_PLAYERS'); end if;
  perform pbq_private.bump(v_s.id);
end $$;

-- Ends round p_round_number. The 4 players who just played move to the back
-- (keeping their relative order) and the next 4 start automatically unless the
-- queue is paused. Passing the round number makes this idempotent: a second
-- click for the same round fails with ROUND_ALREADY_ENDED instead of
-- advancing the queue again, and a click on the *new* round within
-- min_round_seconds() fails with ROUND_TOO_NEW.
create or replace function public.end_game(p_code text, p_admin_key text, p_round_number int)
returns json language plpgsql security definer
set search_path = pg_catalog, public, pbq_private
as $$
declare
  v_s       public.sessions;
  v_round   public.rounds;
  v_max     bigint;
  v_started boolean;
begin
  v_s := pbq_private.lock_session_admin(p_code, p_admin_key);
  select * into v_round from public.rounds
   where session_id = v_s.id and ended_at is null;
  if not found or v_round.round_number <> p_round_number then
    perform pbq_private.fail('ROUND_ALREADY_ENDED');
  end if;
  if v_round.started_at > now() - make_interval(secs => pbq_private.min_round_seconds()) then
    perform pbq_private.fail('ROUND_TOO_NEW');
  end if;

  perform pbq_private.sync_round_names(v_s.id);
  update public.rounds set ended_at = now() where id = v_round.id;

  select coalesce(max(queue_pos), 0) into v_max from public.players where session_id = v_s.id;
  update public.players p
     set state = 'waiting', queue_pos = v_max + o.rn
    from (select id, row_number() over (order by queue_pos) as rn
            from public.players
           where session_id = v_s.id and state = 'playing') o
   where p.id = o.id;

  v_started := pbq_private.try_start(v_s);
  perform pbq_private.bump(v_s.id);
  return json_build_object('next_started', v_started);
end $$;

create or replace function public.set_paused(p_code text, p_admin_key text, p_paused boolean)
returns void language plpgsql security definer
set search_path = pg_catalog, public, pbq_private
as $$
declare v_s public.sessions;
begin
  v_s := pbq_private.lock_session_admin(p_code, p_admin_key);
  update public.sessions set is_paused = coalesce(p_paused, false) where id = v_s.id;
  perform pbq_private.bump(v_s.id);
end $$;

-- Moves a waiting player back one spot (swaps with the player behind them).
create or replace function public.skip_player(p_code text, p_admin_key text, p_player_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public, pbq_private
as $$
declare
  v_s    public.sessions;
  v_me   public.players;
  v_next public.players;
begin
  v_s := pbq_private.lock_session_admin(p_code, p_admin_key);
  select * into v_me from public.players where id = p_player_id and session_id = v_s.id;
  if not found then perform pbq_private.fail('PLAYER_NOT_FOUND'); end if;
  if v_me.state <> 'waiting' then perform pbq_private.fail('PLAYER_IS_PLAYING'); end if;

  select * into v_next from public.players
   where session_id = v_s.id and state = 'waiting' and queue_pos > v_me.queue_pos
   order by queue_pos limit 1;
  if not found then perform pbq_private.fail('ALREADY_LAST'); end if;

  update public.players
     set queue_pos = case when id = v_me.id then v_next.queue_pos else v_me.queue_pos end
   where id in (v_me.id, v_next.id);
  perform pbq_private.bump(v_s.id);
end $$;

create or replace function public.remove_player(p_code text, p_admin_key text, p_player_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public, pbq_private
as $$
declare v_s public.sessions;
begin
  v_s := pbq_private.lock_session_admin(p_code, p_admin_key);
  perform pbq_private.remove_player(v_s.id, p_player_id);
  perform pbq_private.bump(v_s.id);
end $$;

-- Clears every player and the current game. Session stays open; history kept.
create or replace function public.reset_session(p_code text, p_admin_key text)
returns void language plpgsql security definer
set search_path = pg_catalog, public, pbq_private
as $$
declare v_s public.sessions;
begin
  v_s := pbq_private.lock_session_admin(p_code, p_admin_key);
  update public.rounds set ended_at = now() where session_id = v_s.id and ended_at is null;
  delete from public.players where session_id = v_s.id;
  update public.sessions set is_paused = false, status = 'open' where id = v_s.id;
  perform pbq_private.bump(v_s.id);
end $$;

-- Closes the session: ends the current game, no more joining.
create or replace function public.close_session(p_code text, p_admin_key text)
returns void language plpgsql security definer
set search_path = pg_catalog, public, pbq_private
as $$
declare v_s public.sessions;
begin
  v_s := pbq_private.lock_session_admin(p_code, p_admin_key);
  update public.rounds set ended_at = now() where session_id = v_s.id and ended_at is null;
  update public.players set state = 'waiting' where session_id = v_s.id;
  update public.sessions set status = 'closed' where id = v_s.id;
  perform pbq_private.bump(v_s.id);
end $$;

-- -----------------------------------------------------------------------------
-- Public API — read the whole session state in ONE consistent snapshot
-- (runs as the caller, so it only sees what the read policies allow)
-- -----------------------------------------------------------------------------

create or replace function public.get_session_state(p_code text)
returns json language sql stable security invoker
set search_path = pg_catalog, public
as $$
  select case when s.id is null then null else json_build_object(
    'session', json_build_object(
      'id', s.id, 'code', s.code, 'name', s.name, 'status', s.status,
      'is_paused', s.is_paused, 'round_count', s.round_count,
      'version', s.version, 'created_at', s.created_at),
    'players', coalesce((
      select json_agg(json_build_object(
               'id', p.id, 'name', p.name, 'state', p.state,
               'queue_pos', p.queue_pos, 'joined_at', p.joined_at) order by p.queue_pos)
        from public.players p where p.session_id = s.id), '[]'::json),
    'current_round', (
      select json_build_object('round_number', r.round_number,
                               'player_names', r.player_names, 'started_at', r.started_at)
        from public.rounds r where r.session_id = s.id and r.ended_at is null),
    'recent_rounds', coalesce((
      select json_agg(x order by x.round_number desc) from (
        select r.round_number, r.player_names, r.started_at, r.ended_at
          from public.rounds r
         where r.session_id = s.id and r.ended_at is not null
         order by r.round_number desc limit 5) x), '[]'::json)
  ) end
  from (select 1) one
  left join public.sessions s on s.code = upper(btrim(p_code));
$$;

-- -----------------------------------------------------------------------------
-- Function permissions: only the public API is callable.
-- -----------------------------------------------------------------------------

revoke all on all functions in schema pbq_private from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.get_session_state(text),
  public.create_session(text, text),
  public.join_queue(text, text),
  public.leave_queue(text, uuid, text),
  public.verify_organizer(text, text),
  public.start_game(text, text),
  public.end_game(text, text, int),
  public.set_paused(text, text, boolean),
  public.skip_player(text, text, uuid),
  public.remove_player(text, text, uuid),
  public.reset_session(text, text),
  public.close_session(text, text)
to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Set the PIN required to create sessions (run once; change '1234'!):
--
--   insert into pbq_private.app_settings (id, creation_pin_hash)
--   values (1, extensions.crypt('1234', extensions.gen_salt('bf')))
--   on conflict (id) do update set creation_pin_hash = excluded.creation_pin_hash;
-- -----------------------------------------------------------------------------
