import { DataTable } from '@cucumber/cucumber';
import { API_AUTWrapper } from '@controlium/framework';
import { APIUtils } from '@controlium/utils';

import { wireApiValidationStepDefinitions } from './validation.steps.js';

// ─── Mock @controlium/utils ───────────────────────────────────────────────────
//
// Same convention as @controlium/framework's own API_AUTWrapper.spec.ts — overrides only
// performRawHTTPOperation (so aut.request() can produce a controlled, canned response
// without a real network call) and silences Log output; every other export (Validate,
// JsonUtils, XmlUtils, ValueExpression, ...) stays real, since those are exactly what
// validation.steps.ts's own implementation is being tested through, not around.

vi.mock('@controlium/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@controlium/utils')>();
  return {
    ...actual,
    Log: { writeLine: vi.fn() },
    APIUtils: Object.assign(actual.APIUtils, { performRawHTTPOperation: vi.fn() }),
  };
});

const mockPerform = vi.mocked(APIUtils.performRawHTTPOperation);

/** Shorthand for a canned HTTP response — same shape `API_AUTWrapper.spec.ts` uses. */
function makeResponse(status = 200, body = '{"ok":true}', headers: Record<string, string> = {}): APIUtils.HTTPResponse {
  return {
    status,
    statusMessage: status === 200 ? 'OK' : String(status),
    headers,
    body,
    bodyBuffer: Buffer.from(body),
    rawRequestBytes: Buffer.from(''),
    rawResponseBytes: Buffer.from(''),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StepHandler = (...args: any[]) => unknown;

/**
 * Captures every pattern registered against a fake `Then`, in registration order, so each
 * test matches sample step text against the *real* regex `wireApiValidationStepDefinitions`
 * registers — not a hand-copied duplicate of it.
 */
function registerAndCapture() {
  const then: RegExp[] = [];
  const cucumber = { Then: vi.fn((pattern: RegExp) => { then.push(pattern); }) };
  wireApiValidationStepDefinitions(cucumber as never);
  return then;
}

function registerAndCaptureHandlers() {
  const then: { pattern: RegExp; handler: StepHandler }[] = [];
  const cucumber = { Then: vi.fn((pattern: RegExp, handler: StepHandler) => { then.push({ pattern, handler }); }) };
  wireApiValidationStepDefinitions(cucumber as never);
  return then;
}

async function createStubAut(appName = 'AUT', port = 15997): Promise<API_AUTWrapper> {
  return API_AUTWrapper.startNewApplication({ appName, port, bootstrapper: async () => ({}), closeHandler: async () => undefined });
}

describe('wireApiValidationStepDefinitions', () => {

  beforeEach(() => {
    mockPerform.mockReset();
  });

  it('rejects null', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => wireApiValidationStepDefinitions(null as any)).toThrow(/\[cucumber\] must be the '@cucumber\/cucumber' module object/);
  });

  it('rejects an object missing Then', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => wireApiValidationStepDefinitions({} as any)).toThrow(/\[cucumber\.Then\] must be a function/);
  });

  it('registers exactly 4 patterns', () => {
    expect(registerAndCapture()).toHaveLength(4);
  });

  // ─── Regex matching ──────────────────────────────────────────────────────

  describe('pattern matching', () => {

    it('status only, either quote style, any target form', () => {
      const then = registerAndCapture();
      expect("Response from AUT status is '200'".match(then[0])?.slice(1)).toEqual(['AUT', '200', undefined]);
      expect('Response from [MyApp] status is "404"'.match(then[0])?.slice(1)).toEqual(['[MyApp]', undefined, '404']);
      expect("Response from API status is '200'".match(then[0])?.slice(1)).toEqual(['API', '200', undefined]);
    });

    it('literal body — kind and compare-types brackets are both optional', () => {
      const then = registerAndCapture();
      expect("Response from AUT status is '200', body 'OK'".match(then[1])?.slice(1))
        .toEqual(['AUT', '200', undefined, undefined, undefined, 'OK', undefined]);
      expect(`Response from AUT status is '200', [json] body '{"a":1}'`.match(then[1])?.slice(1))
        .toEqual(['AUT', '200', undefined, 'json', undefined, '{"a":1}', undefined]);
      expect("Response from AUT status is '200', [text] body [contains] 'partial'".match(then[1])?.slice(1))
        .toEqual(['AUT', '200', undefined, 'text', 'contains', 'partial', undefined]);
    });

    it('file-sourced body — kind and compare-types brackets are both optional', () => {
      const then = registerAndCapture();
      expect('Response from AUT status is \'200\', body from test data file [a/b.txt]'.match(then[2])?.slice(1))
        .toEqual(['AUT', '200', undefined, undefined, undefined, 'a/b.txt']);
      expect('Response from AUT status is \'200\', [xml] body [contains] from test data file [a/b.xml]'.match(then[2])?.slice(1))
        .toEqual(['AUT', '200', undefined, 'xml', 'contains', 'a/b.xml']);
    });

    it('DataTable body — kind bracket optional, requires trailing ;', () => {
      const then = registerAndCapture();
      expect("Response from AUT status is '200', [json] body;".match(then[3])?.slice(1)).toEqual(['AUT', '200', undefined, 'json']);
      expect("Response from AUT status is '200', body;".match(then[3])?.slice(1)).toEqual(['AUT', '200', undefined, undefined]);
      expect("Response from AUT status is '200', body".match(then[3])).toBeNull();
    });
  });

  // ─── Wired behaviour: status ─────────────────────────────────────────────

  describe('wired behaviour: status', () => {

    afterEach(async () => {
      await API_AUTWrapper.closeAllAUTsAndAPIs();
    });

    it('passes when the status matches', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse(200));
      const aut = API_AUTWrapper.getApplication('AUT');
      await aut.request('GET', '/');
      const then = registerAndCaptureHandlers();

      expect(() => then[0].handler('AUT', '200', undefined)).not.toThrow();
    });

    it('throws, naming both values, when the status does not match', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse(404));
      const aut = API_AUTWrapper.getApplication('AUT');
      await aut.request('GET', '/');
      const then = registerAndCaptureHandlers();

      expect(() => then[0].handler('AUT', '200', undefined)).toThrow(/Expected \[matches \[200\]\][\s\S]*Actual \[404\]/);
    });
  });

  // ─── Wired behaviour: literal body ────────────────────────────────────────

  describe('wired behaviour: literal body', () => {

    afterEach(async () => {
      await API_AUTWrapper.closeAllAUTsAndAPIs();
    });

    it('text kind, equals (default)', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse(200, 'hello world'));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(then[1].handler('AUT', '200', undefined, 'text', undefined, 'hello world', undefined)).resolves.not.toThrow();
      await expect(then[1].handler('AUT', '200', undefined, 'text', undefined, 'goodbye', undefined)).rejects.toThrow();
    });

    it('text kind, contains compare type', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse(200, 'hello world'));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(then[1].handler('AUT', '200', undefined, 'text', 'contains', 'world', undefined)).resolves.not.toThrow();
    });

    it('defaults to text kind when the [kind] bracket is omitted', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse(200, 'plain text'));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(then[1].handler('AUT', '200', undefined, undefined, undefined, 'plain text', undefined)).resolves.not.toThrow();
    });

    it('json kind, structural equality — key order does not matter', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse(200, '{"b":2,"a":1}'));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(then[1].handler('AUT', '200', undefined, 'json', undefined, '{"a":1,"b":2}', undefined)).resolves.not.toThrow();
    });

    it('json kind, structural mismatch throws with both JSON dumps', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse(200, '{"a":1}'));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(then[1].handler('AUT', '200', undefined, 'json', undefined, '{"a":2}', undefined)).rejects.toThrow(/Expected:[\s\S]*Actual:/);
    });

    it("json kind rejects 'not' for a structural comparison", async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse(200, '{"a":1}'));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(then[1].handler('AUT', '200', undefined, 'json', 'not', '{"a":2}', undefined)).rejects.toThrow(/'not' is not supported/);
    });

    it('json kind falls back to a text-level comparison when a text-mode compare type is given', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse(200, '{"a":1,"b":2}'));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(then[1].handler('AUT', '200', undefined, 'json', 'contains', '"a":1', undefined)).resolves.not.toThrow();
    });

    it('xml kind compares the parsed-then-reserialised canonical form — quote-style differences do not matter', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse(200, "<a b='1'>x</a>"));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(then[1].handler('AUT', '200', undefined, 'xml', undefined, '<a b="1">x</a>', undefined)).resolves.not.toThrow();
    });

    it('xml kind mismatch throws', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse(200, '<a><b>1</b></a>'));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(then[1].handler('AUT', '200', undefined, 'xml', undefined, '<a><b>2</b></a>', undefined)).rejects.toThrow();
    });

    it('resolves a named [AppName] target among several registered', async () => {
      await createStubAut('AppA', 15997);
      await createStubAut('AppB', 15998);
      mockPerform.mockResolvedValueOnce(makeResponse(200, 'from A')).mockResolvedValueOnce(makeResponse(200, 'from B'));
      await API_AUTWrapper.getApplication('AppA').request('GET', '/');
      await API_AUTWrapper.getApplication('AppB').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(then[1].handler('[AppB]', '200', undefined, 'text', undefined, 'from B', undefined)).resolves.not.toThrow();
    });
  });

  // ─── Wired behaviour: file-sourced body ──────────────────────────────────

  describe('wired behaviour: file-sourced body', () => {

    afterEach(async () => {
      await API_AUTWrapper.closeAllAUTsAndAPIs();
    });

    it('json kind loads and structurally compares the file contents (testdata/request-body/base.json is {"a":1})', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse(200, '{"a":1}'));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(then[2].handler('AUT', '200', undefined, 'json', undefined, 'request-body/base.json')).resolves.not.toThrow();
    });

    it('xml kind loads and canonically compares the file contents (testdata/request-body/base.xml is <a>1</a>)', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse(200, '<a>1</a>'));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(then[2].handler('AUT', '200', undefined, 'xml', undefined, 'request-body/base.xml')).resolves.not.toThrow();
    });
  });

  // ─── Wired behaviour: DataTable body ──────────────────────────────────────

  describe('wired behaviour: DataTable body', () => {

    afterEach(async () => {
      await API_AUTWrapper.closeAllAUTsAndAPIs();
    });

    async function callDataTableHandler(then: { pattern: RegExp; handler: StepHandler }[], target: string, status: string, kind: string | undefined, rows: string[][]): Promise<unknown> {
      return then[3].handler(target, status, undefined, kind, new DataTable(rows));
    }

    it('json kind, JSON-Path rows, equals (default)', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse(200, '{"data":{"name":"Alice","active":true}}'));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(
        callDataTableHandler(then, 'AUT', '200', 'json', [
          ['JSON-Path', 'Compare Types', 'Expected Value'],
          ['$.data.name', '', 'Alice'],
          ['$.data.active', '', 'boolean:true'],
        ])
      ).resolves.not.toThrow();
    });

    it('json kind, a failing row throws naming the path', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse(200, '{"data":{"name":"Bob"}}'));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(
        callDataTableHandler(then, 'AUT', '200', 'json', [
          ['JSON-Path', 'Compare Types', 'Expected Value'],
          ['$.data.name', '', 'Alice'],
        ])
      ).rejects.toThrow(/\$\.data\.name/);
    });

    it('json kind, contains compare type on an extracted value', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse(200, '{"data":{"tags":"admin,user"}}'));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(
        callDataTableHandler(then, 'AUT', '200', 'json', [
          ['JSON-Path', 'Compare Types', 'Expected Value'],
          ['$.data.tags', 'contains', 'admin'],
        ])
      ).resolves.not.toThrow();
    });

    it('json kind, zero matches passes only when expected is the _undefined sentinel', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse(200, '{"data":{}}'));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(
        callDataTableHandler(then, 'AUT', '200', 'json', [
          ['JSON-Path', 'Compare Types', 'Expected Value'],
          ['$.data.missing', '', '_undefined'],
        ])
      ).resolves.not.toThrow();

      await expect(
        callDataTableHandler(then, 'AUT', '200', 'json', [
          ['JSON-Path', 'Compare Types', 'Expected Value'],
          ['$.data.missing', '', '"should have existed"'],
        ])
      ).rejects.toThrow(/no matching property found/);
    });

    // xml/text DataTable rows have no backing primitive yet — @controlium/utils's
    // Validate (née Validate) class has no XPath/regex equivalent of
    // Validate.jsonProperty (deliberately deferred — see
    // [[project_controlium_validate_primitives]]). These two throw clearly rather than
    // silently matching nothing, per [[feedback_controlium_defensive_coding]].

    it('xml kind throws clearly — not implemented yet', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse(200, '<root><name>Alice</name></root>'));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(
        callDataTableHandler(then, 'AUT', '200', 'xml', [
          ['XPath', 'Compare Types', 'Expected Value'],
          ['/root/name', '', 'Alice'],
        ])
      ).rejects.toThrow(/DataTable-based \[xml\] body validation is not implemented yet/);
    });

    it('text kind throws clearly — not implemented yet', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse(200, 'request-id: abc-123'));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(
        callDataTableHandler(then, 'AUT', '200', undefined, [
          ['RegExp', 'Compare Types', 'Expected Value'],
          ['request-id: (\\S+)', '', 'abc-123'],
        ])
      ).rejects.toThrow(/DataTable-based \[text\] body validation is not implemented yet/);
    });

    it("'count' compares the number of matches instead of their content", async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse(200, '{"items":["a","b","c"]}'));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(
        callDataTableHandler(then, 'AUT', '200', 'json', [
          ['JSON-Path', 'Compare Types', 'Expected Value'],
          ['$.items[*]', 'count', '3'],
        ])
      ).resolves.not.toThrow();
    });

    it("'any' passes if any one match satisfies the row", async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse(200, '{"items":["a","b","c"]}'));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(
        callDataTableHandler(then, 'AUT', '200', 'json', [
          ['JSON-Path', 'Compare Types', 'Expected Value'],
          ['$.items[*]', 'any', 'b'],
        ])
      ).resolves.not.toThrow();
    });

    it('an optional Description column is read but not required', async () => {
      await createStubAut();
      mockPerform.mockResolvedValue(makeResponse(200, '{"a":1}'));
      await API_AUTWrapper.getApplication('AUT').request('GET', '/');
      const then = registerAndCaptureHandlers();

      await expect(
        callDataTableHandler(then, 'AUT', '200', 'json', [
          ['JSON-Path', 'Compare Types', 'Expected Value', 'Description'],
          ['$.a', '', 'number:1', 'the a field'],
        ])
      ).resolves.not.toThrow();
    });
  });
});
