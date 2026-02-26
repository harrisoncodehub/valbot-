const { MessageEmbed } = require("discord.js");

/**
 * Embed helpers for consistent, Zoe-style formatting
 */

// Valorant rank colors
const RANK_COLORS = {
  Unranked: "#A8A8A8",
  Iron: "#4F514F",
  Bronze: "#A0715E",
  Silver: "#A0ADB5",
  Gold: "#ECA63E",
  Platinum: "#59A9B6",
  Diamond: "#B489D4",
  Ascendant: "#5A8F7B",
  Immortal: "#BB4D5C",
  Radiant: "#FFFFAA",
};

/**
 * Get color for rank
 * @param {string} rank - Rank name
 * @returns {string} - Hex color
 */
function getRankColor(rank) {
  for (const [key, color] of Object.entries(RANK_COLORS)) {
    if (rank.includes(key)) {
      return color;
    }
  }
  return "#5865F2"; // Discord blurple default
}

/**
 * Create embed for successful account link
 * @param {string} name - Player name
 * @param {string} tag - Player tag
 * @param {string} region - Region
 * @param {number} level - Account level
 * @returns {MessageEmbed}
 */
function createLinkEmbed(name, tag, region, level) {
  return new MessageEmbed()
    .setColor("#57F287") // Green
    .setTitle("✅ Account Linked Successfully")
    .setDescription(`**${name}#${tag}**`)
    .addField("Region", region.toUpperCase(), true)
    .addField("Level", level.toString(), true)
    .setTimestamp()
    .setFooter({ text: "Use /profile to see your stats" });
}

/**
 * Create embed for player profile
 * @param {Object} data - {name, tag, region, rank, rr, mmr, rrChange, level, wins, losses, mostPlayedAgent, agentImageUrl}
 * @returns {MessageEmbed}
 */
function createProfileEmbed(data) {
  const { name, tag, region, rank, rr, mmr, rrChange, level, wins, losses, mostPlayedAgent, agentImageUrl } = data;
  const color = getRankColor(rank);

  // Format RR change from last game
  let rrChangeText = "";
  if (rrChange !== undefined && rrChange !== null) {
    const sign = rrChange >= 0 ? "+" : "";
    rrChangeText = ` (${sign}${rrChange})`;
  }

  const embed = new MessageEmbed()
    .setColor(color)
    .setTitle(`${name}#${tag}`)
    .setDescription(`**${rank}**`)
    .addField("Current RR", `${rr}/100${rrChangeText}`, true)
    .addField("MMR", mmr?.toString() || "N/A", true)
    .addField("Region", region.toUpperCase(), true)
    .addField("Level", level?.toString() || "N/A", true)
    .setTimestamp()
    .setFooter({ text: "Use /history to see recent matches" });

  if (wins !== null && wins !== undefined) {
    const total = wins + losses;
    const winPct = total > 0 ? Math.round((wins / total) * 100) : 0;
    embed.addField("Last 10 Matches", `${wins}W ${losses}L • ${winPct}% WR`, true);
  }

  if (mostPlayedAgent) {
    embed.addField("Top Agent", mostPlayedAgent, true);
  }

  if (agentImageUrl) {
    embed.setThumbnail(agentImageUrl);
  }

  return embed;
}

/**
 * Create embeds for match history — one embed per match with agent thumbnail.
 * @param {string} playerName - Player name#tag
 * @param {Array} matches - Array of match objects (with optional agentIconUrl)
 * @returns {MessageEmbed[]}
 */
function createHistoryEmbed(playerName, matches) {
  if (!matches || matches.length === 0) {
    return [
      new MessageEmbed()
        .setColor("#5865F2")
        .setTitle(`📊 Recent Matches — ${playerName}`)
        .setDescription("No recent matches found.")
        .setTimestamp(),
    ];
  }

  return matches.map((match, index) => {
    const { map, agent, score, kda, result, rrChange, agentIconUrl } = match;
    const emoji = result === "Victory" ? "🟢" : "🔴";

    let rrText = "";
    if (rrChange !== undefined && rrChange !== null) {
      const rrSign = rrChange >= 0 ? "+" : "";
      rrText = ` • ${rrSign}${rrChange} RR`;
    }

    const embed = new MessageEmbed()
      .setColor(result === "Victory" ? "#57F287" : "#ED4245")
      .setAuthor({ name: playerName })
      .setTitle(`${index + 1}. ${map}`)
      .setDescription(`${emoji} **${result}**${rrText}`)
      .addField("Score", score, true)
      .addField("K/D/A", kda, true);

    if (agentIconUrl) {
      embed.setThumbnail(agentIconUrl);
    }

    if (index === matches.length - 1) {
      embed.setFooter({ text: "Use /match <number> for detailed stats" });
    }

    return embed;
  });
}

/**
 * Create embed for detailed match info
 * @param {Object} matchData - Full match data
 * @returns {MessageEmbed}
 */
function createMatchEmbed(matchData) {
  const { map, mode, result, score, agent, stats, rounds } = matchData;
  const color = result === "Victory" ? "#57F287" : "#ED4245";

  const embed = new MessageEmbed()
    .setColor(color)
    .setTitle(`${result} - ${map}`)
    .setDescription(`**${mode}** • ${score}`)
    .addField("Agent", agent, true)
    .addField("K/D/A", stats.kda, true)
    .addField("ACS", stats.acs?.toString() || "N/A", true)
    .addField("Kills", stats.kills?.toString() || "0", true)
    .addField("Deaths", stats.deaths?.toString() || "0", true)
    .addField("Assists", stats.assists?.toString() || "0", true)
    .setTimestamp();

  if (rounds) {
    embed.addField("Rounds", rounds, false);
  }

  return embed;
}

