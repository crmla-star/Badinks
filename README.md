# Badinks — Pickleball Queue

A small, mobile-first web app for running a friendly pickleball court: friends open one link, type their name, and join a fair first-in, first-out queue. Every phone shows the same live board. One organizer runs the games.

- 1 court · 4 players per game (doubles) · FIFO rotation
- No accounts: players just enter a name
- Live updates through Supabase Realtime, with automatic re-sync after reconnecting
- Organizer controls are protected by a secret per-session key that the server checks on every action

**Stack:** React + Vite + TypeScript + Tailwind CSS v4 · Supabase (Postgres, RPC functions, Realtime) · Vercel

---

## How it works

| Screen | What it shows |
| --- | --- |
| **Home** (`/`) | Join by 6-letter code, create a session (needs the organizer PIN), and your recent sessions |
| **Game** (`/s/CODE`) | Session name, status, player count, share link, join form or "your position" card, and the live queue: **NOW PLAYING · UP NEXT · WAITING** |
| **Organizer panel** | Start / End game, Pause / Resume, Organizer link, Reset, Close. Each player row has ↓ (skip one spot) and ✕ (remove) |

### Queue rules

Each session has a **rotation mode**. The organizer can change it under **Session settings → Rotation**, and the change applies when the current game ends.

**Mix it up** (default): mixes players and teams, which matters when you're exactly 8 people.
1. The first game is the first 4 players to join.
2. When a game ends, everyone is re-ordered by **games played (fewest first)**, with ties broken at random. The next 4 go on court automatically.
3. Everyone plays the same number of games (never more than 1 apart), and groups change over time.
4. With 8 players, groups can only mix if some players occasionally play 2 games in a row and then sit out 2. Nobody ever plays 3 in a row.
5. New players start level with the least-played player, so they neither jump the line nor wait extra.

**Classic 4 off, 4 on**: strict first-in, first-out.
1. **Start game** puts the first 4 waiting players on court.
2. **End game** moves those 4 to the **back** of the line, keeping their order, and the next 4 start automatically.

**Both modes:**
- **Teams:** the court shows **Team 1 vs Team 2**. Partners are chosen so that people who have partnered least this session play together, so teams change from game to game.
- **Joining:** new players join the back. A name can appear only once per session (case- and space-insensitive).
- **Skip and remove:** skip moves a waiting player back one spot. If a player on court is removed or leaves, the next player in line takes their seat.
- **Fewer than 4 waiting:** the app shows a waiting state instead of starting.
- **Pause:** while the queue is paused, ending a game does not start the next one.
- **End game** asks for confirmation, so a stray tap can't end a game.

**Upgrading an existing Supabase project:** re-run the whole `supabase/schema.sql` in the SQL editor. It only adds what's missing and keeps your data and PIN.

### Security model

- The browser only ever has the public **anon** key. **The service-role key is never used anywhere.**
- Row Level Security makes the tables **read-only** to the public. All writes go through `SECURITY DEFINER` Postgres functions (`supabase/schema.sql`).
- **Organizer key:** creating a session returns a random key once. Only its SHA-256 hash is stored, in a private schema the public can't read. Every organizer function checks it on the server. The key is saved on the organizer's phone. Use **Organizer link** (`/s/CODE#key=…`) to open organizer mode on another device. The `#` part is never sent to servers, and the app removes it from the address bar.
- **Creation PIN:** creating a session requires a PIN, stored as a bcrypt hash.
- **Player token:** joining returns a private token stored on the player's phone. Only that phone can make that player leave.
- **Concurrency:** every write locks the session row, so simultaneous actions run one after another. `end_game` takes the round number, so a repeated tap returns "already ended" instead of advancing twice. A unique index allows at most one active game per session.

---

## 1. Supabase setup

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste all of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Set your **organizer PIN** by running this in the SQL editor (change `1234`):

   ```sql
   insert into pbq_private.app_settings (id, creation_pin_hash)
   values (1, extensions.crypt('1234', extensions.gen_salt('bf')))
   on conflict (id) do update set creation_pin_hash = excluded.creation_pin_hash;
   ```

   Run it again with a new value at any time to change the PIN.
4. **Realtime:** the schema adds the `sessions` table to the `supabase_realtime` publication. Check it under **Database → Publications → supabase_realtime**. The app also re-syncs when a phone wakes up or goes back online, and polls every 8 seconds whenever Realtime is disconnected.
5. Copy your **Project URL** and **anon / publishable key** from **Project Settings → API** (or the **Connect** button).

> To start over, run:
> `drop schema pbq_private cascade; drop table public.rounds, public.players, public.sessions cascade;`
> Then run `schema.sql` again.

## 2. Run locally

Requires Node 20+.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

```bash
npm run dev
```

To test from your phone on the same Wi-Fi, run `npm run dev -- --host` and open the "Network" URL it prints.

## 3. Deploy to Vercel

1. Push this repo to GitHub, then in Vercel choose **Add New → Project** and import it. The **Vite** preset is detected automatically (build `npm run build`, output `dist`).
2. Under **Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Click **Deploy**. `vercel.json` rewrites all paths to `index.html`, so shared links like `/s/ABC123` work.

## 4. Using it

1. **Organizer:** open the app → **Organize a game** → enter a name and the PIN → **Create session**.
2. Tap **Share game link** and send it to the group chat.
3. Players open the link, type their name, and tap **Join queue**.
4. With 4 or more players, tap **Start game**. When a game finishes, tap **End game**: the next four go on court automatically.

---

## Tests

```bash
npm test            # unit tests (queue splitting / status logic)
npm run test:db     # SQL tests against a throwaway local PostgreSQL 16+
```

`test:db` runs [`supabase/tests/run-local.sh`](supabase/tests/run-local.sh). It needs the PostgreSQL server binaries (`initdb`, `pg_ctl`) and `psql` installed. It starts a temporary database, loads the schema, and checks as the public `anon` role:

- FIFO rotation and mid-game joins
- duplicate names
- skip, remove, and leave (including forged tokens)
- pause / resume, reset / close, and the waiting state
- that organizer functions reject wrong keys, and that tables and secrets can't be read or written directly
- that **5 simultaneous `end_game` calls advance the queue exactly once**

## Project structure

```
supabase/
  schema.sql              tables, RLS policies, server-side functions
  tests/                  SQL test suite + local runner
src/
  lib/
    api.ts                typed RPC calls + friendly error messages
    queue.ts              pure FIFO view logic (unit tested)
    supabase.ts           client (anon key only)
    storage.ts            device-local identity (player token, organizer key)
    router.ts share.ts toast.ts types.ts
  hooks/
    useSessionState.ts    load + Realtime sync + reconnect handling
    useAction.ts          one action at a time (double-tap guard)
  components/             QueueBoard, OrganizerPanel, PlayerCard, ConfirmDialog, ui
  pages/                  HomePage, SessionPage
```

## Assumptions

- Anyone with the game link can view and join. The 6-character code isn't a secret, and that's fine for friends.
- Players aren't removed when their phone sleeps or disconnects. The organizer can remove no-shows.
- Reset clears all players but keeps the basic game history. Close stops new joins, and Reset reopens a closed session.
- There's no rate limiting on PIN attempts beyond bcrypt's cost. Pick a PIN that isn't trivial.
