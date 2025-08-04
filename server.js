/*
 Updated server.js to route all requests through Cloudflare Workers proxy
*/

// Listen on a specific host via the HOST environment variable
var host = process.env.HOST || '0.0.0.0';
// Listen on a specific port via the PORT environment variable
var port = process.env.PORT || 8080;

// Worker endpoint (your Cloudflare Worker with CORS proxy logic)
var WORKER_ENDPOINT = process.env.WORKER_ENDPOINT;
if (!WORKER_ENDPOINT) {
  console.error('[ERROR] WORKER_ENDPOINT not set.');
  process.exit(1);
}

// Enable debug logging via environment variable
var DEBUG = process.env.DEBUG === 'true';

// Grab the blacklist and whitelist from env
function parseEnvList(env) {
  return env ? env.split(',') : [];
}
var originBlacklist = parseEnvList(process.env.CORSANYWHERE_BLACKLIST);
var originWhitelist = parseEnvList(process.env.CORSANYWHERE_WHITELIST);

// Rate-limiting to avoid abuse
var checkRateLimit = require('./lib/rate-limit')(process.env.CORSANYWHERE_RATELIMIT);

// CORS Anywhere core (we'll use it just for CORS + rate-limiting)
var cors_proxy = require('./lib/cors-anywhere');

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
    console.log('=== INCOMING REQUEST ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));

    var originalTarget = req.url.slice(1);
    var workerUrl = WORKER_ENDPOINT + '?url=' + encodeURIComponent(originalTarget);

    console.log('Original target:', originalTarget);
    console.log('Worker URL:', workerUrl);

    var parsedUrl = require('url').parse(workerUrl);
    var finalPath = parsedUrl.pathname + (parsedUrl.search || '');
    console.log('Final path:', finalPath);
    console.log('=======================');

    return finalPath;
  },

  proxyReqOptDecorator: function(proxyOpts) {
    console.log('=== PROXY OPTIONS ===');
    console.log('Original target:', proxyOpts.target);
    console.log('Worker endpoint:', WORKER_ENDPOINT);

    // Point request at the Worker host instead of original target
    var parsedUrl = require('url').parse(WORKER_ENDPOINT);
    proxyOpts.protocol = parsedUrl.protocol;
    proxyOpts.host = parsedUrl.hostname;
    proxyOpts.hostname = parsedUrl.hostname;
    proxyOpts.port = parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80);

    // Set correct Host header for the Worker
    proxyOpts.headers.host = parsedUrl.host;

    // Ensure changeOrigin is true for proper proxy behavior
    proxyOpts.changeOrigin = true;

    console.log('Modified proxy options:', JSON.stringify(proxyOpts, null, 2));
    console.log('=====================');

    return proxyOpts;
  },

}).listen(port, host, function() {
  console.log('Running CORS Anywhere (via Worker) on ' + host + ':' + port);
  console.log('→ Forwarding all requests through Worker at ' + WORKER_ENDPOINT);
  if (DEBUG) {
    console.log('Debug mode is ON');
  }
});
