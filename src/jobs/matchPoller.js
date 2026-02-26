const henrik = require("../api/henrik");
const guildConfig = require("../storage/guildConfig");
const links = require("../storage/links");
const lastMatches = require("../storage/lastMatches");
const cache = require("../cache/cache");
const { createMatchPostEmbed } = require("../utils/embeds");
const matchHistory = require("../db/matchHistory");
const logger = require("../utils/logger").child({ module: "match-poller" });

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const CHANNEL_POST_LIMIT = 5;
const CHANNEL_WINDOW_MS = 60 * 1000;

function channelLimiter() {
  const posts = new Map(); // channelId -> number[] timestamps

  function canPost(channelId) {
    const now = Date.now();
    const arr = posts.get(channelId) || [];
    const recent = arr.filter((t) => now - t < CHANNEL_WINDOW_MS);
    if (recent.length >= CHANNEL_POST_LIMIT) {
      posts.set(channelId, recent);
      return false;
    }
    recent.push(now);
    posts.set(channelId, recent);
    return true;
  }

  return { canPost };
}

async function fetchLatestCompetitive(region, name, tag) {
  const mode = "competitive";
  const key = cache.matchesKey(region, name, tag, mode);
  let matches = cache.get(key);
  if (!matches) {
    matches = await henrik.getMatches(region, name, tag, 3, mode);
    cache.set(key, matches, 120);
  }
  const match = Array.isArray(matches) ? matches[0] : null;
  return match || null;
}

function summarizeMatchForPlayer(match, name, tag) {
  const player = match?.players?.all_players?.find(
    (p) => p.name === name && p.tag === tag
  );
  if (!player) return null;

  const teamKey = player.team?.toLowerCase();
  const team = match?.teams?.[teamKey];
  if (!team) return null;

  const enemyTeamKey = teamKey === "red" ? "blue" : "red";
  const enemyTeam = match?.teams?.[enemyTeamKey];

  const result = team.has_won ? "Victory" : "Defeat";
  const score = `${team.rounds_won}:${enemyTeam?.rounds_won ?? "?"}`;
  const kda = `${player.stats?.kills ?? 0}/${player.stats?.deaths ?? 0}/${player.stats?.assists ?? 0}`;

  return {
    player: `${name}#${tag}`,
    map: match?.metadata?.map || "Unknown map",
    mode: match?.metadata?.mode || "Unknown mode",
    matchId: match?.metadata?.matchid,
    result,
    score,
    agent: player.character || "Unknown",
    kda,
    // raw stats for match_history
    _player: player,
    _teamKey: teamKey,
    _enemyTeamKey: enemyTeamKey,
    _team: team,
    _enemyTeam: enemyTeam,
  };
}

async function tryGetRRChange(region, name, tag, matchId) {
  if (!matchId) return null;
  try {
    const history = await henrik.getMMRHistory(region, name, tag);
    const entry = Array.isArray(history)
      ? history.find((e) => e.match_id === matchId)
      : null;
    return entry?.mmr_change_to_last_game ?? null;
  } catch {
    return null;
  }
}

/**
 * Start background job that posts new match summaries for configured guilds.
 * @param {import("discord.js").Client} client
 * @param {{ intervalMs?: number }} opts
 */
function startMatchPoller(client, opts = {}) {
  const intervalMs = opts.intervalMs || DEFAULT_INTERVAL_MS;
  const limiter = channelLimiter();
  let running = false;

  async function tick() {
    if (running) return;
    running = true;

    try {
      const allConfigs = await guildConfig.getAllGuildConfigs();
      const guildIds = Object.keys(allConfigs || {});

      for (const guildId of guildIds) {
        const cfg = allConfigs[guildId];
        if (!cfg || !cfg.matchChannelId) continue;
        if (Array.isArray(cfg.modules) && cfg.modules.length) {
          if (!cfg.modules.includes("match_posts")) continue;
        }

        const channelId = cfg.matchChannelId;
        let channel;
        try {
          channel = await client.channels.fetch(channelId);
        } catch (e) {
          logger.warn({ channelId, err: e.message }, "Could not fetch match post channel");
          continue;
        }
        if (!channel || typeof channel.send !== "function") continue;

        const guildLinks = await links.getAllLinks(guildId);
        if (!guildLinks.length) continue;

        for (const link of guildLinks) {
          const { name, tag, region, discordId, puuid } = link;
          if (!name || !tag || !region || !discordId) continue;

          let match;
          try {
            match = await fetchLatestCompetitive(region, name, tag);
          } catch (e) {
            logger.warn({ player: `${name}#${tag}`, err: e.message }, "Match fetch failed");
            continue;
          }

          const matchId = match?.metadata?.matchid;
          if (!matchId) continue;

          const last = await lastMatches.getLastMatchId(guildId, discordId);
          if (!last) {
            await lastMatches.setLastMatchId(guildId, discordId, matchId);
            continue; // baseline without posting
          }
          if (last === matchId) continue;

          const summary = summarizeMatchForPlayer(match, name, tag);
          if (!summary) {
            await lastMatches.setLastMatchId(guildId, discordId, matchId);
            continue;
          }

          summary.rrChange = await tryGetRRChange(region, name, tag, matchId);

          // Fetch Discord display name for the match post (best-effort)
          let discordName = null;
          try {
            const guild = client.guilds.cache.get(guildId);
            if (guild) {
              const member = await guild.members.fetch(discordId);
              discordName = member.displayName;
            }
          } catch {
            // Non-fatal — fall back to gamertag-only display
          }
          summary.discordName = discordName;

          if (!limiter.canPost(channelId)) {
            logger.warn({ channelId }, "Channel post limit reached, skipping match post");
            await lastMatches.setLastMatchId(guildId, discordId, matchId);
            continue;
          }

          try {
            await channel.send({ embeds: [createMatchPostEmbed(summary)] });
            await lastMatches.setLastMatchId(guildId, discordId, matchId);

            // Non-blocking match history upsert
            matchHistory.upsertMatch({
              match_id: matchId,
              discord_id: discordId,
              puuid: puuid || null,
              player_name: name,
              player_tag: tag,
              region,
              agent: summary._player?.character || null,
              map: match?.metadata?.map || null,
              mode: match?.metadata?.mode || null,
              result: summary.result,
              kills: summary._player?.stats?.kills ?? null,
              deaths: summary._player?.stats?.deaths ?? null,
              assists: summary._player?.stats?.assists ?? null,
              score: summary._player?.stats?.score ?? null,
              team_rounds_won: summary._team?.rounds_won ?? null,
              enemy_rounds_won: summary._enemyTeam?.rounds_won ?? null,
              rr_change: summary.rrChange ?? null,
            }).catch(() => {});
          } catch (e) {
            logger.warn({ channelId, err: e.message }, "Failed to send match post");
          }
        }
      }
    } catch (e) {
      logger.error({ err: e }, "Poller tick error");
    } finally {
      running = false;
    }
  }

  const timer = setInterval(tick, intervalMs);
  // run soon after startup
  setTimeout(tick, 15 * 1000);

  return () => clearInterval(timer);
}

module.exports = { startMatchPoller };
