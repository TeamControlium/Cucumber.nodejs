import type { DataTable, Given as CucumberGiven, When as CucumberWhen } from '@cucumber/cucumber';
import { API_AUTWrapper } from '@controlium/framework';
import { APIUtils, JsonUtils, Log, LogLevels, Utils, ValueExpression } from '@controlium/utils';

import { getDataTableRows } from '../../dataTable/cucumberDataTable.js';
import { resolveAppName } from './resolveAppName.js';

/**
 * The slice of `@cucumber/cucumber` `wireApiHeaderStepDefinitions` needs.
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
 * Converts a header-configuration DataTable (`Header Key | Value` columns) into a typed
 * object — each cell's `Value` resolved via {@link ValueExpression.parse}, so `file:`/
 * `number:`/`boolean:`/`json:` all work from a DataTable cell. `json:` is parsed as JSON5
 * (`{ useJson5: true }`) — see this file's own class doc, "JSON content — JSON5, not just
 * strict JSON" section, for why: this is test-authored fixture data, never forwarded as a
 * literal JSON *string* to anything — it only ever becomes an in-memory object that gets
 * strictly re-serialised (`JSON.stringify`) before it goes anywhere, so there's nothing to
 * lose by also accepting unquoted keys/single-quoted strings/trailing commas on the way in.
 * Returns `{}` when no DataTable was attached (the literal/file-sourced patterns' override
 * is optional).
 */
async function resolveDataTableOverrideHeaders(dataTable: DataTable | undefined): Promise<Record<string, unknown>> {
  if (Utils.isUndefined(dataTable)) return {};
  const rows = getDataTableRows(dataTable, ['Header Key', 'Value']);
  const rawHeaders = JsonUtils.buildObjectFromRows(rows, 'Header Key', 'Value');
  const resolvedEntries = await Promise.all(
    Object.entries(rawHeaders).map(async ([key, value]) => [key, await ValueExpression.parse(value, { useJson5: true })] as const)
  );
  return Object.fromEntries(resolvedEntries);
}

/**
 * Extracts a header-configuration DataTable's raw `Value` column text, **unresolved** —
 * used only by the one-shot "next request" overrides further down, which must defer
 * `ValueExpression.parse`'s own detokenisation (and `number:`/`boolean:`/`json:`/`file:`
 * casting) to the moment `API_AUTWrapper.request()` actually consumes the override, rather
 * than resolving it here, eagerly, at step-definition time — see
 * `API_AUTWrapper.setNextRequestHeaders`'s own doc comment for why. The session-level
 * patterns above still resolve immediately via {@link resolveDataTableOverrideHeaders} —
 * eager resolution is exactly what a session-level "set this now" step should do; only the
 * one-shot override needs to defer. Returns `undefined` when no DataTable was attached (the
 * literal/file-sourced one-shot patterns' override is optional).
 */
function extractNextRequestDataTableHeaderExpressions(dataTable: DataTable | undefined): Record<string, string> | undefined {
  if (Utils.isUndefined(dataTable)) return undefined;
  const rows = getDataTableRows(dataTable, ['Header Key', 'Value']);
  return JsonUtils.buildObjectFromRows(rows, 'Header Key', 'Value');
}

/**
 * Applies a resolved headers object to `aut`'s session-level headers, via
 * `setHeaders`/`mergeHeaders` depending on `mode`. Validated via
 * {@link APIUtils.assertPrimitiveValues} first — shared by both this and
 * {@link applyNextRequestHeaders}, same rule regardless of which `API_AUTWrapper` entry
 * point ends up receiving the result.
 */
async function applyHeaders(aut: API_AUTWrapper, mode: 'replaced' | 'merged', headers: Record<string, unknown>): Promise<void> {
  APIUtils.assertPrimitiveValues(headers, 'header');
  const typedHeaders = headers as APIUtils.HTTPHeaders;
  if (mode === 'merged') {
    await aut.mergeHeaders(typedHeaders);
  } else {
    await aut.setHeaders(typedHeaders);
  }
}

