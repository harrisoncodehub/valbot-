# valBot Implementation Plan

A ZoeBot-style VALORANT Discord bot. This plan maps the guide phases to concrete tasks and file structure.

---

## Current Status

| Phase | Status | Notes |
|-------|--------|-------|
| **Phase 0** | ✅ Done | Bot runs, `/ping` works, `.env` has all vars |
| **Phase 1** | ✅ Done | `/link`, `/profile`, `/history`, `/match` live |
| **Phase 2** | ✅ Done | `/setup`, `/leaderboard`, Supabase migration complete |
| **Phase 3** | ✅ Done | Background match poller, automated posts to configured channel |
| **Phase 4** | 🔄 In progress | Supabase done; structured logging (`pino`) next |
| **Phase 5** | ✅ Done | `/daily` and `/weekly` rank-progress commands |
| **Discord names** | ✅ Done | Leaderboard + match posts show Discord display names alongside gamertags |

---

## Phase 0 — Discord + Local Bot (Foundation)

### Checklist

- [x] Discord application + bot created
- [x] Bot invited (Guild Install, `bot` + `applications.commands`, minimal perms)
- [x] Node + discord.js project
- [x] `.env` with `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `HENRIK_API_KEY`
- [x] `register-commands.js` + `index.js`
- [ ] Verify `/ping` works in server

### Remaining Tasks

1. **Add `.env.example`** — Document required vars for new devs:
   ```
   DISCORD_TOKEN=
   CLIENT_ID=
   GUILD_ID=
   HENRIK_API_KEY=
   ```

2. **Add npm scripts** to `package.json`:
   ```json
   "scripts": {
     "register": "node register-commands.js",
     "start": "node index.js",
     "dev": "node index.js"
   }
   ```

3. **Manual verification** — Run `node register-commands.js` then `node index.js`, use `/ping` in Discord.

---

## Phase 1 — Prototype VALORANT Features (MVP)

### Henrik API Endpoints (Reference)

| Purpose | Endpoint | Notes |
|---------|----------|-------|
| Account lookup | `GET /valorant/v1/account/{name}/{tag}` | Validates account exists |
| MMR/Rank | `GET /valorant/v2/mmr/{region}/{name}/{tag}` | Rank, RR, MMR |
| Match history | `GET /valorant/v3/matches/{region}/{name}/{tag}?size=20&start=0` | List of matches (supports pagination) |
| Single match | `GET /valorant/v4/match/{region}/{matchId}` | Full match details |

**Auth:** `Authorization: Bearer {HENRIK_API_KEY}`  
**Regions:** `na`, `eu`, `kr`, `ap`, `br`, `latam`  
**Docs:** https://docs.henrikdev.xyz

### File Structure to Add

```
valBot/
├── src/
│   ├── api/
│   │   └── henrik.js          # Henrik API client (fetch wrappers)
│   ├── storage/
│   │   └── links.js           # JSON/SQLite for discordId → { name, tag, region }
│   ├── cache/
│   │   └── cache.js           # In-memory cache + TTL
│   ├── commands/
│   │   ├── link.js
│   │   ├── profile.js
│   │   ├── history.js
│   │   └── match.js
│   └── utils/
│       ├── embeds.js          # Zoe-style embed builders
│       └── rateLimit.js       # Per-user/guild cooldowns
├── data/
│   └── links.json             # Prototype storage (gitignored)
├── index.js
└── register-commands.js
```

### Task Breakdown

#### 1. Henrik API Client (`src/api/henrik.js`)

- `getAccount(name, tag)` — validate account exists
- `getMMR(region, name, tag)` — rank, RR, MMR
- `getMatches(region, name, tag, size)` — match history
- `getMatch(region, matchId)` — single match details
- Use `fetch` with `Authorization: Bearer ${process.env.HENRIK_API_KEY}`
- Handle 404, rate limits, network errors

#### 2. Storage Layer (`src/storage/links.js`)

- **Prototype:** JSON file `data/links.json`
- Schema: `{ [discordId]: { name, tag, region, puuid? } }`
- `getLink(discordId)`, `setLink(discordId, data)`, `getAllLinks(guildId?)`
- For guild-scoped: need to store `guildId` per link or maintain a guild→members map

#### 3. Cache Layer (`src/cache/cache.js`)

- In-memory Map with TTL
- Profile/MMR: 5–15 min
- Match history: 1–3 min
- Key format: `profile:${region}:${name}:${tag}` etc.

#### 4. Rate Limiting (`src/utils/rateLimit.js`)

- Per-user: e.g. 5 commands / 60 sec
- Per-guild: e.g. 20 commands / 60 sec
- Return friendly message when exceeded

#### 5. Slash Commands

| Command | Options | Behavior |
|---------|---------|----------|
| `/link` | `name`, `tag`, `region` | Validate via Henrik account API → store link |
| `/profile` | `user` (optional) | Self or target; fetch MMR → embed |
| `/history` | `user` (optional), `count` (default 5) | Fetch matches → compact list embed |
| `/match` | `user` (optional), `index` (1-based) | Detailed embed for match at index |

#### 6. Embed Helpers (`src/utils/embeds.js`)

- Zoe-style: clean, consistent colors, rank icons if possible
- Profile: rank, RR, MMR, level, last updated
- History: table/list (map, agent, score, K/D/A)
- Match: full round breakdown, team stats, MVP

#### 7. Register Commands

- Add `/link`, `/profile`, `/history`, `/match` to `register-commands.js` with proper options
- Wire handlers in `index.js` (or use a command loader)

### Done When

- Users can `/link name#tag region` and get validation
- `/profile` shows rank/RR/MMR embed
- `/history` shows last N matches
- `/match 1` shows detailed match
- Caching and rate limiting reduce API spam

