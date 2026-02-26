const fetch = require("node-fetch");
const logger = require("../utils/logger").child({ module: "henrik-api" });

const BASE_URL = "https://api.henrikdev.xyz";

/**
 * Henrik API client for VALORANT data
 * Docs: https://docs.henrikdev.xyz
 */

function getAuthHeaderValue() {
  const raw = process.env.HENRIK_API_KEY;
  if (!raw) {
    throw new Error(
      "Missing HENRIK_API_KEY. Add it to your .env and restart the bot."
    );
  }

  // Be forgiving about common copy/paste formats:
  // - "Bearer <key>"
  // - "Authorization: Bearer <key>"
  // - accidental double "Bearer Bearer <key>"
  let cleaned = String(raw).trim();
  cleaned = cleaned.replace(/^authorization\s*:\s*/i, "").trim();
  cleaned = cleaned.replace(/^bearer\s+/i, "").trim();
  cleaned = cleaned.replace(/^bearer\s+/i, "").trim(); // in case it was doubled

  if (!cleaned) {
    throw new Error(
      "HENRIK_API_KEY is set but empty/malformed. Paste only the key value (not the whole header) into .env and restart the bot."
    );
  }

  return `Bearer ${cleaned}`;
}

function getApiKeyValue() {
  // Keep this in sync with getAuthHeaderValue() sanitization, but return raw key.
  const raw = process.env.HENRIK_API_KEY;
  if (!raw) return null;
  let cleaned = String(raw).trim();
  cleaned = cleaned.replace(/^authorization\s*:\s*/i, "").trim();
  cleaned = cleaned.replace(/^bearer\s+/i, "").trim();
  cleaned = cleaned.replace(/^bearer\s+/i, "").trim();
  return cleaned || null;
}

function getHeaders() {
  return { Authorization: getAuthHeaderValue() };
}

function withApiKeyQuery(url) {
  const key = getApiKeyValue();
  if (!key) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}api_key=${encodeURIComponent(key)}`;
}

async function fetchJson(url) {
  let response;
  try {
    response = await fetch(url, { headers: getHeaders() });
  } catch (e) {
    throw new Error("Network error contacting Henrik API. Please try again.");
  }

  if (!response.ok) {
    if (response.status === 401) {
      // Henrik supports auth via query param too; retry once as a fallback.
      try {
        const retryUrl = withApiKeyQuery(url);
        if (retryUrl !== url) {
          const retry = await fetch(retryUrl);
          if (retry.ok) return retry.json();
        }
      } catch {
        // ignore, fall through to error
      }

      throw new Error(
        "Henrik API returned 401 (Unauthorized). Your HENRIK_API_KEY is missing/invalid, or it isn't a VALORANT key. Update .env and restart the bot."
      );
    }
    if (response.status === 404) {
      const err = new Error("Not found");
      err.status = 404;
      throw err;
    }
    if (response.status === 429) {
      throw new Error("Rate limit exceeded. Please try again later.");
    }
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Validate if a VALORANT account exists
 * @param {string} name - Player name
 * @param {string} tag - Player tag (without #)
 * @returns {Promise<{puuid: string, region: string, account_level: number}>}
 */
async function getAccount(name, tag) {
  const url = `${BASE_URL}/valorant/v1/account/${encodeURIComponent(
    name
  )}/${encodeURIComponent(tag)}`;

  let data;
  try {
    data = await fetchJson(url);
  } catch (e) {
    if (e.status === 404 || e.message === "Not found") {
      throw new Error("Account not found");
    }
    throw e;
  }
  return data.data;
}

/**
 * Get MMR/Rank information for a player
 * @param {string} region - Region (na, eu, kr, ap, br, latam)
 * @param {string} name - Player name
 * @param {string} tag - Player tag (without #)
 * @returns {Promise<{currenttier: number, currenttierpatched: string, ranking_in_tier: number, mmr_change_to_last_game: number, elo: number}>}
 */
async function getMMR(region, name, tag) {
  const url = `${BASE_URL}/valorant/v2/mmr/${encodeURIComponent(
    region
  )}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`;

  let data;
  try {
    data = await fetchJson(url);
  } catch (e) {
    if (e.status === 404 || e.message === "Not found") {
      throw new Error("Player not found or no ranked data available");
    }
    throw e;
  }
  return data.data;
}

/**
 * Get match history for a player
 * @param {string} region - Region (na, eu, kr, ap, br, latam)
 * @param {string} name - Player name
 * @param {string} tag - Player tag (without #)
 * @param {number} size - Number of matches to fetch (default 5, max 20)
 * @param {string} mode - Game mode filter (competitive, unrated, etc.)
 * @returns {Promise<Array>}
 */
async function getMatches(region, name, tag, size = 5, mode = "competitive") {
  // Request more matches to account for filtering
  const requestSize = mode ? Math.min(size * 3, 20) : size;
  
  let url = `${BASE_URL}/valorant/v3/matches/${encodeURIComponent(
    region
  )}/${encodeURIComponent(name)}/${encodeURIComponent(
    tag
  )}?size=${requestSize}&start=0`;
  
  if (mode) {
    url += `&filter=${encodeURIComponent(mode)}`;
  }
  
  logger.debug({ url, mode, size, requestSize }, "Fetching match history from Henrik API");

  let data;
  try {
    data = await fetchJson(url);
  } catch (e) {
    if (e.status === 404 || e.message === "Not found") {
      throw new Error("No match history found");
    }
    throw e;
  }
  let matches = data.data;
  
  // Client-side filtering as fallback (in case API filter doesn't work)
  if (mode && matches && Array.isArray(matches)) {
    const filtered = matches.filter((match) => {
      const matchMode = match.metadata?.mode?.toLowerCase();
      logger.debug({ matchMode }, "Henrik match mode (filter check)");
      return matchMode === mode.toLowerCase();
    });
    logger.debug(
      { before: matches.length, after: filtered.length, mode },
      "Filtered matches client-side"
    );
    return filtered.slice(0, size);
  }
  
  return matches;
}

/**
 * Get detailed information about a specific match
 * @param {string} region - Region (na, eu, kr, ap, br, latam)
 * @param {string} matchId - Match ID
 * @returns {Promise<Object>}
 */
async function getMatch(region, matchId) {
  const url = `${BASE_URL}/valorant/v4/match/${encodeURIComponent(
    region
  )}/${encodeURIComponent(matchId)}`;

  let data;
  try {
    data = await fetchJson(url);
  } catch (e) {
    if (e.status === 404 || e.message === "Not found") {
      throw new Error("Match not found");
    }
    throw e;
  }
  return data.data;
}

/**
 * Get MMR history for a player (shows RR changes per match)
 * @param {string} region - Region (na, eu, kr, ap, br, latam)
 * @param {string} name - Player name
 * @param {string} tag - Player tag (without #)
 * @returns {Promise<Array>} - Array of {match_id, elo, mmr_change_to_last_game, ...}
 */
async function getMMRHistory(region, name, tag) {
  const url = `${BASE_URL}/valorant/v1/mmr-history/${encodeURIComponent(
    region
  )}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`;

  let data;
  try {
    data = await fetchJson(url);
  } catch (e) {
    if (e.status === 404 || e.message === "Not found") {
      return []; // No ranked history
    }
    throw e;
  }
  return data.data || [];
}

module.exports = {
  getAccount,
  getMMR,
  getMatches,
  getMatch,
  getMMRHistory,
};
