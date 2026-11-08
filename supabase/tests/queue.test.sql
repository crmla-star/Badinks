-- SQL tests for the queue functions. Run via run-local.sh (needs a throwaway DB).
\set ON_ERROR_STOP 1
create schema t;
grant usage on schema t to anon;

-- Raises unless running p_sql fails with the given error message.
create function t.expect_error(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_msg then return; end if;
    raise exception 'expected error % from [%], got: %', p_msg, p_sql, sqlerrm;
  end;
  raise exception 'expected error % from [%], but it succeeded', p_msg, p_sql;
end $$;

create function t.eq(p_actual anyelement, p_expected anyelement, p_label text) returns void
language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL %: expected [%], got [%]', p_label, p_expected, p_actual;
  end if;
  raise notice 'PASS %', p_label;
end $$;

-- "playing names | waiting names", both in queue order
create function t.lineup(p_code text) returns text language sql as $$
  select coalesce((select string_agg(p.name, ',' order by p.queue_pos) from public.players p
                    join public.sessions s on s.id = p.session_id
                   where s.code = p_code and p.state = 'playing'), '')
      || ' | ' ||
         coalesce((select string_agg(p.name, ',' order by p.queue_pos) from public.players p
                    join public.sessions s on s.id = p.session_id
                   where s.code = p_code and p.state = 'waiting'), '');
$$;
create function t.pid(p_code text, p_name text) returns uuid language sql as $$
  select p.id from public.players p join public.sessions s on s.id = p.session_id
   where s.code = p_code and p.name = p_name;
$$;
grant execute on all functions in schema t to anon;

set client_min_messages = notice;
set role anon;

-- ---------- creating sessions ----------
select t.expect_error($$select public.create_session('Sunday', '1234')$$, 'PIN_NOT_CONFIGURED');
reset role;
insert into pbq_private.app_settings (id, creation_pin_hash)
values (1, extensions.crypt('1234', extensions.gen_salt('bf')));
set role anon;
select t.expect_error($$select public.create_session('Sunday', '9999')$$, 'INVALID_PIN');
select t.expect_error($$select public.create_session('   ', '1234')$$, 'INVALID_SESSION_NAME');

select r->>'code' as code, r->>'admin_key' as key
  from (select public.create_session('  Sunday   Dink ', '1234') r) x \gset
select t.eq((select name from public.sessions where code = :'code'), 'Sunday Dink', 'session created, name normalized');
select t.eq((select rotation_mode from public.sessions where code = :'code'), 'fair_random', 'new sessions default to fair random');
select t.expect_error(format($$select public.set_rotation_mode(%L, 'nope', 'fifo')$$, :'code'), 'NOT_AUTHORIZED');
select t.expect_error(format($$select public.set_rotation_mode(%L, %L, 'chaos')$$, :'code', :'key'), 'INVALID_MODE');
-- the classic FIFO checks below use 4-off-4-on
select public.set_rotation_mode(:'code', :'key', 'fifo');
select t.eq(public.verify_organizer(:'code', :'key'), true, 'organizer key verifies');
select t.eq(public.verify_organizer(:'code', 'wrong'), false, 'wrong key does not verify');

-- ---------- the public cannot touch data directly ----------
select t.expect_error($$select * from pbq_private.session_secrets$$, 'permission denied for schema pbq_private');
select t.expect_error($$select pbq_private.bump(gen_random_uuid())$$, 'permission denied for schema pbq_private');
select t.expect_error($$insert into public.players (session_id, name, queue_pos) select id, 'X', 99 from public.sessions limit 1$$, 'permission denied for table players');
select t.expect_error($$update public.sessions set is_paused = true$$, 'permission denied for table sessions');
select t.expect_error($$delete from public.rounds$$, 'permission denied for table rounds');

-- ---------- joining ----------
select public.join_queue(:'code', n) from unnest(array['A','B','C','D','E','F','G','H','I']) n;
select r->>'player_id' as a_id, r->>'player_token' as a_token from (select public.join_queue(:'code', 'Ava') r) x \gset
select t.eq(t.lineup(:'code'), ' | A,B,C,D,E,F,G,H,I,Ava', 'joins keep FIFO order, nobody playing yet');
select t.expect_error(format($$select public.join_queue(%L, '  ava ')$$, :'code'), 'NAME_TAKEN');
select t.expect_error(format($$select public.join_queue(%L, 'a')$$, :'code'), 'NAME_TAKEN');
select t.expect_error(format($$select public.join_queue(%L, '   ')$$, :'code'), 'INVALID_NAME');
select t.expect_error($$select public.join_queue('NOPE00', 'Z')$$, 'SESSION_NOT_FOUND');

-- ---------- organizer auth ----------
select t.expect_error(format($$select public.start_game(%L, 'not-the-key')$$, :'code'), 'NOT_AUTHORIZED');
select t.expect_error(format($$select public.reset_session(%L, '')$$, :'code'), 'NOT_AUTHORIZED');
select t.expect_error(format($$select public.remove_player(%L, null, %L)$$, :'code', t.pid(:'code','A')), 'NOT_AUTHORIZED');
select t.eq(t.lineup(:'code'), ' | A,B,C,D,E,F,G,H,I,Ava', 'unauthorized calls changed nothing');

-- ---------- starting ----------
select public.start_game(:'code', :'key');
select t.eq(t.lineup(:'code'), 'A,B,C,D | E,F,G,H,I,Ava', 'first four start playing');
select t.expect_error(format($$select public.start_game(%L, %L)$$, :'code', :'key'), 'GAME_IN_PROGRESS');
select public.join_queue(:'code', 'J');
select t.eq(t.lineup(:'code'), 'A,B,C,D | E,F,G,H,I,Ava,J', 'player joining mid-game goes to the back');

-- ---------- ending: players rotate to the back, next four start ----------
select t.eq(public.end_game(:'code', :'key', 1)::jsonb, '{"next_started": true}'::jsonb, 'end_game reports next game started');
select t.eq(t.lineup(:'code'), 'E,F,G,H | I,Ava,J,A,B,C,D', 'finished players moved to back in order; next four playing');
select t.expect_error(format($$select public.end_game(%L, %L, 1)$$, :'code', :'key'), 'ROUND_ALREADY_ENDED');
select t.eq(t.lineup(:'code'), 'E,F,G,H | I,Ava,J,A,B,C,D', 'repeated end_game did not advance twice');

-- ---------- skip ----------
select public.skip_player(:'code', :'key', t.pid(:'code', 'I'));
select t.eq(t.lineup(:'code'), 'E,F,G,H | Ava,I,J,A,B,C,D', 'skip moves player back one spot');
select t.expect_error(format($$select public.skip_player(%L, %L, %L)$$, :'code', :'key', t.pid(:'code','D')), 'ALREADY_LAST');
select t.expect_error(format($$select public.skip_player(%L, %L, %L)$$, :'code', :'key', t.pid(:'code','E')), 'PLAYER_IS_PLAYING');

-- ---------- remove: a playing player is replaced from the front ----------
select public.remove_player(:'code', :'key', t.pid(:'code', 'F'));
select t.eq(t.lineup(:'code'), 'E,G,H,Ava | I,J,A,B,C,D', 'removed playing player replaced by next in line');
select public.remove_player(:'code', :'key', t.pid(:'code', 'F'));  -- second click: no-op
select t.eq(t.lineup(:'code'), 'E,G,H,Ava | I,J,A,B,C,D', 'removing twice is harmless');
select t.eq((select array(select unnest(player_names) order by 1) from public.rounds r join public.sessions s on s.id = r.session_id
              where s.code = :'code' and r.ended_at is null), array['Ava','E','G','H'], 'round history names updated');
select t.eq((select array_agg(court_slot order by court_slot) from public.players p join public.sessions s on s.id = p.session_id
              where s.code = :'code' and p.state = 'playing'), array[1,2,3,4]::smallint[], 'substitute took the empty seat');

-- ---------- leave (own token only) ----------
select t.expect_error(format($$select public.leave_queue(%L, %L, 'bad')$$, :'code', :'a_id'), 'NOT_AUTHORIZED');
select public.leave_queue(:'code', :'a_id', :'a_token');
select t.eq(t.lineup(:'code'), 'E,G,H,I | J,A,B,C,D', 'player left; their seat filled');
select public.leave_queue(:'code', :'a_id', :'a_token');  -- second tap: no-op
select r->>'player_id' as a_id from (select public.join_queue(:'code', 'Ava') r) x \gset
select t.eq(t.lineup(:'code'), 'E,G,H,I | J,A,B,C,D,Ava', 'player can rejoin at the back');

-- ---------- pause / resume ----------
select public.set_paused(:'code', :'key', true);
select t.eq(public.end_game(:'code', :'key', 2)::jsonb, '{"next_started": false}'::jsonb, 'paused: next game does not auto-start');
select t.eq(t.lineup(:'code'), ' | J,A,B,C,D,Ava,E,G,H,I', 'paused: everyone waiting, order preserved');
select t.expect_error(format($$select public.start_game(%L, %L)$$, :'code', :'key'), 'QUEUE_PAUSED');
select public.set_paused(:'code', :'key', false);
select public.start_game(:'code', :'key');
select t.eq(t.lineup(:'code'), 'J,A,B,C | D,Ava,E,G,H,I', 'resumed: next four start');

-- ---------- waiting state with < 4 players ----------
select r->>'code' as code2, r->>'admin_key' as key2 from (select public.create_session('Small', '1234') r) x \gset
select public.set_rotation_mode(:'code2', :'key2', 'fifo');
select public.join_queue(:'code2', n) from unnest(array['P','Q','R']) n;
select t.expect_error(format($$select public.start_game(%L, %L)$$, :'code2', :'key2'), 'NOT_ENOUGH_PLAYERS');
select t.expect_error(format($$select public.start_game(%L, %L)$$, :'code2', :'key'), 'NOT_AUTHORIZED');
select public.join_queue(:'code2', 'S');
select public.start_game(:'code2', :'key2');
select t.eq(public.end_game(:'code2', :'key2', 1)::jsonb, '{"next_started": true}'::jsonb, 'exactly four players keep rotating');
select t.eq(t.lineup(:'code2'), 'P,Q,R,S | ', 'four players: same group plays again');
select t.expect_error(format($$select public.leave_queue(%L, %L, 'forged')$$, :'code2', t.pid(:'code2','P')), 'NOT_AUTHORIZED');
select t.eq(t.lineup(:'code2'), 'P,Q,R,S | ', 'leave with forged token changed nothing');

-- ---------- teams: partners change from game to game ----------
-- same 4 players: over games 1-3 every possible partner pair appears exactly once
select public.end_game(:'code2', :'key2', 2);
select public.end_game(:'code2', :'key2', 3);
select t.eq((
  with pairs as (
    select least(a, b) || '+' || greatest(a, b) as pair
      from public.rounds r join public.sessions s on s.id = r.session_id,
           lateral (select r.player_names[1] a, r.player_names[2] b
                    union all select r.player_names[3], r.player_names[4]) x
     where s.code = :'code2' and r.round_number in (1, 2, 3))
  select count(distinct pair)::int from pairs), 6, 'teams: 3 games -> 6 different partner pairs');
select t.eq((select cardinality(team1_ids) = 2 and cardinality(team2_ids) = 2 from public.rounds r
              join public.sessions s on s.id = r.session_id where s.code = :'code2' and r.ended_at is null), true,
            'teams: current game has two teams of two');

-- ---------- fair random rotation with exactly 8 players ----------
select r->>'code' as code3, r->>'admin_key' as key3 from (select public.create_session('Eight', '1234') r) x \gset
select public.join_queue(:'code3', n) from unnest(array['A','B','C','D','E','F','G','H']) n;
select public.start_game(:'code3', :'key3');
select t.eq(t.lineup(:'code3'), 'A,B,C,D | E,F,G,H', 'fair: first game is the first four to join');
select public.end_game(:'code3', :'key3', 1);
select t.eq((select string_agg(p.name, ',' order by p.name) from public.players p join public.sessions s on s.id = p.session_id
              where s.code = :'code3' and p.state = 'playing'), 'E,F,G,H', 'fair: those who sat out play next');
create temp table groups (round int, names text, spread int);
select set_config('t.code3', :'code3', false), set_config('t.key3', :'key3', false);
do $$
begin
  -- play 20 more games, recording each lineup and the play-count spread
  for i in 2..21 loop
    insert into groups
    select i,
           (select string_agg(p.name, ',' order by p.name) from public.players p
              join public.sessions s on s.id = p.session_id
             where s.code = current_setting('t.code3') and p.state = 'playing'),
           (select max(p.games_played) - min(p.games_played) from public.players p
              join public.sessions s on s.id = p.session_id
             where s.code = current_setting('t.code3'));
    perform public.end_game(current_setting('t.code3'), current_setting('t.key3'), i);
  end loop;
end $$;
select t.eq((select max(spread) from groups), 1, 'fair: nobody is ever more than 1 game ahead of anyone');
select t.eq((select count(distinct names) > 2 from groups), true, 'fair: groups mix (more than 2 different lineups)');
select t.eq((select not exists (
              select 1 from groups g1
                join groups g2 on g2.round = g1.round + 1
                join groups g3 on g3.round = g1.round + 2,
                unnest(string_to_array(g1.names, ',')) n
               where n = any(string_to_array(g2.names, ',')) and n = any(string_to_array(g3.names, ',')))), true,
            'fair: nobody plays three games in a row');
select r->>'player_id' as late_id from (select public.join_queue(:'code3', 'Late') r) x \gset
select t.eq((select games_played = (select min(games_played) from public.players p2
                                      where p2.session_id = p.session_id and p2.id <> p.id)
               from public.players p where p.id = :'late_id'), true, 'fair: newcomer starts level with the least-played');

-- ---------- state snapshot ----------
select t.eq((public.get_session_state(:'code2')->'current_round'->>'round_number')::int, 4, 'state: current round');
select t.eq(json_array_length(public.get_session_state(:'code2')->'players'), 4, 'state: players');
select t.eq((public.get_session_state(lower(:'code2'))->'session'->>'name'), 'Small', 'state: code is case-insensitive');
select t.eq(public.get_session_state('NOPE00')::text, null, 'state: unknown code returns null');
select t.eq((public.get_session_state(:'code2')::jsonb ? 'admin_key_hash'), false, 'state: no secrets exposed');

-- ---------- history, version, close, reset ----------
select t.eq((select count(*)::int from public.rounds r join public.sessions s on s.id = r.session_id where s.code = :'code'), 3, 'three rounds recorded');
select t.eq((select version > 20 from public.sessions where code = :'code'), true, 'version bumps on changes');
select public.close_session(:'code', :'key');
select t.expect_error(format($$select public.join_queue(%L, 'Late')$$, :'code'), 'SESSION_CLOSED');
select t.eq((select count(*)::int from public.rounds r join public.sessions s on s.id = r.session_id where s.code = :'code' and ended_at is null), 0, 'close ends the active game');
select public.reset_session(:'code', :'key');
select t.eq(t.lineup(:'code'), ' | ', 'reset clears all players');
select t.eq((select status from public.sessions where code = :'code'), 'open', 'reset reopens the session');
select public.join_queue(:'code', 'A');
select t.eq(t.lineup(:'code'), ' | A', 'can join after reset');

reset role;
