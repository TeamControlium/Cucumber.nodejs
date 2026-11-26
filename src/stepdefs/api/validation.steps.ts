import type { DataTable, Then as CucumberThen } from '@cucumber/cucumber';
import { API_AUTWrapper } from '@controlium/framework';
import { Detokeniser, JsonUtils, Log, LogLevels, Validate, ValueExpression, XmlUtils } from '@controlium/utils';

import { resolveDataTableRows } from '../../dataTable/cucumberDataTable.js';

/**
 * The slice of `@cucumber/cucumber` `wireApiValidationStepDefinitions` needs.
 */
export interface CucumberThenAPI {
  Then: typeof CucumberThen;
}

/** A body's declared shape — governs how the expected/actual text is parsed and compared. */
type BodyKind = 'json' | 'xml' | 'text';

/** `undefined`/omitted means `'text'` — the same default `request.steps.ts`'s own `[json|xml|text] body` fork uses. */
function resolveBodyKind(kind: string | undefined): BodyKind {
  return (kind as BodyKind | undefined) ?? 'text';
}

/**
 * Splits a raw `Compare Types` cell/bracket into a lowercased flag set — comma-separated,
 * whitespace-insensitive, same normalisation `Validate.normalizeCompareTypes` itself uses.
 * Only ever used here for *this file's own* dispatch decisions (picking text-level vs.
 * structural JSON comparison below) — never passed onward to a `Validate.*` call in place of
 * the original raw string: `Validate.normalizeCompareTypes`'s own vocabulary check (is
 * `contains` even legal for this comparison kind?) only actually runs on the *string* branch
 * of that function, not on an already-built `Set` — passing a raw string through to every
 * `Validate.*` call below, rather than this locally-parsed `Set`, is what keeps that
 * validation live.
 */
function parseCompareTypeFlags(raw: string | undefined): Set<string> {
  if (!raw || raw.trim().length === 0) return new Set();
  return new Set(raw.replace(/\s+/g, '').toLowerCase().split(','));
}

/**
 * Compares a full expected body against the actual response body, dispatched by {@link
 * BodyKind}:
 * - `text`: direct {@link Validate.text}, `compareTypesRaw` forwarded as given.
 * - `xml`: both sides parsed then re-serialised to a compact canonical form (via {@link
 *   XmlUtils.parse}/{@link XmlUtils.serialize}) before the same {@link Validate.text} —
 *   XML is an ordered format (unlike a JSON object's keys), so comparing a canonicalised
 *   serialisation as text is the right "structural" notion of equality here, not a
 *   key-order-independent deep-equal. This normalises pure *serialisation* choices (e.g.
 *   single- vs double-quoted attribute values, self-closing-tag style) — it does **not**
 *   strip whitespace-only text nodes between elements, since those are genuine parsed
 *   content, not formatting, and there is no generically correct way to know which
 *   inter-element whitespace is insignificant without a schema.
 * - `json`: structural deep-equality (key-order-independent) via {@link Validate.jsonObject}
 *   — *unless* the flags include `contains`/`startswith`/`endswith`/`regexp`, in which case
 *   the test author is clearly asking for a text-level check, not a structural one, so it
 *   falls back to comparing the raw (unparsed) text via {@link Validate.text} instead.
 *
 * `not` is not supported for a structural JSON comparison — {@link Validate.jsonObject} has
 * no meaningful "not equal, structurally" when the two sides aren't even known to be the same
 * shape — callers wanting that should combine `not` with one of the text-level modes instead,
 * or use the per-row `[json] body;` DataTable form.
 *
 * @throws {Error} If `expectedRaw`/`actualBody` isn't valid JSON/XML for the given `kind`, or
 *   `not` is combined with a structural (non-text-level) JSON comparison.
 */
