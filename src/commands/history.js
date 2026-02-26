const henrik = require("../api/henrik");
const storage = require("../storage/links");
const cache = require("../cache/cache");
const { createHistoryEmbed, createErrorEmbed } = require("../utils/embeds");
const { getAgentIconUrl } = require("../utils/agentAssets");
const matchHistory = require("../db/matchHistory");
const logger = require("../utils/logger").child({ module: "history-command" });

/**
 * Handle /history command
 * Shows recent match history for a player
 */
async function execute(interaction) {
  await interaction.deferReply();

  try {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const count = interaction.options.getInteger("count") || 5;

    // Get linked account
    const link = await storage.getLink(targetUser.id);

    if (!link) {
      const isSelf = targetUser.id === interaction.user.id;
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            isSelf
              ? "You haven't linked your account yet. Use `/link` to get started."
              : `${targetUser.username} hasn't linked their account yet.`
          ),
        ],
      });
    }

    const { name, tag, region } = link;
    const mode = "competitive";

    // Check cache first
    const cacheKey = cache.matchesKey(region, name, tag, mode);
    let matches = cache.get(cacheKey);

    if (!matches) {
      // Fetch from API (competitive only)
      matches = await henrik.getMatches(region, name, tag, Math.min(count, 20), mode);
      // Cache for 3 minutes
      cache.set(cacheKey, matches, 180);
    }

    // Fetch MMR history for RR changes
    let mmrHistory = [];
    try {
      mmrHistory = await henrik.getMMRHistory(region, name, tag);
    } catch (e) {
      logger.warn({ err: e.message, player: `${name}#${tag}` }, "Could not fetch MMR history");
    }

    // Create a map of match_id -> rr_change for quick lookup
    const rrChanges = new Map();
    for (const entry of mmrHistory) {
      if (entry.match_id) {
        rrChanges.set(entry.match_id, entry.mmr_change_to_last_game);
      }
    }

    // Format matches for embed
    const formattedMatches = matches.slice(0, count).map((match) => {
      const playerStats = match.players.all_players.find(
        (p) => p.name === name && p.tag === tag
      );

      if (!playerStats) {
        return null;
      }

      const playerTeam = playerStats.team.toLowerCase();
      const won = match.teams[playerTeam].has_won;
      const result = won ? "Victory" : "Defeat";
      const teamScore = match.teams[playerTeam].rounds_won;
      const enemyTeam = playerTeam === "red" ? "blue" : "red";
      const enemyScore = match.teams[enemyTeam].rounds_won;
      
      // Get RR change for this match
      const rrChange = rrChanges.get(match.metadata.matchid);

      return {
        map: match.metadata.map,
        agent: playerStats.character,
        score: `${teamScore}:${enemyScore}`,
        kda: `${playerStats.stats.kills}/${playerStats.stats.deaths}/${playerStats.stats.assists}`,
        result,
        rrChange,
      };
    }).filter(Boolean);

    // Fetch agent icons for all unique agents in one pass
    const uniqueAgents = [...new Set(formattedMatches.map((m) => m.agent))];
    const iconEntries = await Promise.all(
      uniqueAgents.map((a) => getAgentIconUrl(a).then((url) => [a, url]))
    );
    const agentIconMap = new Map(iconEntries);

    const matchesWithIcons = formattedMatches.map((m) => ({
      ...m,
      agentIconUrl: agentIconMap.get(m.agent) || null,
    }));

    const embeds = createHistoryEmbed(`${name}#${tag}`, matchesWithIcons);
    await interaction.editReply({ embeds });

    // Non-blocking batch upsert into match_history
    const displayedMatches = matches.slice(0, count);
    Promise.all(
      displayedMatches.map((match) => {
        const playerStats = match.players?.all_players?.find(
          (p) => p.name === name && p.tag === tag
        );
        if (!playerStats || !match.metadata?.matchid) return Promise.resolve();
        const playerTeam = playerStats.team?.toLowerCase();
        const teamRoundsWon = match.teams?.[playerTeam]?.rounds_won ?? null;
        const enemyTeamKey = playerTeam === 'red' ? 'blue' : 'red';
        const enemyRoundsWon = match.teams?.[enemyTeamKey]?.rounds_won ?? null;
        const won = match.teams?.[playerTeam]?.has_won;
        return matchHistory.upsertMatch({
          match_id: match.metadata.matchid,
          discord_id: targetUser.id,
          puuid: link.puuid || null,
          player_name: name,
          player_tag: tag,
          region,
          agent: playerStats.character || null,
          map: match.metadata.map || null,
          mode: match.metadata.mode || null,
          result: won ? 'Victory' : 'Defeat',
          kills: playerStats.stats?.kills ?? null,
          deaths: playerStats.stats?.deaths ?? null,
          assists: playerStats.stats?.assists ?? null,
          score: playerStats.stats?.score ?? null,
          team_rounds_won: teamRoundsWon,
          enemy_rounds_won: enemyRoundsWon,
          rr_change: rrChanges.get(match.metadata.matchid) ?? null,
        });
      })
    ).catch(() => {});
  } catch (error) {
    logger.error({ err: error }, "Error in /history command");
    await interaction.editReply({
      embeds: [createErrorEmbed(error.message || "Failed to fetch match history. Please try again.")],
    });
  }
}

module.exports = {
  name: "history",
  description: "View recent match history",
  options: [
    {
      name: "user",
      description: "User to check (leave empty for yourself)",
      type: 6, // USER
      required: false,
    },
    {
      name: "count",
      description: "Number of matches to show (1-10, default 5)",
      type: 4, // INTEGER
      required: false,
      minValue: 1,
      maxValue: 10,
    },
  ],
  execute,
};
