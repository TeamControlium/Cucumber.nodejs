import type { DataTable, Then as CucumberThen } from '@cucumber/cucumber';
import { API_AUTWrapper } from '@controlium/framework';
import { JsonUtils, Log, LogLevels, StringUtils, Validate, ValueExpression } from '@controlium/utils';

import { resolveDataTableRows } from '../../dataTable/cucumberDataTable.js';

/**
 * The slice of `@cucumber/cucumber` `wireApiHeaderValidationStepDefinitions` needs.
 */
export interface CucumberThenAPI {
  Then: typeof CucumberThen;
}

/** A single response header's value, normalised to an array — always, even a single-value header. */
function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Splits a comma-separated list of quoted segments (`'a', 'b'`) into trimmed, unquoted items. */
function splitQuotedList(raw: string): string[] {
  return StringUtils.split(raw.trim(), ',').map((item) => StringUtils.trimQuotes(item.trim()));
}

/**
 * Does same as Utils Validate.normalizeCompareTypes but
 * doesnt check if compare types are valid
 */
function normalizeCompareTypes(raw: string | undefined): Set<string> {
  if (!raw || raw.trim().length === 0) return new Set();
  return new Set(raw.replace(/\s+/g, '').toLowerCase().split(','));
}


/**
 * Validates one header's actual value(s) against its expected value(s)/compare-types —
 * shared by every value-checking step in this file: the full-set/subset literal steps (via
 * {@link validateHeaderSet}, which always passes `'casesensitive'`) and the compare-type-
 * driven steps further down (`has value [contains] ...`, DataTable `Compare Types`), which
 * may pass any compare type `Validate.text`/`Validate.array` understands.
 *
 * `'count'` is handled first, on its own — it asserts the *number* of actual occurrences
 * against `expectedHeaderItemValueOrArrayItemCount` read as a number; the expected value's
 * own content is never compared in this mode, only its cardinality.
 *
 * Otherwise, `expectedHeaderItemValueOrArrayItemCount` is normalised to an array, same
 * convention {@link validateHeaderSet} uses for its own per-key value: a single expected
 * value compares directly against a single actual value via `Validate.text`; 2+ expected
 * values are compared as an ordered sequence via `Validate.array` (same-key occurrence order
 * is part of HTTP's own semantics, not incidental). A single expected value against 0 or 2+
 * actual occurrences is a cardinality mismatch — forced to fail cleanly (a sentinel for
 * "missing", a separator-format swap for "too many") rather than silently passing via a
 * coincidental comma-join, exactly as {@link validateHeaderSet}'s own per-item logic does.
 */
function validateHeaderItemValue(expectedHeaderItemValueOrArrayItemCount: string | string[], actualHeaderItemValues: string[], description: string, compareTypesRaw: string | undefined): void {
  const compareTypes = normalizeCompareTypes(compareTypesRaw);

  if (compareTypes.has('count')) {
    if (!Number.isFinite(+expectedHeaderItemValueOrArrayItemCount)) {
      Log.logErrorAndThrow(`Compare types had count, but expected was not a valid number! Was [${StringUtils.truncateIfNeeded(JSON.stringify(expectedHeaderItemValueOrArrayItemCount), 128)}]`);
    }
    compareTypes.delete('count');
    Validate.number(+expectedHeaderItemValueOrArrayItemCount, actualHeaderItemValues.length, `${description} (count)`, [...compareTypes].join(','));
    return;
  }

  const expectedValues = toArray(expectedHeaderItemValueOrArrayItemCount);

  // 2+ expected values: a real repeated header — exact length, then position-by-position.
  if (expectedValues.length !== 1) {
    Validate.array(expectedValues, actualHeaderItemValues, description, compareTypesRaw);
    return;
  }

  // Exactly 1 expected value: resolve what "actual" to show before the one real comparison
  // below — a genuine single actual value compares directly; 0 or 2+ actual occurrences are
  // a cardinality mismatch and must fail, so each gets a value that can't coincidentally
  // equal the expected text (a plain join could, and would silently pass).
  const expectedValue = expectedValues[0];
  let actualValue: string;
  if (actualHeaderItemValues.length === 1) {
    actualValue = actualHeaderItemValues[0];
  } else if (actualHeaderItemValues.length === 0) {
    actualValue = '<Header item not defined>';
  } else {
    const joined = actualHeaderItemValues.join(',');
    actualValue = joined === expectedValue ? actualHeaderItemValues.join(', ') : joined;
  }

  Validate.text(expectedValue, actualValue, description, compareTypesRaw);
}