async function compareFullBody(
  kind: BodyKind,
  expectedRaw: string,
  actualBody: string,
  description: string,
  compareTypesRaw: string | undefined
): Promise<void> {
  if (kind === 'xml') {
    const canonicalise = (text: string): string => XmlUtils.serialize(XmlUtils.parse(text), { pretty: false });
    Validate.text(canonicalise(expectedRaw), canonicalise(actualBody), description, compareTypesRaw);
    return;
  }

  const dispatchFlags = parseCompareTypeFlags(compareTypesRaw);
  const hasTextLevelMode = dispatchFlags.has('contains') || dispatchFlags.has('startswith') || dispatchFlags.has('endswith') || dispatchFlags.has('regexp');
  if (kind === 'text' || hasTextLevelMode) {
    Validate.text(expectedRaw, actualBody, description, compareTypesRaw);
    return;
  }

  // kind === 'json', no text-level mode requested — structural comparison.
  if (dispatchFlags.has('not')) {
    throw new Error(
      `${description}: 'not' is not supported for a structural JSON body comparison — combine 'not' with 'contains'/'startswith'/'endswith'/'regexp' for text-level negation, or use a '[json] body;' DataTable row instead.`
    );
  }
  const expectedParsed = JsonUtils.parse(expectedRaw, true);
  const actualParsed = JsonUtils.parse(actualBody);
  Validate.jsonObject(expectedParsed, actualParsed, description, compareTypesRaw);
}

/**
 * Validates every row of a `[json] body;` DataTable (`JSON-Path` | `Compare Types` |
 * `Expected Value` | `?Description` columns) against the response body — partial,
 * multi-assertion validation, as many independent checks as rows. Delegates entirely to
 * {@link Validate.jsonProperty}, which already does its own JSONPath resolution plus
 * `any`/`count`/index-pick dispatch — nothing left for this function to do beyond reading
 * the DataTable and calling it once per row.
 *
 * **`xml`/`text` kinds are not implemented** — `@controlium/utils`'s `Validate` class has no
 * XPath/regex equivalent of {@link Validate.jsonProperty} yet (see
 * [[project_controlium_validate_primitives]] — deliberately deferred, gated on confirming
 * the JSON design is right first). Throws immediately, loudly, rather than silently matching
 * zero rows or no-opping — a `[xml]`/`[text]` DataTable step must never appear to pass
 * without actually checking anything.
 */
async function validateBodyDataTable(kind: BodyKind, responseBody: string, dataTable: DataTable, descriptionPrefix: string): Promise<void> {
  if (kind !== 'json') {
    throw new Error(
      `${descriptionPrefix}: DataTable-based [${kind}] body validation is not implemented yet — ` +
      `@controlium/utils's Validate class has no XPath/regex equivalent of Validate.jsonProperty ` +
      `yet (only JSON-Path rows are wired up). Use a '[json] body;' DataTable instead, or a full-value ` +
      `'[${kind}] body' pattern, until that primitive exists.`
    );
  }

  const rows = await resolveDataTableRows(dataTable, ['JSON-Path', 'Compare Types', 'Expected Value', '?Description']);

  for (const row of rows) {
    const address = row['JSON-Path'];
    const expectedValue = await ValueExpression.parse(row['Expected Value'], { useJson5: true });
    const description = row['Description']
      ? `${descriptionPrefix} [JSON-Path ${address}] (${row['Description']})`
      : `${descriptionPrefix} [JSON-Path ${address}]`;

    Validate.jsonProperty(responseBody, address, expectedValue, description, row['Compare Types']);
  }
}

