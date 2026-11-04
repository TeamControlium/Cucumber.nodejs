import type { DataTable, Given as CucumberGiven, When as CucumberWhen } from '@cucumber/cucumber';
import { API_AUTWrapper } from '@controlium/framework';
import { APIUtils, JsonUtils, Log, LogLevels, Utils, ValueExpression } from '@controlium/utils';

import { getDataTableRows } from '../../dataTable/cucumberDataTable.js';
import { resolveAppName } from './resolveAppName.js';

/**
 * The slice of `@cucumber/cucumber` `wireApiQueryStringStepDefinitions` needs.
 */
export interface CucumberGivenWhenAPI {
  Given: typeof CucumberGiven;
  When: typeof CucumberWhen;
}

/** `undefined`/omitted means `'replaced'` — see this file's own class doc for why. */
function resolveMode(mode: string | undefined): 'replaced' | 'merged' {
  return mode === 'merged' ? 'merged' : 'replaced';
}

/**
 * Converts a query-param-configuration DataTable (`Query Param | Value` columns) into a
 * typed object — each cell's `Value` resolved via {@link ValueExpression.parse}, so `file:`/
 * `number:`/`boolean:`/`json:` all work from a DataTable cell, exactly the same mechanism
 * `headers.steps.ts`'s own `resolveDataTableOverrideHeaders` uses (see that file's class
 * doc, "JSON content — JSON5, not just strict JSON" section, for the full rationale, not
 * repeated here). Returns `{}` when no DataTable was attached (the literal/file-sourced
 * patterns' override is optional).
 */
async function resolveDataTableOverrideQueryParams(dataTable: DataTable | undefined): Promise<Record<string, unknown>> {
  if (Utils.isUndefined(dataTable)) return {};
  const rows = getDataTableRows(dataTable, ['Query Param', 'Value']);
  const rawQueryParams = JsonUtils.buildObjectFromRows(rows, 'Query Param', 'Value');
  const resolvedEntries = await Promise.all(
    Object.entries(rawQueryParams).map(async ([key, value]) => [key, await ValueExpression.parse(value, { useJson5: true })] as const)
  );
  return Object.fromEntries(resolvedEntries);
}

/**
 * Extracts a query-param-configuration DataTable's raw `Value` column text, **unresolved**
 * — used only by the one-shot "next request" overrides further down, which must defer
 * `ValueExpression.parse`'s own detokenisation (and casting) to the moment
 * `API_AUTWrapper.request()` actually consumes the override, rather than resolving it here,
 * eagerly, at step-definition time — exact mirror of `headers.steps.ts`'s own
 * `extractNextRequestDataTableHeaderExpressions` (see its own doc comment for the full
 * reasoning, not repeated here). The session-level patterns above still resolve immediately
 * via {@link resolveDataTableOverrideQueryParams} — only the one-shot override defers.
 * Returns `undefined` when no DataTable was attached.
 */
function extractNextRequestDataTableQueryParamExpressions(dataTable: DataTable | undefined): Record<string, string> | undefined {
  if (Utils.isUndefined(dataTable)) return undefined;
  const rows = getDataTableRows(dataTable, ['Query Param', 'Value']);
  return JsonUtils.buildObjectFromRows(rows, 'Query Param', 'Value');
}

/**
 * Applies a resolved query-params object to `aut`'s session-level query params, via
 * `setQueryParams`/`mergeQueryParams` depending on `mode`. Validated via
 * {@link APIUtils.assertPrimitiveValues} first — shared by both this and
 * {@link applyNextRequestQueryParams}, same rule regardless of which `API_AUTWrapper` entry
 * point ends up receiving the result.
 */
async function applyQueryParams(aut: API_AUTWrapper, mode: 'replaced' | 'merged', queryParams: Record<string, unknown>): Promise<void> {
  APIUtils.assertPrimitiveValues(queryParams, 'query parameter');
  const typedQueryParams = queryParams as APIUtils.QueryParams;
  if (mode === 'merged') {
    await aut.mergeQueryParams(typedQueryParams);
  } else {
    await aut.setQueryParams(typedQueryParams);
  }
}

