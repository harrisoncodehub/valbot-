require("dotenv").config({ quiet: true });

const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
const logger = require("./src/utils/logger").child({ module: "register-commands" });

// Import command definitions
const linkCommand = require("./src/commands/link");
const profileCommand = require("./src/commands/profile");
const historyCommand = require("./src/commands/history");
const matchCommand = require("./src/commands/match");
const setupCommand = require("./src/commands/setup");
const leaderboardCommand = require("./src/commands/leaderboard");
const dailyCommand = require("./src/commands/daily");
const weeklyCommand = require("./src/commands/weekly");

const commands = [
  {
    name: "ping",
    description: "Replies with pong!",
  },
  {
    name: linkCommand.name,
    description: linkCommand.description,
    options: linkCommand.options,
  },
  {
    name: profileCommand.name,
    description: profileCommand.description,
    options: profileCommand.options,
  },
  {
    name: historyCommand.name,
    description: historyCommand.description,
    options: historyCommand.options,
  },
  {
    name: matchCommand.name,
    description: matchCommand.description,
    options: matchCommand.options,
  },
  {
    name: setupCommand.name,
    description: setupCommand.description,
    options: setupCommand.options,
  },
  {
    name: leaderboardCommand.name,
    description: leaderboardCommand.description,
    options: leaderboardCommand.options,
  },
  {
    name: dailyCommand.name,
    description: dailyCommand.description,
    options: dailyCommand.options,
  },
  {
    name: weeklyCommand.name,
    description: weeklyCommand.description,
    options: weeklyCommand.options,
  },
];

const rest = new REST({ version: "9" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    logger.info("Registering slash commands");

    // Try to register guild commands first (faster, instant update)
    if (process.env.GUILD_ID) {
      logger.info({ guildId: process.env.GUILD_ID }, "Registering guild commands");
      await rest.put(
        Routes.applicationGuildCommands(
          process.env.CLIENT_ID,
          process.env.GUILD_ID
        ),
        { body: commands }
      );
      logger.info("Successfully registered guild commands");
    } else {
      throw new Error("GUILD_ID not found in .env file");
    }
  } catch (error) {
    if (error.code === 50001) {
      logger.error({ code: error.code }, "Missing Access (50001) while registering commands");
      logger.error("This usually means:");
      logger.error("1. The bot hasn't been invited to the server with 'applications.commands' scope");
      logger.error("2. The bot isn't in the server");
      logger.error("3. The CLIENT_ID or GUILD_ID in .env is incorrect");
      logger.error("To fix this:");
      logger.error("1. Go to Discord Developer Portal -> Your Application -> OAuth2 -> URL Generator");
      logger.error("2. Select scopes: 'bot' and 'applications.commands'");
      logger.error("3. Select bot permissions you need (e.g., 'Send Messages')");
      logger.error("4. Copy the generated URL and invite the bot to your server");
      logger.error("Alternatively, you can register global commands (takes up to 1 hour to propagate):");
      logger.error("Change Routes.applicationGuildCommands to Routes.applicationCommands");
    } else {
      logger.error({ err: error }, "Command registration failed");
    }
  }
})();