/**
 * Validates `actualHeaders` against `expectedHeaders` as a whole set — `subset: false` (the
 * `has headers ...` family) requires every expected header to be present with the *same*
 * set of values (nothing missing, nothing extra — on either the header-name or, for a
 * repeated header, the value side) and the actual set to carry nothing beyond what's given;
 * `subset: true` (the `contains headers ...` family) only requires every given header/value
 * to be present, with the actual response free to carry more. Header names are matched
 * case-insensitively (`HTTPResponse.headers`' own keys are already lowercased); value
 * comparison is case-*sensitive*, fixed (`'casesensitive'`) — unlike the compare-type-driven
 * value steps elsewhere in this file, there's no bracket here to let a caller choose.
 *
 * Per-key value comparison itself is delegated entirely to {@link validateHeaderItemValue}
 * (always `'casesensitive'` here — this literal-based family gives the caller no bracket to
 * choose a different compare type) — see its own doc comment for how single-vs-multi-value
 * and cardinality-mismatch cases are handled.
 */
function validateHeaderSet(expectedHeaders: Record<string, unknown>, actualHeaders: Record<string, string | string[]>, subset: boolean, label: string): void {
  const validateFullHeader = !subset;
  const allExpectedHeaderKeys = new Map(Object.keys(expectedHeaders).map((key) => [key.toLowerCase(), key] as const));
  const allActualHeaderKeys = new Set(Object.keys(actualHeaders));

  Log.writeLine(
    LogLevels.FrameworkInformation,
    `validateHeaderSet: mode=${validateFullHeader ? 'exact (has)' : 'subset (contains)'}; ${allExpectedHeaderKeys.size} expected header(s) given; ${allActualHeaderKeys.size} actual header(s) present`
  );

  // Exact-set mode only: every actual key must also be an expected key, and the counts must
  // match — together that guarantees the two key-sets are identical (an equal-size subset is
  // the full set). Subset mode skips this entirely; the actual response may carry extras.
  if (validateFullHeader) {
    Validate.number(allExpectedHeaderKeys.size, allActualHeaderKeys.size, `${label} headers (${allActualHeaderKeys.size}) matches expected count (${allExpectedHeaderKeys.size})`);
    for (const actualHeaderKey of allActualHeaderKeys) {
      Validate.boolean(true, allExpectedHeaderKeys.has(actualHeaderKey), `${label} has header key [${actualHeaderKey}]`);
    }
  }

  // Value comparison, one expected header key at a time — delegated to validateHeaderItemValue.
  for (const [expectedHeaderKey_Lower, expectedHeaderKey] of allExpectedHeaderKeys) {
    const headerItemDescription = `${label} [${expectedHeaderKey}]`;
    const actualValues = toArray(actualHeaders[expectedHeaderKey_Lower]);
    validateHeaderItemValue(expectedHeaders[expectedHeaderKey] as string | string[], actualValues, headerItemDescription, 'casesensitive');
  }
}

/** Parses a flat `{ "Header-Name": "value" }` (or `string[]` per-value) literal — same `JsonUtils.parseObjectLiteral` convention `headers.steps.ts` uses for *setting* request headers. */
function parseHeaderSetLiteral(text: string, context: string): Record<string, unknown> {
  return JsonUtils.parseObjectLiteral(text, context, true);
}

/** Builds a `{ "Header-Name": "value" }` object from a `Header Key | Value` DataTable — each cell resolved via {@link ValueExpression.parse}, so a `json:[...]` cell can express a repeated header's multiple values. */
async function buildHeaderSetFromDataTable(dataTable: DataTable): Promise<Record<string, unknown>> {
  const rows = await resolveDataTableRows(dataTable, ['Header Key', 'Value']);
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    result[row['Header Key']] = await ValueExpression.parse(row['Value'], { useJson5: true });
  }
  return result;
}

