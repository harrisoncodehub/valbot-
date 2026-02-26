'use strict';
const supabase = require('../db/supabase');

/**
 * Map a DB row to camelCase config object.
 * @param {object} row
 */
function toConfig(row) {
  return {
    matchChannelId: row.match_channel_id || null,
    leaderboardChannelId: row.leaderboard_channel_id || null,
    rankPanelMessageId: row.rank_panel_message_id || null,
    rankPanelChannelId: row.rank_panel_channel_id || null,
    modules: row.modules || [],
    updatedAt: row.updated_at,
  };
}

/**
 * @param {string} guildId
 * @returns {Promise<{matchChannelId?, leaderboardChannelId?, rankPanelMessageId?, rankPanelChannelId?, modules: string[]}|null>}
 */
async function getGuildConfig(guildId) {
  if (!guildId) return null;
  const { data, error } = await supabase
    .from('guild_configs')
    .select('*')
    .eq('guild_id', guildId)
    .maybeSingle();
  if (error) {
    console.error('[guildConfig] getGuildConfig error:', error.message);
    return null;
  }
  if (!data) return null;
  return toConfig(data);
}

/**
 * Shallow-merge patch into guild config.
 * @param {string} guildId
 * @param {object} patch - camelCase keys
 * @returns {Promise<object>} updated config (camelCase)
 */
async function setGuildConfig(guildId, patch) {
  if (!guildId) {
    throw new Error('Missing guildId (this command must be used in a server).');
  }

  // Pre-fetch to merge
  const { data: existing } = await supabase
    .from('guild_configs')
    .select('*')
    .eq('guild_id', guildId)
    .maybeSingle();

  const base = existing || { modules: [] };

  const row = {
    guild_id: guildId,
    match_channel_id:
      patch.matchChannelId !== undefined
        ? patch.matchChannelId
        : base.match_channel_id || null,
    leaderboard_channel_id:
      patch.leaderboardChannelId !== undefined
        ? patch.leaderboardChannelId
        : base.leaderboard_channel_id || null,
    rank_panel_message_id:
      patch.rankPanelMessageId !== undefined
        ? patch.rankPanelMessageId
        : base.rank_panel_message_id || null,
    rank_panel_channel_id:
      patch.rankPanelChannelId !== undefined
        ? patch.rankPanelChannelId
        : base.rank_panel_channel_id || null,
    modules:
      patch.modules !== undefined
        ? patch.modules
        : Array.isArray(base.modules)
          ? base.modules
          : [],
    updated_at: new Date().toISOString(),
  };

  if (!Array.isArray(row.modules)) row.modules = [];

  const { data, error } = await supabase
    .from('guild_configs')
    .upsert(row, { onConflict: 'guild_id' })
    .select()
    .single();

  if (error) {
    console.error('[guildConfig] setGuildConfig error:', error.message);
    throw error;
  }

  return toConfig(data);
}

/**
 * Returns all guild configs as { [guildId]: configObj }.
 * @returns {Promise<object>}
 */
async function getAllGuildConfigs() {
  const { data, error } = await supabase.from('guild_configs').select('*');
  if (error) {
    console.error('[guildConfig] getAllGuildConfigs error:', error.message);
    return {};
  }
  const result = {};
  for (const row of data || []) {
    result[row.guild_id] = toConfig(row);
  }
  return result;
}

module.exports = { getGuildConfig, setGuildConfig, getAllGuildConfigs };
