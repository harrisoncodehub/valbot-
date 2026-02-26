/**
 * Simple in-memory cache with TTL (Time To Live)
 * Used to reduce API calls to Henrik API
 */

const cache = new Map();

/**
 * Cache entry structure: { data, expiresAt }
 */

/**
 * Get a value from cache
 * @param {string} key - Cache key
 * @returns {any|null} - Cached value or null if expired/not found
 */
function get(key) {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  // Check if expired
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

/**
 * Set a value in cache with TTL
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 * @param {number} ttlSeconds - Time to live in seconds (default 300 = 5 min)
 */
function set(key, data, ttlSeconds = 300) {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  cache.set(key, { data, expiresAt });
}

/**
 * Delete a value from cache
 * @param {string} key - Cache key
 */
function del(key) {
  cache.delete(key);
}

/**
 * Clear all cache
 */
function clear() {
  cache.clear();
}

/**
 * Get cache stats
 * @returns {Object} - {size, keys}
 */
function stats() {
  return {
    size: cache.size,
    keys: Array.from(cache.keys()),
  };
}

/**
 * Generate cache key for profile/MMR data
 * @param {string} region
 * @param {string} name
 * @param {string} tag
 * @returns {string}
 */
function profileKey(region, name, tag) {
  return `profile:${region}:${name}:${tag}`;
}

/**
 * Generate cache key for match history
 * @param {string} region
 * @param {string} name
 * @param {string} tag
 * @param {string} mode
 * @returns {string}
 */
function matchesKey(region, name, tag, mode = "competitive") {
  return `matches:${region}:${name}:${tag}:${mode}`;
}

/**
 * Generate cache key for single match
 * @param {string} region
 * @param {string} matchId
 * @returns {string}
 */
function matchKey(region, matchId) {
  return `match:${region}:${matchId}`;
}

module.exports = {
  get,
  set,
  del,
  clear,
  stats,
  profileKey,
  matchesKey,
  matchKey,
};
