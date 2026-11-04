import type { DataTable, Given as CucumberGiven, When as CucumberWhen } from '@cucumber/cucumber';
import { API_AUTWrapper } from '@controlium/framework';
import { APIUtils, Log, LogLevels, StringUtils, Utils, ValueExpression } from '@controlium/utils';

import { getDataTableRows } from '../../dataTable/cucumberDataTable.js';
import { resolveAppName } from './resolveAppName.js';

/**
 * The slice of `@cucumber/cucumber` `wireApiRequestStepDefinitions` needs.
 */
export interface CucumberGivenWhenAPI {
  Given: typeof CucumberGiven;
  When: typeof CucumberWhen;
}

/**
 * Converts a DataTable's path-override rows (`JSON-Path`/`XPath` | `Value` columns) into the
 * plain, runner-agnostic shape {@link APIUtils.resolveLiteralRequestBody} takes — the
 * DataTable→rows extraction is the only Cucumber-specific part; the actual value resolution
 * (each cell's `Value` cast via `ValueExpression.parse`'s source×cast grammar, so `file:`/
 * `number:`/`boolean:`/`json:` all work here too) is delegated to
 * {@link APIUtils.resolveRequestBodyModifications} — the same, runner-agnostic function any
 * other test runner's own equivalent would call with its own already-resolved `{ path, value
 * }[]` list.
 */
async function resolveModifications(
  pathColumnName: 'JSON-Path' | 'XPath',
  dataTable: DataTable | undefined
): Promise<APIUtils.RequestBodyModification[] | undefined> {
  if (Utils.isUndefined(dataTable)) return undefined;
  const rows = getDataTableRows(dataTable, [pathColumnName, 'Value']);
  return APIUtils.resolveRequestBodyModifications(rows.map((row) => ({ path: row[pathColumnName], value: row.Value })));
}

/**
 * Resolves a literal request body of the given kind to the final string
 * {@link API_AUTWrapper.request} takes, plus the `Content-Type` that body's kind implies.
 * The DataTable→modifications conversion (and the per-kind `JSON-Path`/`XPath` column
 * choice) is the only Cucumber-specific part; the actual parse/mutate/detokenise/serialise/
 * Content-Type work is {@link APIUtils.resolveLiteralRequestBody}'s own job — the same,
 * runner-agnostic function any other test runner's own equivalent would call directly with
 * its own already-resolved modifications array.
 *
 * `body` is opaque text, never mutable — a DataTable attached to it is a contradiction,
 * caught here before `APIUtils.resolveLiteralRequestBody` even runs (that function's own
 * `bodyKind: 'text'` check is a backstop for other callers, not this step's primary
 * validation). See `docs/design/request-body-path-mutation.md` for the full path-mutation
 * rule set and why the three-way fork exists at all.
 *
 * @throws {Error} If a DataTable is attached to a `body` (opaque) body — mutating
 *   "opaque text" is a contradiction in terms; see the design note's own "real fork"
 *   section for why this is never inferred from the text's own shape.
 */
async function resolveLiteralRequestBody(
  bodyKind: 'json' | 'xml' | 'yaml' | 'text' | undefined,
  literalBody: string,
  dataTable: DataTable | undefined
): Promise<{ body: string; contentType: string | undefined }> {
  if ((bodyKind ?? 'text') === 'text') {
    if (!Utils.isUndefined(dataTable)) {
      throw new Error(
        '[cucumber-driver stepdefs] DataTable overrides can only be used with "json", "xml" or "yaml" body.'
      );
    }
    return APIUtils.resolveLiteralRequestBody('text', literalBody);
  }
  // json/yaml modifications are JSONPath-addressed; xml's are XPath-addressed — same
  // 'JSON-Path'/'XPath' DataTable column convention as every other path-mutation pattern
  // in this package.
  const modifications = await resolveModifications(bodyKind === 'xml' ? 'XPath' : 'JSON-Path', dataTable);
  return APIUtils.resolveLiteralRequestBody(bodyKind, literalBody, modifications);
}

