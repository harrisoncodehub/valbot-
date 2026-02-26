const henrik = require("../api/henrik");
const storage = require("../storage/links");
const cache = require("../cache/cache");
const { createProfileEmbed, createErrorEmbed } = require("../utils/embeds");
const { getAgentIconUrl } = require("../utils/agentAssets");
const logger = require("../utils/logger").child({ module: "profile-command" });

/**
 * Handle /profile command
 * Shows ranked stats for a player
 */
async function execute(interaction) {
  await interaction.deferReply();

  try {
    const targetUser = interaction.options.getUser("user") || interaction.user;

    // Get linked account
    const link = await storage.getLink(targetUser.id);

    if (!link) {
      const isself = targetUser.id === interaction.user.id;
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            isself
              ? "You haven't linked your account yet. Use `/link` to get started."
              : `${targetUser.username} hasn't linked their account yet.`
          ),
        ],
      });
    }

    const { name, tag, region } = link;

    // Check MMR cache first
    const cacheKey = cache.profileKey(region, name, tag);
    let mmrData = cache.get(cacheKey);

    // Fetch matches from cache or API (shared key with /history)
    const matchesCacheKey = cache.matchesKey(region, name, tag, "competitive");
    let cachedMatches = cache.get(matchesCacheKey);

    // Kick off all fetches in parallel
    const [mmrResult, matchesResult, accountData] = await Promise.all([
      mmrData
        ? Promise.resolve(mmrData)
        : henrik.getMMR(region, name, tag).then((data) => {
            cache.set(cacheKey, data, 600);
            return data;
          }),
      cachedMatches
        ? Promise.resolve(cachedMatches)
        : henrik.getMatches(region, name, tag, 10, "competitive").then((data) => {
            cache.set(matchesCacheKey, data, 180);
            return data;
          }).catch(() => null),
      henrik.getAccount(name, tag),
    ]);

    mmrData = mmrResult;
    const matches = matchesResult;

    // Compute W/L and most played agent from matches
    let wins = 0;
    let losses = 0;
    const agentCounts = new Map();

    if (Array.isArray(matches)) {
      for (const match of matches.slice(0, 10)) {
        const playerStats = match.players?.all_players?.find(
          (p) => p.name === name && p.tag === tag
        );
        if (!playerStats) continue;

        const playerTeam = playerStats.team.toLowerCase();
        if (match.teams?.[playerTeam]?.has_won) {
          wins++;
        } else {
          losses++;
        }

        const agent = playerStats.character;
        if (agent) {
          agentCounts.set(agent, (agentCounts.get(agent) || 0) + 1);
        }
      }
    }

    let mostPlayedAgent = null;
    let topCount = 0;
    for (const [agent, count] of agentCounts) {
      if (count > topCount) {
        topCount = count;
        mostPlayedAgent = agent;
      }
    }

    const agentImageUrl = await getAgentIconUrl(mostPlayedAgent);
    const totalGames = wins + losses;

    // Create embed
    const embed = createProfileEmbed({
      name,
      tag,
      region,
      rank: mmrData.current_data?.currenttierpatched || mmrData.currenttierpatched || "Unranked",
      rr: mmrData.current_data?.ranking_in_tier ?? mmrData.ranking_in_tier ?? 0,
      mmr: mmrData.current_data?.elo || mmrData.elo,
      rrChange: mmrData.current_data?.mmr_change_to_last_game ?? mmrData.mmr_change_to_last_game,
      level: accountData.account_level,
      wins: totalGames > 0 ? wins : null,
      losses: totalGames > 0 ? losses : null,
      mostPlayedAgent,
      agentImageUrl,
    });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error({ err: error }, "Error in /profile command");
    await interaction.editReply({
      embeds: [createErrorEmbed(error.message || "Failed to fetch profile. Please try again.")],
    });
  }
}

module.exports = {
  name: "profile",
  description: "View VALORANT profile and rank",
  options: [
    {
      name: "user",
      description: "User to check (leave empty for yourself)",
      type: 6, // USER
      required: false,
    },
  ],
  execute,
};
