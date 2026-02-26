const henrik = require("../api/henrik");
const links = require("../storage/links");
const cache = require("../cache/cache");
const { createLeaderboardEmbed, createErrorEmbed } = require("../utils/embeds");
const logger = require("../utils/logger").child({ module: "leaderboard-command" });

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await fn(items[current], current);
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

function computeFromMatches(name, tag, matches) {
  if (!Array.isArray(matches) || matches.length === 0) {
    return { winrate: null, kd: null, sample: 0 };
  }

  let wins = 0;
  let games = 0;
  let kills = 0;
  let deaths = 0;

  for (const match of matches) {
    const player = match?.players?.all_players?.find(
      (p) => p.name === name && p.tag === tag
    );
    if (!player) continue;
    const teamKey = player.team?.toLowerCase();
    const team = match?.teams?.[teamKey];
    if (!team) continue;

    games++;
    if (team.has_won) wins++;
    kills += player.stats?.kills || 0;
    deaths += player.stats?.deaths || 0;
  }

  const winrate = games ? Math.round((wins / games) * 100) : null;
  const kd = deaths ? (kills / deaths).toFixed(2) : games ? "Perfect" : null;
  return { winrate, kd, sample: games };
}

async function execute(interaction) {
  await interaction.deferReply();

  try {
    if (!interaction.guildId) {
      return interaction.editReply({
        embeds: [createErrorEmbed("`/leaderboard` can only be used inside a server.")],
      });
    }

    const count = Math.min(interaction.options.getInteger("count") || 10, 25);
    const guildLinks = await links.getAllLinks(interaction.guildId);

    if (!guildLinks.length) {
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            "No one in this server is linked yet. Use `/link` first, then try `/leaderboard`."
          ),
        ],
      });
    }

    const rows = await mapLimit(guildLinks, 3, async (link) => {
      const { name, tag, region } = link;

      // MMR (cached)
      const pKey = cache.profileKey(region, name, tag);
      let mmr = cache.get(pKey);
      if (!mmr) {
        mmr = await henrik.getMMR(region, name, tag);
        cache.set(pKey, mmr, 600);
      }

      const tier =
        mmr?.current_data?.currenttier ?? mmr?.currenttier ?? 0;
      const rank =
        mmr?.current_data?.currenttierpatched ??
        mmr?.currenttierpatched ??
        "Unranked";
      const rr =
        mmr?.current_data?.ranking_in_tier ??
        mmr?.ranking_in_tier ??
        0;

      // Recent matches (cached)
      const mode = "competitive";
      const mKey = cache.matchesKey(region, name, tag, mode);
      let matches = cache.get(mKey);
      if (!matches) {
        matches = await henrik.getMatches(region, name, tag, 10, mode);
        cache.set(mKey, matches, 180);
      }
      const computed = computeFromMatches(name, tag, matches.slice(0, 10));

      return {
        discordId: link.discordId,
        name,
        tag,
        region,
        tier,
        rank,
        rr,
        winrate: computed.winrate,
        kd: computed.kd,
        sample: computed.sample,
      };
    });

    const ok = rows.filter(Boolean);
    ok.sort((a, b) => (b.tier - a.tier) || (b.rr - a.rr));
    const top = ok.slice(0, count);

    // Bulk-fetch Discord display names for leaderboard entries
    const memberNameMap = new Map();
    try {
      const userIds = top.map((r) => r.discordId).filter(Boolean);
      if (userIds.length > 0) {
        const members = await interaction.guild.members.fetch({ user: userIds });
        for (const [id, member] of members) {
          memberNameMap.set(id, member.displayName);
        }
      }
    } catch (e) {
      logger.warn({ err: e.message }, "Could not bulk-fetch guild members");
    }

    const annotatedTop = top.map((r) => ({
      ...r,
      discordName: memberNameMap.get(r.discordId) ?? null,
    }));

    const embed = createLeaderboardEmbed(interaction.guild, annotatedTop);
    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error({ err: error }, "Error in /leaderboard");
    return interaction.editReply({
      embeds: [createErrorEmbed(error.message || "Failed to build leaderboard.")],
    });
  }
}

module.exports = {
  name: "leaderboard",
  description: "Show this server's linked players leaderboard",
  options: [
    {
      name: "count",
      description: "How many players to show (max 25, default 10)",
      type: 4, // INTEGER
      required: false,
      minValue: 1,
      maxValue: 25,
    },
  ],
  execute,
};
