import { DataTable } from '@cucumber/cucumber';
import { API_AUTWrapper } from '@controlium/framework';

import { wireApiHeaderStepDefinitions } from './headers.steps.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StepHandler = (...args: any[]) => unknown;

/**
 * Captures every pattern registered against a fake `Given`/`When`, keyed by which
 * registration call it was (in registration order), so each test can match sample step
 * text against the *real* regex `wireApiHeaderStepDefinitions` registers — not a
 * hand-copied duplicate of it — and inspect exactly what Cucumber would capture.
 *
 * Registration order (see headers.steps.ts's own doc comment for why each pattern exists,
 * and why the no-`;`/`;` pairs are two separate registrations rather than one with an
 * optional `dataTable` parameter):
 *   given[0] literal JSON, no DataTable       given[1] literal JSON, mandatory DataTable
 *   given[2] file-sourced, no DataTable       given[3] file-sourced, mandatory DataTable
 *   given[4] DataTable-only (mandatory `;`)
 *   when[0]  literal JSON, no DataTable       when[1]  literal JSON, mandatory DataTable
 *   when[2]  file-sourced, no DataTable       when[3]  file-sourced, mandatory DataTable
 *   when[4]  DataTable-only (mandatory `;`)
 */
function registerAndCapture() {
  const given: RegExp[] = [];
  const when: RegExp[] = [];
  const cucumber = {
    Given: vi.fn((pattern: RegExp) => { given.push(pattern); }),
    When: vi.fn((pattern: RegExp) => { when.push(pattern); }),
  };
  wireApiHeaderStepDefinitions(cucumber as never);
  return { given, when };
}