/**
 * Stages a resolved headers object as the static one-shot "next request" override, via
 * `API_AUTWrapper.setNextRequestHeaders`/`mergeNextRequestHeaders` depending on `mode` — no
 * `aut` argument, since the override is genuinely global (see this file's own class doc,
 * "Next request only" section). Synchronous — staging never detokenises; `request()` itself
 * does that lazily when it actually consumes the override.
 *
 * `headers` — the literal/file-sourced portion — is validated here, since its shape is
 * already fully known (plain JSON5-parsed values, never `ValueExpression` verb-grammar).
 * `dataTableValueExpressions`, if any, stays raw and unvalidated — its shape (e.g. whether a
 * `json:` cell resolves to a non-primitive) is only knowable once `API_AUTWrapper.request()`
 * resolves it, where it's validated again, then.
 */
function applyNextRequestHeaders(
  mode: 'replaced' | 'merged',
  headers: Record<string, unknown>,
  dataTableValueExpressions?: Record<string, string>
): void {
  APIUtils.assertPrimitiveValues(headers, 'header');
  const typedHeaders = headers as APIUtils.HTTPHeaders;
  if (mode === 'merged') {
    API_AUTWrapper.mergeNextRequestHeaders(typedHeaders, dataTableValueExpressions);
  } else {
    API_AUTWrapper.setNextRequestHeaders(typedHeaders, dataTableValueExpressions);
  }
}

/**
 * Loads a test-data file's contents as a JSON headers object, via
 * `ValueExpression.parse('file,json:<filename>', { useJson5: true })` — reusing the same
 * source×cast grammar a DataTable cell's `Value` column uses, rather than hand-rolling file
 * reading/parsing here. Gets the path resolved via `Utils.resolveTestDataPath`, detokenised
 * (path, then content), and JSON5-parsed for free — same "test fixture data, not a literal
 * string going anywhere" reasoning as {@link resolveDataTableOverrideHeaders}'s own doc
 * comment. Shape-validated via {@link JsonUtils.assertPlainObject}.
 */
async function resolveHeadersFromTestDataFile(filename: string): Promise<Record<string, unknown>> {
  const fileHeaders = await ValueExpression.parse(`file,json:${filename}`, { useJson5: true });
  return JsonUtils.assertPlainObject(fileHeaders, `test data file [${filename}]`);
}