/**
 * Resolves a test-data-file-sourced request body — the one point where the `bin` kind forks
 * away entirely from {@link resolveLiteralRequestBody}'s text-based path: `bin` loads raw
 * bytes via {@link APIUtils.resolveBinaryFileRequestBody} (no `ValueExpression.parse`, no
 * text decoding, no trimming, no DataTable), while every other kind still goes through
 * `ValueExpression.parse`'s plain `file:` source (detokenised path, then content, same as
 * every other file-sourced value in this package) and on into
 * {@link resolveLiteralRequestBody} exactly as before. Shared by both file-sourced step
 * registrations below (with vs. without a trailing DataTable) so this fork lives in exactly
 * one place.
 *
 * @throws {Error} If a DataTable is attached to a `bin` file — raw bytes have no structure
 *   to mutate, same reasoning as `body` (opaque text) rejecting one.
 */
async function resolveFileRequestBody(
  bodyKind: 'json' | 'xml' | 'yaml' | 'text' | 'bin' | undefined,
  filename: string,
  dataTable: DataTable | undefined
): Promise<{ body: string | Buffer; contentType: string | undefined }> {
  if (bodyKind === 'bin') {
    if (!Utils.isUndefined(dataTable)) {
      throw new Error(
        '[cucumber-driver stepdefs] DataTable overrides can only be used with "json", "xml" or "yaml" body — "bin" (raw binary) has no structure to mutate.'
      );
    }
    return APIUtils.resolveBinaryFileRequestBody(filename);
  }
  const fileBody = (await ValueExpression.parse(`file:${filename}`)) as string;
  return resolveLiteralRequestBody(bodyKind, fileBody, dataTable);
}

