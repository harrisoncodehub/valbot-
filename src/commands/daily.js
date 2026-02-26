const { fetchProgressRows } = require("../utils/rankProgress");
const { createProgressEmbed, createErrorEmbed } = require("../utils/embeds");

async function execute(interaction) {
  await interaction.deferReply();

  try {
    if (!interaction.guildId) {
      return interaction.editReply({
        embeds: [createErrorEmbed("`/daily` can only be used inside a server.")],
      });
    }

    const rows = await fetchProgressRows(interaction.guildId, 86_400_000);

    if (!rows.length) {
      return interaction.editReply({
        embeds: [
          createErrorEmbed(
            "No one in this server is linked yet. Use `/link` first, then try `/daily`."
          ),
        ],
      });
    }

    const embed = createProgressEmbed(
      "📈 Daily Gains",
      rows,
      "Last 24h",
      interaction.guild
    );
    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Error in /daily:", error);
    return interaction.editReply({
      embeds: [createErrorEmbed(error.message || "Failed to build daily progress.")],
    });
  }
}

module.exports = {
  name: "daily",
  description: "Show today's RR gains/losses for all linked server members",
  options: [],
  execute,
};