/**
 * Registers step definitions for configuring the headers an API-based AUT's requests will
 * carry — JSON literal / test-data-file / DataTable sourced.
 *
 * ## Wording
 *
 * `request headers for (AUT|[name]) are [replaced|merged] with/using ...` — `replaced`/
 * `merged` read as past-participle adjectives, not bare verbs ("are replaced with", not
 * "will replace") — "will use merge header data" (an earlier draft of this wording)
 * doesn't parse as English; "are merged with" does. `[replaced|merged]` is a code-word per
 * this workspace's own `[...]`-for-code-words-and-references convention (see
 * `~/repos/controlium/PRINCIPLES.md`) — bracketed in the step text itself, not just in this
 * prose. The word is **optional** — omit it, brackets and all, and it defaults to
 * `replaced`:
 * - `request headers for AUT are [replaced] with '...'`
 * - `request headers for AUT are [merged] with '...'`
 * - `request headers for AUT are '...'` — omitted, same as `[replaced]`
 *
 * "Request" (not just "headers") — matches standard HTTP terminology (request headers vs.
 * response headers) and disambiguates from the response-side validation steps living right
 * next to these in `validation.steps.ts`.
 *
 * `replaced`/`merged` deliberately matches `API_AUTWrapper`'s own method names exactly —
 * `replaced` → `setHeaders()`, `merged` → `mergeHeaders()` — so a reader can map the
 * Gherkin wording straight onto the framework call with no translation layer in between.
 *
 * No "detokenised" variant of these patterns — `API_AUTWrapper.request()` (and, for the
 * session-level ones, `setHeaders`/`mergeHeaders` themselves) detokenise unconditionally
 * (see their own doc comments), so there is no per-step choice to word a pattern around; a
 * step reading "header data" is always detokenised.
 *
 * A trailing `;` means "a DataTable follows" — same convention as `request.steps.ts`'s own
 * literal-body patterns (see that file's own doc comment for the full reasoning, not
 * repeated here); applies to all six registrations below. Not a style choice: Cucumber-JS's
 * own `UserCodeRunner` appends one callback argument to whatever a step handler is given,
 * then infers "this must be the callback interface" purely from `fn.length ===
 * argsArray.length` after that append. A single, genuinely *optional* trailing `dataTable`
 * parameter is exactly the shape that collides with this — for an `async` handler (which
 * every one of these is), omitting the table lands `fn.length` exactly on that collision,
 * producing Cucumber's own "function uses multiple asynchronous interfaces: callback and
 * promise" error instead of ever running the step. Confirmed live, the hard way — see
 * `request.steps.ts`'s own doc comment for the full arity derivation and why no
 * parameter-default/rest-param trick avoids it. Splitting into two registrations per
 * pattern (identical text, `;`-terminated or not, each with its own fixed, non-optional
 * arity) sidesteps the collision entirely:
 * - JSON-literal and test-data-file patterns: the no-`;` registration takes no `dataTable`
 *   parameter at all (base only); the `;`-registration takes a mandatory `dataTable`
 *   (base + override, DataTable key always wins on collision).
 * - DataTable-only patterns: have no literal/file base at all, so a DataTable is always
 *   required — only the `;`-registration exists; omitting the table means the step's own
 *   text doesn't match *any* registration (a plain "no step definition found" from
 *   Cucumber itself), rather than a runtime check inside the handler catching it after the
 *   fact. The `;` doubles as a signal to the test author, not just to us, that a table must
 *   follow.
 *
 * ## Quoted literal values — verbatim, either quote style
 *
 * A quoted literal (the inline JSON cases) may be delimited by **either** `'...'` or
 * `"..."`, the test author's choice, and everything between the opening and closing
 * delimiter is used **verbatim** — including the *other* quote character, or even the
 * *same* quote character appearing again inside, unescaped. E.g. with a single-quoted
 * literal, `'{"name": "O'Brien"}'` captures `{"name": "O'Brien"}` exactly, embedded
 * apostrophe included — no escaping convention needed.
 *
 * This works via two alternative branches, one per delimiter — `(?:'(.*)'|"(.*)")` — not a
 * captured delimiter character plus a numbered backreference (`(['"])(.*)\N$`), which was
 * this convention's original form. Deliberately not that: `alexkrechik.cucumberautocomplete`
 * (the VS Code extension autocomplete/go-to-definition depends on) wraps every
 * space-separated token of a step's regex in its own new capturing group when it builds the
 * partial-match regex for its autocomplete dropdown — which renumbers, and so breaks, any
 * backreference already in the step's own pattern. Confirmed directly against the
 * extension's installed and current upstream source (`getPartialRegText`/
 * `getPartialRegParts` in `steps.handler.js`) — unconditional, nothing to configure around
 * (unlike `stepsInvariants`'s own, separate backreference-breaking behaviour — safely
 * enabled in this package's own `.vscode/settings.json`, precisely because no step pattern
 * here has a backreference left for it to break). The two-branch form
 * gives the identical "must close with the same character it opened with, verbatim,
 * including the other quote character or the same one again inside, unescaped" guarantee —
 * each branch's own greedy `(.*)` backtracks to the *last* occurrence of *that branch's own*
 * literal delimiter — but structurally, with no backreference for the autocomplete builder
 * to break. The cost: one extra parameter per quoted segment in the handler signature (only
 * one of the pair is ever defined; resolve the real value via `single ?? double`), since the
 * delimiter character itself is no longer separately captured at all.
 *
 * Square brackets (`[name]`, `[path]`, `[replaced|merged]`) are a different, pre-existing
 * convention, covering two different *kinds* of thing with the same bracket deliberately —
 * a reference to something (`[name]`, `[path]`) or a code-word from a fixed, known set
 * (`[replaced|merged]`) — never free text, so this verbatim-quoting concern never applies
 * to them; all three already use a plain greedy match with no exclusion, which already
 * tolerates whatever's inside.
 *
 * This quoting convention is a repo-wide rule, not specific to these patterns — see
 * `~/repos/controlium/PRINCIPLES.md`'s own "Gherkin step wording" principle.
 * `validation.steps.ts`'s own stubs don't follow it yet (not real step text yet — still
 * `notImplemented()` stubs); that's tracked separately, not fixed implicitly by this file.
 *
 * ## JSON content — JSON5, not just strict JSON
 *
 * Whatever's *inside* the quoted delimiters above (and the DataTable `json:` cast, and a
 * test-data file's contents) is parsed as **JSON5**, not strict JSON — unquoted keys,
 * single-quoted strings, trailing commas, and comments are all accepted, e.g.
 * `'{Content-Type: "text/plain"}'` works, not just `'{"Content-Type": "text/plain"}'`.
 *
 * Deliberate, not an accident of reusing a lenient library: this repo's test authors
 * include non-technical testers (see `PRINCIPLES.md`), and strict-JSON-only punishes them
 * for a distinction — "is this JSON or JS object-literal syntax" — that has zero bearing on
 * correctness here. The parsed result is never re-emitted as a literal string anywhere; it
 * only ever becomes an in-memory headers object, which — if it goes anywhere at all (the
 * wire) — is produced fresh via strict `JSON.stringify` regardless of how leniently the
 * author's source text was written. So JSON5 loosens what a test author is allowed to
 * *type*; it changes nothing about what ends up on the wire.
 *
 * This is an explicit choice at each call site (`{ useJson5: true }` passed to
 * `ValueExpression.parse`, `true` passed to `JsonUtils.parse`), not a changed default on the
 * shared utilities themselves — `JsonUtils.parse`/`ValueExpression.parse`'s own default
 * remains strict JSON, for any caller elsewhere that genuinely needs to validate the
 * author's text was strict JSON specifically. See `ValueExpression.parse`'s own doc comment
 * for the full `useJson5` contract.
 *
 * ## "Next request only" one-shot equivalents
 *
 * `next API request headers are [replaced|merged] with/using ...` (brackets real, per the
 * "Wording" section above) — no `(AUT|[name])`
 * target at all, deliberately: this is a one-shot override for whichever AUT's
 * `API_AUTWrapper.request()` fires next, genuinely global, not scoped to a particular AUT
 * (see `API_AUTWrapper.setNextRequestHeaders`'s own doc comment for why). Also deliberately
 * "request", not "request's" — avoiding any apostrophe in the fixed step text, since this
 * repo's quoting convention already gives `'`/`"` real, load-bearing meaning elsewhere in
 * the very same patterns. Registered via `When`, not `Given` — staging a one-shot override
 * right before the action that consumes it reads as an action, not background setup.
 *
 * Lets a test set general headers once (via the `request headers for (AUT|[name])`
 * patterns above) and still override them completely or partially for one specific request
 * — e.g. sending
 * a deliberately corrupt `Authorization` value for a single negative-test call, with
 * everything after it reverting to the general headers automatically.
 *
 * @param cucumber - The `@cucumber/cucumber` module itself, same convention as
 *   `wireCucumberHooks`.
 */