/**
 * Registers step definitions for validating an AUT/API's own response headers — presence,
 * single/multiple value(s) with compare-type flags, and full-set/subset comparison
 * (including multi-valued headers like `Set-Cookie`, which `HTTPResponse.headers` already
 * preserves as a real `string[]`, never comma-joined). The response-body counterpart lives
 * in `validation.steps.ts`; target identification and quoting conventions are the same as
 * that file (see its own doc comment for the full reasoning, not repeated here).
 *
 * `has headers 'name1', 'name2'` and `has headers '{"a":"b"}'` would otherwise collide
 * textually — a comma-separated quoted *name* list looks exactly like the start of a JSON
 * literal to a reader, and *could* to a regex too — so the presence family uses the literal
 * word `named` (matching the original "a header named 'xyz'" phrasing) to stay unambiguous:
 * `has header(s) named '...'` (presence) vs `has headers '...'` (full-set, no `named`).
 *
 * @param cucumber - The `@cucumber/cucumber` module itself, same convention as `wireCucumberHooks`.
 */
export function wireApiHeaderValidationStepDefinitions(cucumber: CucumberThenAPI): void {
  if (cucumber === null || typeof cucumber !== 'object') {
    throw new Error(
      `wireApiHeaderValidationStepDefinitions: [cucumber] must be the '@cucumber/cucumber' module object — received ${cucumber === null ? 'null' : typeof cucumber}`
    );
  }
  const thenType = typeof cucumber.Then;
  if (thenType !== 'function') {
    throw new Error(
      `wireApiHeaderValidationStepDefinitions: [cucumber.Then] must be a function — received ${thenType}. Did you pass the '@cucumber/cucumber' module itself?`
    );
  }

  const { Then } = cucumber;

  // ─── Presence ──────────────────────────────────────────────────────────────

  /**
   * Verifies one or more named headers are present — no value comparison, existence only
   * (HTTP header names are case-insensitive by spec). A "list of one" is the common case.
   *
   * @example
   * Then Response from AUT has header named 'Content-Type'
   * Then Response from AUT has headers named 'Content-Type', 'ETag'
   */
  Then(/^Response from (AUT|API|\[[^[\]]*\]) (?:does have|has) headers? named (.+)$/, function (requestTarget: string, rawNames: string) {
    const target = API_AUTWrapper.findAUTOrAPIByTargetText(requestTarget);
    const names = splitQuotedList(rawNames);
    const actualHeaders = target.lastResponse.headers;

    for (const name of names) {
      const exists = Object.prototype.hasOwnProperty.call(actualHeaders, name.toLowerCase());
      Validate.boolean(true, exists, `[${target.appName}] response headers [${name}]`);
    }
  });

  /**
   * Verifies one or more named headers are *not* present.
   *
   * @example
   * Then Response from AUT does not have header named 'X-Debug'
   * Then Response from AUT does not have headers named 'X-Debug', 'X-Internal'
   */
  Then(/^Response from (AUT|API|\[[^[\]]*\]) does not (?:have|has) headers? named (.+)$/, function (requestTarget: string, rawNames: string) {
    const target = API_AUTWrapper.findAUTOrAPIByTargetText(requestTarget);
    const names = splitQuotedList(rawNames);
    const actualHeaders = target.lastResponse.headers;

    for (const name of names) {
      const exists = Object.prototype.hasOwnProperty.call(actualHeaders, name.toLowerCase());
      Validate.boolean(false, exists, `[${target.appName}] response headers [${name}]`);
    }
  });

  // ─── Value(s), with compare types ──────────────────────────────────────────

  /**
   * Verifies one or more named headers' values — a position-matched quoted list of names
   * and a quoted list of values, with an optional compare-type bracket applied to every pair
   * (defaults to `equals`). For per-header compare types, use the DataTable form below
   * instead.
   *
   * @example
   * Then Response from AUT header 'Content-Type' has value 'application/json'
   * Then Response from AUT header 'Content-Type' has value [contains] 'json'
   * Then Response from AUT headers 'Content-Type', 'ETag' have values 'application/json', '"abc"'
   */
  Then(/^Response from (AUT|API|\[[^[\]]*\]) headers? (.+) (?:has|have) values? (?:\[(.*)\] )?(.+)$/, async function (
    requestTarget: string,
    rawNames: string,
    compareTypesCapture: string | undefined,
    rawValues: string
  ) {
    const target = API_AUTWrapper.findAUTOrAPIByTargetText(requestTarget);
    const names = splitQuotedList(rawNames);
    const values = splitQuotedList(rawValues);
    if (names.length !== values.length) {
      throw new Error(`Response from ${requestTarget} header values: ${names.length} header name(s) but ${values.length} value(s) given — these lists must be the same length`);
    }
    Log.writeLine(LogLevels.TestInformation, `STEP Response from ${requestTarget} header(s) [${names.join(', ')}] have value(s) [${values.join(', ')}]`);

    for (let index = 0; index < names.length; index++) {
      const name = names[index];
      const candidates = toArray(target.lastResponse.headers[name.toLowerCase()]);
      validateHeaderItemValue(values[index], candidates, `[${target.appName}] response headers [${name}]`, compareTypesCapture);
    }
  });

  /**
   * Runs every row's own value comparison via {@link validateHeaderItemValue} — shared by
   * both the exact-set (`has header values;`) and subset (`contains header values;`)
   * DataTable forms below; the only thing that differs between them is whether the key-set
   * itself is also checked for "nothing extra" first (exact) or not at all (subset).
   */
  async function validateHeaderValueRows(target: ReturnType<typeof API_AUTWrapper.findAUTOrAPIByTargetText>, rows: Record<string, string>[]): Promise<void> {
    for (const row of rows) {
      const name = row['Header Key'];
      const expectedValue = String(await ValueExpression.parse(row['Expected Value'], { useJson5: true }));
      const description = row['Description']
        ? `[${target.appName}] response headers [${name}] (${row['Description']})`
        : `[${target.appName}] response headers [${name}]`;
      const candidates = toArray(target.lastResponse.headers[name.toLowerCase()]);
      validateHeaderItemValue(expectedValue, candidates, description, row['Compare Types']);
    }
  }

  /**
   * Exact-set-only companion to {@link validateHeaderValueRows}: the DataTable's own
   * *distinct* header keys (case-insensitive) must equal the actual response's own header
   * keys exactly — same "equal-size subset is the full set" reasoning {@link
   * validateHeaderSet} already uses for its own exact mode. Distinct keys, not row count —
   * a header key may legitimately appear on more than one row (multiple compare-type
   * assertions against the same header, e.g. one row checking `contains`, another
   * `casesensitive`), which is still only one actual header to account for, not two.
   */
  function validateHeaderValueRowsKeySetIsExact(target: ReturnType<typeof API_AUTWrapper.findAUTOrAPIByTargetText>, rows: Record<string, string>[], label: string): void {
    const expectedKeysLower = new Set(rows.map((row) => row['Header Key'].toLowerCase()));
    const actualKeysLower = new Set(Object.keys(target.lastResponse.headers));
    Validate.number(expectedKeysLower.size, actualKeysLower.size, `${label} headers (${actualKeysLower.size}) matches expected count (${expectedKeysLower.size})`);
    for (const actualKey of actualKeysLower) {
      Validate.boolean(true, expectedKeysLower.has(actualKey), `${label} has header key [${actualKey}]`);
    }
  }

  /**
   * Verifies the response's headers are *exactly* the set of keys named in the DataTable —
   * nothing extra — with each row's own compare-type comparison also passing. The exact-set
   * counterpart to `contains header values;` below. Per-header compare types, via DataTable
   * (`Header Key | Compare Types | Expected Value | ?Description`).
   *
   * @example
   * Then Response from AUT has header values;
   *   | Header Key   | Compare Types | Expected Value          |
   *   | Content-Type | equals        | application/json        |
   */
  Then(/^Response from (AUT|API|\[[^[\]]*\]) has header values;$/, async function (requestTarget: string, dataTable: DataTable) {
    const target = API_AUTWrapper.findAUTOrAPIByTargetText(requestTarget);
    Log.writeLine(LogLevels.TestInformation, `STEP Response from ${requestTarget} has header values (DataTable, exact)`);

    const rows = await resolveDataTableRows(dataTable, ['Header Key', 'Compare Types', 'Expected Value', '?Description']);
    validateHeaderValueRowsKeySetIsExact(target, rows, `[${target.appName}] response headers`);
    await validateHeaderValueRows(target, rows);
  });

  /**
   * Verifies the given header values are present — every row's own comparison must pass —
   * with the actual response free to carry other headers beyond what's listed. Same
   * per-row engine as the exact form above; the only difference is skipping the key-set
   * check entirely.
   *
   * @example
   * Then Response from AUT contains header values;
   *   | Header Key   | Compare Types | Expected Value          |
   *   | Content-Type | equals        | application/json        |
   *   | Set-Cookie   | any           | sails.sid=abc            |
   */
  Then(/^Response from (AUT|API|\[[^[\]]*\]) contains header values;$/, async function (requestTarget: string, dataTable: DataTable) {
    const target = API_AUTWrapper.findAUTOrAPIByTargetText(requestTarget);
    Log.writeLine(LogLevels.TestInformation, `STEP Response from ${requestTarget} contains header values (DataTable)`);

    const rows = await resolveDataTableRows(dataTable, ['Header Key', 'Compare Types', 'Expected Value', '?Description']);
    await validateHeaderValueRows(target, rows);
  });

  // ─── Full-set / subset, order-independent ──────────────────────────────────

  /**
   * Verifies the response's headers are *exactly* the given set — every given header
   * present with the same value(s), nothing extra. Source is a flat JSON object, same
   * literal convention `headers.steps.ts` uses for *setting* request headers — a value may
   * be a string or an array of strings (a repeated header, e.g. `Set-Cookie`).
   *
   * @example
   * Then Response from AUT has headers '{"Content-Type":"application/json"}'
   */
  Then(/^Response from (AUT|API|\[[^[\]]*\]) has headers (?:'(.*)'|"(.*)")$/, function (
    requestTarget: string,
    literalSingleQuoted: string | undefined,
    literalDoubleQuoted: string | undefined
  ) {
    const target = API_AUTWrapper.findAUTOrAPIByTargetText(requestTarget);
    Log.writeLine(LogLevels.TestInformation, `STEP Response from ${requestTarget} has headers (literal)`);
    const expectedHeaders = parseHeaderSetLiteral(literalSingleQuoted ?? literalDoubleQuoted as string, 'has headers');
    validateHeaderSet(expectedHeaders, target.lastResponse.headers, false, `[${target.appName}] response headers`);
  });

  /** Same as above, sourced from a test data file. */
  Then(/^Response from (AUT|API|\[[^[\]]*\]) has headers from test data file \[(.*)\]$/, async function (requestTarget: string, filename: string) {
    const target = API_AUTWrapper.findAUTOrAPIByTargetText(requestTarget);
    Log.writeLine(LogLevels.TestInformation, `STEP Response from ${requestTarget} has headers from test data file [${filename}]`);
    const literal = (await ValueExpression.parse(`file:${filename}`)) as string;
    const expectedHeaders = parseHeaderSetLiteral(literal, 'has headers from test data file');
    validateHeaderSet(expectedHeaders, target.lastResponse.headers, false, `[${target.appName}] response headers`);
  });

  /** Same as above, sourced from a `Header Key | Value` DataTable. */
  Then(/^Response from (AUT|API|\[[^[\]]*\]) has headers;$/, async function (requestTarget: string, dataTable: DataTable) {
    const target = API_AUTWrapper.findAUTOrAPIByTargetText(requestTarget);
    Log.writeLine(LogLevels.TestInformation, `STEP Response from ${requestTarget} has headers (DataTable)`);
    const expectedHeaders = await buildHeaderSetFromDataTable(dataTable);
    validateHeaderSet(expectedHeaders, target.lastResponse.headers, false, `[${target.appName}] response headers`);
  });

  /**
   * Verifies the response's headers *include* the given set — every given header/value must
   * be present; the response may carry more. Same literal-JSON-object sourcing as `has
   * headers` above.
   *
   * @example
   * Then Response from AUT contains headers '{"Content-Type":"application/json"}'
   */
  Then(/^Response from (AUT|API|\[[^[\]]*\]) contains headers (?:'(.*)'|"(.*)")$/, function (
    requestTarget: string,
    literalSingleQuoted: string | undefined,
    literalDoubleQuoted: string | undefined
  ) {
    const target = API_AUTWrapper.findAUTOrAPIByTargetText(requestTarget);
    Log.writeLine(LogLevels.TestInformation, `STEP Response from ${requestTarget} contains headers (literal)`);
    const expectedHeaders = parseHeaderSetLiteral(literalSingleQuoted ?? literalDoubleQuoted as string, 'contains headers');
    validateHeaderSet(expectedHeaders, target.lastResponse.headers, true, `[${target.appName}] response headers`);
  });

  /**
   * Same as above, with a mandatory trailing DataTable override that overrides/adds
   * individual keys on top of the literal — a DataTable key always wins on collision, same
   * convention `headers.steps.ts` uses for *setting* request headers. `JsonUtils.resolveSentinels`
   * runs on the merged result (not on each side separately, same order `API_AUTWrapper.setHeaders`/
   * `mergeHeaders` already use) — so a DataTable row's `Value` can be `_undefined` to delete a
   * key the literal declared entirely before validation runs, or `_null` for a real `null`,
   * same sentinel vocabulary already used for request headers.
   *
   * @example
   * Then Response from AUT contains headers '{"Content-Type":"application/json","X-Debug":"1"}';
   *   | Header Key | Value      |
   *   | X-Debug    | _undefined |
   */
  Then(/^Response from (AUT|API|\[[^[\]]*\]) contains headers (?:'(.*)'|"(.*)");$/, async function (
    requestTarget: string,
    literalSingleQuoted: string | undefined,
    literalDoubleQuoted: string | undefined,
    dataTable: DataTable
  ) {
    const target = API_AUTWrapper.findAUTOrAPIByTargetText(requestTarget);
    Log.writeLine(LogLevels.TestInformation, `STEP Response from ${requestTarget} contains headers (literal + DataTable)`);
    const literalHeaders = parseHeaderSetLiteral(literalSingleQuoted ?? literalDoubleQuoted as string, 'contains headers');
    const dataTableHeaders = await buildHeaderSetFromDataTable(dataTable);
    const expectedHeaders = JsonUtils.resolveSentinels({ ...literalHeaders, ...dataTableHeaders });
    validateHeaderSet(expectedHeaders, target.lastResponse.headers, true, `[${target.appName}] response headers`);
  });

  /** Same as above, sourced from a test data file. */
  Then(/^Response from (AUT|API|\[[^[\]]*\]) contains headers in test data file \[(.*)\]$/, async function (requestTarget: string, filename: string) {
    const target = API_AUTWrapper.findAUTOrAPIByTargetText(requestTarget);
    Log.writeLine(LogLevels.TestInformation, `STEP Response from ${requestTarget} contains headers in test data file [${filename}]`);
    const literal = (await ValueExpression.parse(`file:${filename}`)) as string;
    const expectedHeaders = parseHeaderSetLiteral(literal, 'contains headers in test data file');
    validateHeaderSet(expectedHeaders, target.lastResponse.headers, true, `[${target.appName}] response headers`);
  });

  /**
   * Same as above, with a mandatory trailing DataTable override on top of the file-sourced
   * base — a DataTable key always wins on collision, same sentinel/merge-order rules as the
   * literal form's own sibling registration above.
   *
   * @example
   * Then Response from AUT contains headers in test data file [headers/base.json];
   *   | Header Key  | Value      |
   *   | X-From-File | _undefined |
   */
  Then(/^Response from (AUT|API|\[[^[\]]*\]) contains headers in test data file \[(.*)\];$/, async function (requestTarget: string, filename: string, dataTable: DataTable) {
    const target = API_AUTWrapper.findAUTOrAPIByTargetText(requestTarget);
    Log.writeLine(LogLevels.TestInformation, `STEP Response from ${requestTarget} contains headers in test data file [${filename}] (+ DataTable)`);
    const literal = (await ValueExpression.parse(`file:${filename}`)) as string;
    const fileHeaders = parseHeaderSetLiteral(literal, 'contains headers in test data file');
    const dataTableHeaders = await buildHeaderSetFromDataTable(dataTable);
    const expectedHeaders = JsonUtils.resolveSentinels({ ...fileHeaders, ...dataTableHeaders });
    validateHeaderSet(expectedHeaders, target.lastResponse.headers, true, `[${target.appName}] response headers`);
  });

  /** Same as above, sourced from a `Header Key | Value` DataTable. */
  Then(/^Response from (AUT|API|\[[^[\]]*\]) contains headers;$/, async function (requestTarget: string, dataTable: DataTable) {
    const target = API_AUTWrapper.findAUTOrAPIByTargetText(requestTarget);
    Log.writeLine(LogLevels.TestInformation, `STEP Response from ${requestTarget} contains headers (DataTable)`);
    const expectedHeaders = await buildHeaderSetFromDataTable(dataTable);
    validateHeaderSet(expectedHeaders, target.lastResponse.headers, true, `[${target.appName}] response headers`);
  });
}
