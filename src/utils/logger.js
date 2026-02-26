'use strict';

function createConsoleLogger(bindings = {}) {
  function withBindings(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    return Object.keys(bindings).length ? { ...bindings, ...obj } : obj;
  }

  function log(method, ...args) {
    const consoleMethod = console[method] || console.log;

    if (args.length === 2 && typeof args[1] === 'string' && args[0] && typeof args[0] === 'object') {
      consoleMethod(args[1], withBindings(args[0]));
      return;
    }

    if (args.length === 1 && args[0] && typeof args[0] === 'object') {
      consoleMethod(withBindings(args[0]));
      return;
    }

    consoleMethod(...args);
  }

  return {
    child(extra = {}) {
      return createConsoleLogger({ ...bindings, ...extra });
    },
    debug: (...args) => log('log', ...args),
    info: (...args) => log('log', ...args),
    warn: (...args) => log('warn', ...args),
    error: (...args) => log('error', ...args),
  };
}

let logger;

try {
  const pino = require('pino');
  logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    base: undefined,
    redact: ['DISCORD_TOKEN', 'HENRIK_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
  });
} catch (err) {
  logger = createConsoleLogger();
  logger.warn(
    { err: err?.message || err },
    'pino is not installed; falling back to console logging'
  );
}

module.exports = logger;