---

## Phase 2 — Zoe-like Server Features

### File Structure Additions

```
src/
├── storage/
│   └── guildConfig.js         # Guild settings
├── commands/
│   ├── setup.js
│   └── leaderboard.js
```

### Task Breakdown

#### 1. Guild Config Storage (`src/storage/guildConfig.js`)

- **Prototype:** `data/guildConfig.json`
- Schema: `{ [guildId]: { matchChannelId?, leaderboardChannelId?, rankPanelMessageId?, language?, modules: [] } }`

#### 2. `/setup` Command

- Modal or subcommands: set match channel, leaderboard channel, enable/disable modules
- Store in guild config

#### 3. `/leaderboard` Command

- Get all linked users in guild (need to track guildId per link)
- For each: fetch MMR (use cache), compute winrate from recent matches
- Sort by rank/RR
- Embed: rank, name, RR, winrate, recent KD

#### 4. Rank Panel (Optional)

- `/rankpanel create` — post message, store `messageId` + `channelId`
- `/rankpanel update` — edit that message with current leaderboard
- Store in guild config

### Schema Update for Links

- Add `guildId` to each link so we can query "all linked users in server X"
- Or: separate `data/links.json` per guild, or use `{ discordId: { guilds: [guildId], ... } }`

### Done When

- `/setup` configures channels
- `/leaderboard` shows server leaderboard
- Optional: rank panel message that can be updated

---

## Phase 3 — Automation

### Task Breakdown

#### 1. Background Polling Job

- `setInterval` or `node-cron` every X minutes (e.g. 5–10)
- For each guild with `matchChannelId`:
  - Get linked users
  - Fetch match history (cached)
  - Compare to last known match ID per user
  - If new match → post summary embed to channel

#### 2. Anti-Spam

- Cooldown: max N posts per channel per minute
- Batch: if multiple new matches, consider batching into one message
- Per-user: don’t post if user had a match in last 2 min (avoid duplicates)

#### 3. Deployment

- **Railway / Fly.io:** Add `Procfile` or `Dockerfile`, connect repo, set env vars
- **VPS:** Use `pm2` for process management, `pm2 startup` for reboot persistence
- **Database:** Phase 4 — for now JSON/SQLite is fine for prototype

### Done When

- Bot runs 24/7
- New matches are posted to configured channel
- No spam/rate-limit issues

---

## Phase 4 — Production Hardening

### Task Breakdown

#### 1. Database Migration

- Move from JSON → **SQLite** (simple) or **Postgres** (scalable)
- Tables: `links`, `guild_config`, `match_cache`, `last_match_per_user`
- Use `better-sqlite3` or `pg` + migrations

#### 2. Logging

- Replace `console.log` with structured logger (e.g. `pino`)
- Log levels: debug, info, warn, error

#### 3. Error Monitoring

- Optional: Sentry or similar for production errors

#### 4. Permissions & Security

- Review: who can run `/setup`? (admin only)
- Validate all user input (name, tag, region)
- Never log tokens

#### 5. Riot OAuth (Optional)

- For "production legit" — Riot Sign On
- More setup, but official and stable long-term

### Done When

- Persistent DB, proper logging, security review
- Optional: Riot OAuth integration

---

## Suggested Order of Implementation

1. **Phase 0 polish** — `.env.example`, npm scripts, verify `/ping`
2. **Phase 1.1** — Henrik client + storage + `/link`
3. **Phase 1.2** — `/profile` + embeds
4. **Phase 1.3** — `/history` + `/match`
5. **Phase 1.4** — Cache + rate limiting
6. **Phase 2.1** — Guild config + `/setup`
7. **Phase 2.2** — `/leaderboard` (with guildId in links)
8. **Phase 2.3** — Rank panel (optional)
9. **Phase 3** — Polling + deployment
10. **Phase 4** — DB migration + logging (as needed)

---

## Quick Reference: Henrik API

```javascript
// Base
const BASE = 'https://api.henrikdev.xyz';
const headers = { Authorization: `Bearer ${process.env.HENRIK_API_KEY}` };

// Account (validate)
fetch(`${BASE}/valorant/v1/account/${name}/${tag}`, { headers })

// MMR
fetch(`${BASE}/valorant/v2/mmr/${region}/${name}/${tag}`, { headers })

// Match history
fetch(`${BASE}/valorant/v3/matches/${region}/${name}/${tag}?size=20&start=0`, { headers })

// Single match
fetch(`${BASE}/valorant/v4/match/${region}/${matchId}`, { headers })
```

**Note:** Exact paths may vary — check https://docs.henrikdev.xyz for current API.
