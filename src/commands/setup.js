const { Permissions } = require("discord.js");
const guildConfig = require("../storage/guildConfig");
const { createErrorEmbed } = require("../utils/embeds");

const MODULES = [
  { name: "Match posts", value: "match_posts" },
  { name: "Leaderboard", value: "leaderboard" },
];

function requireManageGuild(interaction) {
  const perms = interaction.memberPermissions;
  if (!perms) return true; // best-effort in case of partials
  return perms.has(Permissions.FLAGS.MANAGE_GUILD);
}

async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    if (!interaction.guildId) {
      return interaction.editReply({
        embeds: [createErrorEmbed("`/setup` can only be used inside a server.")],
      });
    }

    if (!requireManageGuild(interaction)) {
      return interaction.editReply({
        embeds: [createErrorEmbed("You need **Manage Server** to use `/setup`.")],
      });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "show") {
      const cfg = (await guildConfig.getGuildConfig(interaction.guildId)) || {
        modules: [],
      };
      const lines = [
        `**Match channel**: ${cfg.matchChannelId ? `<#${cfg.matchChannelId}>` : "Not set"}`,
        `**Leaderboard channel**: ${
          cfg.leaderboardChannelId ? `<#${cfg.leaderboardChannelId}>` : "Not set"
        }`,
        `**Modules**: ${
          Array.isArray(cfg.modules) && cfg.modules.length
            ? cfg.modules.map((m) => `\`${m}\``).join(", ")
            : "None enabled"
        }`,
      ];
      return interaction.editReply({ content: lines.join("\n") });
    }

    if (sub === "matchchannel") {
      const channel = interaction.options.getChannel("channel", true);
      const updated = await guildConfig.setGuildConfig(interaction.guildId, {
        matchChannelId: channel.id,
      });
      if (!updated.modules.includes("match_posts")) {
        updated.modules = Array.from(new Set([...updated.modules, "match_posts"]));
        await guildConfig.setGuildConfig(interaction.guildId, { modules: updated.modules });
      }
      return interaction.editReply({
        content: `✅ Match posts will go to <#${channel.id}>.`,
      });
    }

    if (sub === "leaderboardchannel") {
      const channel = interaction.options.getChannel("channel", true);
      const updated = await guildConfig.setGuildConfig(interaction.guildId, {
        leaderboardChannelId: channel.id,
      });
      if (!updated.modules.includes("leaderboard")) {
        updated.modules = Array.from(new Set([...updated.modules, "leaderboard"]));
        await guildConfig.setGuildConfig(interaction.guildId, { modules: updated.modules });
      }
      return interaction.editReply({
        content: `✅ Leaderboard posts will go to <#${channel.id}>.`,
      });
    }

    if (sub === "module") {
      const moduleName = interaction.options.getString("name", true);
      const enabled = interaction.options.getBoolean("enabled", true);
      const current = (await guildConfig.getGuildConfig(interaction.guildId)) || {
        modules: [],
      };
      const set = new Set(Array.isArray(current.modules) ? current.modules : []);
      if (enabled) set.add(moduleName);
      else set.delete(moduleName);
      await guildConfig.setGuildConfig(interaction.guildId, { modules: Array.from(set) });
      return interaction.editReply({
        content: `✅ Module \`${moduleName}\` is now **${enabled ? "enabled" : "disabled"}**.`,
      });
    }

    return interaction.editReply({
      embeds: [createErrorEmbed("Unknown setup subcommand.")],
    });
  } catch (error) {
    console.error("Error in /setup:", error);
    return interaction.editReply({
      embeds: [createErrorEmbed(error.message || "Failed to update setup.")],
    });
  }
}

module.exports = {
  name: "setup",
  description: "Configure valBot for this server (admin only)",
  options: [
    {
      name: "show",
      description: "Show current server configuration",
      type: 1, // SUB_COMMAND
    },
    {
      name: "matchchannel",
      description: "Set the channel for automatic match posts",
      type: 1, // SUB_COMMAND
      options: [
        {
          name: "channel",
          description: "Channel to post match updates in",
          type: 7, // CHANNEL
          required: true,
        },
      ],
    },
    {
      name: "leaderboardchannel",
      description: "Set the channel for leaderboard posts",
      type: 1, // SUB_COMMAND
      options: [
        {
          name: "channel",
          description: "Channel to post leaderboards in",
          type: 7, // CHANNEL
          required: true,
        },
      ],
    },
    {
      name: "module",
      description: "Enable/disable modules for this server",
      type: 1, // SUB_COMMAND
      options: [
        {
          name: "name",
          description: "Module name",
          type: 3, // STRING
          required: true,
          choices: MODULES,
        },
        {
          name: "enabled",
          description: "Enable or disable the module",
          type: 5, // BOOLEAN
          required: true,
        },
      ],
    },
  ],
  execute,
};

