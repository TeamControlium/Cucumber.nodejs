import { DataTable } from '@cucumber/cucumber';
import { API_AUTWrapper } from '@controlium/framework';
import { Settings } from '@controlium/utils';

import { wireApiRequestStepDefinitions } from './request.steps.js';

function makeDataTable(rows: string[][]): DataTable {
  return new DataTable(rows);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StepHandler = (...args: any[]) => unknown;

/**
 * Captures every pattern registered against fake `Given`/`When`, in registration order, so
 * each test matches sample step text against the *real* regex `wireApiRequestStepDefinitions`
 * registers — not a hand-copied duplicate of it.
 */
function registerAndCapture() {
  const given: RegExp[] = [];
  const when: RegExp[] = [];
  const cucumber = {
    Given: vi.fn((pattern: RegExp) => { given.push(pattern); }),
    When: vi.fn((pattern: RegExp) => { when.push(pattern); }),
  };
  wireApiRequestStepDefinitions(cucumber as never);
  return { given, when };
}

describe('wireApiRequestStepDefinitions', () => {

  it('rejects null', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => wireApiRequestStepDefinitions(null as any)).toThrow(/\[cucumber\] must be the '@cucumber\/cucumber' module object/);
  });

  it('rejects an object missing Given', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => wireApiRequestStepDefinitions({ When: vi.fn() } as any)).toThrow(/\[cucumber\.Given\] must be a function/);
  });

  it('rejects an object missing When', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => wireApiRequestStepDefinitions({ Given: vi.fn() } as any)).toThrow(/\[cucumber\.When\] must be a function/);
  });

  it('registers exactly 1 Given pattern and 7 When patterns', () => {
    const { given, when } = registerAndCapture();
    expect(given).toHaveLength(1);
    expect(when).toHaveLength(7);
  });

  describe('resource path preamble selection', () => {

    it('matches an unqualified AUT target and a named target', () => {
      const { given } = registerAndCapture();
      expect('requests to AUT use resource path preamble [V1]'.match(given[0])?.slice(1)).toEqual(['AUT', 'V1']);
      expect('requests to [MyApp] use resource path preamble [V2]'.match(given[0])?.slice(1)).toEqual(['[MyApp]', 'V2']);
    });
  });

  describe('no body', () => {

    it('matches with either quote style for the method, independently of the path', () => {
      const { when } = registerAndCapture();
      expect("a 'GET' request to AUT path '/users'".match(when[0])?.slice(1)).toEqual(['GET', undefined, 'AUT', '/users', undefined]);
      expect('a "DELETE" request to [MyApp] path \'/users\''.match(when[0])?.slice(1))
        .toEqual([undefined, 'DELETE', '[MyApp]', '/users', undefined]);
    });

    it('a path cannot contain its own quote delimiter — paths never legitimately have whitespace or an unescaped quote, so this is tighter than method/body', () => {
      const { when } = registerAndCapture();
      expect("a 'GET' request to AUT path '/o'brien'".match(when[0])).toBeNull();
    });

    it('an embedded apostrophe in the path works by using the other quote style as the delimiter', () => {
      const { when } = registerAndCapture();
      expect(`a 'GET' request to AUT path "/o'brien"`.match(when[0])?.slice(1))
        .toEqual(['GET', undefined, 'AUT', undefined, "/o'brien"]);
    });

    it('a non-standard method token matches — the method is never restricted to a fixed enum', () => {
      const { when } = registerAndCapture();
      expect("a 'WIBBLE' request to AUT path '/users'".match(when[0])?.slice(1))
        .toEqual(['WIBBLE', undefined, 'AUT', '/users', undefined]);
    });

    it('does not match a [bracketed] method — that convention means "a reference", not a literal', () => {
      const { when } = registerAndCapture();
      expect("a [GET] request to AUT path '/users'".match(when[0])).toBeNull();
    });
  });

  describe('literal body, no DataTable (pattern [1])', () => {

    it('accepts "json body", "xml body", and "body" wording, capturing which one was used', () => {
      const { when } = registerAndCapture();
      expect("a 'POST' request to AUT path '/users', [json] body '{\"a\":1}'".match(when[1])?.slice(1))
        .toEqual(['POST', undefined, 'AUT', '/users', undefined, 'json', '{"a":1}', undefined]);
      expect("a 'POST' request to AUT path '/users', [xml] body '<a>1</a>'".match(when[1])?.slice(1))
        .toEqual(['POST', undefined, 'AUT', '/users', undefined, 'xml', '<a>1</a>', undefined]);
      expect("a 'POST' request to AUT path '/users', body '{\"a\":1}'".match(when[1])?.slice(1))
        .toEqual(['POST', undefined, 'AUT', '/users', undefined, undefined, '{"a":1}', undefined]);
    });

    it('method, path, and body may each independently use either quote style', () => {
      const { when } = registerAndCapture();
      const match = `a "POST" request to AUT path '/users', [json] body "{'a':1}"`.match(when[1]);
      expect(match?.slice(1)).toEqual([undefined, 'POST', 'AUT', '/users', undefined, 'json', undefined, "{'a':1}"]);
    });

    it('does not match when the step has a trailing ";" — that is the DataTable-required pattern\'s territory', () => {
      const { when } = registerAndCapture();
      expect("a 'POST' request to AUT path '/users', [json] body '{\"a\":1}';".match(when[1])).toBeNull();
    });

    it('does not recognise "yaml" — yaml is only ever reachable via the DocString and test-data-file patterns', () => {
      const { when } = registerAndCapture();
      expect("a 'POST' request to AUT path '/users', [yaml] body 'a: 1'".match(when[1])).toBeNull();
    });
  });

  describe('literal body, DataTable required (pattern [2], trailing ";")', () => {

    it('accepts "json body", "xml body", and "body" wording, capturing which one was used', () => {
      const { when } = registerAndCapture();
      expect("a 'POST' request to AUT path '/users', [json] body '{\"a\":1}';".match(when[2])?.slice(1))
        .toEqual(['POST', undefined, 'AUT', '/users', undefined, 'json', '{"a":1}', undefined]);
      expect("a 'POST' request to AUT path '/users', [xml] body '<a>1</a>';".match(when[2])?.slice(1))
        .toEqual(['POST', undefined, 'AUT', '/users', undefined, 'xml', '<a>1</a>', undefined]);
      expect("a 'POST' request to AUT path '/users', body '{\"a\":1}';".match(when[2])?.slice(1))
        .toEqual(['POST', undefined, 'AUT', '/users', undefined, undefined, '{"a":1}', undefined]);
    });

    it('does not match without the trailing ";" — that is the no-DataTable pattern\'s territory', () => {
      const { when } = registerAndCapture();
      expect("a 'POST' request to AUT path '/users', [json] body '{\"a\":1}'".match(when[2])).toBeNull();
    });
  });

  describe('DocString body (pattern [3])', () => {

    it('matches a bare "body:", no line-ending clause', () => {
      const { when } = registerAndCapture();
      expect("a 'POST' request to AUT path '/users', body:".match(when[3])?.slice(1))
        .toEqual(['POST', undefined, 'AUT', '/users', undefined, undefined, undefined, undefined]);
    });

    it('accepts "json body:"/"xml body:", capturing which one was used', () => {
      const { when } = registerAndCapture();
      expect("a 'POST' request to AUT path '/users', [json] body:".match(when[3])?.slice(1))
        .toEqual(['POST', undefined, 'AUT', '/users', undefined, 'json', undefined, undefined]);
      expect("a 'POST' request to AUT path '/users', [xml] body:".match(when[3])?.slice(1))
        .toEqual(['POST', undefined, 'AUT', '/users', undefined, 'xml', undefined, undefined]);
    });

    it('captures an optional "(\'<escaped>\' line endings)" clause verbatim', () => {
      const { when } = registerAndCapture();
      expect("a 'POST' request to AUT path '/users', body ('/r/n' line endings):".match(when[3])?.slice(1))
        .toEqual(['POST', undefined, 'AUT', '/users', undefined, undefined, '/r/n', undefined]);
      expect("a 'POST' request to AUT path '/users', [json] body ('/#65;' line endings):".match(when[3])?.slice(1))
        .toEqual(['POST', undefined, 'AUT', '/users', undefined, 'json', '/#65;', undefined]);
    });

    it('accepts "yaml body:" — yaml is reachable here, unlike the quoted-literal patterns', () => {
      const { when } = registerAndCapture();
      expect("a 'POST' request to AUT path '/users', [yaml] body:".match(when[3])?.slice(1))
        .toEqual(['POST', undefined, 'AUT', '/users', undefined, 'yaml', undefined, undefined]);
    });

    it('does not match without the trailing ":" — that is the quoted-literal pattern\'s territory', () => {
      const { when } = registerAndCapture();
      expect("a 'POST' request to AUT path '/users', body".match(when[3])).toBeNull();
    });

    it('does not match a quoted literal body — that is pattern [1]/[2]\'s territory', () => {
      const { when } = registerAndCapture();
      expect("a 'POST' request to AUT path '/users', body '{\"a\":1}'".match(when[3])).toBeNull();
    });
  });

  describe('test-data-file body, no DataTable (pattern [4])', () => {

    it('accepts "json body", "xml body", "yaml body", and "body" wording, capturing which one was used', () => {
      const { when } = registerAndCapture();
      expect("a 'POST' request to AUT path '/users', [json] file [a/b.json]".match(when[4])?.slice(1))
        .toEqual(['POST', undefined, 'AUT', '/users', undefined, 'json', 'a/b.json']);
      expect("a 'POST' request to AUT path '/users', [xml] file [a/b.xml]".match(when[4])?.slice(1))
        .toEqual(['POST', undefined, 'AUT', '/users', undefined, 'xml', 'a/b.xml']);
      expect("a 'POST' request to AUT path '/users', [yaml] file [a/b.yaml]".match(when[4])?.slice(1))
        .toEqual(['POST', undefined, 'AUT', '/users', undefined, 'yaml', 'a/b.yaml']);
      expect("a 'POST' request to AUT path '/users', file [a/b.json]".match(when[4])?.slice(1))
        .toEqual(['POST', undefined, 'AUT', '/users', undefined, undefined, 'a/b.json']);
    });

    it('accepts "bin file" wording too', () => {
      const { when } = registerAndCapture();
      expect("a 'POST' request to AUT path '/users', [bin] file [a/b.bin]".match(when[4])?.slice(1))
        .toEqual(['POST', undefined, 'AUT', '/users', undefined, 'bin', 'a/b.bin']);
    });

    it('does not match when the step has a trailing ";" — that is the DataTable-required pattern\'s territory', () => {
      const { when } = registerAndCapture();
      expect("a 'POST' request to AUT path '/users', [json] file [a/b.json];".match(when[4])).toBeNull();
    });
  });

  describe('test-data-file body, DataTable required (pattern [5], trailing ";")', () => {

    it('accepts "json body", "xml body", "yaml body", and "body" wording, capturing which one was used', () => {
      const { when } = registerAndCapture();
      expect("a 'POST' request to AUT path '/users', [json] file [a/b.json];".match(when[5])?.slice(1))
        .toEqual(['POST', undefined, 'AUT', '/users', undefined, 'json', 'a/b.json']);
      expect("a 'POST' request to AUT path '/users', [xml] file [a/b.xml];".match(when[5])?.slice(1))
        .toEqual(['POST', undefined, 'AUT', '/users', undefined, 'xml', 'a/b.xml']);
      expect("a 'POST' request to AUT path '/users', [yaml] file [a/b.yaml];".match(when[5])?.slice(1))
        .toEqual(['POST', undefined, 'AUT', '/users', undefined, 'yaml', 'a/b.yaml']);
      expect("a 'POST' request to AUT path '/users', file [a/b.json];".match(when[5])?.slice(1))
        .toEqual(['POST', undefined, 'AUT', '/users', undefined, undefined, 'a/b.json']);
    });

    it('accepts "bin file" wording too', () => {
      const { when } = registerAndCapture();
      expect("a 'POST' request to AUT path '/users', [bin] file [a/b.bin];".match(when[5])?.slice(1))
        .toEqual(['POST', undefined, 'AUT', '/users', undefined, 'bin', 'a/b.bin']);
    });

    it('does not match without the trailing ";" — that is the no-DataTable pattern\'s territory', () => {
      const { when } = registerAndCapture();
      expect("a 'POST' request to AUT path '/users', [json] file [a/b.json]".match(when[5])).toBeNull();
    });
  });

  describe('DataTable-only JSON body (pattern [6])', () => {

    it('matches "json body;" with a trailing DataTable', () => {
      const { when } = registerAndCapture();
      expect("a 'POST' request to AUT path '/users', json body;".match(when[6])?.slice(1))
        .toEqual(['POST', undefined, 'AUT', '/users', undefined]);
    });

    it('does not match without the trailing ";"', () => {
      const { when } = registerAndCapture();
      expect("a 'POST' request to AUT path '/users', json body".match(when[6])).toBeNull();
    });

    it('does not match "xml body;" or bare "body;" — json only', () => {
      const { when } = registerAndCapture();
      expect("a 'POST' request to AUT path '/users', xml body;".match(when[6])).toBeNull();
      expect("a 'POST' request to AUT path '/users', body;".match(when[6])).toBeNull();
    });

    it('does not match the literal-body pattern (no trailing quoted value)', () => {
      const { when } = registerAndCapture();
      expect("a 'POST' request to AUT path '/users', json body;".match(when[1])).toBeNull();
    });
  });

  // ─── Wired behaviour — pattern [0]: no body ──────────────────────────────────────────
  //
  // aut.request() never throws on connection failure (no real AUT is actually listening
  // here) — it records the attempted request on the transaction regardless of whether a
  // response came back, which is all these tests need to verify the handler actually
  // called through with the right method/path.
  describe('wired behaviour: no body (pattern [0])', () => {

    function registerAndCaptureHandlers() {
      const given: { pattern: RegExp; handler: StepHandler }[] = [];
      const when: { pattern: RegExp; handler: StepHandler }[] = [];
      const cucumber = {
        Given: vi.fn((pattern: RegExp, handler: StepHandler) => { given.push({ pattern, handler }); }),
        When: vi.fn((pattern: RegExp, handler: StepHandler) => { when.push({ pattern, handler }); }),
      };
      wireApiRequestStepDefinitions(cucumber as never);
      return { given, when };
    }

    async function createStubAut(appName = 'AUT'): Promise<API_AUTWrapper> {
      return API_AUTWrapper.create({
        appName,
        port: 15991,
        bootstrapper: async () => ({}),
        closeHandler: async () => undefined,
      });
    }

    afterEach(async () => {
      await API_AUTWrapper.closeAllRegistered();
    });

    it('calls through with the given method and path', async () => {
      const aut = await createStubAut();
      const { when } = registerAndCaptureHandlers();

      await when[0].handler('GET', undefined, 'AUT', '/users', undefined);

      expect(aut.lastTransaction.request.method).toBe('GET');
      expect(aut.lastTransaction.request.resourcePath).toBe('/users');
    });

    it('resolves a named [AppName] target to the correct instance among several registered', async () => {
      const autA = await createStubAut('AppA');
      const autB = await createStubAut('AppB');
      const { when } = registerAndCaptureHandlers();

      await when[0].handler('GET', undefined, '[AppB]', '/only-on-b', undefined);

      expect(autB.lastTransaction.request.resourcePath).toBe('/only-on-b');
      expect(autA.transactions).toHaveLength(0);
    });

    it('a non-standard method token flows straight through, unrestricted', async () => {
      const aut = await createStubAut();
      const { when } = registerAndCaptureHandlers();

      await when[0].handler('WIBBLE', undefined, 'AUT', '/anything', undefined);

      expect(aut.lastTransaction.request.method).toBe('WIBBLE');
    });

    it('a query string embedded directly in the literal path is preserved', async () => {
      const aut = await createStubAut();
      const { when } = registerAndCaptureHandlers();

      await when[0].handler('GET', undefined, 'AUT', '/search?q=foo&limit=10', undefined);

      expect(aut.lastTransaction.request.resourcePath).toBe('/search?q=foo&limit=10');
    });
  });

  // ─── Wired behaviour — pattern [1]: literal body, no DataTable ──────────────────────────
  describe('wired behaviour: literal body, no DataTable (pattern [1])', () => {

    function registerAndCaptureHandlers() {
      const given: { pattern: RegExp; handler: StepHandler }[] = [];
      const when: { pattern: RegExp; handler: StepHandler }[] = [];
      const cucumber = {
        Given: vi.fn((pattern: RegExp, handler: StepHandler) => { given.push({ pattern, handler }); }),
        When: vi.fn((pattern: RegExp, handler: StepHandler) => { when.push({ pattern, handler }); }),
      };
      wireApiRequestStepDefinitions(cucumber as never);
      return { given, when };
    }

    async function createStubAut(appName = 'AUT'): Promise<API_AUTWrapper> {
      return API_AUTWrapper.create({
        appName,
        port: 15993,
        bootstrapper: async () => ({}),
        closeHandler: async () => undefined,
      });
    }

    afterEach(async () => {
      await API_AUTWrapper.closeAllRegistered();
    });

    it('"data" sends the literal text verbatim, with no structural interpretation', async () => {
      const aut = await createStubAut();
      const { when } = registerAndCaptureHandlers();

      await when[1].handler('POST', undefined, 'AUT', '/users', undefined, undefined, 'plain text value', undefined);

      expect(aut.lastTransaction.request.body).toBe('plain text value');
    });

    it('"json body" sends the parsed-then-reserialised text, Content-Type inferred', async () => {
      const aut = await createStubAut();
      const { when } = registerAndCaptureHandlers();

      await when[1].handler('POST', undefined, 'AUT', '/users', undefined, 'json', '{"a":1}', undefined);

      expect(aut.lastTransaction.request.body).toBe('{"a":1}');
      expect(aut.lastTransaction.request.headers['Content-Type']).toBe('application/json');
    });

    it('"json body" accepts JSON5 (unquoted key) and still sends strict JSON on the wire', async () => {
      const aut = await createStubAut();
      const { when } = registerAndCaptureHandlers();

      await when[1].handler('POST', undefined, 'AUT', '/users', undefined, 'json', '{a:1}', undefined);

      expect(aut.lastTransaction.request.body).toBe('{"a":1}');
    });

    it('"xml body" sends the re-serialised XML text, Content-Type set explicitly (no sniffing exists for XML)', async () => {
      const aut = await createStubAut();
      const { when } = registerAndCaptureHandlers();

      await when[1].handler('POST', undefined, 'AUT', '/users', undefined, 'xml', '<a>1</a>', undefined);

      expect(aut.lastTransaction.request.body).toBe('<a>1</a>');
      expect(aut.lastTransaction.request.headers['Content-Type']).toBe('application/xml');
    });
  });

  // ─── Wired behaviour — pattern [3]: DocString body ───────────────────────────────────────
  describe('wired behaviour: DocString body (pattern [3])', () => {

    function registerAndCaptureHandlers() {
      const given: { pattern: RegExp; handler: StepHandler }[] = [];
      const when: { pattern: RegExp; handler: StepHandler }[] = [];
      const cucumber = {
        Given: vi.fn((pattern: RegExp, handler: StepHandler) => { given.push({ pattern, handler }); }),
        When: vi.fn((pattern: RegExp, handler: StepHandler) => { when.push({ pattern, handler }); }),
      };
      wireApiRequestStepDefinitions(cucumber as never);
      return { given, when };
    }

    async function createStubAut(appName = 'AUT'): Promise<API_AUTWrapper> {
      return API_AUTWrapper.create({
        appName,
        port: 15995,
        bootstrapper: async () => ({}),
        closeHandler: async () => undefined,
      });
    }

    afterEach(async () => {
      await API_AUTWrapper.closeAllRegistered();
    });

    it('no line-ending clause — sends the DocString content with Gherkin\'s own "\\n" untouched', async () => {
      const aut = await createStubAut();
      const { when } = registerAndCaptureHandlers();

      await when[3].handler('POST', undefined, 'AUT', '/users', undefined, undefined, undefined, undefined, 'line one\nline two');

      expect(aut.lastTransaction.request.body).toBe('line one\nline two');
    });

    it('"json body:" parses-then-reserialises the DocString content, Content-Type set', async () => {
      const aut = await createStubAut();
      const { when } = registerAndCaptureHandlers();

      await when[3].handler('POST', undefined, 'AUT', '/users', undefined, 'json', undefined, undefined, '{"a":1}');

      expect(aut.lastTransaction.request.body).toBe('{"a":1}');
      expect(aut.lastTransaction.request.headers['Content-Type']).toBe('application/json');
    });

    it('"xml body:" parses-then-reserialises the DocString content, Content-Type set', async () => {
      const aut = await createStubAut();
      const { when } = registerAndCaptureHandlers();

      await when[3].handler('POST', undefined, 'AUT', '/users', undefined, 'xml', undefined, undefined, '<a>1</a>');

      expect(aut.lastTransaction.request.body).toBe('<a>1</a>');
      expect(aut.lastTransaction.request.headers['Content-Type']).toBe('application/xml');
    });

    it('"yaml body:" parses-then-reserialises the DocString content, Content-Type set (no sniffing exists for YAML)', async () => {
      const aut = await createStubAut();
      const { when } = registerAndCaptureHandlers();

      await when[3].handler('POST', undefined, 'AUT', '/users', undefined, 'yaml', undefined, undefined, 'a: 1\n');

      expect(aut.lastTransaction.request.body).toBe('a: 1\n');
      expect(aut.lastTransaction.request.headers['Content-Type']).toBe('application/yaml');
    });

    it('bare "body:" (text) never gets a Content-Type guess', async () => {
      const aut = await createStubAut();
      const { when } = registerAndCaptureHandlers();

      await when[3].handler('POST', undefined, 'AUT', '/users', undefined, undefined, undefined, undefined, 'plain text');

      expect(aut.lastTransaction.request.headers['Content-Type']).toBeUndefined();
    });

    it('"yaml body:" rejects malformed YAML content', async () => {
      await createStubAut();
      const { when } = registerAndCaptureHandlers();

      await expect(when[3].handler('POST', undefined, 'AUT', '/users', undefined, 'yaml', undefined, undefined, 'a: [1, 2'))
        .rejects.toThrow();
    });

    it('a line-ending override substitutes every "\\n" in the content, including ones from trailing blank lines', async () => {
      const aut = await createStubAut();
      const { when } = registerAndCaptureHandlers();

      await when[3].handler('POST', undefined, 'AUT', '/users', undefined, undefined, '/r/t', undefined, 'a\nb\n');

      expect(aut.lastTransaction.request.body).toBe('a\r\tb\r\t');
    });

    it('single-letter escapes: /n /r /t /b /f /v /0', async () => {
      const aut = await createStubAut();
      const { when } = registerAndCaptureHandlers();

      await when[3].handler('POST', undefined, 'AUT', '/users', undefined, undefined, '/n/r/t/b/f/v/0', undefined, 'a\nb');

      expect(aut.lastTransaction.request.body).toBe('a\n\r\t\b\f\v\0b');
    });

    it('/#<number>; — decimal by default', async () => {
      const aut = await createStubAut();
      const { when } = registerAndCaptureHandlers();

      await when[3].handler('POST', undefined, 'AUT', '/users', undefined, undefined, '/#65;', undefined, 'a\nb');

      expect(aut.lastTransaction.request.body).toBe('aAb');
    });

    it('/#<number>; — 0x/0o/0b prefixes opt into hex/octal/binary', async () => {
      const aut = await createStubAut();
      const { when } = registerAndCaptureHandlers();

      await when[3].handler('POST', undefined, 'AUT', '/users', undefined, undefined, '/#0x41;', undefined, 'a\nb');
      expect(aut.lastTransaction.request.body).toBe('aAb');

      await when[3].handler('POST', undefined, 'AUT', '/users', undefined, undefined, '/#0o101;', undefined, 'a\nb');
      expect(aut.lastTransaction.request.body).toBe('aAb');

      await when[3].handler('POST', undefined, 'AUT', '/users', undefined, undefined, '/#0b1000001;', undefined, 'a\nb');
      expect(aut.lastTransaction.request.body).toBe('aAb');
    });

    it('// — a literal slash', async () => {
      const aut = await createStubAut();
      const { when } = registerAndCaptureHandlers();

      await when[3].handler('POST', undefined, 'AUT', '/users', undefined, undefined, '//', undefined, 'a\nb');

      expect(aut.lastTransaction.request.body).toBe('a/b');
    });

    it('rejects an unrecognised escape', async () => {
      await createStubAut();
      const { when } = registerAndCaptureHandlers();

      await expect(when[3].handler('POST', undefined, 'AUT', '/users', undefined, undefined, '/z', undefined, 'a\nb'))
        .rejects.toThrow(/unrecognised escape/);
    });

    it('rejects an unterminated "/#" numeric escape', async () => {
      await createStubAut();
      const { when } = registerAndCaptureHandlers();

      await expect(when[3].handler('POST', undefined, 'AUT', '/users', undefined, undefined, '/#65', undefined, 'a\nb'))
        .rejects.toThrow(/unterminated/);
    });

    it('rejects a "/#" numeric escape that is not a valid non-negative integer', async () => {
      await createStubAut();
      const { when } = registerAndCaptureHandlers();

      await expect(when[3].handler('POST', undefined, 'AUT', '/users', undefined, undefined, '/#-5;', undefined, 'a\nb'))
        .rejects.toThrow(/not a valid character code/);
      await expect(when[3].handler('POST', undefined, 'AUT', '/users', undefined, undefined, '/#;', undefined, 'a\nb'))
        .rejects.toThrow(/not a valid character code/);
    });
  });

  // ─── Wired behaviour — pattern [2]: literal body, DataTable required ────────────────────
  describe('wired behaviour: literal body, DataTable required (pattern [2])', () => {

    function registerAndCaptureHandlers() {
      const given: { pattern: RegExp; handler: StepHandler }[] = [];
      const when: { pattern: RegExp; handler: StepHandler }[] = [];
      const cucumber = {
        Given: vi.fn((pattern: RegExp, handler: StepHandler) => { given.push({ pattern, handler }); }),
        When: vi.fn((pattern: RegExp, handler: StepHandler) => { when.push({ pattern, handler }); }),
      };
      wireApiRequestStepDefinitions(cucumber as never);
      return { given, when };
    }

    async function createStubAut(appName = 'AUT'): Promise<API_AUTWrapper> {
      return API_AUTWrapper.create({
        appName,
        port: 15994,
        bootstrapper: async () => ({}),
        closeHandler: async () => undefined,
      });
    }

    afterEach(async () => {
      await API_AUTWrapper.closeAllRegistered();
    });

    it('"body" rejects a DataTable — mutating opaque text is a contradiction', async () => {
      await createStubAut();
      const { when } = registerAndCaptureHandlers();
      const dataTable = makeDataTable([['JSON-Path', 'Value'], ['$.a', '2']]);

      await expect(when[2].handler('POST', undefined, 'AUT', '/users', undefined, undefined, '{"a":1}', undefined, dataTable))
        .rejects.toThrow(/DataTable overrides can only be used with "json", "xml" or "yaml" body/);
    });

    it('"json body" with a DataTable mutates the parsed object via JSON-Path before sending', async () => {
      const aut = await createStubAut();
      const { when } = registerAndCaptureHandlers();
      const dataTable = makeDataTable([['JSON-Path', 'Value'], ['$.a', '2'], ['$.b', 'new']]);

      await when[2].handler('POST', undefined, 'AUT', '/users', undefined, 'json', '{"a":1}', undefined, dataTable);

      expect(aut.lastTransaction.request.body).toBe('{"a":"2","b":"new"}');
    });

    it('"xml body" with a DataTable mutates the document via XPath before sending', async () => {
      const aut = await createStubAut();
      const { when } = registerAndCaptureHandlers();
      const dataTable = makeDataTable([['XPath', 'Value'], ['/a', 'updated']]);

      await when[2].handler('POST', undefined, 'AUT', '/users', undefined, 'xml', '<a>1</a>', undefined, dataTable);

      expect(aut.lastTransaction.request.body).toBe('<a>updated</a>');
    });

    it('"xml body" DataTable can delete a node via the shared _undefined sentinel', async () => {
      const aut = await createStubAut();
      const { when } = registerAndCaptureHandlers();
      const dataTable = makeDataTable([['XPath', 'Value'], ['/a/@id', '_undefined']]);

      await when[2].handler('POST', undefined, 'AUT', '/users', undefined, 'xml', '<a id="1">text</a>', undefined, dataTable);

      expect(aut.lastTransaction.request.body).toBe('<a>text</a>');
    });
  });

  // ─── Wired behaviour — patterns [4]-[5]: test-data-file body ────────────────────────────
  //
  // testdata/request-body/base.json: {"a":1}; base.xml: <a>1</a>; base.yaml: a: 1;
  // plain.txt: "plain text value".
  describe('wired behaviour: test-data-file body (patterns [4]-[5])', () => {

    function registerAndCaptureHandlers() {
      const given: { pattern: RegExp; handler: StepHandler }[] = [];
      const when: { pattern: RegExp; handler: StepHandler }[] = [];
      const cucumber = {
        Given: vi.fn((pattern: RegExp, handler: StepHandler) => { given.push({ pattern, handler }); }),
        When: vi.fn((pattern: RegExp, handler: StepHandler) => { when.push({ pattern, handler }); }),
      };
      wireApiRequestStepDefinitions(cucumber as never);
      return { given, when };
    }

    async function createStubAut(appName = 'AUT'): Promise<API_AUTWrapper> {
      return API_AUTWrapper.create({
        appName,
        port: 15996,
        bootstrapper: async () => ({}),
        closeHandler: async () => undefined,
      });
    }

    afterEach(async () => {
      await API_AUTWrapper.closeAllRegistered();
    });

    describe('no DataTable (pattern [4])', () => {

      it('"json body" loads, parses, and re-serialises the file contents, Content-Type set', async () => {
        const aut = await createStubAut();
        const { when } = registerAndCaptureHandlers();

        await when[4].handler('POST', undefined, 'AUT', '/users', undefined, 'json', 'request-body/base.json');

        expect(aut.lastTransaction.request.body).toBe('{"a":1}');
        expect(aut.lastTransaction.request.headers['Content-Type']).toBe('application/json');
      });

      it('"xml body" loads, parses, and re-serialises the file contents, Content-Type set', async () => {
        const aut = await createStubAut();
        const { when } = registerAndCaptureHandlers();

        await when[4].handler('POST', undefined, 'AUT', '/users', undefined, 'xml', 'request-body/base.xml');

        expect(aut.lastTransaction.request.body).toBe('<a>1</a>');
        expect(aut.lastTransaction.request.headers['Content-Type']).toBe('application/xml');
      });

      it('"yaml body" loads, parses, and re-serialises the file contents, Content-Type set', async () => {
        const aut = await createStubAut();
        const { when } = registerAndCaptureHandlers();

        await when[4].handler('POST', undefined, 'AUT', '/users', undefined, 'yaml', 'request-body/base.yaml');

        expect(aut.lastTransaction.request.body).toBe('a: 1\n');
        expect(aut.lastTransaction.request.headers['Content-Type']).toBe('application/yaml');
      });

      it('bare "body" sends the file contents verbatim, no Content-Type guess', async () => {
        const aut = await createStubAut();
        const { when } = registerAndCaptureHandlers();

        await when[4].handler('POST', undefined, 'AUT', '/users', undefined, undefined, 'request-body/plain.txt');

        expect(aut.lastTransaction.request.body).toBe('plain text value');
        expect(aut.lastTransaction.request.headers['Content-Type']).toBeUndefined();
      });

      it('resolves the path via the configured test-data root, not relative to this package', async () => {
        await createStubAut();
        const { when } = registerAndCaptureHandlers();

        await expect(when[4].handler('POST', undefined, 'AUT', '/users', undefined, undefined, 'request-body/does-not-exist.txt'))
          .rejects.toThrow();
      });

      it('"bin file" loads the raw bytes untouched (no trim, no UTF-8 decode) and defaults Content-Type to application/octet-stream', async () => {
        const aut = await createStubAut();
        const { when } = registerAndCaptureHandlers();

        // testdata/request-body/base.bin: 89 50 4e 47 0d 0a 1a 0a ff 20 0a 20 — a non-UTF-8
        // byte (0xff) and surrounding whitespace bytes that a text-based load (trim +
        // UTF-8 decode) would corrupt or strip.
        await when[4].handler('POST', undefined, 'AUT', '/users', undefined, 'bin', 'request-body/base.bin');

        const body = aut.lastTransaction.request.body as Buffer;
        expect(Buffer.isBuffer(body)).toBe(true);
        expect(body).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x20, 0x0a, 0x20]));
        expect(aut.lastTransaction.request.headers['Content-Type']).toBe('application/octet-stream');
      });
    });

    describe('DataTable required (pattern [5])', () => {

      it('"json body" applies the DataTable override on top of the file contents', async () => {
        const aut = await createStubAut();
        const { when } = registerAndCaptureHandlers();
        const dataTable = makeDataTable([['JSON-Path', 'Value'], ['$.b', 'added']]);

        await when[5].handler('POST', undefined, 'AUT', '/users', undefined, 'json', 'request-body/base.json', dataTable);

        expect(aut.lastTransaction.request.body).toBe('{"a":1,"b":"added"}');
      });

      it('"xml body" applies the DataTable override on top of the file contents', async () => {
        const aut = await createStubAut();
        const { when } = registerAndCaptureHandlers();
        const dataTable = makeDataTable([['XPath', 'Value'], ['/a', 'updated']]);

        await when[5].handler('POST', undefined, 'AUT', '/users', undefined, 'xml', 'request-body/base.xml', dataTable);

        expect(aut.lastTransaction.request.body).toBe('<a>updated</a>');
      });

      it('bare "body" rejects a DataTable — mutating opaque text is a contradiction', async () => {
        await createStubAut();
        const { when } = registerAndCaptureHandlers();
        const dataTable = makeDataTable([['JSON-Path', 'Value'], ['$.a', '2']]);

        await expect(when[5].handler('POST', undefined, 'AUT', '/users', undefined, undefined, 'request-body/plain.txt', dataTable))
          .rejects.toThrow(/DataTable overrides can only be used with "json", "xml" or "yaml" body/);
      });

      it('"bin file" rejects a DataTable — raw binary has no structure to mutate', async () => {
        await createStubAut();
        const { when } = registerAndCaptureHandlers();
        const dataTable = makeDataTable([['JSON-Path', 'Value'], ['$.a', '2']]);

        await expect(when[5].handler('POST', undefined, 'AUT', '/users', undefined, 'bin', 'request-body/base.bin', dataTable))
          .rejects.toThrow(/DataTable overrides can only be used with "json", "xml" or "yaml" body/);
      });
    });

    describe('DataTable-only JSON body (pattern [6]) — no literal/file base at all', () => {

      it('builds the whole JSON body from the table — same JSON-Path/Value mechanism as pattern [2]/[5], applied against an empty {} base', async () => {
        const aut = await createStubAut();
        const { when } = registerAndCaptureHandlers();
        const dataTable = makeDataTable([['JSON-Path', 'Value'], ['$.name', 'Bob']]);

        await when[6].handler('POST', undefined, 'AUT', '/users', undefined, dataTable);

        expect(aut.lastTransaction.request.body).toBe('{"name":"Bob"}');
        expect(aut.lastTransaction.request.headers['Content-Type']).toBe('application/json');
      });

      it('supports multiple rows, nested paths, and cast values (number:/boolean:/json:)', async () => {
        const aut = await createStubAut();
        const { when } = registerAndCaptureHandlers();
        const dataTable = makeDataTable([
          ['JSON-Path', 'Value'],
          ['$.name', 'Bob'],
          ['$.age', 'number:42'],
          ['$.active', 'boolean:true'],
          ['$.address.city', 'London'],
        ]);

        await when[6].handler('POST', undefined, 'AUT', '/users', undefined, dataTable);

        expect(JSON.parse(aut.lastTransaction.request.body as string)).toEqual({
          name: 'Bob',
          age: 42,
          active: true,
          address: { city: 'London' },
        });
      });
    });
  });

  describe('wired behaviour: resource path preamble selection', () => {

    function registerAndCaptureHandlers() {
      const given: { pattern: RegExp; handler: StepHandler }[] = [];
      const when: { pattern: RegExp; handler: StepHandler }[] = [];
      const cucumber = {
        Given: vi.fn((pattern: RegExp, handler: StepHandler) => { given.push({ pattern, handler }); }),
        When: vi.fn((pattern: RegExp, handler: StepHandler) => { when.push({ pattern, handler }); }),
      };
      wireApiRequestStepDefinitions(cucumber as never);
      return { given, when };
    }

    async function createStubAut(appName = 'AUT'): Promise<API_AUTWrapper> {
      Settings.setContext({
        sourceName: 'TestProfile',
        parameters: { testAUTDetails: { [appName]: { resourcePathPreambles: { V1: '/api/v1', V2: '/api/v2' } } } },
      });
      const aut = await API_AUTWrapper.create({
        appName,
        port: 15992,
        bootstrapper: async () => ({}),
        closeHandler: async () => undefined,
      });
      aut.loadSettings();
      return aut;
    }

    afterEach(async () => {
      Settings.clearContext();
      await API_AUTWrapper.closeAllRegistered();
    });

    it('switches the preamble on the resolved AUT', async () => {
      const aut = await createStubAut();
      const { given } = registerAndCaptureHandlers();

      given[0].handler('AUT', 'V1');

      expect(aut.resourcePathPreamble).toBe('/api/v1');
    });

    it('resolves a named [AppName] target to the correct instance among several registered', async () => {
      const autA = await createStubAut('AppA');
      const autB = await createStubAut('AppB');
      const { given } = registerAndCaptureHandlers();

      given[0].handler('[AppB]', 'V2');

      expect(autB.resourcePathPreamble).toBe('/api/v2');
      expect(autA.resourcePathPreamble).toBeUndefined();
    });

    it('propagates the underlying throw for an unknown preamble name', async () => {
      await createStubAut();
      const { given } = registerAndCaptureHandlers();

      expect(() => given[0].handler('AUT', 'V3')).toThrow(/no resourcePathPreamble named \[V3\]/);
    });
  });
});