/**
 * Create error embed
 * @param {string} message - Error message
 * @returns {MessageEmbed}
 */
function createErrorEmbed(message) {
  return new MessageEmbed()
    .setColor("#ED4245") // Red
    .setTitle("❌ Error")
    .setDescription(message)
    .setTimestamp();
}

/**
 * Create embed for server leaderboard
 * @param {import("discord.js").Guild} guild
 * @param {Array} rows - Array of {name, tag, rank, rr, winrate, kd, sample, region}
 * @returns {MessageEmbed}
 */
function createLeaderboardEmbed(guild, rows) {
  const embed = new MessageEmbed()
    .setColor("#FEE75C")
    .setTitle(`🏆 Leaderboard — ${guild?.name || "Server"}`)
    .setTimestamp();

  if (!rows || rows.length === 0) {
    embed.setDescription("No ranked data found yet.");
    return embed;
  }

  const lines = rows.map((r, i) => {
    const wr =
      r.winrate === null || r.winrate === undefined
        ? "WR N/A"
        : `WR ${r.winrate}%${r.sample ? ` (${r.sample})` : ""}`;
    const kd = r.kd ? `K/D ${r.kd}` : "K/D N/A";
    const rr = typeof r.rr === "number" ? `${r.rr} RR` : "RR N/A";
    const region = r.region ? ` • ${String(r.region).toUpperCase()}` : "";
    const playerLabel = r.discordName
      ? `**${r.discordName}** (${r.name}#${r.tag})`
      : `**${r.name}#${r.tag}**`;
    return `${i + 1}. ${playerLabel} — **${r.rank}** (${rr}) — ${wr} — ${kd}${region}`;
  });

  embed.setDescription(lines.join("\n"));
  embed.setFooter({ text: "Tip: use /profile or /history for details" });
  return embed;
}

/**
 * Create embed for daily/weekly rank progress leaderboard
 * @param {string} title - Embed title prefix (e.g. "📈 Daily Gains")
 * @param {Array} rows - Array of {name, tag, rank, rr, rrDelta, matchCount}
 * @param {string} periodLabel - Footer label (e.g. "Last 24h")
 * @param {import("discord.js").Guild} guild
 * @returns {MessageEmbed}
 */
function createProgressEmbed(title, rows, periodLabel, guild) {
  const embed = new MessageEmbed()
    .setColor("#FEE75C")
    .setTitle(`${title} — ${guild?.name || "Server"}`)
    .setTimestamp()
    .setFooter({ text: periodLabel });

  if (!rows || rows.length === 0) {
    embed.setDescription("No ranked data found.");
    return embed;
  }

  const lines = rows.map((r, i) => {
    const rrText = typeof r.rr === "number" ? ` (${r.rr} RR)` : "";
    const rankStr = r.rank && r.rank !== "Unranked" ? `${r.rank}${rrText}` : "Unranked";

    if (r.matchCount === 0) {
      return `${i + 1}. **${r.name}#${r.tag}** — ${rankStr} — no games`;
    }

    const sign = r.rrDelta > 0 ? "+" : "";
    const emoji = r.rrDelta > 0 ? "🟢" : r.rrDelta < 0 ? "🔴" : "⚪";
    const plural = r.matchCount === 1 ? "match" : "matches";
    return `${i + 1}. **${r.name}#${r.tag}** — ${rankStr} — ${emoji} ${sign}${r.rrDelta} RR (${r.matchCount} ${plural})`;
  });

  embed.setDescription(lines.join("\n"));
  return embed;
}

/**
 * Create embed for automated match posts
 * @param {Object} data
 * @param {string} data.player - "name#tag"
 * @param {string} data.map
 * @param {string} data.mode
 * @param {string} data.result - "Victory" | "Defeat"
 * @param {string} data.score - "13:11"
 * @param {string} data.agent
 * @param {string} data.kda - "20/15/4"
 * @param {number|null|undefined} data.rrChange
 * @returns {MessageEmbed}
 */
function createMatchPostEmbed(data) {
  const color = data.result === "Victory" ? "#57F287" : "#ED4245";
  const rr =
    data.rrChange === undefined || data.rrChange === null
      ? ""
      : ` • ${data.rrChange >= 0 ? "+" : ""}${data.rrChange} RR`;

  return new MessageEmbed()
    .setColor(color)
    .setTitle(`🎮 ${data.discordName ? `${data.discordName} (${data.player})` : data.player} — ${data.result}${rr}`)
    .setDescription(`**${data.map}** • ${data.mode} • ${data.score}`)
    .addField("Agent", data.agent || "Unknown", true)
    .addField("K/D/A", data.kda || "N/A", true)
    .setTimestamp();
}

module.exports = {
  createLinkEmbed,
  createProfileEmbed,
  createHistoryEmbed,
  createMatchEmbed,
  createErrorEmbed,
  createLeaderboardEmbed,
  createMatchPostEmbed,
  createProgressEmbed,
  getRankColor,
};