describe('wireApiHeaderStepDefinitions', () => {

  it('rejects null', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => wireApiHeaderStepDefinitions(null as any)).toThrow(/\[cucumber\] must be the '@cucumber\/cucumber' module object/);
  });

  it('rejects an object missing Given/When', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => wireApiHeaderStepDefinitions({ Given: vi.fn() } as any)).toThrow(/\[cucumber\.When\] must be a function/);
  });

  it('registers exactly 5 Given patterns (session-level) and 5 When patterns (next-request)', () => {
    const { given, when } = registerAndCapture();
    expect(given).toHaveLength(5);
    expect(when).toHaveLength(5);
  });

  describe('session-level: request headers for (AUT|[name]) are ...', () => {

    it('literal JSON, no DataTable (given[0]) — matches with the verb, capturing target/mode/content', () => {
      const { given } = registerAndCapture();
      const match = "request headers for AUT are [replaced] with '{\"a\":1}'".match(given[0]);
      expect(match?.slice(1)).toEqual(['AUT', 'replaced', '{"a":1}', undefined]);
    });

    it('literal JSON, no DataTable (given[0]) — matches with the verb omitted, mode comes back undefined', () => {
      const { given } = registerAndCapture();
      const match = 'request headers for AUT are \'{"a":1}\''.match(given[0]);
      expect(match?.slice(1)).toEqual(['AUT', undefined, '{"a":1}', undefined]);
    });

    it('literal JSON, no DataTable (given[0]) — double-quote delimiter, with an embedded single quote left untouched', () => {
      const { given } = registerAndCapture();
      const match = `request headers for AUT are [merged] with "{'name': 'O'}"`.match(given[0]);
      expect(match?.slice(1)).toEqual(['AUT', 'merged', undefined, "{'name': 'O'}"]);
    });

    it('literal JSON, no DataTable (given[0]) — single-quote delimiter, with an embedded double-quoted string (apostrophe-safe)', () => {
      const { given } = registerAndCapture();
      const match = `request headers for AUT are [replaced] with '{"name": "O'Brien"}'`.match(given[0]);
      expect(match?.slice(1)).toEqual(['AUT', 'replaced', `{"name": "O'Brien"}`, undefined]);
    });

    it('literal JSON, no DataTable (given[0]) — named AUT target in square brackets', () => {
      const { given } = registerAndCapture();
      const match = "request headers for [MyApp] are [replaced] with '{}'".match(given[0]);
      expect(match?.[1]).toBe('[MyApp]');
    });

    it('literal JSON, no DataTable (given[0]) — does NOT match when a trailing `;` is present (that is given[1]\'s pattern)', () => {
      const { given } = registerAndCapture();
      expect("request headers for AUT are [replaced] with '{}';".match(given[0])).toBeNull();
    });

    it('literal JSON, mandatory DataTable (given[1]) — requires the trailing `;`', () => {
      const { given } = registerAndCapture();
      const match = "request headers for AUT are [replaced] with '{\"a\":1}';".match(given[1]);
      expect(match?.slice(1)).toEqual(['AUT', 'replaced', '{"a":1}', undefined]);
      expect("request headers for AUT are [replaced] with '{\"a\":1}'".match(given[1])).toBeNull();
    });

    it('file-sourced, no DataTable (given[2]) — matches with the verb, and with it omitted', () => {
      const { given } = registerAndCapture();
      expect('request headers for AUT are using test data file [auth/base.json]'.match(given[2])?.slice(1))
        .toEqual(['AUT', undefined, 'auth/base.json']);
      expect('request headers for AUT are [merged] using test data file [auth/base.json]'.match(given[2])?.slice(1))
        .toEqual(['AUT', 'merged', 'auth/base.json']);
    });

    it('file-sourced, no DataTable (given[2]) — a path containing its own square brackets is still captured whole', () => {
      const { given } = registerAndCapture();
      const match = 'request headers for AUT are using test data file [a/[weird]/b.json]'.match(given[2]);
      expect(match?.[3]).toBe('a/[weird]/b.json');
    });

    it('file-sourced, no DataTable (given[2]) — does NOT match when a trailing `;` is present (that is given[3]\'s pattern)', () => {
      const { given } = registerAndCapture();
      expect('request headers for AUT are using test data file [auth/base.json];'.match(given[2])).toBeNull();
    });

    it('file-sourced, mandatory DataTable (given[3]) — requires the trailing `;`', () => {
      const { given } = registerAndCapture();
      const match = 'request headers for AUT are using test data file [auth/base.json];'.match(given[3]);
      expect(match?.slice(1)).toEqual(['AUT', undefined, 'auth/base.json']);
      expect('request headers for AUT are using test data file [auth/base.json]'.match(given[3])).toBeNull();
    });

    it('DataTable-only (given[4]) — requires the trailing `;`, bare and with the verb', () => {
      const { given } = registerAndCapture();
      expect('request headers for AUT are;'.match(given[4])?.slice(1)).toEqual(['AUT', undefined]);
      expect('request headers for AUT are [replaced] with;'.match(given[4])?.slice(1)).toEqual(['AUT', 'replaced']);
      expect('request headers for AUT are [merged] with;'.match(given[4])?.slice(1)).toEqual(['AUT', 'merged']);
    });

    it('DataTable-only (given[4]) — does NOT match without the trailing `;` — there is no base, so no table means no match at all', () => {
      const { given } = registerAndCapture();
      expect('request headers for AUT are'.match(given[4])).toBeNull();
      expect('request headers for AUT are [replaced] with'.match(given[4])).toBeNull();
    });
  });

  describe('"next request" one-shot: next API request headers are ...', () => {

    it('literal JSON, no DataTable (when[0]) — no AUT target captured at all, mode optional', () => {
      const { when } = registerAndCapture();
      expect("next API request headers are [replaced] with '{\"a\":1}'".match(when[0])?.slice(1))
        .toEqual(['replaced', '{"a":1}', undefined]);
      expect('next API request headers are \'{"a":1}\''.match(when[0])?.slice(1))
        .toEqual([undefined, '{"a":1}', undefined]);
    });

    it('literal JSON, no DataTable (when[0]) — tolerates its own commas/colons inside the quoted value', () => {
      const { when } = registerAndCapture();
      const match = 'next API request headers are [replaced] with \'{"x":"y,z:w"}\''.match(when[0]);
      expect(match?.[2]).toBe('{"x":"y,z:w"}');
    });

    it('literal JSON, no DataTable (when[0]) — does NOT match when a trailing `;` is present (that is when[1]\'s pattern)', () => {
      const { when } = registerAndCapture();
      expect("next API request headers are [replaced] with '{}';".match(when[0])).toBeNull();
    });

    it('literal JSON, mandatory DataTable (when[1]) — requires the trailing `;`', () => {
      const { when } = registerAndCapture();
      const match = "next API request headers are [replaced] with '{\"a\":1}';".match(when[1]);
      expect(match?.slice(1)).toEqual(['replaced', '{"a":1}', undefined]);
      expect("next API request headers are [replaced] with '{\"a\":1}'".match(when[1])).toBeNull();
    });

    it('file-sourced, no DataTable (when[2]) — mode optional', () => {
      const { when } = registerAndCapture();
      expect('next API request headers are using test data file [a.json]'.match(when[2])?.slice(1))
        .toEqual([undefined, 'a.json']);
      expect('next API request headers are [merged] using test data file [a.json]'.match(when[2])?.slice(1))
        .toEqual(['merged', 'a.json']);
    });

    it('file-sourced, mandatory DataTable (when[3]) — requires the trailing `;`', () => {
      const { when } = registerAndCapture();
      const match = 'next API request headers are using test data file [a.json];'.match(when[3]);
      expect(match?.slice(1)).toEqual([undefined, 'a.json']);
      expect('next API request headers are using test data file [a.json]'.match(when[3])).toBeNull();
    });

    it('DataTable-only (when[4]) — requires the trailing `;`, bare and with the verb', () => {
      const { when } = registerAndCapture();
      expect('next API request headers are;'.match(when[4])?.slice(1)).toEqual([undefined]);
      expect('next API request headers are [replaced] with;'.match(when[4])?.slice(1)).toEqual(['replaced']);
      expect('next API request headers are'.match(when[4])).toBeNull();
    });

    it('does not match "next API request headers are" followed by an AUT target — there is none to give', () => {
      const { when } = registerAndCapture();
      expect('next API request headers for AUT are [replaced] with \'{}\''.match(when[0])).toBeNull();
    });
  });

  it('an unrelated colon in the step text (no recognised structure around it) simply fails to match, rather than mis-parsing', () => {
    const { given } = registerAndCapture();
    // Sanity: these patterns are anchored and specific — they should not accidentally
    // match unrelated step text that merely contains a colon or quote somewhere.
    expect('Some other step: with \'quoted\' text'.match(given[0])).toBeNull();
    expect('Some other step: with \'quoted\' text'.match(given[2])).toBeNull();
    expect('Some other step: with \'quoted\' text'.match(given[4])).toBeNull();
  });

  // ─── Wired behaviour — session-level patterns [0]-[4] ────────────────────────────────
  //
  // These need a real API_AUTWrapper instance (via create(), with a stub bootstrapper —
  // nothing here ever actually starts a server) rather than just the regex, since the
  // point is proving the handler actually calls through to setHeaders/mergeHeaders
  // correctly, not just that the pattern matches step text.
  describe('wired behaviour: session-level (patterns [0]-[4])', () => {

    function registerAndCaptureHandlers() {
      const given: { pattern: RegExp; handler: StepHandler }[] = [];
      const when: { pattern: RegExp; handler: StepHandler }[] = [];
      const cucumber = {
        Given: vi.fn((pattern: RegExp, handler: StepHandler) => { given.push({ pattern, handler }); }),
        When: vi.fn((pattern: RegExp, handler: StepHandler) => { when.push({ pattern, handler }); }),
      };
      wireApiHeaderStepDefinitions(cucumber as never);
      return { given, when };
    }

    async function createStubAut(appName = 'AUT'): Promise<API_AUTWrapper> {
      return API_AUTWrapper.create({
        appName,
        port: 15990,
        bootstrapper: async () => ({}),
        closeHandler: async () => undefined,
      });
    }

    afterEach(async () => {
      await API_AUTWrapper.closeAllRegistered();
    });

    // ─── pattern [0]: literal JSON, no DataTable ───────────────────────────────────────
    describe('literal JSON, no DataTable (pattern [0])', () => {

      it('mode omitted — defaults to setHeaders (replace)', async () => {
        const aut = await createStubAut();
        const { given } = registerAndCaptureHandlers();

        await given[0].handler('AUT', undefined, '{"Authorization":"Bearer abc"}', undefined);

        expect(aut.getHeaders()).toEqual({ Authorization: 'Bearer abc' });
      });

      it('explicit "merged" — combines onto whatever session headers already existed', async () => {
        const aut = await createStubAut();
        await aut.setHeaders({ 'x-existing': 'yes' });
        const { given } = registerAndCaptureHandlers();

        await given[0].handler('AUT', 'merged', '{"Authorization":"Bearer abc"}', undefined);

        expect(aut.getHeaders()).toEqual({ 'x-existing': 'yes', Authorization: 'Bearer abc' });
      });

      it('explicit "replaced" — wipes anything already set, including from settings/earlier steps', async () => {
        const aut = await createStubAut();
        await aut.setHeaders({ 'x-should-be-gone': 'yes' });
        const { given } = registerAndCaptureHandlers();

        await given[0].handler('AUT', 'replaced', '{"Authorization":"Bearer abc"}', undefined);

        expect(aut.getHeaders()).toEqual({ Authorization: 'Bearer abc' });
      });

      it('resolves a named [AppName] target to the correct instance among several registered', async () => {
        const autA = await createStubAut('AppA');
        const autB = await createStubAut('AppB');
        const { given } = registerAndCaptureHandlers();

        await given[0].handler('[AppB]', undefined, '{"Authorization":"for-B"}', undefined);

        expect(autB.getHeaders()).toEqual({ Authorization: 'for-B' });
        expect(autA.getHeaders()).toEqual({});
      });

      it('rejects header data that is not valid JSON', async () => {
        await createStubAut();
        const { given } = registerAndCaptureHandlers();

        await expect(given[0].handler('AUT', undefined, '{not valid', undefined)).rejects.toThrow(/not valid JSON/);
      });

      it('rejects header data that is valid JSON but not an object', async () => {
        await createStubAut();
        const { given } = registerAndCaptureHandlers();

        await expect(given[0].handler('AUT', undefined, '[1,2,3]', undefined)).rejects.toThrow(/must be a JSON object/);
      });

      it('accepts JSON5 — unquoted keys, single-quoted strings, trailing commas (this is test fixture data, never forwarded as a literal string)', async () => {
        const aut = await createStubAut();
        const { given } = registerAndCaptureHandlers();

        await given[0].handler('AUT', undefined, "{Authorization: 'Bearer abc',}", undefined);

        expect(aut.getHeaders()).toEqual({ Authorization: 'Bearer abc' });
      });
    });

    // ─── pattern [1]: literal JSON, mandatory DataTable ────────────────────────────────
    describe('literal JSON, mandatory DataTable (pattern [1])', () => {

      it('a DataTable override wins on key collision with the literal base', async () => {
        const aut = await createStubAut();
        const { given } = registerAndCaptureHandlers();
        const dataTable = new DataTable([
          ['Header Key', 'Value'],
          ['Authorization', 'Bearer overridden'],
          ['X-New', 'added'],
        ]);

        await given[1].handler('AUT', undefined, '{"Authorization":"Bearer original","X-Kept":"yes"}', undefined, dataTable);

        expect(aut.getHeaders()).toEqual({ Authorization: 'Bearer overridden', 'X-Kept': 'yes', 'X-New': 'added' });
      });

      it('a DataTable override value goes through ValueExpression — number: casts to an actual number', async () => {
        const aut = await createStubAut();
        const { given } = registerAndCaptureHandlers();
        const dataTable = new DataTable([
          ['Header Key', 'Value'],
          ['X-Count', 'number:42'],
        ]);

        await given[1].handler('AUT', undefined, '{}', undefined, dataTable);

        expect(aut.getHeaders()['X-Count']).toBe(42);
      });

      it('rejects a resolved header value that is a non-primitive (e.g. json: in a DataTable cell)', async () => {
        await createStubAut();
        const { given } = registerAndCaptureHandlers();
        const dataTable = new DataTable([
          ['Header Key', 'Value'],
          ['X-Bad', 'json:{"a":1}'],
        ]);

        await expect(given[1].handler('AUT', undefined, '{}', undefined, dataTable)).rejects.toThrow(/non-primitive value/);
      });

      it('accepts a multi-value header (e.g. Set-Cookie) via a json: array cast, sent as-is', async () => {
        const aut = await createStubAut();
        const { given } = registerAndCaptureHandlers();
        const dataTable = new DataTable([
          ['Header Key', 'Value'],
          ['Set-Cookie', 'json:["a=1","b=2"]'],
        ]);

        await given[1].handler('AUT', undefined, '{}', undefined, dataTable);

        expect(aut.getHeaders()['Set-Cookie']).toEqual(['a=1', 'b=2']);
      });

      it('a DataTable cell\'s json: cast accepts JSON5 too (a single-quoted string, invalid in strict JSON)', async () => {
        const aut = await createStubAut();
        const { given } = registerAndCaptureHandlers();
        const dataTable = new DataTable([
          ['Header Key', 'Value'],
          ['X-Trace', "json:'hello'"],
        ]);

        await given[1].handler('AUT', undefined, '{}', undefined, dataTable);

        expect(aut.getHeaders()).toEqual({ 'X-Trace': 'hello' });
      });

      it('a _undefined sentinel in the DataTable override removes a header from the literal base', async () => {
        await createStubAut();
        const { given } = registerAndCaptureHandlers();
        const dataTable = new DataTable([
          ['Header Key', 'Value'],
          ['X-Remove-Me', '_undefined'],
        ]);
        const aut = API_AUTWrapper.getApplication();

        await given[1].handler('AUT', undefined, '{"X-Remove-Me":"present","X-Kept":"yes"}', undefined, dataTable);

        expect(aut.getHeaders()).toEqual({ 'X-Kept': 'yes' });
      });
    });

    // ─── pattern [2]: file-sourced, no DataTable ───────────────────────────────────────
    //
    // testdata/headers/base.json: { "Authorization": "Bearer file-token", "X-From-File": "yes" }
    describe('file-sourced, no DataTable (pattern [2])', () => {

      it('mode omitted — loads headers straight from the test data file', async () => {
        const aut = await createStubAut();
        const { given } = registerAndCaptureHandlers();

        await given[2].handler('AUT', undefined, 'headers/base.json');

        expect(aut.getHeaders()).toEqual({ Authorization: 'Bearer file-token', 'X-From-File': 'yes' });
      });

      it('explicit "merged" — combines file headers onto whatever session headers already existed', async () => {
        const aut = await createStubAut();
        await aut.setHeaders({ 'x-existing': 'yes' });
        const { given } = registerAndCaptureHandlers();

        await given[2].handler('AUT', 'merged', 'headers/base.json');

        expect(aut.getHeaders()).toEqual({ 'x-existing': 'yes', Authorization: 'Bearer file-token', 'X-From-File': 'yes' });
      });

      it('rejects a test data file whose contents are not a JSON object', async () => {
        await createStubAut();
        const { given } = registerAndCaptureHandlers();

        await expect(given[2].handler('AUT', undefined, 'headers/not-an-object.json')).rejects.toThrow(/must be a JSON object/);
      });
    });

    // ─── pattern [3]: file-sourced, mandatory DataTable ────────────────────────────────
    describe('file-sourced, mandatory DataTable (pattern [3])', () => {

      it('a DataTable override wins on key collision with the file-sourced base', async () => {
        const aut = await createStubAut();
        const { given } = registerAndCaptureHandlers();
        const dataTable = new DataTable([
          ['Header Key', 'Value'],
          ['X-From-File', 'overridden'],
        ]);

        await given[3].handler('AUT', undefined, 'headers/base.json', dataTable);

        expect(aut.getHeaders()).toEqual({ Authorization: 'Bearer file-token', 'X-From-File': 'overridden' });
      });
    });

    // ─── pattern [4]: DataTable-only, mandatory `;` ────────────────────────────────────
    describe('DataTable-only (pattern [4])', () => {

      it('applies headers straight from the table, default mode replaced', async () => {
        const aut = await createStubAut();
        const { given } = registerAndCaptureHandlers();
        const dataTable = new DataTable([
          ['Header Key', 'Value'],
          ['Authorization', 'Bearer from-table'],
        ]);

        await given[4].handler('AUT', undefined, dataTable);

        expect(aut.getHeaders()).toEqual({ Authorization: 'Bearer from-table' });
      });

      it('explicit "merged" — combines onto whatever session headers already existed', async () => {
        const aut = await createStubAut();
        await aut.setHeaders({ 'x-existing': 'yes' });
        const { given } = registerAndCaptureHandlers();
        const dataTable = new DataTable([
          ['Header Key', 'Value'],
          ['Authorization', 'Bearer from-table'],
        ]);

        await given[4].handler('AUT', 'merged', dataTable);

        expect(aut.getHeaders()).toEqual({ 'x-existing': 'yes', Authorization: 'Bearer from-table' });
      });
    });
  });

  // ─── Wired behaviour — "next request" one-shot equivalents ───────────────────────────
  //
  // These stage static, instance-independent state (API_AUTWrapper.setNextRequestHeaders/
  // mergeNextRequestHeaders), so unlike the session-level block above there's no `aut`
  // argument to the handler at all — verified instead via whichever AUT's request() fires
  // next. Each AUT here never actually starts a real server (stub bootstrapper), so
  // request() itself fails to connect — irrelevant to these tests, since the headers a
  // request carried are recorded on its transaction regardless of whether it got a response.
  describe('wired behaviour: "next request" one-shot equivalents', () => {

    function registerAndCaptureHandlers() {
      const given: { pattern: RegExp; handler: StepHandler }[] = [];
      const when: { pattern: RegExp; handler: StepHandler }[] = [];
      const cucumber = {
        Given: vi.fn((pattern: RegExp, handler: StepHandler) => { given.push({ pattern, handler }); }),
        When: vi.fn((pattern: RegExp, handler: StepHandler) => { when.push({ pattern, handler }); }),
      };
      wireApiHeaderStepDefinitions(cucumber as never);
      return { given, when };
    }

    async function createStubAut(appName = 'AUT'): Promise<API_AUTWrapper> {
      return API_AUTWrapper.create({
        appName,
        port: 15990,
        bootstrapper: async () => ({}),
        closeHandler: async () => undefined,
      });
    }

    afterEach(async () => {
      API_AUTWrapper.clearNextRequestHeaders();
      await API_AUTWrapper.closeAllRegistered();
    });

    describe('literal JSON, no DataTable (when[0])', () => {

      it('stages a static override consumed by whichever AUT requests next', async () => {
        const aut = await createStubAut();
        const { when } = registerAndCaptureHandlers();

        await when[0].handler(undefined, '{"Authorization":"Bearer one-shot"}', undefined);
        await aut.request('GET', '/anything');

        expect(aut.lastTransaction.request.headers).toEqual({ Authorization: 'Bearer one-shot' });

        // Consumed — gone for the request after.
        await aut.request('GET', '/anything');
        expect(aut.lastTransaction.request.headers).toEqual({});
      });

      it('explicit "merged" — stages a merge rather than a full replace', async () => {
        const aut = await createStubAut();
        await aut.setHeaders({ 'x-session': 'yes' });
        const { when } = registerAndCaptureHandlers();

        await when[0].handler('merged', '{"Authorization":"Bearer one-shot"}', undefined);
        await aut.request('GET', '/anything');

        expect(aut.lastTransaction.request.headers).toEqual({ 'x-session': 'yes', Authorization: 'Bearer one-shot' });
      });

      it('rejects header data that is not valid JSON', async () => {
        const { when } = registerAndCaptureHandlers();

        await expect(when[0].handler(undefined, '{not valid', undefined)).rejects.toThrow(/not valid JSON/);
      });
    });

    describe('literal JSON, mandatory DataTable (when[1])', () => {

      it('a DataTable override wins on key collision with the literal base', async () => {
        const aut = await createStubAut();
        const { when } = registerAndCaptureHandlers();
        const dataTable = new DataTable([
          ['Header Key', 'Value'],
          ['Authorization', 'Bearer overridden'],
        ]);

        await when[1].handler(undefined, '{"Authorization":"Bearer original"}', undefined, dataTable);
        await aut.request('GET', '/anything');

        expect(aut.lastTransaction.request.headers).toEqual({ Authorization: 'Bearer overridden' });
      });

      it('rejects a resolved header value that is a non-primitive', async () => {
        const aut = await createStubAut();
        const { when } = registerAndCaptureHandlers();
        const dataTable = new DataTable([
          ['Header Key', 'Value'],
          ['X-Bad', 'json:{"a":1}'],
        ]);

        // The DataTable's own Value column is deliberately resolved lazily — only when
        // API_AUTWrapper.request() actually consumes this one-shot override, same as the
        // literal portion (see the step definition's own doc comment) — so staging alone
        // can never reject for a bad DataTable-sourced value; only a subsequent request()
        // call triggers the resolve-and-validate that catches it.
        await when[1].handler(undefined, '{}', undefined, dataTable);
        await expect(aut.request('GET', '/anything')).rejects.toThrow(/non-primitive value/);
      });
    });

    describe('file-sourced, no DataTable (when[2])', () => {

      it('loads headers straight from the test data file', async () => {
        const aut = await createStubAut();
        const { when } = registerAndCaptureHandlers();

        await when[2].handler(undefined, 'headers/base.json');
        await aut.request('GET', '/anything');

        expect(aut.lastTransaction.request.headers).toEqual({ Authorization: 'Bearer file-token', 'X-From-File': 'yes' });
      });
    });

    describe('file-sourced, mandatory DataTable (when[3])', () => {

      it('a DataTable override wins on key collision with the file-sourced base', async () => {
        const aut = await createStubAut();
        const { when } = registerAndCaptureHandlers();
        const dataTable = new DataTable([
          ['Header Key', 'Value'],
          ['X-From-File', 'overridden'],
        ]);

        await when[3].handler(undefined, 'headers/base.json', dataTable);
        await aut.request('GET', '/anything');

        expect(aut.lastTransaction.request.headers).toEqual({ Authorization: 'Bearer file-token', 'X-From-File': 'overridden' });
      });
    });

    describe('DataTable-only (when[4])', () => {

      it('stages headers straight from the table', async () => {
        const aut = await createStubAut();
        const { when } = registerAndCaptureHandlers();
        const dataTable = new DataTable([
          ['Header Key', 'Value'],
          ['Authorization', 'Bearer from-table'],
        ]);

        await when[4].handler(undefined, dataTable);
        await aut.request('GET', '/anything');

        expect(aut.lastTransaction.request.headers).toEqual({ Authorization: 'Bearer from-table' });
      });
    });
  });
});
