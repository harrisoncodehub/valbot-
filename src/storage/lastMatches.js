'use strict';
const supabase = require('../db/supabase');

/**
 * @param {string} guildId
 * @param {string} discordId
 * @returns {Promise<string|null>}
 */
async function getLastMatchId(guildId, discordId) {
  const { data, error } = await supabase
    .from('poller_state')
    .select('last_match_id')
    .eq('guild_id', guildId)
    .eq('discord_id', discordId)
    .maybeSingle();
  if (error) {
    console.error('[lastMatches] getLastMatchId error:', error.message);
    return null;
  }
  return data?.last_match_id || null;
}

/**
 * @param {string} guildId
 * @param {string} discordId
 * @param {string} matchId
 */
async function setLastMatchId(guildId, discordId, matchId) {
  const { error } = await supabase.from('poller_state').upsert(
    {
      guild_id: guildId,
      discord_id: discordId,
      last_match_id: matchId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'guild_id,discord_id' }
  );
  if (error) {
    console.error('[lastMatches] setLastMatchId error:', error.message);
    // non-fatal — poller continues
  }
}

module.exports = { getLastMatchId, setLastMatchId };
