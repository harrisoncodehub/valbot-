const https = require("https");
const cache = require("../cache/cache");

/**
 * Fetch agent icon URL by agent name, using a 24h cache.
 * @param {string} agentName - e.g. "Jett", "KAY/O"
 * @returns {Promise<string|null>}
 */
async function getAgentIconUrl(agentName) {
  if (!agentName) return null;

  const AGENT_CACHE_KEY = "agentAssets:icons";
  let iconMap = cache.get(AGENT_CACHE_KEY);

  if (!iconMap) {
    iconMap = await new Promise((resolve, reject) => {
      https.get(
        "https://valorant-api.com/v1/agents?isPlayableCharacter=true",
        (res) => {
          let raw = "";
          res.on("data", (chunk) => (raw += chunk));
          res.on("end", () => {
            try {
              const json = JSON.parse(raw);
              const map = new Map();
              for (const agent of json.data || []) {
                map.set(agent.displayName, agent.displayIcon);
              }
              resolve(map);
            } catch (e) {
              reject(e);
            }
          });
        }
      ).on("error", reject);
    });
    cache.set(AGENT_CACHE_KEY, iconMap, 86400);
  }

  return iconMap.get(agentName) || null;
}

module.exports = { getAgentIconUrl };
