import { createServer } from 'node:http';

/**
 * The "Application Under Test" for this example — deliberately trivial (no framework of
 * its own) so the example is about the @controlium wiring, not about the app being tested.
 * A real suite's bootstrapper wraps whatever the target app's actual entrypoint is
 * (NestFactory.create, an Express app, etc.) — see API_AUTWrapper's own class doc for
 * worked examples of both.
 */
export function startTargetApp(port) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }
      if (req.url.startsWith('/my-query')) {
        handleMyQuery(req, res);
        return;
      }
      if (req.url.startsWith('/my-body')) {
        handleMyBody(req, res);
        return;
      }
      if (req.url.startsWith('/echo')) {
        handleEcho(req, res);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });
    server.on('error', (error) => reject(error));
    server.listen(port, () => resolve(server));
  });
}

/**
 * `/my-query` — echoes every query parameter back as a flat key/value object in the
 * response body. `500` (not `400`) on any processing error — deliberately indistinguishable
 * from "the AUT's own logic failed", since that's exactly what this route is for: giving a
 * future negative-path test (e.g. "response is 500") a real endpoint that can actually fail,
 * rather than one that can only ever succeed or 404.
 *
 * Decodes each key/value with `decodeURIComponent` directly, rather than via
 * `URLSearchParams` — `URLSearchParams` is deliberately lenient about malformed
 * percent-encoding (it won't throw on `%zz`), which would make the error path above dead
 * code; `decodeURIComponent('%zz')` throws a real `URIError`, so `?bad=%zz` genuinely
 * reaches the `500`, verified live.
 */
function handleMyQuery(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const params = {};
    for (const pair of url.search.slice(1).split('&')) {
      if (pair === '') continue;
      const [rawKey, rawValue = ''] = pair.split('=');
      params[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(params));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * `/my-body` — echoes the request body straight back as the response body, byte for
 * byte, with the request's own `Content-Type` carried through to the response (falling
 * back to `text/plain` if the request didn't set one) — whatever shape a test sent
 * (JSON/XML/plain text) comes back in that same shape, for asserting round-tripping.
 */
function handleMyBody(req, res) {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    res.writeHead(200, { 'Content-Type': req.headers['content-type'] ?? 'text/plain' });
    res.end(body);
  });
  req.on('error', (err) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  });
}

/**
 * `req.headers` comma-joins a repeated header into one string (e.g. two `wibble:` lines
 * become `'aa, b,b'`) — lossy the moment any value itself contains a comma, since there's
 * then no way to tell "two values, one with a comma in it" apart from "one value with two
 * commas". Rebuilding from `req.rawHeaders` (the flat, unfolded `[name, value, name,
 * value, ...]` list) instead keeps each repeated header as a genuinely separate array
 * entry, with no joining at all — the only representation that round-trips a case like
 * `wibble: ['aa', 'b,b']` without corrupting it.
 */
function foldRawHeaders(rawHeaders) {
  const headers = {};
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const name = rawHeaders[i].toLowerCase();
    const value = rawHeaders[i + 1];
    if (!(name in headers)) {
      headers[name] = value;
    } else if (Array.isArray(headers[name])) {
      headers[name].push(value);
    } else {
      headers[name] = [headers[name], value];
    }
  }
  return headers;
}

/**
 * Headers that must never be blindly reflected back as *real* response headers — not
 * because an AUT couldn't legitimately set them, but because these specifically control
 * HTTP framing/connection handling, and copying the request's version of them onto the
 * response (rather than letting Node manage them) risks producing a response the HTTP
 * client can't even parse. `host` is included too — a request-only header that is never
 * meaningful as a response header. Everything else, however unusual (`wibble`, arbitrary
 * casing, repeated headers), is reflected as-is — this app's whole job is to let a test
 * configure response headers into *any* shape an AUT might produce, including shapes that
 * aren't on this list.
 */
const UNSAFE_TO_REFLECT_AS_RESPONSE_HEADERS = new Set([
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'te',
  'trailer',
  'trailers',
  'upgrade',
  'proxy-authenticate',
  'proxy-authorization',
]);

/**
 * `/echo` — echoes the request's headers back as genuine HTTP response headers (so a test
 * can verify the framework's own response-header validation against whatever header shape
 * an AUT might set — repeated headers, unusual names, etc.), via `res.setHeader`, which
 * accepts {@link foldRawHeaders}'s own array values (used instead of `req.headers` — see
 * its own doc comment for why) to set multiple header lines of the same name, exactly
 * reproducing the request's own repeats. The same headers are also included in the JSON
 * response body, alongside the request body, purely for convenience (asserting on headers
 * *and* body together via JSONPath into one response, without a second round-trip) — the
 * response headers themselves are the actual point of this route. `Content-Type:
 * application/json` is forced via `writeHead`'s own headers argument, which Node gives
 * precedence over anything already set with `setHeader` — so a reflected request
 * `Content-Type` never clobbers it. The body is decoded as UTF-8 text (never binary-safe) —
 * fine for this app's own JSON/XML/text examples, not a general echo-anything-back
 * guarantee.
 */
function handleEcho(req, res) {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    const headers = foldRawHeaders(req.rawHeaders);
    for (const [name, value] of Object.entries(headers)) {
      if (UNSAFE_TO_REFLECT_AS_RESPONSE_HEADERS.has(name)) continue;
      res.setHeader(name, value);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ headers, body }));
  });
  req.on('error', (err) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  });
}

// --- Runnable as its own process: `node server.js`, port via TARGET_APP_PORT --------------
//
// Same shape a real app's bootstrap.ts/main.ts split gives for free (see e.g. ea-eq-bff's
// or ea-experience-layer-api's src/bootstrap.ts — a standalone `bootstrap(port)` the test
// suite wires directly, kept separate from main.ts's own "just run it" entrypoint): this app
// is never only test-controllable — it can always be started directly too, same as
// standalone-server.js already allows.

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.TARGET_APP_PORT ?? 3999);
  startTargetApp(port).then((server) => {
    console.log(`Target app listening on port ${port}`);

    const shutdown = () => {
      console.log('Target app shutting down');
      server.close(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
