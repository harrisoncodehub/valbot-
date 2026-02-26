'use strict';
const supabase = require('./supabase');

/**
 * Upsert a single match record into match_history.
 * Silently ignores duplicate (match_id, discord_id) pairs.
 * @param {object} data
 */
async function upsertMatch(data) {
  const { error } = await supabase
    .from('match_history')
    .upsert(data, { onConflict: 'match_id,discord_id', ignoreDuplicates: true });
  if (error) console.error('[matchHistory] upsertMatch error:', error.message);
}

/**
 * Fetch recent match history for a Discord user.
 * @param {string} discordId
 * @param {number} limit
 * @returns {Promise<object[]>}
 */
async function getMatchHistory(discordId, limit = 10) {
  const { data, error } = await supabase
    .from('match_history')
    .select('*')
    .eq('discord_id', discordId)
    .order('recorded_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[matchHistory] getMatchHistory error:', error.message);
    return [];
  }
  return data || [];
}

module.exports = { upsertMatch, getMatchHistory };
