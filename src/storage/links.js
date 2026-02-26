'use strict';
const supabase = require('../db/supabase');

/**
 * Get a user's linked account.
 * @param {string} discordId
 * @returns {Promise<{name, tag, region, puuid?, guildIds: string[], updatedAt}|null>}
 */
async function getLink(discordId) {
  const { data, error } = await supabase
    .from('user_links')
    .select('*')
    .eq('discord_id', discordId)
    .maybeSingle();
  if (error) {
    console.error('[links] getLink error:', error.message);
    return null;
  }
  if (!data) return null;
  return {
    name: data.name,
    tag: data.tag,
    region: data.region,
    puuid: data.puuid,
    guildIds: data.guild_ids || [],
    updatedAt: data.updated_at,
  };
}

/**
 * Set/update a user's linked account.
 * Merges guild_ids from existing row with new guildId/guildIds.
 * @param {string} discordId
 * @param {{name, tag, region, puuid?, guildId?: string, guildIds?: string[]}} data
 */
async function setLink(discordId, data) {
  // Pre-fetch to merge guild_ids
  const { data: existing } = await supabase
    .from('user_links')
    .select('guild_ids')
    .eq('discord_id', discordId)
    .maybeSingle();

  const guildIds = new Set(
    Array.isArray(existing?.guild_ids) ? existing.guild_ids : []
  );
  if (typeof data.guildId === 'string' && data.guildId.length > 0) {
    guildIds.add(data.guildId);
  }
  if (Array.isArray(data.guildIds)) {
    for (const g of data.guildIds) {
      if (typeof g === 'string' && g.length > 0) guildIds.add(g);
    }
  }

  const row = {
    discord_id: discordId,
    name: data.name,
    tag: data.tag,
    region: data.region,
    puuid: data.puuid || null,
    guild_ids: Array.from(guildIds),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('user_links')
    .upsert(row, { onConflict: 'discord_id' });
  if (error) {
    console.error('[links] setLink error:', error.message);
    throw error;
  }
}

/**
 * Remove a user's link.
 * @param {string} discordId
 * @returns {Promise<boolean>} true if deleted, false if not found
 */
async function removeLink(discordId) {
  const { data, error } = await supabase
    .from('user_links')
    .delete()
    .eq('discord_id', discordId)
    .select('discord_id');
  if (error) {
    console.error('[links] removeLink error:', error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/**
 * Get all linked users, optionally filtered by guild.
 * @param {string|null} guildId
 * @returns {Promise<Array<{discordId, name, tag, region, puuid?, guildIds: string[]}>>}
 */
async function getAllLinks(guildId = null) {
  let query = supabase.from('user_links').select('*');
  if (guildId) {
    query = query.contains('guild_ids', [guildId]);
  }
  const { data, error } = await query;
  if (error) {
    console.error('[links] getAllLinks error:', error.message);
    return [];
  }
  return (data || []).map((row) => ({
    discordId: row.discord_id,
    name: row.name,
    tag: row.tag,
    region: row.region,
    puuid: row.puuid,
    guildIds: row.guild_ids || [],
    updatedAt: row.updated_at,
  }));
}

module.exports = { getLink, setLink, removeLink, getAllLinks };