/**
 * Registers step definitions for issuing an HTTP request against an API-based AUT — no
 * body / literal body / test-data-file body / DataTable-only body. All wired for real.
 *
 * Same conventions as `headers.steps.ts` (see its own doc comment for the full reasoning,
 * not repeated here):
 * - No "detokenised" wording fork — detokenisation is unconditional, so there's no per-step
 *   choice to word a pattern around.
 * - The literal-body pattern uses a trailing `;` to mean "a DataTable follows" — same
 *   convention the legacy framework used throughout its own step definitions (e.g.
 *   `APIAUT.steps.ts`'s header/body steps) — rather than one pattern with a genuinely
 *   *optional* trailing `dataTable` parameter. That's not a style choice: an `async`
 *   function can't actually have an optional trailing parameter here. Cucumber-JS's own
 *   `UserCodeRunner` appends one callback argument to whatever it supplies, then infers
 *   "callback interface" purely from `fn.length === argsArray.length` after that append —
 *   so the *one* static arity a function can declare has to simultaneously satisfy both
 *   "table attached" and "table absent" invocations of the same pattern, which is only
 *   possible at the exact value that also makes it collide with the callback check when
 *   the table's absent. Verified directly against `user_code_runner.js`/
 *   `step_definition.js`'s own source — not fixable by any parameter-default/rest-param
 *   trick, since `fn.length` is one fixed number either way. Splitting into two
 *   registrations (identical pattern, `;`-terminated or not, each with its own fixed,
 *   non-optional arity) sidesteps the collision entirely — and the `;` doubles as a
 *   signal to the test author, not just to us, that this step needs a table below it.
 * - Every quoted literal (method, resource path, request body) may be delimited by
 *   **either** `'...'` or `"..."`, the test author's choice, and is captured **verbatim**
 *   between the opening and closing delimiter — including the *other* quote character, or
 *   the *same* one appearing again inside, unescaped. Each segment is two alternative
 *   branches, one per delimiter (`(?:'(content)'|"(content)")`), not a captured
 *   delimiter-character plus a numbered backreference (`(['"])(content)\N`) — deliberately:
 *   `alexkrechik.cucumberautocomplete`'s own partial-match builder (used for the VS Code
 *   autocomplete dropdown) wraps every space-separated token of a step's regex in its own
 *   new capturing group, which silently renumbers — and so breaks — any backreference in
 *   the original pattern. Confirmed directly against the extension's installed/upstream
 *   source (`getPartialRegText`/`getPartialRegParts` in `steps.handler.js`): no special
 *   backreference handling exists, and it's unconditional, not something a setting avoids
 *   (unlike `stepsInvariants`'s own, separate backreference-breaking behaviour — safely
 *   enabled in this package's own `.vscode/settings.json`, precisely because no step
 *   pattern here has a backreference left for it to break). The
 *   two-branch form gives the same "must close with the same delimiter it opened with"
 *   guarantee structurally, with no backreference for that renumbering to break — at the
 *   cost of one extra (always-`undefined`-on-one-side) parameter per quoted segment in the
 *   handler signature; each handler resolves the real value via `single ?? double`. A
 *   single step's method, path, and body are independent quoted segments — they don't have
 *   to use the same quote style as each other.
 * - The method is a quoted literal, not a `[bracketed]` reference — `[...]` means "a
 *   reference to something" elsewhere in this repo's convention (an AUT name, a file
 *   path); a method is a literal value like the path or body, and HTTP's method token is
 *   extensible by spec (RFC 9110) — nothing stops an AUT from handling a non-standard verb,
 *   or a test deliberately sending one it *doesn't* handle (e.g. asserting a 405 for an
 *   unsupported method) — so this is never restricted to a fixed enum.
 *
 * ## "[json] body" vs "[xml] body" vs "body" — whether a DataTable override is even legal,
 * and which kind
 *
 * Every literal-body pattern's — quoted, DocString, and test-data-file alike —
 * `(?:\[(json|xml|text)\] )?body` wording is a real, load-bearing fork, not just a cosmetic
 * choice of phrasing — it's captured (not a `(?:...)` non-capturing group), precisely so
 * the real implementation can tell which one a test author actually wrote. The bracketed
 * word is a code-word, per this workspace's own `[...]`-for-code-words-and-references
 * convention (see `~/repos/controlium/PRINCIPLES.md`) — never free text, and omitted
 * entirely, brackets and all, for the `text`-defaults-when-absent case. A body — whether
 * inline or loaded from a file — is declared JSON (`[json] body ...`), XML (`[xml]
 * body ...`), or opaque text (`body ...`); a DataTable override expresses a mutation that
 * only makes sense against a parsed structure of the *matching* kind — `JSON-Path`/`Value`
 * columns for `[json] body`, `XPath`/`Value` columns for `[xml] body` (see
 * `docs/design/request-body-path-mutation.md` for the full mutation rule set) — so
 * attaching one to a bare `body ...` step must throw, even when the underlying text
 * (literal or file contents) happens to parse as valid JSON or XML. The step's own wording
 * is what the test author asserted about the body's shape; this never second-guesses that
 * by sniffing the text itself. (Unrelated to `API_AUTWrapper.request()`'s own
 * `Content-Type` inference, which *does* sniff the body — that's a wire-format header
 * decision, not a "can this DataTable mutate it, and as which kind" decision; the two are
 * independent.)
 *
 * `[yaml] body` is a fourth option on the DocString and test-data-file patterns only — never
 * the quoted-literal (single-line) ones; see {@link resolveLiteralRequestBody}'s own doc
 * comment for why. Its DataTable-modification story is the same as `[json] body`'s —
 * `JSON-Path`/`Value` columns, via the same `JsonUtils.updateJSONObject`, since YAML
 * parses to the exact same plain-object/array/scalar tree JSON does.
 *
 * `[bin] file [...]` is a fifth option on the test-data-file pattern **only** — never the
 * quoted-literal or DocString ones, since genuinely binary content (an image, an archive,
 * deliberately malformed bytes) can never be typed as Gherkin text in the first place; a file
 * is the only possible source. Loaded via {@link APIUtils.resolveBinaryFileRequestBody} —
 * raw bytes, untouched (no detokenising, no trimming, no text parsing of any kind) — and
 * implies `Content-Type: application/octet-stream` unless the test sets its own (same "imply
 * one, caller's own header always wins" convention `json`/`xml`/`yaml` already follow). Like
 * `text`, `bin` has no DataTable story at all — opaque bytes have no structure to mutate — so
 * attaching one throws the same way attaching one to `body ...` already does.
 *
 * The DataTable-only body pattern (no literal/file base at all) is `[json] body` only, not
 * part of the three-way `json`/`xml`/`text` fork above — it reuses exactly the same
 * `JSON-Path`/`Value` DataTable mechanism the "[json] body '...'; + DataTable" pattern uses,
 * just applied against an empty `{}` base instead of a real literal (see that pattern's own
 * doc comment). `xml`/`text` have no equivalent: there's no established "build a whole XML
 * document from path-mutations against nothing" equivalent, and opaque `text` has no
 * structure for a DataTable to mutate at all.
 *
 * Also registers one `Given` — selecting which of an AUT's settings-configured
 * `resourcePathPreambles` is in use for the rest of the session (see
 * `API_AUTWrapper.useResourcePathPreamble`'s own doc comment for the replace-not-accumulate
 * semantics). Lives here, not in `launch.steps.ts`, since it's a request-routing concern —
 * which path every subsequent request actually goes to — not AUT lifecycle. Reset
 * automatically at the end of every test via `API_AUTWrapper.close()` (called by
 * `afterTest()`/`closeAllRegistered()`), same as session headers — never leaks into
 * whichever test runs next.
 *
 * @param cucumber - The `@cucumber/cucumber` module itself, same convention as
 *   `wireCucumberHooks`.
 */
