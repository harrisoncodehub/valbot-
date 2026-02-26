const henrik = require("../api/henrik");
const storage = require("../storage/links");
const cache = require("../cache/cache");
const { createMatchEmbed, createErrorEmbed } = require("../utils/embeds");
const matchHistory = require("../db/matchHistory");
const logger = require("../utils/logger").child({ module: "match-command" });

/**
 * Handle /match command
 * Shows detailed stats for a specific match
 */
async function execute(interaction) {
  await interaction.deferReply();

  try {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const index = interaction.options.getInteger("index") || 1;

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

    // Get match history to find the match at index (competitive only)
    const cacheKey = cache.matchesKey(region, name, tag, mode);
    let matches = cache.get(cacheKey);

    if (!matches) {
      matches = await henrik.getMatches(region, name, tag, 10, mode);
      cache.set(cacheKey, matches, 180);
    }

    if (index < 1 || index > matches.length) {
      return interaction.editReply({
        embeds: [createErrorEmbed(`Invalid match index. Please choose between 1 and ${matches.length}.`)],
      });
    }

    const match = matches[index - 1];
    const playerStats = match.players.all_players.find(
      (p) => p.name === name && p.tag === tag
    );

    if (!playerStats) {
      return interaction.editReply({
        embeds: [createErrorEmbed("Could not find your stats in this match.")],
      });
    }

    const playerTeam = playerStats.team.toLowerCase();
    const won = match.teams[playerTeam].has_won;
    const result = won ? "Victory" : "Defeat";
    const teamScore = match.teams[playerTeam].rounds_won;
    const enemyTeam = playerTeam === "red" ? "blue" : "red";
    const enemyScore = match.teams[enemyTeam].rounds_won;

    const matchData = {
      map: match.metadata.map,
      mode: match.metadata.mode,
      result,
      score: `${teamScore}:${enemyScore}`,
      agent: playerStats.character,
      stats: {
        kda: `${playerStats.stats.kills}/${playerStats.stats.deaths}/${playerStats.stats.assists}`,
        kills: playerStats.stats.kills,
        deaths: playerStats.stats.deaths,
        assists: playerStats.stats.assists,
        acs: playerStats.stats.score / match.rounds.length || 0,
      },
      rounds: `${match.rounds.length} rounds`,
    };

    const embed = createMatchEmbed(matchData);
    await interaction.editReply({ embeds: [embed] });

    // Non-blocking match history upsert
    matchHistory.upsertMatch({
      match_id: match.metadata.matchid,
      discord_id: targetUser.id,
      puuid: link.puuid || null,
      player_name: name,
      player_tag: tag,
      region,
      agent: playerStats.character || null,
      map: match.metadata.map || null,
      mode: match.metadata.mode || null,
      result: matchData.result,
      kills: playerStats.stats.kills,
      deaths: playerStats.stats.deaths,
      assists: playerStats.stats.assists,
      score: playerStats.stats.score || null,
      team_rounds_won: teamScore,
      enemy_rounds_won: enemyScore,
      rr_change: null,
    }).catch(() => {});
  } catch (error) {
    logger.error({ err: error }, "Error in /match command");
    await interaction.editReply({
      embeds: [createErrorEmbed(error.message || "Failed to fetch match details. Please try again.")],
    });
  }
}

module.exports = {
  name: "match",
  description: "View detailed stats for a specific match",
  options: [
    {
      name: "index",
      description: "Match number from history (1 = most recent, default 1)",
      type: 4, // INTEGER
      required: false,
      minValue: 1,
      maxValue: 10,
    },
    {
      name: "user",
      description: "User to check (leave empty for yourself)",
      type: 6, // USER
      required: false,
    },
  ],
  execute,
};
