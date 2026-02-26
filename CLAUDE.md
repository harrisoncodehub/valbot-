# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install            # Install dependencies
npm run register       # Register slash commands with Discord (guild-scoped, instant)
npm start              # Run the bot
```

> There are no tests. The `test` script in package.json is a placeholder.

## Environment

Copy `.env.example` to `.env` and fill in:
- `DISCORD_TOKEN` — bot token from Discord Developer Portal
- `CLIENT_ID` — Discord application ID
- `GUILD_ID` — target Discord server ID (used for guild-scoped command registration)
- `HENRIK_API_KEY` — key from https://docs.henrikdev.xyz (paste only the raw key, not the full header)
- `SUPABASE_URL` — project URL from Supabase dashboard (e.g. `https://xyz.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY` — service-role key (bypasses RLS; never expires; server-side only)

## Architecture

**Runtime flow:** `index.js` boots the Discord client, registers command handlers in a `Map`, then on `ready` starts the background `matchPoller`. All slash command interactions route through `index.js` → rate-limit check → `commands/<name>.execute(interaction)`.

**Adding a new command:** create `src/commands/<name>.js` with an `execute(interaction)` export, add it to `register-commands.js` with its options, and add it to the `commands` Map in `index.js`.

### Key layers

| Layer | Path | Notes |
|---|---|---|
| API client | `src/api/henrik.js` | Wraps HenrikDev REST API. All VALORANT data comes through here. `HENRIK_API_KEY` is sanitized here (strips accidental `Bearer` prefix). On 401, retries once via query param. |
| DB client | `src/db/supabase.js` | Singleton `@supabase/supabase-js` v2 client. Throws at startup if env vars missing. |
| Match history | `src/db/matchHistory.js` | `upsertMatch(data)` / `getMatchHistory(discordId, limit)`. Non-fatal errors — never block command responses. |
| Storage | `src/storage/` | Async wrappers over Supabase tables (formerly flat JSON). Three modules: `links.js` (`user_links`), `guildConfig.js` (`guild_configs`), `lastMatches.js` (`poller_state`). All functions are now `async`. |
| Cache | `src/cache/cache.js` | In-memory `Map` with TTL. Keys built via `cache.profileKey()`, `cache.matchesKey()`, etc. Profile: 5-10 min TTL; matches: 1-3 min. |
| Rate limiting | `src/utils/rateLimit.js` | Per-user (5 cmds/60s) and per-guild (20 cmds/60s), checked in `index.js` before command dispatch. |
| Embeds | `src/utils/embeds.js` | All Discord embeds are built here. VALORANT rank colors, Zoe-style formatting. `createProgressEmbed` powers `/daily` and `/weekly`. |
| Rank progress | `src/utils/rankProgress.js` | `fetchProgressRows(guildId, windowMs)` — fetches MMR + MMR history for all linked guild members, sums `mmr_change_to_last_game` within the time window, returns rows sorted by RR delta. MMR history cached at `mmrHistory:{region}:{name}:{tag}` for 300s. |
| Match poller | `src/jobs/matchPoller.js` | `setInterval` every 5 min. For each guild with `matchChannelId` configured, fetches latest competitive match per linked user, compares to stored last match ID, posts embed if new. First run sets baseline without posting. Channel post rate limit: 5/min. Also writes to `match_history` after each post. |

### Supabase tables

| Table | Replaces | Notes |
|---|---|---|
| `user_links` | `links.json` | PK: `discord_id`. `guild_ids TEXT[]` with GIN index for guild-scoped queries. |
| `guild_configs` | `guildConfig.json` | PK: `guild_id`. All channel IDs + `modules TEXT[]`. |
| `poller_state` | `lastMatches.json` | PK: `(guild_id, discord_id)`. Stores last posted match ID. |
| `match_history` | _(new)_ | PK: `id BIGINT IDENTITY`. Unique on `(match_id, discord_id)`. Populated non-blocking from `/history`, `/match`, and the poller. |

Run the SQL in `IMPLEMENTATION_PLAN.md` → Step 1 to create these tables. Migrate existing JSON data with `node migrate.js` (delete the file after).

### Henrik API endpoints used

| Function | Endpoint |
|---|---|
| `getAccount` | `GET /valorant/v1/account/{name}/{tag}` |
| `getMMR` | `GET /valorant/v2/mmr/{region}/{name}/{tag}` |
| `getMatches` | `GET /valorant/v3/matches/{region}/{name}/{tag}?size=N&filter=competitive` |
| `getMatch` | `GET /valorant/v4/match/{region}/{matchId}` |
| `getMMRHistory` | `GET /valorant/v1/mmr-history/{region}/{name}/{tag}` |

`getMatches` does both API-side filtering (`filter=` param) and client-side filtering as a fallback.

## Roadmap context

See `IMPLEMENTATION_PLAN.md` for the full phased plan. The current codebase is **Phases 1–5 complete** plus Discord display names in leaderboard and match posts. Next: structured logging (`pino`) and optional Riot OAuth.
