import type { DataTable, Then as CucumberThen } from '@cucumber/cucumber';

/**
 * The slice of `@cucumber/cucumber` `wireApiValidationStepDefinitions` needs.
 */
export interface CucumberThenAPI {
  Then: typeof CucumberThen;
}

function notImplemented(pattern: string): never {
  throw new Error(`[cucumber-driver stepdefs] "${pattern}" is registered but not implemented yet.`);
}

/**
 * Registers step definitions for validating a local API-based AUT's own responses
 * (status code, body/JSON content). Every body is a stub that throws when actually
 * invoked by a scenario; see `headers.steps.ts`/`request.steps.ts` for why.
 *
 * Same conventions as those two files (see their own doc comments for the full reasoning,
 * not repeated here): no "detokenised" wording fork, no trailing `;` marker (the literal/
 * test-data-file `json data` patterns take an optional trailing DataTable override instead),
 * and every quoted literal (status code, body value) may be delimited by either `'...'` or
 * `"..."`, captured verbatim via two alternative branches, one per delimiter
 * (`(?:'(.*)'|"(.*)")`) — not a captured delimiter character plus a numbered backreference;
 * see `headers.steps.ts`'s own doc comment for why that form specifically breaks this
 * package's VS Code autocomplete. Independent quoted segments within one step don't have to
 * use the same quote style as each other.
 *
 * Deliberately excludes any "Last intercepted [...] request..." steps — those would
 * validate the AUT's own *outbound* calls to its mocked dependencies (a `mocking/`
 * concern), not the AUT's own endpoints, so they're out of scope here.
 *
 * Also excludes "AUT is running" — parked in `launch.steps.ts` for now; see that file's
 * own doc comment for why.
 *
 * @param cucumber - The `@cucumber/cucumber` module itself, same convention as
 *   `wireCucumberHooks`.
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

  Then(/^Response status is (?:'(\d*)'|"(\d*)")$/, function (_statusCodeSingleQuoted: string | undefined, _statusCodeDoubleQuoted: string | undefined) {
    notImplemented("Response status is '###'/\"###\"");
  });

  Then(/^Response status is (?:'(\d*)'|"(\d*)"), body (?:'(.*)'|"(.*)")$/, function (
      _statusCodeSingleQuoted: string | undefined,
      _statusCodeDoubleQuoted: string | undefined,
      _expectedValueSingleQuoted: string | undefined,
      _expectedValueDoubleQuoted: string | undefined
    ) {
      notImplemented("Response status is '###', body '...'");
    }
  );

  Then(/^Response status is (?:'(\d*)'|"(\d*)"), body \[(.*)\] (?:'(.*)'|"(.*)")$/, function (
      _statusCodeSingleQuoted: string | undefined,
      _statusCodeDoubleQuoted: string | undefined,
      _jsonPath: string,
      _expectedValueSingleQuoted: string | undefined,
      _expectedValueDoubleQuoted: string | undefined
    ) {
      notImplemented("Response status is '###', body [jsonPath] '...'");
    }
  );

  Then(/^Response status is (?:'(\d*)'|"(\d*)"), body from test data file \[(.*)\]$/, function (
      _statusCodeSingleQuoted: string | undefined,
      _statusCodeDoubleQuoted: string | undefined,
      _filename: string
    ) {
      notImplemented("Response status is '###', body from test data file [...]");
    }
  );

  Then(/^Response status is (?:'(\d*)'|"(\d*)"), body \[(.*)\] from test data file \[(.*)\]$/, function (
      _statusCodeSingleQuoted: string | undefined,
      _statusCodeDoubleQuoted: string | undefined,
      _jsonPath: string,
      _filename: string
    ) {
      notImplemented("Response status is '###', body [jsonPath] from test data file [...]");
    }
  );

  Then(/^Response status is (?:'(\d*)'|"(\d*)"), json data$/, function (
      _statusCodeSingleQuoted: string | undefined,
      _statusCodeDoubleQuoted: string | undefined,
      _dataTable: DataTable
    ) {
      notImplemented("Response status is '###', json data (DataTable required)");
    }
  );

  Then(/^Response status is (?:'(\d*)'|"(\d*)"), json data (?:'(.*)'|"(.*)")$/, function (
      _statusCodeSingleQuoted: string | undefined,
      _statusCodeDoubleQuoted: string | undefined,
      _literalJsonSingleQuoted: string | undefined,
      _literalJsonDoubleQuoted: string | undefined,
      _dataTable?: DataTable
    ) {
      notImplemented("Response status is '###', json data '...' (DataTable override optional)");
    }
  );

  Then(/^Response status is (?:'(\d*)'|"(\d*)"), json data from test data file \[(.*)\]$/, function (
      _statusCodeSingleQuoted: string | undefined,
      _statusCodeDoubleQuoted: string | undefined,
      _filename: string,
      _dataTable?: DataTable
    ) {
      notImplemented("Response status is '###', json data from test data file [...] (DataTable override optional)");
    }
  );
}
