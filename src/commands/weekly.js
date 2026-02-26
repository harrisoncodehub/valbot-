const { fetchProgressRows } = require("../utils/rankProgress");
const { createProgressEmbed, createErrorEmbed } = require("../utils/embeds");
const logger = require("../utils/logger").child({ module: "weekly-command" });

async function execute(interaction) {
  await interaction.deferReply();

  try {
    if (!interaction.guildId) {
      return interaction.editReply({
        embeds: [createErrorEmbed("`/weekly` can only be used inside a server.")],
      });
    }

    const rows = await fetchProgressRows(interaction.guildId, 604_800_000);

    if (!rows.length) {
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            "No one in this server is linked yet. Use `/link` first, then try `/weekly`."
          ),
        ],
      });
    }

    const embed = createProgressEmbed(
      "📅 Weekly Progress",
      rows,
      "Last 7 days",
      interaction.guild
    );
    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error({ err: error }, "Error in /weekly");
    return interaction.editReply({
      embeds: [createErrorEmbed(error.message || "Failed to build weekly progress.")],
    });
  }
}

module.exports = {
  name: "weekly",
  description: "Show this week's RR gains/losses for all linked server members",
  options: [],
  execute,
};
