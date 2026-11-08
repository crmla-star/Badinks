#!/usr/bin/env bash
# Runs the SQL test suite against a throwaway local PostgreSQL (16+) cluster.
# Usage: bash supabase/tests/run-local.sh
set -euo pipefail
shopt -s lastpipe
HERE="$(cd "$(dirname "$0")" && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
WORK="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
cleanup() { "$PGBIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

RUN_AS=""
if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$WORK"; RUN_AS="runuser -u postgres --"
fi
$RUN_AS "$PGBIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
$RUN_AS "$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" start >/dev/null

PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h "$WORK" -p "$PORT" -U postgres -d postgres)
# Recreate the bits Supabase provides out of the box.
"${PSQL[@]}" -c "create role anon nologin; create role authenticated nologin; create schema extensions;"
"${PSQL[@]}" -f "$HERE/../schema.sql"
"${PSQL[@]}" -o /dev/null -f "$HERE/queue.test.sql" 2>&1 | sed -E "s/^psql:[^ ]+ NOTICE:  //"

# Concurrency: fire end_game for the same round from 5 connections at once.
"${PSQL[@]}" -o /dev/null -f "$HERE/concurrency.setup.sql"
for i in 1 2 3 4 5; do
  "${PSQL[@]}" -tA -c "set role anon; select public.end_game('CONCUR', 'concur-key', 1);" >"$WORK/c$i.out" 2>&1 &
done
wait
OK=$(grep -l next_started "$WORK"/c*.out | wc -l)
DUP=$(grep -l ROUND_ALREADY_ENDED "$WORK"/c*.out | wc -l)
"${PSQL[@]}" -f "$HERE/concurrency.check.sql"
if [ "$OK" != "1" ] || [ "$DUP" != "4" ]; then
  echo "FAIL concurrency: $OK succeeded, $DUP rejected (expected 1 and 4)"; exit 1
fi
echo "PASS concurrency: 5 simultaneous end_game calls -> 1 applied, 4 rejected"
echo "ALL TESTS PASSED"