export function wireApiRequestStepDefinitions(cucumber: CucumberGivenWhenAPI): void {
  if (cucumber === null || typeof cucumber !== 'object') {
    throw new Error(
      `wireApiRequestStepDefinitions: [cucumber] must be the '@cucumber/cucumber' module object — received ${cucumber === null ? 'null' : typeof cucumber}`
    );
  }

  const givenType = typeof cucumber.Given;
  if (givenType !== 'function') {
    throw new Error(
      `wireApiRequestStepDefinitions: [cucumber.Given] must be a function — received ${givenType}. Did you pass the '@cucumber/cucumber' module itself?`
    );
  }

  const whenType = typeof cucumber.When;
  if (whenType !== 'function') {
    throw new Error(
      `wireApiRequestStepDefinitions: [cucumber.When] must be a function — received ${whenType}. Did you pass the '@cucumber/cucumber' module itself?`
    );
  }

  const { Given, When } = cucumber;

  /**
   * Selects which of an AUT's settings-configured `resourcePathPreambles` every
   * subsequent request on this AUT uses, via
   * {@link API_AUTWrapper.useResourcePathPreamble} — replaces whatever preamble was
   * selected before, rather than accumulating. Reset automatically at the end of the test.
   *
   * @example
   * Given requests to AUT use resource path preamble [V2]
   * Given requests to [MyApp] use resource path preamble [V1]
   */
  Given(/^requests to (AUT|\[[^[\]]*\]) use resource path preamble \[(.*)\]$/, function (requestTarget: string, name: string) {
    Log.writeLine(LogLevels.TestInformation, `STEP ${requestTarget} uses resource path preamble [${name}]`);
    const aut = API_AUTWrapper.getApplication(resolveAppName(requestTarget));
    aut.useResourcePathPreamble(name);
  });

  /**
   * Issues an HTTP request with no body, via {@link API_AUTWrapper.request}. `method` is
   * a literal, not restricted to a fixed enum — HTTP's method token is extensible by spec
   * (RFC 9110), and a test may deliberately send one an AUT doesn't handle (e.g. asserting
   * a 405).
   *
   * @example
   * When a 'GET' request to AUT path '/users'
   * When a "DELETE" request to [MyApp] path '/users/42'
   */
  When(/^a (?:'([^']*)'|"([^"]*)") request to (AUT|\[[^[\]]*\]) path (?:'([^'\s]*)'|"([^"\s]*)")$/, async function (
    methodSingleQuoted: string | undefined,
    methodDoubleQuoted: string | undefined,
    requestTarget: string,
    pathSingleQuoted: string | undefined,
    pathDoubleQuoted: string | undefined
  ) {
    const method = methodSingleQuoted ?? methodDoubleQuoted as string;
    const resourcePath = pathSingleQuoted ?? pathDoubleQuoted as string;
    Log.writeLine(LogLevels.TestInformation, `STEP: [${method}] request to ${requestTarget} path [${resourcePath}]`);
    const aut = API_AUTWrapper.getApplication(resolveAppName(requestTarget));
    await aut.request(method, resourcePath);
  }
  );

  /**
   * Issues an HTTP request with an inline literal body, via
   * {@link API_AUTWrapper.request}. The body's kind (`body`/`json body`/`xml body`) is
   * load-bearing wording, not cosmetic — see {@link resolveLiteralRequestBody}'s own doc
   * comment for the full three-way fork. No DataTable override — see the trailing-`;`
   * sibling registration below for that (see this function's own doc comment for why
   * these are two separate registrations rather than one with an optional parameter).
   *
   * @example
   * When a 'POST' request to AUT path '/users', body 'plain text body'
   * When a 'POST' request to AUT path '/users', [json] body '{"name": "Bob"}'
   * When a 'POST' request to AUT path '/users', [xml] body '<user><name>Bob</name></user>'
   */
  When(/^a (?:'([^']*)'|"([^"]*)") request to (AUT|\[[^[\]]*\]) path (?:'([^'\s]*)'|"([^"\s]*)"), (?:\[(json|xml|text)\] )?body (?:'(.*)'|"(.*)")$/, async function (
    methodSingleQuoted: string | undefined,
    methodDoubleQuoted: string | undefined,
    requestTarget: string,
    pathSingleQuoted: string | undefined,
    pathDoubleQuoted: string | undefined,
    bodyKind: 'json' | 'xml' | 'text' | undefined,
    bodySingleQuoted: string | undefined,
    bodyDoubleQuoted: string | undefined
  ) {
    const method = methodSingleQuoted ?? methodDoubleQuoted as string;
    const resourcePath = pathSingleQuoted ?? pathDoubleQuoted as string;
    const requestBody = bodySingleQuoted ?? bodyDoubleQuoted as string;
    Log.writeLine(
      LogLevels.TestInformation,
      `STEP: [${method}] request to ${requestTarget} path [${resourcePath}], [${bodyKind ?? 'text'}] body '${requestBody}'`
    );
    const aut = API_AUTWrapper.getApplication(resolveAppName(requestTarget));
    const { body, contentType } = await resolveLiteralRequestBody(bodyKind, requestBody, undefined);
    await aut.request(method, resourcePath, { body, contentType });
  }
  );

  /**
   * Same as the pattern above, but with a mandatory trailing DataTable override
   * (`JSON-Path`/`XPath` | `Value` columns — never legal on opaque `body`, enforced by
   * {@link resolveLiteralRequestBody}). The trailing `;` is the signal — to both Cucumber
   * and the test author — that a DataTable must follow; see this function's own doc
   * comment for why this is a separate registration rather than one shared pattern with
   * an optional `dataTable` parameter.
   *
   * @example
   * When a 'POST' request to AUT path '/users', [json] body '{"name": "Bob"}';
   *   | JSON-Path | Value |
   *   | $.role    | admin |
   * When a 'POST' request to AUT path '/users', [xml] body '<user><name>Bob</name></user>';
   *   | XPath      | Value |
   *   | /user/role | admin |
   */
  When(/^a (?:'([^']*)'|"([^"]*)") request to (AUT|\[[^[\]]*\]) path (?:'([^'\s]*)'|"([^"\s]*)"), (?:\[(json|xml|text)\] )?body (?:'(.*)'|"(.*)");$/, async function (
    methodSingleQuoted: string | undefined,
    methodDoubleQuoted: string | undefined,
    requestTarget: string,
    pathSingleQuoted: string | undefined,
    pathDoubleQuoted: string | undefined,
    bodyKind: 'json' | 'xml' | 'text' | undefined,
    bodySingleQuoted: string | undefined,
    bodyDoubleQuoted: string | undefined,
    dataTable: DataTable
  ) {
    const method = methodSingleQuoted ?? methodDoubleQuoted as string;
    const resourcePath = pathSingleQuoted ?? pathDoubleQuoted as string;
    const requestBody = bodySingleQuoted ?? bodyDoubleQuoted as string;
    Log.writeLine(
      LogLevels.TestInformation,
      `STEP: [${method}] request to ${requestTarget} path [${resourcePath}], [${bodyKind ?? 'text'}] body '${requestBody}'; (+ DataTable)`
    );
    const aut = API_AUTWrapper.getApplication(resolveAppName(requestTarget));
    const { body, contentType } = await resolveLiteralRequestBody(bodyKind, requestBody, dataTable);
    await aut.request(method, resourcePath, { body, contentType });
  }
  );

  /**
   * Issues an HTTP request with a DocString literal body, via {@link API_AUTWrapper.request}
   * — the multi-line equivalent of the quoted-literal pattern above, for bodies that need to
   * span more than one physical line (a quoted literal is necessarily single-line, since
   * Gherkin step text itself is always one line). No DataTable override — deliberately: a
   * DocString and a DataTable override together would be a daft thing to need (the DocString
   * already IS the structured content; there is nothing left for a DataTable to mutate that
   * couldn't just be written into the DocString directly).
   *
   * The DocString's own media-type tag (`"""json`, `"""xml`, etc.) is never inspected —
   * Cucumber-JS itself discards it before a step handler is ever invoked (confirmed against
   * `@cucumber/cucumber`'s own `models/step_definition.js` source: `docString: (arg) =>
   * arg.content` — `mediaType` never reaches here), so there would be nothing to read even
   * if this cared to. The body's kind is always determined purely from the
   * `(json|xml|text|yaml)` word captured in the step's own text.
   *
   * `yaml` is only recognised here (and on the test-data-file pattern below) — never on the
   * quoted-literal (single-line) patterns above. Idiomatic, block-style YAML is inherently
   * multi-line, which is the entire reason this DocString registration exists at all; see
   * {@link resolveLiteralRequestBody}'s own doc comment for the full reasoning.
   *
   * ## Line endings
   *
   * Gherkin always normalises a DocString's own line breaks to `\n`, regardless of whether
   * the feature file itself uses LF or CRLF (confirmed directly against `@cucumber/gherkin`
   * — a CRLF-delimited feature file still yields `\n`-only DocString content). `body:` alone
   * leaves that `\n` untouched ("lf", the default). An optional `('<escaped>' line endings)`
   * clause before the `:` substitutes a different separator for every `\n` in the content
   * (including ones produced by trailing blank lines before the closing `"""` — Gherkin
   * counts a blank line immediately before the closer as real trailing content, one `\n` per
   * blank line, confirmed empirically; there is no implicit extra terminator beyond that).
   *
   * `<escaped>` uses `/` as its escape character (matching `Detokeniser`'s own choice, for a
   * consistent mental model across this repo) — though this grammar is deliberately NOT
   * routed through `Detokeniser` itself, to avoid entangling this with Detokeniser's own
   * escaping, which is separately flagged as needing a from-scratch redesign. See
   * {@link StringUtils.resolveLineEndingEscape} for the implementation (shared, runner-
   * agnostic — any other test runner's own equivalent needs the identical grammar); in
   * summary:
   * - `/n` `/r` `/t` `/b` `/f` `/v` `/0` — the standard C-family/ECMAScript single-letter
   *   escapes (LF/CR/TAB/backspace/form-feed/vertical-tab/NUL) — `/n`, not `/lf`: exactly
   *   what `\n` etc. mean in a JS string literal, just introduced by `/` instead of `\`.
   * - `/#<number>;` — an arbitrary character by code point, terminated by `;` (so a literal
   *   digit can immediately follow without ambiguity — the same convention HTML's own
   *   `&#NNN;` numeric character references use). `<number>` is **decimal** by default
   *   (`/#65;` → `'A'`) — deliberately not hex, so a non-technical test author never needs
   *   to understand a base other than the one they already use daily — but a `0x`/`0o`/`0b`
   *   prefix opts into hex/octal/binary (`/#0x41;`, `/#0o101;`, `/#0b1000001;`), via
   *   `Number()`'s own native prefix handling, not bespoke per-base parsing.
   * - `//` — a literal `/`.
   * - Any other character, not preceded by `/`, is literal, verbatim.
   * - Anything else after a `/` throws — never silently guessed, same rule as every other
   *   cast in this codebase (`number:`/`boolean:`/etc.).
   *
   * @example
   * When a 'POST' request to AUT path '/users', [json] body:
   *   """
   *   {"name": "Bob"}
   *   """
   * When a 'POST' request to AUT path '/users', body ('/r/n' line endings):
   *   """
   *   line one
   *   line two
   *   """
   */
  When(/^a (?:'([^']*)'|"([^"]*)") request to (AUT|\[[^[\]]*\]) path (?:'([^'\s]*)'|"([^"\s]*)"), (?:\[(json|xml|text|yaml)\] )?body(?: \((?:'(.*)'|"(.*)") line endings\))?:$/, async function (
    methodSingleQuoted: string | undefined,
    methodDoubleQuoted: string | undefined,
    requestTarget: string,
    pathSingleQuoted: string | undefined,
    pathDoubleQuoted: string | undefined,
    bodyKind: 'json' | 'xml' | 'yaml' | 'text' | undefined,
    lineEndingEscapeSingleQuoted: string | undefined,
    lineEndingEscapeDoubleQuoted: string | undefined,
    docStringContent: string
  ) {
    const method = methodSingleQuoted ?? methodDoubleQuoted as string;
    const resourcePath = pathSingleQuoted ?? pathDoubleQuoted as string;
    const lineEndingEscapeText = lineEndingEscapeSingleQuoted ?? lineEndingEscapeDoubleQuoted;
    const lineEnding = StringUtils.resolveLineEndingEscape(lineEndingEscapeText);
    const requestBody = lineEnding === '\n' ? docStringContent : docStringContent.split('\n').join(lineEnding);
    Log.writeLine(
      LogLevels.TestInformation,
      `STEP: [${method}] request to ${requestTarget} path [${resourcePath}], [${bodyKind ?? 'text'}] body from DocString (${docStringContent.length} chars)`
    );
    const aut = API_AUTWrapper.getApplication(resolveAppName(requestTarget));
    const { body, contentType } = await resolveLiteralRequestBody(bodyKind, requestBody, undefined);
    await aut.request(method, resourcePath, { body, contentType });
  }
  );

  /**
   * Issues an HTTP request with a body loaded from a test-data file, via
   * {@link API_AUTWrapper.request} — same body-kind fork and the same downstream
   * parse/mutate/beautify/Content-Type handling as the quoted-literal and DocString
   * patterns above for `json`/`xml`/`yaml`/`text` ({@link resolveLiteralRequestBody}, via
   * {@link resolveFileRequestBody}), just sourced from a file instead of the step's own
   * text — loaded via {@link ValueExpression.parse}'s plain `file:` source (the configured
   * test-data root, detokenised path then content, same as every other file-sourced value
   * in this package). `bin` forks away from all of that entirely — see
   * {@link resolveFileRequestBody}'s own doc comment. No DataTable override — see the
   * trailing-`;` sibling registration below for that (see this function's own doc comment
   * for why these are two separate registrations rather than one with an optional
   * parameter).
   *
   * @example
   * When a 'POST' request to AUT path '/users', [json] file [users/newUser.json]
   * When a 'POST' request to AUT path '/users', [xml] file [users/newUser.xml]
   * When a 'POST' request to AUT path '/users', [yaml] file [users/newUser.yaml]
   * When a 'POST' request to AUT path '/users', file [users/rawBody.txt]
   * When a 'POST' request to AUT path '/upload', [bin] file [images/photo.png]
   */
  When(/^a (?:'([^']*)'|"([^"]*)") request to (AUT|\[[^[\]]*\]) path (?:'([^'\s]*)'|"([^"\s]*)"), (?:\[(json|xml|text|yaml|bin)\] )?file \[(.*)\]$/, async function (
    methodSingleQuoted: string | undefined,
    methodDoubleQuoted: string | undefined,
    requestTarget: string,
    pathSingleQuoted: string | undefined,
    pathDoubleQuoted: string | undefined,
    bodyKind: 'json' | 'xml' | 'yaml' | 'text' | 'bin' | undefined,
    filename: string
  ) {
    const method = methodSingleQuoted ?? methodDoubleQuoted as string;
    const resourcePath = pathSingleQuoted ?? pathDoubleQuoted as string;
    Log.writeLine(
      LogLevels.TestInformation,
      `STEP: [${method}] request to ${requestTarget} path [${resourcePath}], [${bodyKind ?? 'text'}] body from test data file [${filename}]`
    );
    const aut = API_AUTWrapper.getApplication(resolveAppName(requestTarget));
    const { body, contentType } = await resolveFileRequestBody(bodyKind, filename, undefined);
    await aut.request(method, resourcePath, { body, contentType });
  }
  );

  /**
   * Same as the pattern above, but with a mandatory trailing DataTable override
   * (`JSON-Path`/`XPath` | `Value` columns — never legal on opaque `body` or `bin`,
   * enforced by {@link resolveLiteralRequestBody}/{@link resolveFileRequestBody}
   * respectively). The trailing `;` is the signal — to both Cucumber and the test author —
   * that a DataTable must follow; see this function's own doc comment for why this is a
   * separate registration rather than one shared pattern with an optional `dataTable`
   * parameter.
   *
   * @example
   * When a 'POST' request to AUT path '/users', [json] file [users/newUser.json];
   *   | JSON-Path | Value |
   *   | $.role    | admin |
   */
  When(/^a (?:'([^']*)'|"([^"]*)") request to (AUT|\[[^[\]]*\]) path (?:'([^'\s]*)'|"([^"\s]*)"), (?:\[(json|xml|text|yaml|bin)\] )?file \[(.*)\];$/, async function (
    methodSingleQuoted: string | undefined,
    methodDoubleQuoted: string | undefined,
    requestTarget: string,
    pathSingleQuoted: string | undefined,
    pathDoubleQuoted: string | undefined,
    bodyKind: 'json' | 'xml' | 'yaml' | 'text' | 'bin' | undefined,
    filename: string,
    dataTable: DataTable
  ) {
    const method = methodSingleQuoted ?? methodDoubleQuoted as string;
    const resourcePath = pathSingleQuoted ?? pathDoubleQuoted as string;
    Log.writeLine(
      LogLevels.TestInformation,
      `STEP: [${method}] request to ${requestTarget} path [${resourcePath}], [${bodyKind ?? 'text'}] body from test data file [${filename}]; (+ DataTable)`
    );
    const aut = API_AUTWrapper.getApplication(resolveAppName(requestTarget));
    const { body, contentType } = await resolveFileRequestBody(bodyKind, filename, dataTable);
    await aut.request(method, resourcePath, { body, contentType });
  }
  );

  /**
   * Issues an HTTP request whose JSON body is built entirely from a DataTable
   * (`JSON-Path`/`Value` columns) — no literal/file base at all. Reuses exactly the same
   * mechanism as the "[json] body '...'; + DataTable" pattern above
   * ({@link resolveModifications} / {@link APIUtils.resolveLiteralRequestBody}), just
   * applied against an empty `{}` base instead of a real literal — so a tester uses the
   * identical JSON-Path convention (nesting, array indices, casts) everywhere a JSON body
   * takes a DataTable, whether or not a literal base happens to be present, rather than a
   * second, flat-only convention that only applies when there's no literal base.
   *
   * `json` only — not `xml`/`text`: {@link JsonUtils.updateJSONObject} happily creates
   * missing intermediate objects/arrays along a path, so JSONPath mutations against an
   * empty `{}` base can build an arbitrarily nested JSON document from nothing; there's no
   * equivalent "create missing elements" behaviour for XML here, and opaque `text` has no
   * structure for a DataTable to mutate at all. The trailing `;` is mandatory (not
   * optional, unlike the literal/file-sourced patterns above) — with no literal/file base, a
   * DataTable is this pattern's *only* possible source of data, so omitting it means the
   * step's own text simply doesn't match any registration (Cucumber's own "no step
   * definition found"), rather than a runtime check inside the handler catching it after
   * the fact.
   *
   * @example
   * When a 'POST' request to AUT path '/users', json body;
   *   | JSON-Path | Value     |
   *   | $.name    | Bob       |
   *   | $.age     | number:42 |
   */
  When(/^a (?:'([^']*)'|"([^"]*)") request to (AUT|\[[^[\]]*\]) path (?:'([^'\s]*)'|"([^"\s]*)"), json body;$/, async function (
    methodSingleQuoted: string | undefined,
    methodDoubleQuoted: string | undefined,
    requestTarget: string,
    pathSingleQuoted: string | undefined,
    pathDoubleQuoted: string | undefined,
    dataTable: DataTable
  ) {
    const method = methodSingleQuoted ?? methodDoubleQuoted as string;
    const resourcePath = pathSingleQuoted ?? pathDoubleQuoted as string;
    Log.writeLine(
      LogLevels.TestInformation,
      `STEP: [${method}] request to ${requestTarget} path [${resourcePath}], [json] body built entirely from DataTable`
    );
    const aut = API_AUTWrapper.getApplication(resolveAppName(requestTarget));
    const modifications = await resolveModifications('JSON-Path', dataTable);
    const { body, contentType } = await APIUtils.resolveLiteralRequestBody('json', '{}', modifications);
    await aut.request(method, resourcePath, { body, contentType });
  }
  );
}
