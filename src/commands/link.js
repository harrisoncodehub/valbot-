const henrik = require("../api/henrik");
const storage = require("../storage/links");
const { createLinkEmbed, createErrorEmbed } = require("../utils/embeds");

/**
 * Handle /link command
 * Links a user's Discord account to their VALORANT account
 */
async function execute(interaction) {
  await interaction.deferReply();

  try {
    const name = interaction.options.getString("name");
    const tag = interaction.options.getString("tag");
    const region = interaction.options.getString("region");

    // Validate account exists via Henrik API
    const accountData = await henrik.getAccount(name, tag);

    if (!accountData) {
      return interaction.editReply({
        embeds: [createErrorEmbed("Account not found. Please check your name and tag.")],
      });
    }

    // Store the link
    await storage.setLink(interaction.user.id, {
      name,
      tag,
      region,
      puuid: accountData.puuid,
      guildId: interaction.guildId,
    });

    // Success embed
    const embed = createLinkEmbed(
      name,
      tag,
      region,
      accountData.account_level || 0
    );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Error in /link command:", error);
    await interaction.editReply({
      embeds: [createErrorEmbed(error.message || "Failed to link account. Please try again.")],
    });
  }
}

module.exports = {
  name: "link",
  description: "Link your Discord account to your VALORANT account",
  options: [
    {
      name: "name",
      description: "Your VALORANT name (without tag)",
      type: 3, // STRING
      required: true,
    },
    {
      name: "tag",
      description: "Your VALORANT tag (without #)",
      type: 3, // STRING
      required: true,
    },
    {
      name: "region",
      description: "Your region",
      type: 3, // STRING
      required: true,
      choices: [
        { name: "North America", value: "na" },
        { name: "Europe", value: "eu" },
        { name: "Korea", value: "kr" },
        { name: "Asia Pacific", value: "ap" },
        { name: "Brazil", value: "br" },
        { name: "Latin America", value: "latam" },
      ],
    },
  ],
  execute,
};
