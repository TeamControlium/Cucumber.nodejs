import { DataTable } from '@cucumber/cucumber';
import { API_AUTWrapper } from '@controlium/framework';
import { APIUtils, Validate } from '@controlium/utils';

import { wireApiHeaderValidationStepDefinitions } from './headerValidation.steps.js';

// ─── Mock @controlium/utils ───────────────────────────────────────────────────
//
// Same convention as validation.steps.spec.ts/@controlium/framework's own API_AUTWrapper.spec.ts.

vi.mock('@controlium/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@controlium/utils')>();
  return {
    ...actual,
    Log: { writeLine: vi.fn() },
    APIUtils: Object.assign(actual.APIUtils, { performRawHTTPOperation: vi.fn() }),
  };
});

const mockPerform = vi.mocked(APIUtils.performRawHTTPOperation);

function makeResponse(headers: Record<string, string | string[]> = {}): APIUtils.HTTPResponse {
  return {
    status: 200,
    statusMessage: 'OK',
    headers,
    body: '',
    bodyBuffer: Buffer.from(''),
    rawRequestBytes: Buffer.from(''),
    rawResponseBytes: Buffer.from(''),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StepHandler = (...args: any[]) => unknown;

function registerAndCapture() {
  const then: RegExp[] = [];
  const cucumber = { Then: vi.fn((pattern: RegExp) => { then.push(pattern); }) };
  wireApiHeaderValidationStepDefinitions(cucumber as never);
  return then;
}

function registerAndCaptureHandlers() {
  const then: { pattern: RegExp; handler: StepHandler }[] = [];
  const cucumber = { Then: vi.fn((pattern: RegExp, handler: StepHandler) => { then.push({ pattern, handler }); }) };
  wireApiHeaderValidationStepDefinitions(cucumber as never);
  return then;
}

async function createStubAut(appName = 'AUT', port = 15999): Promise<API_AUTWrapper> {
  return API_AUTWrapper.startNewApplication({ appName, port, bootstrapper: async () => ({}), closeHandler: async () => undefined });
}

describe('wireApiHeaderValidationStepDefinitions', () => {

  beforeEach(() => {
    mockPerform.mockReset();
  });

  it('rejects null', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => wireApiHeaderValidationStepDefinitions(null as any)).toThrow(/\[cucumber\] must be the '@cucumber\/cucumber' module object/);
  });

  it('rejects an object missing Then', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => wireApiHeaderValidationStepDefinitions({} as any)).toThrow(/\[cucumber\.Then\] must be a function/);
  });

  it('registers exactly 10 patterns', () => {
    expect(registerAndCapture()).toHaveLength(10);
  });

  // ─── Regex matching — in particular, no collision between the "named" presence family ──
  // ─── and the literal-JSON full-set/subset families, despite both starting "has headers" ──

  describe('pattern matching', () => {

    it('presence requires the literal word "named" — singular or plural', () => {
      const then = registerAndCapture();
      expect("Response from AUT has header named 'ETag'".match(then[0])?.slice(1)).toEqual(['AUT', "'ETag'"]);
      expect("Response from AUT has headers named 'ETag', 'X-Trace'".match(then[0])?.slice(1)).toEqual(['AUT', "'ETag', 'X-Trace'"]);
    });

    it('negative presence requires "named" too', () => {
      const then = registerAndCapture();
      expect("Response from AUT does not have header named 'X-Debug'".match(then[1])?.slice(1)).toEqual(['AUT', "'X-Debug'"]);
    });

    it('value check — optional compare-types bracket', () => {
      const then = registerAndCapture();
      expect("Response from AUT header 'ETag' has value 'abc'".match(then[2])?.slice(1)).toEqual(['AUT', "'ETag'", undefined, "'abc'"]);
      expect("Response from AUT header 'ETag' has value [contains] 'abc'".match(then[2])?.slice(1)).toEqual(['AUT', "'ETag'", 'contains', "'abc'"]);
    });

    it('header-values DataTable pattern requires the exact trailing phrase', () => {
      const then = registerAndCapture();
      expect('Response from AUT has header values;'.match(then[3])?.slice(1)).toEqual(['AUT']);
    });

    it("'has headers' (full-set, literal JSON) does not collide with 'has headers named' (presence)", () => {
      const then = registerAndCapture();
      expect('Response from AUT has headers \'{"a":"b"}\''.match(then[4])?.slice(1)).toEqual(['AUT', '{"a":"b"}', undefined]);
      expect('Response from AUT has headers \'{"a":"b"}\''.match(then[0])).toBeNull();
      expect("Response from AUT has headers named 'a'".match(then[4])).toBeNull();
    });

    it("'has headers' full-set file/DataTable forms", () => {
      const then = registerAndCapture();
      expect('Response from AUT has headers from test data file [a/b.json]'.match(then[5])?.slice(1)).toEqual(['AUT', 'a/b.json']);
      expect('Response from AUT has headers;'.match(then[6])?.slice(1)).toEqual(['AUT']);
    });

    it("'contains headers' subset literal/file/DataTable forms", () => {
      const then = registerAndCapture();
      expect('Response from AUT contains headers \'{"a":"b"}\''.match(then[7])?.slice(1)).toEqual(['AUT', '{"a":"b"}', undefined]);
      expect('Response from AUT contains headers in test data file [a/b.json]'.match(then[8])?.slice(1)).toEqual(['AUT', 'a/b.json']);
      expect('Response from AUT contains headers;'.match(then[9])?.slice(1)).toEqual(['AUT']);
    });
  });

  // ─── Wired behaviour: presence ────────────────────────────────────────────

  describe('wired behaviour: presence', () => {

    afterEach(async () => {
      await API_AUTWrapper.closeAllAUTsAndAPIs();
    });

    it('passes when the named header(s) are present (case-insensitive)', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse({ 'content-type': 'application/json', etag: 'abc' }));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      expect(() => then[0].handler('AUT', "'Content-Type', 'ETag'")).not.toThrow();
    });

    it('throws naming the missing header(s)', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse({ 'content-type': 'application/json' }));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      expect(() => then[0].handler('AUT', "'ETag'")).toThrow(/response headers \[ETag\][\s\S]*Expected \[true\][\s\S]*Actual \[false\]/);
    });

    it("'does not have header named' passes when absent, throws when present", async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse({ 'content-type': 'application/json' }));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      expect(() => then[1].handler('AUT', "'X-Debug'")).not.toThrow();
      expect(() => then[1].handler('AUT', "'Content-Type'")).toThrow(/response headers \[Content-Type\][\s\S]*Expected \[false\][\s\S]*Actual \[true\]/);
    });
  });

  // ─── Wired behaviour: value(s) with compare types ─────────────────────────

  describe('wired behaviour: value(s)', () => {

    afterEach(async () => {
      await API_AUTWrapper.closeAllAUTsAndAPIs();
    });

    it('single header, equals (default)', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse({ 'content-type': 'application/json' }));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(then[2].handler('AUT', "'Content-Type'", undefined, "'application/json'")).resolves.not.toThrow();
      await expect(then[2].handler('AUT', "'Content-Type'", undefined, "'text/html'")).rejects.toThrow();
    });

    it('single header, contains compare type', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse({ 'content-type': 'application/json; charset=utf-8' }));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(then[2].handler('AUT', "'Content-Type'", 'contains', "'application/json'")).resolves.not.toThrow();
    });

    it('multiple headers, position-matched', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse({ 'content-type': 'application/json', etag: 'abc' }));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(then[2].handler('AUT', "'Content-Type', 'ETag'", undefined, "'application/json', 'abc'")).resolves.not.toThrow();
    });

    it('throws clearly if the name list and value list are different lengths', async () => {
      await createStubAut();
      const then = registerAndCaptureHandlers();

      await expect(then[2].handler('AUT', "'Content-Type', 'ETag'", undefined, "'application/json'")).rejects.toThrow(/2 header name\(s\) but 1 value\(s\)/);
    });

    it('DataTable form supports per-row compare types, including "any" against a repeated header', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse({ 'content-type': 'application/json', 'set-cookie': ['a=1', 'b=2'] }));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(
        then[3].handler('AUT', new DataTable([
          ['Header Key', 'Compare Types', 'Expected Value'],
          ['Content-Type', 'equals', 'application/json'],
          ['Set-Cookie', 'any', 'b=2'],
        ]))
      ).resolves.not.toThrow();
    });

    it('DataTable form reads an optional Description column without requiring it', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse({ 'content-type': 'application/json' }));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(
        then[3].handler('AUT', new DataTable([
          ['Header Key', 'Compare Types', 'Expected Value', 'Description'],
          ['Content-Type', '', 'application/json', 'the content type'],
        ]))
      ).resolves.not.toThrow();
    });
  });

  // ─── Wired behaviour: full-set ("has") ─────────────────────────────────────

  describe('wired behaviour: full-set (has headers)', () => {

    afterEach(async () => {
      await API_AUTWrapper.closeAllAUTsAndAPIs();
    });

    it('passes when the actual headers are exactly the given set', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse({ 'content-type': 'application/json' }));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      expect(() => then[4].handler('AUT', '{"Content-Type":"application/json"}', undefined)).not.toThrow();
    });

    it('throws if the actual headers have anything extra', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse({ 'content-type': 'application/json', etag: 'abc' }));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      expect(() => then[4].handler('AUT', '{"Content-Type":"application/json"}', undefined)).toThrow(/response headers \[etag\][\s\S]*Expected \[true\][\s\S]*Actual \[false\]/);
    });

    it('throws if a given header is missing', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse({ 'content-type': 'application/json' }));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      expect(() => then[4].handler('AUT', '{"Content-Type":"application/json","ETag":"abc"}', undefined)).toThrow(/response headers \[ETag\]: expected 1 value\(s\) \[abc\], but found 0 value\(s\)/);
    });

    it('a repeated header (Set-Cookie) is compared as an order-independent set of values', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse({ 'set-cookie': ['a=1', 'b=2'] }));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      expect(() => then[4].handler('AUT', '{"Set-Cookie":["b=2","a=1"]}', undefined)).not.toThrow();
    });

    it('DataTable-sourced exact set', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse({ 'content-type': 'application/json' }));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(
        then[6].handler('AUT', new DataTable([
          ['Header Key', 'Value'],
          ['Content-Type', 'application/json'],
        ]))
      ).resolves.not.toThrow();
    });
  });

  // ─── Wired behaviour: subset ("contains") ──────────────────────────────────

  describe('wired behaviour: subset (contains headers)', () => {

    afterEach(async () => {
      await API_AUTWrapper.closeAllAUTsAndAPIs();
    });

    it('passes when the actual headers merely include the given set, extras allowed', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse({ 'content-type': 'application/json', etag: 'abc', date: 'Thu, 01 Jan 2026 00:00:00 GMT' }));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      expect(() => then[7].handler('AUT', '{"Content-Type":"application/json"}', undefined)).not.toThrow();
    });

    it('still throws if a given header is missing', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse({ 'content-type': 'application/json' }));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      expect(() => then[7].handler('AUT', '{"ETag":"abc"}', undefined)).toThrow(/response headers \[ETag\]: expected \[abc\] to match at least one of/);
    });

    it('a repeated header only needs the given values to be a subset of the actual ones', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse({ 'set-cookie': ['a=1', 'b=2', 'c=3'] }));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      expect(() => then[7].handler('AUT', '{"Set-Cookie":["b=2"]}', undefined)).not.toThrow();
    });

    it('DataTable-sourced subset', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse({ 'content-type': 'application/json', etag: 'abc' }));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(
        then[9].handler('AUT', new DataTable([
          ['Header Key', 'Value'],
          ['Content-Type', 'application/json'],
        ]))
      ).resolves.not.toThrow();
    });
  });

  // ─── Centralisation — every pass/fail judgement here must be Validate' to make, ────
  // ─── not this file's; these tests assert the *delegation* itself, not logging (which ───
  // ─── is Validate' own responsibility, already covered by validate.spec.ts). ─────────
  // ─── Validate has no multi-candidate primitive any more (see compareHeaderCandidates' ──
  // ─── own doc comment) — presence now delegates to Validate.boolean, and value-set ────
  // ─── membership bottoms out at Validate.text (via this file's own any/count/index ────
  // ─── dispatch, mirroring Validate.jsonProperty's shape). ───────────────────────────

  describe('centralised validation — delegates every judgement to Validate', () => {

    afterEach(async () => {
      vi.restoreAllMocks();
      await API_AUTWrapper.closeAllAUTsAndAPIs();
    });

    it("'has header named' delegates the presence judgement to Validate.boolean", async () => {
      const booleanSpy = vi.spyOn(Validate, 'boolean');
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse({ 'content-type': 'application/json' }));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      then[0].handler('AUT', "'Content-Type'");

      expect(booleanSpy).toHaveBeenCalledWith(true, true, expect.stringContaining('Content-Type'));
    });

    it("'does not have header named' delegates with shouldExist=false", async () => {
      const booleanSpy = vi.spyOn(Validate, 'boolean');
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse({ 'content-type': 'application/json' }));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      then[1].handler('AUT', "'X-Debug'");

      expect(booleanSpy).toHaveBeenCalledWith(false, false, expect.stringContaining('X-Debug'));
    });

    it("'contains headers' (subset) delegates value-set membership to Validate.text — presence falls out of its own empty-candidates handling, no separate existence pre-check", async () => {
      const booleanSpy = vi.spyOn(Validate, 'boolean');
      const textSpy = vi.spyOn(Validate, 'text');
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse({ 'content-type': 'application/json', date: 'Thu, 01 Jan 2026 00:00:00 GMT' }));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      then[7].handler('AUT', '{"Content-Type":"application/json"}', undefined);

      expect(textSpy).toHaveBeenCalledWith('application/json', 'application/json', expect.stringContaining('Content-Type'), expect.stringContaining('casesensitive'));
      // Subset mode never checks the actual side for extras, and doesn't need a separate
      // presence check at all — the 'any' candidate search's own empty-candidates handling
      // (a plain thrown Error, not a Validate call) covers it.
      expect(booleanSpy).not.toHaveBeenCalled();
    });

    it("'has headers' (exact set) delegates the extra-header-name check to Validate.boolean", async () => {
      const booleanSpy = vi.spyOn(Validate, 'boolean');
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse({ 'content-type': 'application/json' }));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      then[4].handler('AUT', '{"Content-Type":"application/json"}', undefined);

      // Exact-set mode's one boolean call confirms the actual header isn't unexpected.
      expect(booleanSpy).toHaveBeenCalledWith(true, true, expect.stringContaining('content-type'));
      expect(booleanSpy).toHaveBeenCalledTimes(1);
    });
  });
});
