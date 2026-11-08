insert into public.sessions (code, name) values ('CONCUR', 'Concurrency');
insert into pbq_private.session_secrets
  select id, pbq_private.hash_token('concur-key') from public.sessions where code = 'CONCUR';
set role anon;
select public.join_queue('CONCUR', n) from unnest(array['A','B','C','D','E','F','G','H']) n;
select public.start_game('CONCUR', 'concur-key');
