require("dotenv").config({ quiet: true });
const { Client, Intents } = require("discord.js");
const { checkLimits } = require("./src/utils/rateLimit");
const { startMatchPoller } = require("./src/jobs/matchPoller");

// Import commands
const linkCommand = require("./src/commands/link");
const profileCommand = require("./src/commands/profile");
const historyCommand = require("./src/commands/history");
const matchCommand = require("./src/commands/match");
const setupCommand = require("./src/commands/setup");
const leaderboardCommand = require("./src/commands/leaderboard");
const dailyCommand = require("./src/commands/daily");
const weeklyCommand = require("./src/commands/weekly");

const client = new Client({ intents: [Intents.FLAGS.GUILDS] });

// Store commands in a Map for easy access
const commands = new Map();
commands.set("link", linkCommand);
commands.set("profile", profileCommand);
commands.set("history", historyCommand);
commands.set("match", matchCommand);
commands.set("setup", setupCommand);
commands.set("leaderboard", leaderboardCommand);
commands.set("daily", dailyCommand);
commands.set("weekly", weeklyCommand);

client.once("ready", (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  startMatchPoller(client);
  console.log("🕒 Match poller started");
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  // Discard interactions older than 2.5s — their token is already expired
  // (happens when Discord replays unacknowledged interactions after a restart)
  if (Date.now() - interaction.createdTimestamp > 2500) return;

  try {
    // Handle ping command separately (no rate limit)
    if (interaction.commandName === "ping") {
      console.log("Received /ping, replying...");
      await interaction.reply("pong 🏓");
      return;
    }

    // Check rate limits for VALORANT commands
    const limitCheck = checkLimits(interaction.user.id, interaction.guildId);
    if (limitCheck.limited) {
      return interaction.reply({
        content: limitCheck.message,
        ephemeral: true,
      });
    }

    // Execute command
    const command = commands.get(interaction.commandName);
    if (command) {
      await command.execute(interaction);
    }
} catch (error) {
    console.error("Interaction error:", error);
    try {
      const msg = { content: "Something went wrong.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg).catch(() => {});
      } else {
        await interaction.reply(msg).catch(() => {});
      }
    } catch (e) {
      console.error("Failed to send error reply:", e);
    }
  }
});

console.log("🔄 Starting bot...");

client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error("❌ Failed to login:", error);
  process.exit(1);
});