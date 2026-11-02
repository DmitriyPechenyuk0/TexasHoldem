# Load smoke test

Bots play many tables across two api instances (POK-116). The run proves that the Redis-based setup holds: leases, request forwarding, the socket.io adapter and integration events. It also measures what players would feel.

## Running it

Bring up the infrastructure and build the api first:

```sh
pnpm infra:up
pnpm --filter @holdem/shared build && pnpm --filter @holdem/api build
pnpm --filter @holdem/loadtest start -- --tables 20 --players 6 --minutes 10
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--tables` | 20 | Tables to open and fill |
| `--players` | 6 | Players per table (2–9) |
| `--minutes` | 10 | How long the bots play once every table is full |
| `--think` | `200-800` | Milliseconds a bot waits before acting, picked at random in the range |
| `--chaos` | off | Kill one instance (`SIGKILL`) halfway through, and measure the recovery |
| `--port` | 4101 | The instances listen on this port and the next |

The run sets everything up and tears it down again, on Linux, where it reads CPU and memory from `/proc`:

1. It creates a database of its own and migrates it. The settings come from `apps/api/.env`.
2. It starts two instances of `apps/api/dist/main.js` with `TRUST_PROXY=loopback` and `LOG_LEVEL=warn`. They share Redis and the database, as in production.
3. It signs every player up through the api, each from an address of its own (`X-Forwarded-For`), so per-address limits apply as for real players. It marks them verified in the database and signs them in.
4. Each table's first player creates it through the lobby (public, micro stakes, 1/2), and every player sits with a 200-chip buy-in. Players are spread over both instances in turn, so every table has players on both.
5. The bots play until time is up. The run then writes the report to `results/` (ignored by git), stops the instances and drops the database.

## What the bots do

A bot acts when the table tells it that its turn started (`TurnStarted`). It first reads the table (`join`, the snapshot), whose `legalActions` the table computes with the engine's `legalActions`. Then it picks among those actions at random (`src/strategy.ts`):

- mostly checks and calls;
- bets or raises to between the minimum and three times it in 22 % of turns;
- folds to a bet in 10 % of turns;
- goes all in in 3 % of turns.

At the showdown it mucks when asked. A busted bot rebuys and sits back in.

Bots behave as a client should:

- A bot's tasks run one after another, so a turn never waits on a rebuy, nor is skipped for one.
- An action the table refuses is counted, and the bot then checks or calls, so the turn is not lost to the timer.
- While a table moves to another instance it answers `table.unavailable`, and the bot tries again.
- A bot whose instance died reconnects through the other one and reads the snapshot. A turn that started while it was away shows only there.

## What it measures

- **view**: `join` → ack, the snapshot a bot reads before acting.
- **act**: `act` / `muck-cards` → ack. The command is stored before the ack, so this is a turn's round trip.
- **command**: the other commands (`take-seat`, `rebuy`, `sit-in`).
- **fan-out**: from a bot sending its action, to each other player at the table receiving the batch with it. The players are on both instances, so most of these cross the Redis adapter.
- **reconnect** and **table recovery**, with `--chaos`:
  - reconnect: how long a bot whose instance died takes to rejoin through the other one;
  - table recovery: how long each table takes to deal or start a turn again once its lease has expired and the other instance has taken it over.
- Counts of refused commands by code, missing acks, timed-out turns, rebuys and disconnects. A stalled table, one that made no progress in its last minute, counts too.
- **CPU and memory** of each instance, sampled every 5 s.

All times are taken in the bots' process, against one clock.

## Results

Run on 2026-11-02 on one machine (AMD Ryzen 5 5600G, 12 threads, 13 GB). The bots, both instances, Postgres and Redis (Docker) all ran on it, with the defaults: 20 s turns, a 3 s pause between hands, and bots thinking 200–800 ms.

### 20 tables × 6 players, 10 minutes

1,103 hands were dealt with no error: no refused command, no missing ack, no turn lost to the timer, no stalled table. 682 busted bots rebought.

| Latency | Count | p50 | p95 | p99 | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
| **act** (turn → ack) | 17,199 | 4.6 ms | **6.2 ms** | 7.8 ms | 16.5 ms |
| view (`join` → snapshot) | 18,001 | 2.2 ms | 3.0 ms | 4.7 ms | 14.4 ms |
| command (seat, rebuy, sit in) | 1,484 | 4.0 ms | 5.8 ms | 7.6 ms | 11.0 ms |
| fan-out (action → other players) | 83,815 | 4.8 ms | 6.4 ms | 8.1 ms | 17.4 ms |

| Instance | CPU p50 | CPU max | Memory p50 | Memory max |
| --- | ---: | ---: | ---: | ---: |
| 1 | 8 % | 11 % | 382 MB | 383 MB |
| 2 | 8 % | 13 % | 329 MB | 332 MB |

CPU is a share of one core.

### With an instance killed (`--chaos`, 4 minutes)

One instance was killed with `SIGKILL` two minutes in; its 60 bots and the tables it ran moved to the other one. Every table played on: 421 hands, and no turn was lost to the timer.

| Recovery | p50 | p95 | Max |
| --- | ---: | ---: | ---: |
| A bot back at its table | 0.6 s | 10.4 s | 10.4 s |
| A table dealing or timing a turn again | 3.7 s | 13.8 s | 13.9 s |

The slowest tables are those the dead instance ran. Their leases run out after `TABLE_LEASE_TTL_MS` (10 s), and the other instance adopts orphans at that interval too, so recovery stays under twice the TTL. Until then those tables answer `table.unavailable` (661 times in this run), and clients try again. Turns and fan-out kept their latencies throughout (act p95 6.1 ms, fan-out p95 6.5 ms).
