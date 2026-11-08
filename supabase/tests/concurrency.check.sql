do $$
declare v text;
begin
  select string_agg(p.name || ':' || p.state, ',' order by p.queue_pos) into v
    from public.players p join public.sessions s on s.id = p.session_id where s.code = 'CONCUR';
  if v <> 'E:playing,F:playing,G:playing,H:playing,A:waiting,B:waiting,C:waiting,D:waiting' then
    raise exception 'FAIL concurrency lineup: %', v;
  end if;
  if (select count(*) from public.rounds r join public.sessions s on s.id = r.session_id where s.code = 'CONCUR') <> 2 then
    raise exception 'FAIL concurrency: expected exactly 2 rounds';
  end if;
end $$;