/**
 * Stages a resolved query-params object as the static one-shot "next request" override, via
 * `API_AUTWrapper.setNextRequestQueryParams`/`mergeNextRequestQueryParams` depending on
 * `mode` — no `aut` argument, since the override is genuinely global (see this file's own
 * class doc, "Next request only" section). Synchronous — staging never detokenises;
 * `request()` itself does that lazily when it actually consumes the override.
 *
 * `queryParams` — the literal/file-sourced portion — is validated here, since its shape is
 * already fully known. `dataTableValueExpressions`, if any, stays raw and unvalidated —
 * only knowable once `API_AUTWrapper.request()` resolves it, where it's validated again,
 * then — exact mirror of `headers.steps.ts`'s own `applyNextRequestHeaders`.
 */
function applyNextRequestQueryParams(
  mode: 'replaced' | 'merged',
  queryParams: Record<string, unknown>,
  dataTableValueExpressions?: Record<string, string>
): void {
  APIUtils.assertPrimitiveValues(queryParams, 'query parameter');
  const typedQueryParams = queryParams as APIUtils.QueryParams;
  if (mode === 'merged') {
    API_AUTWrapper.mergeNextRequestQueryParams(typedQueryParams, dataTableValueExpressions);
  } else {
    API_AUTWrapper.setNextRequestQueryParams(typedQueryParams, dataTableValueExpressions);
  }
}

/**
 * Loads a test-data file's contents as a JSON query-params object, via
 * `ValueExpression.parse('file,json:<filename>', { useJson5: true })` — same mechanism as
 * `headers.steps.ts`'s own `resolveHeadersFromTestDataFile`. Shape-validated via
 * {@link JsonUtils.assertPlainObject}.
 */
async function resolveQueryParamsFromTestDataFile(filename: string): Promise<Record<string, unknown>> {
  const fileQueryParams = await ValueExpression.parse(`file,json:${filename}`, { useJson5: true });
  return JsonUtils.assertPlainObject(fileQueryParams, `test data file [${filename}]`);
}

/**
 * Registers step definitions for configuring the query parameters an API-based AUT's
 * requests will carry — JSON literal / test-data-file / DataTable sourced, session-level
 * and one-shot "next request only" — exactly mirroring `headers.steps.ts`'s own structure
 * and conventions (see that file's own class doc for the full reasoning behind the quoting,
 * `;`-means-DataTable-follows, and JSON5 conventions; not repeated here).
 *
 * ## Wording
 *
 * `request query params for (AUT|[name]) are [replaced|merged] with/using ...` — plural
 * "params"/"are", matching `API_AUTWrapper.setQueryParams`/`mergeQueryParams`'s own plural
 * naming, same as `request headers ... are` matches `setHeaders`/`mergeHeaders`.
 * `[replaced|merged]` is bracketed in the step text itself, not just this prose — a
 * code-word per this workspace's own `[...]`-for-code-words-and-references convention (see
 * `~/repos/controlium/PRINCIPLES.md`), omitted entirely (brackets and all) when defaulting
 * to `replaced`.
 *
 * ## How this combines with a query string embedded directly in the path, or given via
 * `request.steps.ts`'s own per-call `queryString`
 *
 * None of these three sources ever overrides another — they're concatenated, preserving
 * every key from every source, even a key that appears in more than one (e.g. the path
 * itself carrying `?a=1` while a session query param also sets `a=2` sends both:
 * `?a=1&a=2`) — see `API_AUTWrapper.request`'s and `APIUtils.mergeQueryStrings`'s own doc
 * comments for why: this is a test framework, a tester combining more than one source
 * deliberately wants to see what the AUT does with the result, not have the choice made
 * for them silently.
 *
 * ## "Next request only" one-shot equivalents
 *
 * `next API request query params are [replaced|merged] with/using ...` — no `(AUT|[name])`
 * target at all, deliberately: a one-shot override for whichever AUT's
 * `API_AUTWrapper.request()` fires next, genuinely global, not scoped to a particular AUT —
 * same reasoning as `headers.steps.ts`'s own one-shot header override.
 *
 * @param cucumber - The `@cucumber/cucumber` module itself, same convention as
 *   `wireCucumberHooks`.
 */
