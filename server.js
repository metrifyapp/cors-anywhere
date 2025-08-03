/*
 Updated server.js to route all requests through Cloudflare Workers proxy
*/

// Listen on a specific host via the HOST environment variable
const host = process.env.HOST || '0.0.0.0';
// Listen on a specific port via the PORT environment variable
const port = process.env.PORT || 8080;

// Worker endpoint (your Cloudflare Worker with CORS proxy logic)
const WORKER_ENDPOINT = process.env.WORKER_ENDPOINT;
if (!WORKER_ENDPOINT) {
  console.error('[ERROR] WORKER_ENDPOINT not set.');
  process.exit(1);
}

// Grab the blacklist and whitelist from env
function parseEnvList(env) {
  return env ? env.split(',') : [];
}
const originBlacklist = parseEnvList(process.env.CORSANYWHERE_BLACKLIST);
const originWhitelist = parseEnvList(process.env.CORSANYWHERE_WHITELIST);

// Rate-limiting to avoid abuse
const checkRateLimit = require('./lib/rate-limit')(process.env.CORSANYWHERE_RATELIMIT);

// CORS Anywhere core (we'll use it just for CORS + rate-limiting)
const cors_proxy = require('./lib/cors-anywhere');

// Create the proxy server
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

  // Rewrite every request to go through the Worker
  proxyReqPathResolver: function(req) {
    // req.url is like '/https://target.site/path?query'
    const originalTarget = req.url.slice(1); // remove leading slash
    const workerUrl = `${WORKER_ENDPOINT}?url=${encodeURIComponent(originalTarget)}`;
    // Return just the path+query for the Worker host
    const path = new URL(workerUrl).pathname + (new URL(workerUrl).search || '');
    return path;
  },

  proxyReqOptDecorator: function(proxyOpts, srcReq) {
    // Point request at the Worker host instead of original target
    const workerUrl = new URL(WORKER_ENDPOINT);
    proxyOpts.protocol = workerUrl.protocol;
    proxyOpts.host = workerUrl.hostname;
    proxyOpts.hostname = workerUrl.hostname;
    proxyOpts.port = workerUrl.port || (workerUrl.protocol === 'https:' ? 443 : 80);
    // Set correct Host header for the Worker
    proxyOpts.headers.host = workerUrl.host;
    return proxyOpts;
  }

}).listen(port, host, function() {
  console.log(`Running CORS Anywhere (via Worker) on ${host}:${port}`);
  console.log(`→ Forwarding all requests through Worker at ${WORKER_ENDPOINT}`);
});