/**
 * Registers step definitions for validating an AUT/API's own responses — status code, and
 * body (JSON/XML/text, full or partial) — the response-side counterpart to
 * `request.steps.ts`'s own request-building steps. Response/request *validation* for a
 * mocked/intercepted request (the AUT's own *outbound* calls to its dependencies) is a
 * separate, deliberately out-of-scope concern here — see `mocking/` once that exists;
 * header validation is a separate sibling file, `headerValidation.steps.ts`.
 *
 * Target identification (`AUT|API|[name]`) is resolved via {@link API_AUTWrapper.findAUTOrAPIByTargetText},
 * exactly as every other API step-def file resolves it — see that method's own doc comment
 * for the three-way dispatch. The response itself comes from `.lastResponse`, which already
 * throws a clear error if the target has never made a request — no extra null-check needed
 * here.
 *
 * Same quoting/wording conventions as `request.steps.ts`/`headers.steps.ts` (see their own
 * doc comments for the full reasoning, not repeated here): every quoted literal may be
 * delimited by either `'...'` or `"..."`, captured via two alternative branches rather than
 * a backreference (VS Code autocomplete compatibility); a trailing `;` means "a DataTable
 * follows" — but unlike those two files, nothing here actually *needs* an optional-vs-
 * mandatory DataTable fork on the same pattern (the Cucumber-JS arity collision their own
 * doc comments describe): every full-value pattern here never takes a DataTable at all, and
 * the one partial/multi-row pattern always does — so there is exactly one fixed arity per
 * pattern, no splitting required.
 *
 * `[json|xml|text]` is the same optional body-kind fork `request.steps.ts` uses (defaults to
 * `text` when omitted) — governing both how the full-value patterns parse/compare (see
 * {@link compareFullBody}) and which DataTable address column the partial pattern expects
 * (see {@link validateBodyDataTable}). An optional `[<compareTypes>]` bracket — a
 * comma-separated compare-type flag list, meaning depends on `Validate.text`/`number`/
 * `jsonObject`/`jsonProperty`'s own per-context vocabulary — may precede the quoted/
 * file-sourced expected value on the full-value patterns; omitted means `equals`.
 *
 * @param cucumber - The `@cucumber/cucumber` module itself, same convention as `wireCucumberHooks`.
 */