export function wireApiQueryStringStepDefinitions(cucumber: CucumberGivenWhenAPI): void {
  if (cucumber === null || typeof cucumber !== 'object') {
    throw new Error(
      `wireApiQueryStringStepDefinitions: [cucumber] must be the '@cucumber/cucumber' module object — received ${cucumber === null ? 'null' : typeof cucumber}`
    );
  }

  const givenType = typeof cucumber.Given;
  if (givenType !== 'function') {
    throw new Error(
      `wireApiQueryStringStepDefinitions: [cucumber.Given] must be a function — received ${givenType}. Did you pass the '@cucumber/cucumber' module itself?`
    );
  }

  const whenType = typeof cucumber.When;
  if (whenType !== 'function') {
    throw new Error(
      `wireApiQueryStringStepDefinitions: [cucumber.When] must be a function — received ${whenType}. Did you pass the '@cucumber/cucumber' module itself?`
    );
  }

  const { Given, When } = cucumber;

  // --- Session-level: request query params for (AUT|[name]) -------------------------------

  /**
   * Sets (or merges onto) an AUT's session-level query params from an inline JSON literal.
   * No DataTable override — see the trailing-`;` sibling registration below for that.
   *
   * @example
   * Given request query params for AUT are [replaced] with '{"name": "blahblah"}'
   * Given request query params for [MyApp] are [merged] with "{'page': 2}"
   * Given request query params for AUT are '{"name": "blahblah"}'
   */
  Given(/^request query params for (AUT|\[.*\]) are (?:\[(replaced|merged)\] with )?(?:'(.*)'|"(.*)")$/, async function (
      requestTarget: string,
      modeCapture: string | undefined,
      queryParamsDataSingleQuoted: string | undefined,
      queryParamsDataDoubleQuoted: string | undefined
    ) {
      const mode = resolveMode(modeCapture);
      const queryParamsData = queryParamsDataSingleQuoted ?? queryParamsDataDoubleQuoted as string;
      Log.writeLine(LogLevels.TestInformation, `STEP request query params for ${requestTarget} are [${mode}] with [${queryParamsData}]`);

      const aut = API_AUTWrapper.getApplication(resolveAppName(requestTarget));

      const literalQueryParams = JsonUtils.parseObjectLiteral(
        queryParamsData,
        `[cucumber-driver stepdefs] "request query params for ${requestTarget} are ${mode} with '...'" — query param data`,
        true
      );

      await applyQueryParams(aut, mode, literalQueryParams);
    }
  );

  /**
   * Same as the pattern above, but with a mandatory trailing DataTable override that
   * overrides/adds individual keys on top of the literal — a DataTable key always wins on
   * collision. The trailing `;` is the signal that a DataTable must follow.
   *
   * @example
   * Given request query params for AUT are '{"name": "blahblah"}';
   *   | Query Param | Value |
   *   | page        | number:2 |
   */
  Given(/^request query params for (AUT|\[.*\]) are (?:\[(replaced|merged)\] with )?(?:'(.*)'|"(.*)");$/, async function (
      requestTarget: string,
      modeCapture: string | undefined,
      queryParamsDataSingleQuoted: string | undefined,
      queryParamsDataDoubleQuoted: string | undefined,
      dataTable: DataTable
    ) {
      const mode = resolveMode(modeCapture);
      const queryParamsData = queryParamsDataSingleQuoted ?? queryParamsDataDoubleQuoted as string;
      Log.writeLine(LogLevels.TestInformation, `STEP request query params for ${requestTarget} are [${mode}] with [${queryParamsData}] (+ DataTable)`);

      const aut = API_AUTWrapper.getApplication(resolveAppName(requestTarget));

      const literalQueryParams = JsonUtils.parseObjectLiteral(
        queryParamsData,
        `[cucumber-driver stepdefs] "request query params for ${requestTarget} are ${mode} with '...'" — query param data`,
        true
      );

      const dataTableQueryParams = await resolveDataTableOverrideQueryParams(dataTable);
      const queryParams = { ...literalQueryParams, ...dataTableQueryParams };

      await applyQueryParams(aut, mode, queryParams);
    }
  );

  /**
   * Sets (or merges onto) an AUT's session-level query params from a JSON test-data file.
   * No DataTable override — see the trailing-`;` sibling registration below for that.
   *
   * @example
   * Given request query params for AUT are [replaced] using test data file [query/search.json]
   */
  Given(/^request query params for (AUT|\[.*\]) are (?:\[(replaced|merged)\] )?using test data file \[(.*)\]$/, async function (requestTarget: string, modeCapture: string | undefined, filename: string) {
      const mode = resolveMode(modeCapture);
      Log.writeLine(LogLevels.TestInformation, `STEP request query params for ${requestTarget} are [${mode}] using test data file [${filename}]`);

      const aut = API_AUTWrapper.getApplication(resolveAppName(requestTarget));
      const fileQueryParams = await resolveQueryParamsFromTestDataFile(filename);

      await applyQueryParams(aut, mode, fileQueryParams);
    }
  );

  /**
   * Same as the pattern above, but with a mandatory trailing DataTable override that
   * overrides/adds individual keys on top of the file-sourced base — a DataTable key always
   * wins on collision.
   *
   * @example
   * Given request query params for AUT are using test data file [query/search.json];
   *   | Query Param | Value |
   *   | page        | 3     |
   */
  Given(/^request query params for (AUT|\[.*\]) are (?:\[(replaced|merged)\] )?using test data file \[(.*)\];$/, async function (requestTarget: string, modeCapture: string | undefined, filename: string, dataTable: DataTable) {
      const mode = resolveMode(modeCapture);
      Log.writeLine(LogLevels.TestInformation, `STEP request query params for ${requestTarget} are [${mode}] using test data file [${filename}] (+ DataTable)`);

      const aut = API_AUTWrapper.getApplication(resolveAppName(requestTarget));
      const fileQueryParams = await resolveQueryParamsFromTestDataFile(filename);

      const dataTableQueryParams = await resolveDataTableOverrideQueryParams(dataTable);
      const queryParams = { ...fileQueryParams, ...dataTableQueryParams };

      await applyQueryParams(aut, mode, queryParams);
    }
  );

  /**
   * Sets (or merges onto) an AUT's session-level query params built entirely from a
   * DataTable (`Query Param` | `Value` columns) — no literal/file base at all. The trailing
   * `;` is mandatory here — with no literal/file base, a DataTable is the step's *only*
   * source of data.
   *
   * @example
   * Given request query params for AUT are [replaced] with;
   *   | Query Param | Value        |
   *   | name        | blahblah     |
   *   | page        | number:2     |
   */
  Given(/^request query params for (AUT|\[.*\]) are(?: \[(replaced|merged)\] with)?;$/, async function (requestTarget: string, modeCapture: string | undefined, dataTable: DataTable) {
      const mode = resolveMode(modeCapture);
      Log.writeLine(LogLevels.TestInformation, `STEP request query params for ${requestTarget} are [${mode}]`);

      const aut = API_AUTWrapper.getApplication(resolveAppName(requestTarget));
      const queryParams = await resolveDataTableOverrideQueryParams(dataTable);
      await applyQueryParams(aut, mode, queryParams);
    }
  );

  // --- "Next request only" one-shot equivalents — no (AUT|[name]) target; see class doc. ---

  /**
   * Stages a one-shot query-params override — replacing or merging on top of whichever
   * AUT's session query params — for whichever `API_AUTWrapper.request()` fires next, from
   * an inline JSON literal. No DataTable override — see the trailing-`;` sibling
   * registration below for that.
   *
   * @example
   * When next API request query params are [replaced] with '{"debug": "true"}'
   */
  When(/^next API request query params are (?:\[(replaced|merged)\] with )?(?:'(.*)'|"(.*)")$/, async function (modeCapture: string | undefined, queryParamsDataSingleQuoted: string | undefined, queryParamsDataDoubleQuoted: string | undefined) {
      const mode = resolveMode(modeCapture);
      const queryParamsData = queryParamsDataSingleQuoted ?? queryParamsDataDoubleQuoted as string;
      Log.writeLine(LogLevels.TestInformation, `STEP next API request query params are [${mode}] with [${queryParamsData}]`);

      const literalQueryParams = JsonUtils.parseObjectLiteral(
        queryParamsData,
        `[cucumber-driver stepdefs] "next API request query params are ${mode} with '...'" — query param data`,
        true
      );

      applyNextRequestQueryParams(mode, literalQueryParams);
    }
  );

  /**
   * Same as the pattern above, but with a mandatory trailing DataTable override that
   * overrides/adds individual keys on top of the literal.
   *
   * The DataTable's own `Value` column text is **not** resolved here — extracted raw (see
   * {@link extractNextRequestDataTableQueryParamExpressions}) and resolved only when
   * `API_AUTWrapper.request()` actually consumes this override, same deferred timing as the
   * literal portion above — see `headers.steps.ts`'s own mirror registration for the full
   * reasoning, not repeated here.
   *
   * @example
   * When next API request query params are [replaced] with '{"debug": "true"}';
   *   | Query Param | Value |
   *   | trace       | true  |
   */
  When(/^next API request query params are (?:\[(replaced|merged)\] with )?(?:'(.*)'|"(.*)");$/, async function (modeCapture: string | undefined, queryParamsDataSingleQuoted: string | undefined, queryParamsDataDoubleQuoted: string | undefined, dataTable: DataTable) {
      const mode = resolveMode(modeCapture);
      const queryParamsData = queryParamsDataSingleQuoted ?? queryParamsDataDoubleQuoted as string;
      Log.writeLine(LogLevels.TestInformation, `STEP next API request query params are [${mode}] with [${queryParamsData}] (+ DataTable)`);

      const literalQueryParams = JsonUtils.parseObjectLiteral(
        queryParamsData,
        `[cucumber-driver stepdefs] "next API request query params are ${mode} with '...'" — query param data`,
        true
      );

      const dataTableValueExpressions = extractNextRequestDataTableQueryParamExpressions(dataTable);

      applyNextRequestQueryParams(mode, literalQueryParams, dataTableValueExpressions);
    }
  );

  /**
   * As the inline-literal one-shot override above, but sourced from a JSON test-data file.
   * No DataTable override — see the trailing-`;` sibling registration below for that.
   *
   * @example
   * When next API request query params are [replaced] using test data file [query/debug.json]
   */
  When(/^next API request query params are (?:\[(replaced|merged)\] )?using test data file \[(.*)\]$/, async function (modeCapture: string | undefined, filename: string) {
      const mode = resolveMode(modeCapture);
      Log.writeLine(LogLevels.TestInformation, `STEP next API request query params are [${mode}] using test data file [${filename}]`);

      const fileQueryParams = await resolveQueryParamsFromTestDataFile(filename);
      applyNextRequestQueryParams(mode, fileQueryParams);
    }
  );

  /**
   * Same as the pattern above, but with a mandatory trailing DataTable override that
   * overrides/adds individual keys on top of the file-sourced base. Same deferred
   * DataTable-resolution timing as the literal pattern above.
   *
   * @example
   * When next API request query params are using test data file [query/debug.json];
   *   | Query Param | Value |
   *   | trace       | true  |
   */
  When(/^next API request query params are (?:\[(replaced|merged)\] )?using test data file \[(.*)\];$/, async function (modeCapture: string | undefined, filename: string, dataTable: DataTable) {
      const mode = resolveMode(modeCapture);
      Log.writeLine(LogLevels.TestInformation, `STEP next API request query params are [${mode}] using test data file [${filename}] (+ DataTable)`);

      const fileQueryParams = await resolveQueryParamsFromTestDataFile(filename);
      const dataTableValueExpressions = extractNextRequestDataTableQueryParamExpressions(dataTable);

      applyNextRequestQueryParams(mode, fileQueryParams, dataTableValueExpressions);
    }
  );

  /**
   * As the inline-literal one-shot override above, but built entirely from a DataTable
   * (`Query Param` | `Value` columns) — no literal/file base at all. The trailing `;` is
   * mandatory here — with no literal/file base, a DataTable is the step's *only* source of
   * data. Same deferred DataTable-resolution timing as the other one-shot DataTable
   * overrides above.
   *
   * @example
   * When next API request query params are [replaced] with;
   *   | Query Param | Value     |
   *   | debug       | json:null |
   */
  When(/^next API request query params are(?: \[(replaced|merged)\] with)?;$/, async function (modeCapture: string | undefined, dataTable: DataTable) {
      const mode = resolveMode(modeCapture);
      Log.writeLine(LogLevels.TestInformation, `STEP next API request query params are [${mode}]`);

      const dataTableValueExpressions = extractNextRequestDataTableQueryParamExpressions(dataTable);
      applyNextRequestQueryParams(mode, {}, dataTableValueExpressions);
    }
  );
}
