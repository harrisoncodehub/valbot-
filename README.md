# valBot

A ZoeBot-style Discord bot for VALORANT stats using the HenrikDev API.

## Setup

1. Install deps:

```bash
npm install
```

2. Create `.env` (copy from `.env.example`) and fill:

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`
- `HENRIK_API_KEY`

3. Register slash commands (guild-scoped, instant updates):

```bash
npm run register
```

4. Start the bot:

```bash
npm start
```

## Commands

- `/ping` — health check
- `/link name tag region` — link your VALORANT account
- `/profile [user]` — show rank/MMR
- `/history [user] [count]` — recent competitive matches
- `/match [index] [user]` — details for a match from `/history`
- `/setup ...` — configure server channels/modules (requires **Manage Server**)
- `/leaderboard [count]` — server leaderboard (linked users only)

## Automation (Match Posts)

If you configure a match channel:

- `/setup matchchannel channel:#your-channel`

The bot will poll every ~5 minutes and post a summary when it detects a new competitive match for linked users in that server.

## Data

Prototype storage is JSON under `data/` (gitignored):

- `data/links.json`
- `data/guildConfig.json`
- `data/lastMatches.json`

