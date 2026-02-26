/**
 * Simple rate limiting to prevent spam
 * Tracks command usage per user and per guild
 */

const userLimits = new Map(); // userId -> { count, resetAt }
const guildLimits = new Map(); // guildId -> { count, resetAt }

const USER_LIMIT = 5; // commands per window
const GUILD_LIMIT = 20; // commands per window
const WINDOW_MS = 60000; // 1 minute

/**
 * Check if user is rate limited
 * @param {string} userId - Discord user ID
 * @returns {Object} - {limited: boolean, retryAfter: number}
 */
function checkUserLimit(userId) {
  const now = Date.now();
  const limit = userLimits.get(userId);

  if (!limit || now > limit.resetAt) {
    // Reset or create new limit
    userLimits.set(userId, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });
    return { limited: false, retryAfter: 0 };
  }

  if (limit.count >= USER_LIMIT) {
    const retryAfter = Math.ceil((limit.resetAt - now) / 1000);
    return { limited: true, retryAfter };
  }

  limit.count++;
  return { limited: false, retryAfter: 0 };
}

/**
 * Check if guild is rate limited
 * @param {string} guildId - Discord guild ID
 * @returns {Object} - {limited: boolean, retryAfter: number}
 */
function checkGuildLimit(guildId) {
  const now = Date.now();
  const limit = guildLimits.get(guildId);

  if (!limit || now > limit.resetAt) {
    // Reset or create new limit
    guildLimits.set(guildId, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });
    return { limited: false, retryAfter: 0 };
  }

  if (limit.count >= GUILD_LIMIT) {
    const retryAfter = Math.ceil((limit.resetAt - now) / 1000);
    return { limited: true, retryAfter };
  }

  limit.count++;
  return { limited: false, retryAfter: 0 };
}

/**
 * Check both user and guild limits
 * @param {string} userId - Discord user ID
 * @param {string} guildId - Discord guild ID
 * @returns {Object} - {limited: boolean, message: string}
 */
function checkLimits(userId, guildId) {
  const userCheck = checkUserLimit(userId);
  if (userCheck.limited) {
    return {
      limited: true,
      message: `You're using commands too quickly. Try again in ${userCheck.retryAfter} seconds.`,
    };
  }

  const guildCheck = checkGuildLimit(guildId);
  if (guildCheck.limited) {
    return {
      limited: true,
      message: `This server is using commands too quickly. Try again in ${guildCheck.retryAfter} seconds.`,
    };
  }

  return { limited: false, message: null };
}

module.exports = {
  checkLimits,
};
