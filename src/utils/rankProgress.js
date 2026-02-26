const henrik = require("../api/henrik");
const links = require("../storage/links");
const cache = require("../cache/cache");

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await fn(items[current], current);
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

/**
 * Fetch RR progress rows for all linked players in a guild within a time window.
 * @param {string} guildId
 * @param {number} windowMs - Time window in milliseconds (e.g. 86_400_000 for 24h)
 * @returns {Promise<Array<{name, tag, region, tier, rank, rr, rrDelta, matchCount}>>}
 */
async function fetchProgressRows(guildId, windowMs) {
  const guildLinks = await links.getAllLinks(guildId);
  if (!guildLinks.length) return [];

  const cutoff = new Date(Date.now() - windowMs);

  const rows = await mapLimit(guildLinks, 3, async (link) => {
    const { name, tag, region } = link;
    try {
      // Current rank (shared cache with /profile and /leaderboard)
      const pKey = cache.profileKey(region, name, tag);
      let mmr = cache.get(pKey);
      if (!mmr) {
        mmr = await henrik.getMMR(region, name, tag);
        cache.set(pKey, mmr, 600);
      }

      const tier = mmr?.current_data?.currenttier ?? mmr?.currenttier ?? 0;
      const rank =
        mmr?.current_data?.currenttierpatched ??
        mmr?.currenttierpatched ??
        "Unranked";
      const rr =
        mmr?.current_data?.ranking_in_tier ?? mmr?.ranking_in_tier ?? 0;

      // MMR history (separate cache)
      const hKey = `mmrHistory:${region}:${name}:${tag}`;
      let history = cache.get(hKey);
      if (!history) {
        history = await henrik.getMMRHistory(region, name, tag);
        cache.set(hKey, history, 300);
      }

      const recent = Array.isArray(history)
        ? history.filter((e) => e.date && new Date(e.date) >= cutoff)
        : [];

      const rrDelta = recent.reduce(
        (sum, e) => sum + (e.mmr_change_to_last_game || 0),
        0
      );
      const matchCount = recent.length;

      return { name, tag, region, tier, rank, rr, rrDelta, matchCount };
    } catch {
      return null;
    }
  });

  const ok = rows.filter(Boolean);
  ok.sort((a, b) => b.rrDelta - a.rrDelta);
  return ok;
}

module.exports = { fetchProgressRows };
