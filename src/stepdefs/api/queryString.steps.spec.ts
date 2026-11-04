import { DataTable } from '@cucumber/cucumber';
import { API_AUTWrapper } from '@controlium/framework';

import { wireApiQueryStringStepDefinitions } from './queryString.steps.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StepHandler = (...args: any[]) => unknown;

/**
 * Same registration-order convention as `headers.steps.spec.ts`'s own
 * `registerAndCapture`/`registerAndCaptureHandlers` — see that file's own doc comment.
 *
 * Registration order:
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
  wireApiQueryStringStepDefinitions(cucumber as never);
  return { given, when };
}

function registerAndCaptureHandlers() {
  const given: { pattern: RegExp; handler: StepHandler }[] = [];
  const when: { pattern: RegExp; handler: StepHandler }[] = [];
  const cucumber = {
    Given: vi.fn((pattern: RegExp, handler: StepHandler) => { given.push({ pattern, handler }); }),
    When: vi.fn((pattern: RegExp, handler: StepHandler) => { when.push({ pattern, handler }); }),
  };
  wireApiQueryStringStepDefinitions(cucumber as never);
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

function makeDataTable(rows: string[][]): DataTable {
  return new DataTable(rows);
}

describe('wireApiQueryStringStepDefinitions', () => {

  it('rejects null', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => wireApiQueryStringStepDefinitions(null as any)).toThrow(/\[cucumber\] must be the '@cucumber\/cucumber' module object/);
  });

  it('rejects a non-object', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => wireApiQueryStringStepDefinitions('nope' as any)).toThrow(/\[cucumber\] must be the '@cucumber\/cucumber' module object/);
  });

  it('rejects an object missing Given', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => wireApiQueryStringStepDefinitions({ When: vi.fn() } as any)).toThrow(/\[cucumber\.Given\] must be a function/);
  });

  it('rejects an object missing When', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => wireApiQueryStringStepDefinitions({ Given: vi.fn() } as any)).toThrow(/\[cucumber\.When\] must be a function/);
  });

  describe('pattern matching', () => {

    it('literal JSON, no DataTable (pattern [0]) — accepts replaced/merged/omitted wording', () => {
      const { given } = registerAndCapture();
      expect("request query params for AUT are [replaced] with '{\"a\":1}'".match(given[0])?.slice(1))
        .toEqual(['AUT', 'replaced', '{"a":1}', undefined]);
      expect('request query params for AUT are \'{"a":1}\''.match(given[0])?.slice(1))
        .toEqual(['AUT', undefined, '{"a":1}', undefined]);
    });

    it('does not match literal JSON with a trailing ";" — that is the DataTable-required pattern\'s territory', () => {
      const { given } = registerAndCapture();
      expect('request query params for AUT are \'{"a":1}\';'.match(given[0])).toBeNull();
    });

    it('literal JSON, mandatory DataTable (pattern [1]) — requires the trailing ";"', () => {
      const { given } = registerAndCapture();
      expect('request query params for AUT are \'{"a":1}\';'.match(given[1])?.slice(1))
        .toEqual(['AUT', undefined, '{"a":1}', undefined]);
      expect('request query params for AUT are \'{"a":1}\''.match(given[1])).toBeNull();
    });

    it('file-sourced, no DataTable (pattern [2])', () => {
      const { given } = registerAndCapture();
      expect('request query params for AUT are using test data file [a.json]'.match(given[2])?.slice(1))
        .toEqual(['AUT', undefined, 'a.json']);
    });

    it('DataTable-only (pattern [4]) — requires the trailing ";", bare and with the mode word', () => {
      const { given } = registerAndCapture();
      expect('request query params for AUT are;'.match(given[4])?.slice(1)).toEqual(['AUT', undefined]);
      expect('request query params for AUT are [replaced] with;'.match(given[4])?.slice(1)).toEqual(['AUT', 'replaced']);
      expect('request query params for AUT are'.match(given[4])).toBeNull();
    });

    it('one-shot: literal JSON, no DataTable (when[0]) — no (AUT|[name]) target at all', () => {
      const { when } = registerAndCapture();
      expect('next API request query params are [replaced] with \'{"a":1}\''.match(when[0])?.slice(1))
        .toEqual(['replaced', '{"a":1}', undefined]);
    });

    it('one-shot: DataTable-only (when[4])', () => {
      const { when } = registerAndCapture();
      expect('next API request query params are;'.match(when[4])?.slice(1)).toEqual([undefined]);
    });
  });

  describe('wired behaviour: session-level', () => {

    afterEach(async () => {
      await API_AUTWrapper.closeAllRegistered();
    });

    it('literal JSON, no DataTable — mode omitted defaults to setQueryParams (replace)', async () => {
      const aut = await createStubAut();
      const { given } = registerAndCaptureHandlers();

      await given[0].handler('AUT', undefined, '{"name":"blahblah"}', undefined);

      expect(aut.getQueryParams()).toEqual({ name: 'blahblah' });
    });

    it('literal JSON — explicit "merged" combines onto whatever session query params already existed', async () => {
      const aut = await createStubAut();
      await aut.setQueryParams({ page: 1 });
      const { given } = registerAndCaptureHandlers();

      await given[0].handler('AUT', 'merged', '{"name":"blahblah"}', undefined);

      expect(aut.getQueryParams()).toEqual({ page: 1, name: 'blahblah' });
    });

    it('literal JSON with DataTable override — DataTable key wins on collision', async () => {
      const aut = await createStubAut();
      const { given } = registerAndCaptureHandlers();
      const dataTable = makeDataTable([['Query Param', 'Value'], ['page', 'number:2']]);

      await given[1].handler('AUT', undefined, '{"page":1,"name":"blahblah"}', undefined, dataTable);

      expect(aut.getQueryParams()).toEqual({ page: 2, name: 'blahblah' });
    });

    it('DataTable-only — builds the whole set from the table, casts included', async () => {
      const aut = await createStubAut();
      const { given } = registerAndCaptureHandlers();
      const dataTable = makeDataTable([
        ['Query Param', 'Value'],
        ['name', 'blahblah'],
        ['page', 'number:2'],
      ]);

      await given[4].handler('AUT', undefined, dataTable);

      expect(aut.getQueryParams()).toEqual({ name: 'blahblah', page: 2 });
    });

    it('rejects a resolved query param value that is a non-primitive (e.g. json: object in a DataTable cell)', async () => {
      await createStubAut();
      const { given } = registerAndCaptureHandlers();
      const dataTable = makeDataTable([['Query Param', 'Value'], ['bad', 'json:{"a":1}']]);

      await expect(given[4].handler('AUT', undefined, dataTable)).rejects.toThrow(/non-primitive value/);
    });

    it('accepts a multi-value query param (string[]) — a genuine repeated key', async () => {
      const aut = await createStubAut();
      const { given } = registerAndCaptureHandlers();
      const dataTable = makeDataTable([['Query Param', 'Value'], ['tag', 'json:["a","b"]']]);

      await given[4].handler('AUT', undefined, dataTable);

      expect(aut.getQueryParams()['tag']).toEqual(['a', 'b']);
    });

    it('end-to-end: session query params appear on the actual request', async () => {
      const aut = await createStubAut();
      const { given } = registerAndCaptureHandlers();

      await given[0].handler('AUT', undefined, '{"name":"blahblah"}', undefined);
      await aut.request('GET', '/xyz');

      expect(aut.lastTransaction.request.queryString).toBe('name=blahblah');
    });
  });

  describe('wired behaviour: "next request" one-shot equivalents', () => {

    afterEach(async () => {
      await API_AUTWrapper.closeAllRegistered();
      API_AUTWrapper.clearNextRequestQueryParams();
    });

    it('replaces session query params entirely for the next request only', async () => {
      const aut = await createStubAut();
      await aut.setQueryParams({ page: 1 });
      const { when } = registerAndCaptureHandlers();

      await when[0].handler(undefined, '{"page":"99"}', undefined);
      await aut.request('GET', '/');
      expect(aut.lastTransaction.request.queryString).toBe('page=99');

      // Consumed — the next request reverts to plain session query params.
      await aut.request('GET', '/');
      expect(aut.lastTransaction.request.queryString).toBe('page=1');
    });

    it('DataTable-only one-shot override', async () => {
      const aut = await createStubAut();
      await aut.setQueryParams({ page: 1 });
      const { when } = registerAndCaptureHandlers();
      const dataTable = makeDataTable([['Query Param', 'Value'], ['debug', 'true']]);

      await when[4].handler(undefined, dataTable);
      await aut.request('GET', '/');

      expect(aut.lastTransaction.request.queryString).toBe('debug=true');
    });
  });
});
