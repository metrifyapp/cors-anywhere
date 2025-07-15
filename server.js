/*
 Updated server.js to integrate Smartproxy rotating proxy
*/

// Listen on a specific host via the HOST environment variable
var host = process.env.HOST || '0.0.0.0';
// Listen on a specific port via the PORT environment variable
var port = process.env.PORT || 8080;

// Grab the blacklist and whitelist from env
function parseEnvList(env) {
  return env ? env.split(',') : [];
}
var originBlacklist = parseEnvList(process.env.CORSANYWHERE_BLACKLIST);
var originWhitelist = parseEnvList(process.env.CORSANYWHERE_WHITELIST);

// Rate-limiting to avoid abuse
var checkRateLimit = require('./lib/rate-limit')(process.env.CORSANYWHERE_RATELIMIT);

// CORS Anywhere core
var cors_proxy = require('./lib/cors-anywhere');

// HTTP(S) proxy agent for Smartproxy
const { HttpsProxyAgent } = require('https-proxy-agent');

// Smartproxy credentials and endpoint (rotating port)
const SMART_USER = process.env.SMARTPROXY_USER;
const SMART_PASS = process.env.SMARTPROXY_PASS;
const SMART_HOST = process.env.SMARTPROXY_HOST || 'gate.decodo.com';
const SMART_PORT = process.env.SMARTPROXY_PORT || '10000';

if (!SMART_USER || !SMART_PASS) {
  console.warn('[WARN] SMARTPROXY_USER or SMARTPROXY_PASS not set. Requests will go direct without proxy.');
}

// Build proxy URL if credentials exist
const proxyAuth = SMART_USER && SMART_PASS
  ? `${SMART_USER}:${SMART_PASS}@${SMART_HOST}:${SMART_PORT}`
  : null;
const agentOptions = proxyAuth
  ? new HttpsProxyAgent(`http://${proxyAuth}`)
  : null;

cors_proxy.createServer({
  originBlacklist: originBlacklist,
  originWhitelist: originWhitelist,
  requireHeader: ['origin', 'x-requested-with'],
  checkRateLimit: checkRateLimit,
  removeHeaders: [
    'cookie',
    'cookie2',
    'x-request-start',
    'x-request-id',
    'via',
    'connect-time',
    'total-route-time',
  ],
  redirectSameOrigin: true,
  httpProxyOptions: {
    xfwd: false,
    // Inject Smartproxy agent if configured
    agent: agentOptions || undefined
  },
}).listen(port, host, function() {
  console.log(`Running CORS Anywhere on ${host}:${port}`);
  if (agentOptions) console.log('→ Using Smartproxy rotating proxy');
});