export function wireApiHeaderStepDefinitions(cucumber: CucumberGivenWhenAPI): void {
  if (cucumber === null || typeof cucumber !== 'object') {
    throw new Error(
      `wireApiHeaderStepDefinitions: [cucumber] must be the '@cucumber/cucumber' module object — received ${cucumber === null ? 'null' : typeof cucumber}`
    );
  }

  const givenType = typeof cucumber.Given;
  if (givenType !== 'function') {
    throw new Error(
      `wireApiHeaderStepDefinitions: [cucumber.Given] must be a function — received ${givenType}. Did you pass the '@cucumber/cucumber' module itself?`
    );
  }

  const whenType = typeof cucumber.When;
  if (whenType !== 'function') {
    throw new Error(
      `wireApiHeaderStepDefinitions: [cucumber.When] must be a function — received ${whenType}. Did you pass the '@cucumber/cucumber' module itself?`
    );
  }

  const { Given, When } = cucumber;

  // --- Session-level: request headers for (AUT|[name]) ------------------------------------

  /**
   * Sets (or merges onto) an AUT's session-level request headers from an inline JSON
   * literal. No DataTable override — see the trailing-`;` sibling registration below for
   * that (see this function's own doc comment for why these are two separate registrations
   * rather than one with an optional parameter).
   *
   * @example
   * Given request headers for AUT are [replaced] with '{"Authorization": "Bearer abc"}'
   * Given request headers for [MyApp] are [merged] with "{'X-Trace-Id': '123'}"
   * Given request headers for AUT are '{"Authorization": "Bearer abc"}'
   */
  Given(/^request headers for (AUT|\[.*\]) are (?:\[(replaced|merged)\] with )?(?:'(.*)'|"(.*)")$/, async function (
      requestTarget: string,
      modeCapture: string | undefined,
      headerDataSingleQuoted: string | undefined,
      headerDataDoubleQuoted: string | undefined
    ) {
      const mode = resolveMode(modeCapture);
      const headerData = headerDataSingleQuoted ?? headerDataDoubleQuoted as string;
      Log.writeLine(LogLevels.TestInformation, `STEP request headers for ${requestTarget} are [${mode}] with [${headerData}]`);

      const aut = API_AUTWrapper.getApplication(resolveAppName(requestTarget));

      const literalHeaders = JsonUtils.parseObjectLiteral(
        headerData,
        `[cucumber-driver stepdefs] "request headers for ${requestTarget} are ${mode} with '...'" — header data`,
        true
      );

      await applyHeaders(aut, mode, literalHeaders);
    }
  );

  /**
   * Same as the pattern above, but with a mandatory trailing DataTable override that
   * overrides/adds individual keys on top of the literal — a DataTable key always wins on
   * collision. The trailing `;` is the signal — to both Cucumber and the test author —
   * that a DataTable must follow; see this function's own doc comment for why this is a
   * separate registration rather than one shared pattern with an optional `dataTable`
   * parameter.
   *
   * @example
   * Given request headers for AUT are '{"Authorization": "Bearer abc"}';
   *   | Header Key | Value        |
   *   | X-Trace-Id | number:12345 |
   */
  Given(/^request headers for (AUT|\[.*\]) are (?:\[(replaced|merged)\] with )?(?:'(.*)'|"(.*)");$/, async function (
      requestTarget: string,
      modeCapture: string | undefined,
      headerDataSingleQuoted: string | undefined,
      headerDataDoubleQuoted: string | undefined,
      dataTable: DataTable
    ) {
      const mode = resolveMode(modeCapture);
      const headerData = headerDataSingleQuoted ?? headerDataDoubleQuoted as string;
      Log.writeLine(LogLevels.TestInformation, `STEP request headers for ${requestTarget} are [${mode}] with [${headerData}] (+ DataTable)`);

      const aut = API_AUTWrapper.getApplication(resolveAppName(requestTarget));

      const literalHeaders = JsonUtils.parseObjectLiteral(
        headerData,
        `[cucumber-driver stepdefs] "request headers for ${requestTarget} are ${mode} with '...'" — header data`,
        true
      );

      // DataTable always wins on key collision with the literal base — see
      // docs/design/step-definition-structure.md.
      const dataTableHeaders = await resolveDataTableOverrideHeaders(dataTable);
      const headers = { ...literalHeaders, ...dataTableHeaders };

      await applyHeaders(aut, mode, headers);
    }
  );

  /**
   * Sets (or merges onto) an AUT's session-level request headers from a JSON test-data
   * file. No DataTable override — see the trailing-`;` sibling registration below for
   * that (see this function's own doc comment for why these are two separate registrations
   * rather than one with an optional parameter).
   *
   * @example
   * Given request headers for AUT are [replaced] using test data file [headers/auth.json]
   * Given request headers for [MyApp] are [merged] using test data file [headers/trace.json]
   */
  Given(/^request headers for (AUT|\[.*\]) are (?:\[(replaced|merged)\] )?using test data file \[(.*)\]$/, async function (requestTarget: string, modeCapture: string | undefined, filename: string) {
      const mode = resolveMode(modeCapture);
      Log.writeLine(LogLevels.TestInformation, `STEP request headers for ${requestTarget} are [${mode}] using test data file [${filename}]`);

      const aut = API_AUTWrapper.getApplication(resolveAppName(requestTarget));
      const fileHeaders = await resolveHeadersFromTestDataFile(filename);

      await applyHeaders(aut, mode, fileHeaders);
    }
  );

  /**
   * Same as the pattern above, but with a mandatory trailing DataTable override that
   * overrides/adds individual keys on top of the file-sourced base — a DataTable key
   * always wins on collision. The trailing `;` is the signal — to both Cucumber and the
   * test author — that a DataTable must follow; see this function's own doc comment for
   * why this is a separate registration rather than one shared pattern with an optional
   * `dataTable` parameter.
   *
   * @example
   * Given request headers for AUT are using test data file [headers/auth.json];
   *   | Header Key | Value          |
   *   | X-Trace-Id | 123            |
   */
  Given(/^request headers for (AUT|\[.*\]) are (?:\[(replaced|merged)\] )?using test data file \[(.*)\];$/, async function (requestTarget: string, modeCapture: string | undefined, filename: string, dataTable: DataTable) {
      const mode = resolveMode(modeCapture);
      Log.writeLine(LogLevels.TestInformation, `STEP request headers for ${requestTarget} are [${mode}] using test data file [${filename}] (+ DataTable)`);

      const aut = API_AUTWrapper.getApplication(resolveAppName(requestTarget));
      const fileHeaders = await resolveHeadersFromTestDataFile(filename);

      // DataTable always wins on key collision with the file-sourced base — see
      // docs/design/step-definition-structure.md.
      const dataTableHeaders = await resolveDataTableOverrideHeaders(dataTable);
      const headers = { ...fileHeaders, ...dataTableHeaders };

      await applyHeaders(aut, mode, headers);
    }
  );

  /**
   * Sets (or merges onto) an AUT's session-level request headers built entirely from a
   * DataTable (`Header Key` | `Value` columns) — no literal/file base at all. The trailing
   * `;` is mandatory here (not optional, unlike the two patterns above) — with no
   * literal/file base, a DataTable is the step's *only* source of data, so the pattern
   * itself requires it; omitting the table means this step's own text simply doesn't match
   * any registration at all (Cucumber's own "no step definition found"), rather than a
   * runtime check inside the handler catching it after the fact — see this function's own
   * doc comment for why.
   *
   * @example
   * Given request headers for AUT are [replaced] with;
   *   | Header Key    | Value       |
   *   | Authorization | Bearer abc  |
   *   | X-Trace-Id    | number:123  |
   */
  Given(/^request headers for (AUT|\[.*\]) are(?: \[(replaced|merged)\] with)?;$/, async function (requestTarget: string, modeCapture: string | undefined, dataTable: DataTable) {
      const mode = resolveMode(modeCapture);
      Log.writeLine(LogLevels.TestInformation, `STEP request headers for ${requestTarget} are [${mode}]`);

      const aut = API_AUTWrapper.getApplication(resolveAppName(requestTarget));
      const headers = await resolveDataTableOverrideHeaders(dataTable);
      await applyHeaders(aut, mode, headers);
    }
  );

  // --- "Next request only" one-shot equivalents — no (AUT|[name]) target; see class doc. ---

  /**
   * Stages a one-shot header override — replacing or merging on top of whichever AUT's
   * session headers — for whichever `API_AUTWrapper.request()` fires next, from an inline
   * JSON literal. No DataTable override — see the trailing-`;` sibling registration below
   * for that (see this function's own doc comment for why these are two separate
   * registrations rather than one with an optional parameter). Consumed and cleared
   * automatically the moment that next request fires; every request after that reverts to
   * the AUT's ordinary session headers.
   *
   * @example
   * When next API request headers are [replaced] with '{"Authorization": "bad-token"}'
   * When next API request headers are [merged] with "{'X-Debug': 'true'}"
   */
  When(/^next API request headers are (?:\[(replaced|merged)\] with )?(?:'(.*)'|"(.*)")$/, async function (modeCapture: string | undefined, headerDataSingleQuoted: string | undefined, headerDataDoubleQuoted: string | undefined) {
      const mode = resolveMode(modeCapture);
      const headerData = headerDataSingleQuoted ?? headerDataDoubleQuoted as string;
      Log.writeLine(LogLevels.TestInformation, `STEP next API request headers are [${mode}] with [${headerData}]`);

      const literalHeaders = JsonUtils.parseObjectLiteral(
        headerData,
        `[cucumber-driver stepdefs] "next API request headers are ${mode} with '...'" — header data`,
        true
      );

      applyNextRequestHeaders(mode, literalHeaders);
    }
  );

  /**
   * Same as the pattern above, but with a mandatory trailing DataTable override that
   * overrides/adds individual keys on top of the literal — a DataTable key always wins on
   * collision. The trailing `;` is the signal — to both Cucumber and the test author —
   * that a DataTable must follow; see this function's own doc comment for why this is a
   * separate registration rather than one shared pattern with an optional `dataTable`
   * parameter.
   *
   * Unlike the session-level DataTable patterns above, the DataTable's own `Value` column
   * text is **not** resolved here — it's extracted raw (see
   * {@link extractNextRequestDataTableHeaderExpressions}) and resolved only when
   * `API_AUTWrapper.request()` actually consumes this override, same deferred timing as the
   * literal portion right above. A one-shot override exists specifically to reflect the
   * freshest possible state at the moment it fires; resolving the DataTable half of it
   * eagerly here, while the literal half stays deferred, would quietly break that for
   * exactly the entries a test author chose to express via the table.
   *
   * @example
   * When next API request headers are [replaced] with '{"Authorization": "bad-token"}';
   *   | Header Key | Value |
   *   | X-Debug    | true  |
   */
  When(/^next API request headers are (?:\[(replaced|merged)\] with )?(?:'(.*)'|"(.*)");$/, async function (modeCapture: string | undefined, headerDataSingleQuoted: string | undefined, headerDataDoubleQuoted: string | undefined, dataTable: DataTable) {
      const mode = resolveMode(modeCapture);
      const headerData = headerDataSingleQuoted ?? headerDataDoubleQuoted as string;
      Log.writeLine(LogLevels.TestInformation, `STEP next API request headers are [${mode}] with [${headerData}] (+ DataTable)`);

      const literalHeaders = JsonUtils.parseObjectLiteral(
        headerData,
        `[cucumber-driver stepdefs] "next API request headers are ${mode} with '...'" — header data`,
        true
      );

      const dataTableValueExpressions = extractNextRequestDataTableHeaderExpressions(dataTable);

      applyNextRequestHeaders(mode, literalHeaders, dataTableValueExpressions);
    }
  );

  /**
   * As the inline-literal one-shot override above, but sourced from a JSON test-data file.
   * No DataTable override — see the trailing-`;` sibling registration below for that (see
   * this function's own doc comment for why these are two separate registrations rather
   * than one with an optional parameter).
   *
   * @example
   * When next API request headers are [replaced] using test data file [headers/bad-auth.json]
   */
  When(/^next API request headers are (?:\[(replaced|merged)\] )?using test data file \[(.*)\]$/, async function (modeCapture: string | undefined, filename: string) {
      const mode = resolveMode(modeCapture);
      Log.writeLine(LogLevels.TestInformation, `STEP next API request headers are [${mode}] using test data file [${filename}]`);

      const fileHeaders = await resolveHeadersFromTestDataFile(filename);
      applyNextRequestHeaders(mode, fileHeaders);
    }
  );

  /**
   * Same as the pattern above, but with a mandatory trailing DataTable override that
   * overrides/adds individual keys on top of the file-sourced base — a DataTable key
   * always wins on collision. The trailing `;` is the signal — to both Cucumber and the
   * test author — that a DataTable must follow; see this function's own doc comment for
   * why this is a separate registration rather than one shared pattern with an optional
   * `dataTable` parameter.
   *
   * Same deferred-DataTable-resolution timing as the literal pattern above — see that
   * registration's own doc comment.
   *
   * @example
   * When next API request headers are using test data file [headers/bad-auth.json];
   *   | Header Key | Value |
   *   | X-Debug    | true  |
   */
  When(/^next API request headers are (?:\[(replaced|merged)\] )?using test data file \[(.*)\];$/, async function (modeCapture: string | undefined, filename: string, dataTable: DataTable) {
      const mode = resolveMode(modeCapture);
      Log.writeLine(LogLevels.TestInformation, `STEP next API request headers are [${mode}] using test data file [${filename}] (+ DataTable)`);

      const fileHeaders = await resolveHeadersFromTestDataFile(filename);
      const dataTableValueExpressions = extractNextRequestDataTableHeaderExpressions(dataTable);

      applyNextRequestHeaders(mode, fileHeaders, dataTableValueExpressions);
    }
  );

  /**
   * As the inline-literal one-shot override above, but built entirely from a DataTable
   * (`Header Key` | `Value` columns) — no literal/file base at all. The trailing `;` is
   * mandatory here (not optional, unlike the two patterns above) — with no literal/file
   * base, a DataTable is the step's *only* source of data, so the pattern itself requires
   * it; omitting the table means this step's own text simply doesn't match any
   * registration at all (Cucumber's own "no step definition found"), rather than a runtime
   * check inside the handler catching it after the fact — see this function's own doc
   * comment for why.
   *
   * Same deferred-DataTable-resolution timing as the other one-shot DataTable overrides
   * above — see the literal-plus-DataTable registration's own doc comment for why.
   *
   * @example
   * When next API request headers are [replaced] with;
   *   | Header Key    | Value     |
   *   | Authorization | json:null |
   */
  When(/^next API request headers are(?: \[(replaced|merged)\] with)?;$/, async function (modeCapture: string | undefined, dataTable: DataTable) {
      const mode = resolveMode(modeCapture);
      Log.writeLine(LogLevels.TestInformation, `STEP next API request headers are [${mode}]`);

      const dataTableValueExpressions = extractNextRequestDataTableHeaderExpressions(dataTable);
      applyNextRequestHeaders(mode, {}, dataTableValueExpressions);
    }
  );
}
