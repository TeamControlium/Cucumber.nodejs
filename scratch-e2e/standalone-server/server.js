import { createServer, STATUS_CODES } from 'node:http';

/**
 * A genuinely independent, generic HTTP test-utility server — the local, offline-safe
 * equivalent of something like httpbin.org. Deliberately **not** wired into
 * `@controlium/framework`'s `API_AUTWrapper` lifecycle at all — it's never `create()`d/
 * `prepareApplication()`d/`startApplication()`d by anything in this package. It's started
 * once, before `scratch-e2e`'s own Cucumber run even begins (see `run-scratch-e2e.sh`), and
 * stopped when that whole run ends, regardless of pass/fail.
 *
 * Two jobs this exists for:
 * - A real, local downstream dependency for the *controlled* target app (`target-app/`) to
 *   call out to — giving the (still-to-be-built) mocking layer something genuine to either
 *   intercept or pass through to, rather than needing a real external dependency.
 * - A stand-in "AUT" the test suite itself never starts or stops — for testing
 *   `request.steps.ts` against something not under `API_AUTWrapper`'s control at all (a
 *   plain `new API_AUTWrapper({ host, port })`, never through `create()`/
 *   `prepareApplication()`, works fine for this — `isControlled` just stays `false`).
 *
 * Endpoints:
 * - `GET/POST/... /errorcodes?code=<code>&message=<msg>` — responds with HTTP status
 *   `code`, body `{ statusCode, error, message }` (`error` is the standard reason phrase
 *   for that code, via Node's own `http.STATUS_CODES`; `message` defaults to the same
 *   reason phrase if the query param is omitted). `code` missing, non-numeric, or outside
 *   100–599 → `400`, since that's the test author's own mistake, not something to silently
 *   paper over.
 * - `GET /headers?type=<json|text>` — `200`, body is every header this request actually
 *   carried. `json` → `req.headers` as-is (Node already lowercases names and folds
 *   same-named ones per its own normal HTTP handling — reported honestly, not re-cased).
 *   `text` → one `Header-Name: value` line per header (a header with multiple values gets
 *   one line per value, same name repeated). `type` missing or anything other than exactly
 *   `"text"` defaults to `json`.
 * - `/bodyecho` (any method) — `200`, body is exactly what was received, byte for byte,
 *   with the same `Content-Type` echoed back if the request had one.
 */
export function startStandaloneServer(port) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');

      if (url.pathname === '/errorcodes') {
        handleErrorCodes(url, res);
        return;
      }
      if (url.pathname === '/headers') {
        handleHeaders(url, req, res);
        return;
      }
      if (url.pathname === '/bodyecho') {
        handleBodyEcho(req, res);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });
    server.listen(port, () => resolve(server));
  });
}

function handleErrorCodes(url, res) {
  const codeText = url.searchParams.get('code');
  const code = Number(codeText);
  if (codeText === null || !Number.isInteger(code) || code < 100 || code > 599) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      statusCode: 400,
      error: STATUS_CODES[400],
      message: `[code] query param must be an integer between 100 and 599 — got [${codeText}]`,
    }));
    return;
  }

  const reasonPhrase = STATUS_CODES[code] ?? 'Unknown Status';
  const message = url.searchParams.get('message') ?? reasonPhrase;
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ statusCode: code, error: reasonPhrase, message }));
}

function handleHeaders(url, req, res) {
  const type = url.searchParams.get('type') === 'text' ? 'text' : 'json';

  if (type === 'json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(req.headers));
    return;
  }

  const lines = [];
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const singleValue of value) lines.push(`${name}: ${singleValue}`);
    } else if (value !== undefined) {
      lines.push(`${name}: ${value}`);
    }
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(lines.join('\n'));
}

function handleBodyEcho(req, res) {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const contentType = req.headers['content-type'];
    res.writeHead(200, contentType ? { 'Content-Type': contentType } : {});
    res.end(body);
  });
}

// --- Runnable as its own process: `node server.js`, port via STANDALONE_SERVER_PORT -------

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.STANDALONE_SERVER_PORT ?? 3998);
  startStandaloneServer(port).then((server) => {
    console.log(`Standalone test server listening on port ${port}`);

    const shutdown = () => {
      console.log('Standalone test server shutting down');
      server.close(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