export function wireApiValidationStepDefinitions(cucumber: CucumberThenAPI): void {
  if (cucumber === null || typeof cucumber !== 'object') {
    throw new Error(
      `wireApiValidationStepDefinitions: [cucumber] must be the '@cucumber/cucumber' module object — received ${cucumber === null ? 'null' : typeof cucumber}`
    );
  }

  const thenType = typeof cucumber.Then;
  if (thenType !== 'function') {
    throw new Error(
      `wireApiValidationStepDefinitions: [cucumber.Then] must be a function — received ${thenType}. Did you pass the '@cucumber/cucumber' module itself?`
    );
  }

  const { Then } = cucumber;

  /**
   * Validates only the response status code.
   *
   * @example
   * Then Response from AUT status is '200'
   * Then Response from [Scratch Target App] status is "404"
   */
  Then(/^Response from (AUT|API|\[[^[\]]*\]) status is (?:'(\d*)'|"(\d*)")$/, function (
    requestTarget: string,
    statusSingleQuoted: string | undefined,
    statusDoubleQuoted: string | undefined
  ) {
    const expectedStatus = statusSingleQuoted ?? statusDoubleQuoted as string;
    Log.writeLine(LogLevels.TestInformation, `STEP Response from ${requestTarget} status is [${expectedStatus}]`);
    const target = API_AUTWrapper.findAUTOrAPIByTargetText(requestTarget);
    Validate.number(expectedStatus, target.lastResponse.status, `[${target.appName}] response status`);
  });

  /**
   * Validates status and a full literal body value — kind-aware (json/xml/text, defaults to
   * text), compare-type-optional (defaults to equals).
   *
   * @example
   * Then Response from AUT status is '200', body 'OK'
   * Then Response from AUT status is '200', [json] body '{"a":1}'
   * Then Response from AUT status is '200', [text] body [contains] 'partial text'
   * Then Response from [Scratch Target App] status is '200', [xml] body '<a>1</a>'
   */
  Then(/^Response from (AUT|API|\[[^[\]]*\]) status is (?:'(\d*)'|"(\d*)"), (?:\[(json|xml|text)\] )?body (?:\[(.*)\] )?(?:'(.*)'|"(.*)")$/, async function (
    requestTarget: string,
    statusSingleQuoted: string | undefined,
    statusDoubleQuoted: string | undefined,
    kindCapture: string | undefined,
    compareTypesCapture: string | undefined,
    bodySingleQuoted: string | undefined,
    bodyDoubleQuoted: string | undefined
  ) {
    const expectedStatus = statusSingleQuoted ?? statusDoubleQuoted as string;
    const kind = resolveBodyKind(kindCapture);
    const rawExpectedBody = bodySingleQuoted ?? bodyDoubleQuoted as string;
    Log.writeLine(LogLevels.TestInformation, `STEP Response from ${requestTarget} status is [${expectedStatus}], [${kind}] body`);

    const target = API_AUTWrapper.findAUTOrAPIByTargetText(requestTarget);
    Validate.number(expectedStatus, target.lastResponse.status, `[${target.appName}] response status`);

    await compareFullBody(kind, rawExpectedBody, target.lastResponse.body, `[${target.appName}] response body`, compareTypesCapture);
  });

  /**
   * Same as above, body sourced from a test data file instead of an inline literal.
   *
   * @example
   * Then Response from AUT status is '200', body from test data file [responses/ok.txt]
   * Then Response from AUT status is '200', [json] body [contains] from test data file [responses/partial.json]
   */
  Then(/^Response from (AUT|API|\[[^[\]]*\]) status is (?:'(\d*)'|"(\d*)"), (?:\[(json|xml|text)\] )?body (?:\[(.*)\] )?from test data file \[(.*)\]$/, async function (
    requestTarget: string,
    statusSingleQuoted: string | undefined,
    statusDoubleQuoted: string | undefined,
    kindCapture: string | undefined,
    compareTypesCapture: string | undefined,
    filename: string
  ) {
    const expectedStatus = statusSingleQuoted ?? statusDoubleQuoted as string;
    const kind = resolveBodyKind(kindCapture);
    Log.writeLine(LogLevels.TestInformation, `STEP Response from ${requestTarget} status is [${expectedStatus}], [${kind}] body from test data file [${filename}]`);

    const target = API_AUTWrapper.findAUTOrAPIByTargetText(requestTarget);
    Validate.number(expectedStatus, target.lastResponse.status, `[${target.appName}] response status`);

    const resolvedFilename = await Detokeniser.doAsync(filename);
    const expectedBody = (await ValueExpression.parse(`file:${resolvedFilename}`)) as string;
    await compareFullBody(kind, expectedBody, target.lastResponse.body, `[${target.appName}] response body`, compareTypesCapture);
  });

  /**
   * Partial, multi-assertion body validation — one independent check per DataTable row.
   * Address column name depends on `kind`: `JSON-Path` (json, the only kind currently
   * wired — see {@link validateBodyDataTable}) / `XPath` (xml) / `RegExp` (text, defaults
   * when `[...]` is omitted).
   *
   * @example
   * Then Response from AUT status is '200', [json] body;
   *   | JSON-Path   | Compare Types | Expected Value |
   *   | $.data.name | equals        | "Alice"        |
   *   | $.data.tags | contains      | "admin"        |
   */
  Then(/^Response from (AUT|API|\[[^[\]]*\]) status is (?:'(\d*)'|"(\d*)"), (?:\[(json|xml|text)\] )?body;$/, async function (
    requestTarget: string,
    statusSingleQuoted: string | undefined,
    statusDoubleQuoted: string | undefined,
    kindCapture: string | undefined,
    dataTable: DataTable
  ) {
    const expectedStatus = statusSingleQuoted ?? statusDoubleQuoted as string;
    const kind = resolveBodyKind(kindCapture);
    Log.writeLine(LogLevels.TestInformation, `STEP Response from ${requestTarget} status is [${expectedStatus}], [${kind}] body (DataTable)`);

    const target = API_AUTWrapper.findAUTOrAPIByTargetText(requestTarget);
    Validate.number(expectedStatus, target.lastResponse.status, `[${target.appName}] response status`);

    await validateBodyDataTable(kind, target.lastResponse.body, dataTable, `[${target.appName}] response body`);
  });
}
