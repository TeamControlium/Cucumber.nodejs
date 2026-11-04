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
