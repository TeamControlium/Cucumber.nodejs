import type { After, AfterAll, Before, BeforeAll, BeforeStep, ITestStepHookParameter, IWorld, setDefaultTimeout } from '@cucumber/cucumber';
import he from 'he';

import { LifecycleHooks, SettingsRegistry } from '@controlium/framework';
import { Detokeniser, Logger, LogLevels, Settings, Utils } from '@controlium/utils';

export {
  wireAllStepDefinitions,
  wireHousekeepingStepDefinitions,
  wireEnvironmentStepDefinitions,
  wireLoggingStepDefinitions,
  wireApiStepDefinitions,
  wireApiLaunchStepDefinitions,
  wireApiHeaderStepDefinitions,
  wireApiQueryStringStepDefinitions,
  wireApiRequestStepDefinitions,
  wireApiValidationStepDefinitions,
  wireApiHeaderValidationStepDefinitions,
} from './stepdefs/index.js';
export type {
  CucumberAllStepDefinitionsAPI,
  CucumberHousekeepingGivenWhenAPI,
  CucumberGivenWhenThenAPI,
  CucumberGivenThenAPI,
  CucumberHeadersGivenWhenAPI,
  CucumberQueryStringGivenWhenAPI,
  CucumberRequestGivenWhenAPI,
  CucumberThenAPI,
  CucumberHeaderValidationThenAPI,
} from './stepdefs/index.js';

export { resolveDataTableRows } from './dataTable/cucumberDataTable.js';

/**
 * Builds a {@link Logger.logOutputCallback} that forwards log output to this scenario's
 * `world.attach` — plain-text log lines get HTML-entity-encoded first (via `he`), since an
 * HTML-based report formatter would otherwise risk misinterpreting characters like `<`/`&`
 * in ordinary log text as markup; anything with an explicit `mediaType` (HTML attachments,
 * base64 screenshots, etc.) is passed through as-is.
 */
function buildAttachCallback(world: IWorld): (text: string, mediaType: string | undefined) => void {
  return (text: string, mediaType: string | undefined): void => {
    if (Utils.isUndefined(mediaType) || (mediaType ?? '') == 'text/plain') {
      world.attach(he.encode(text));
    } else {
      world.attach(text, mediaType);
    }
  };
}

/**
 * The slice of the `@cucumber/cucumber` module `wireCucumberHooks` actually needs.
 * Deliberately narrower than `typeof import('@cucumber/cucumber')` — this function has
 * no business requiring the other ~30 exports (formatters, `Given`/`When`/`Then`, etc.),
 * and a narrow structural type is what makes this trivially testable with a plain fake
 * object rather than the real module or a full-shape mock.
 */
export interface CucumberHookAPI {
  BeforeAll: typeof BeforeAll;
  Before: typeof Before;
  BeforeStep: typeof BeforeStep;
  After: typeof After;
  AfterAll: typeof AfterAll;
}

/**
 * Enforces this package's `;`-terminated step wording convention both ways: a step's text
 * ends in `;` exactly when a DataTable is attached to it. Registered once, via
 * {@link wireCucumberHooks}'s `BeforeStep` call, against every step in every feature, so it
 * catches every `;`-terminated pattern's mismatches at once, with no check needed inside
 * any individual handler.
 *
 * Cucumber-JS catches both mismatches on its own, but never names the DataTable as the
 * cause:
 * - Missing table: every table-consuming handler here is `async function(..., dataTable)`.
 *   Drop the table and Cucumber's resolved parameter count drops to match that handler's
 *   arity once `UserCodeRunner.run` appends its own callback argument — satisfying both its
 *   callback-style and (since the handler is `async`) promise-style checks at once. Result:
 *   "function uses multiple asynchronous interfaces: callback and promise", no mention of a
 *   table.
 * - Unexpected table: `StepDefinition.getInvocationParameters`'s `validCodeLengths` check in
 *   `step_runner.js` fails the call before the handler runs — "function has N arguments,
 *   should have M…" — again, no mention of a table.
 *
 * A `BeforeStep` hook catches both before either generic error fires, reading the step's
 * text and argument straight off the pickle, and reports the actual problem instead.
 *
 * @throws {Error} If `pickleStep.text`'s trailing `;` disagrees with whether
 *   `pickleStep.argument.dataTable` is present. Names the step text with its
 *   `Given`/`When`/`Then` keyword restored (Gherkin's pickle compiler drops it from `text`
 *   and normalises `And`/`But` into one of the three — see `PickleStepType` in
 *   `@cucumber/messages`). Logged at `Error` level before throwing, so it's on record
 *   either way.
 */
function guardStepDataTableExistance({ pickleStep }: ITestStepHookParameter): void {
  const keyword =
    pickleStep.type === 'Context' ? 'Given' :
      pickleStep.type === 'Action' ? 'When' :
        pickleStep.type === 'Outcome' ? 'Then' :
          '<Step>';
  const endsWithSemicolon = pickleStep.text.endsWith(';');
  const hasDataTable = !Utils.isUndefined(pickleStep.argument?.dataTable);
  if (endsWithSemicolon === hasDataTable) return;

  const mismatch = endsWithSemicolon ? 'but has no Data Table' : 'but has a Data Table';
  const errText = `Step terminated ${endsWithSemicolon ? 'with' : 'without'} [;] ${mismatch}! Step: [${keyword} ${pickleStep.text}]`;
  const errDetails = `Framework uses a step's trailing semicolon [;] to indicate a Cucumber DataTable follows the step. ${endsWithSemicolon ? 'Semi-colon terminated steps must have a Data Table.' : 'If step has a Data Table step text must terminate with a semi-colon.'}`;

  Logger.writeLine(LogLevels.Error, `${errText}\n\n${errDetails}`, { suppressAllPreamble: true });
  throw new Error(errText);
}

/**
 * Wires `@controlium/framework`'s runner-agnostic lifecycle functions into Cucumber-JS's
 * native hooks. Pure convenience, nothing more — a suite could always call the four
 * functions by hand from its own `BeforeAll`/`Before`/`After`/`AfterAll`
 * (see `docs/design/test-runner-interface.md` in `@controlium/framework`); this just
 * saves writing that out.
 *
 * @param cucumber - The `@cucumber/cucumber` module itself
 *   (`import * as Cucumber from '@cucumber/cucumber'`), passed in rather than imported
 *   directly here so the calling support file controls exactly which Cucumber instance
 *   gets wired.
 *
 * @example
 * // features/support/hooks.ts
 * import * as Cucumber from '@cucumber/cucumber';
 * import { wireCucumberHooks } from '@controlium/cucumber';
 *
 * wireCucumberHooks(Cucumber);
 *
 * Also binds each test's Cucumber World to `@controlium/utils`'s `Settings` context
 * (`Settings.setContext`/`clearContext`) for the duration of that test, so
 * `profileParameterName`-sourced settings (Detokeniser, bootstrapping, anywhere else) can
 * resolve against the World without it being threaded through explicitly.
 *
 * @param cucumber - The `@cucumber/cucumber` module itself
 *   (`import * as Cucumber from '@cucumber/cucumber'`), passed in rather than imported
 *   directly here so the calling support file controls exactly which Cucumber instance
 *   gets wired.
 *
 * @example
 * // features/support/hooks.ts
 * import * as Cucumber from '@cucumber/cucumber';
 * import { wireCucumberHooks } from '@controlium/cucumber';
 *
 * wireCucumberHooks(Cucumber);
 *
 * @throws {Error} if `cucumber` isn't an object exposing `BeforeAll`/`Before`/`After`/
 *   `AfterAll` as functions — i.e. isn't actually the `@cucumber/cucumber` module.
 */
export function wireCucumberHooks(cucumber: CucumberHookAPI): void {
  if (cucumber === null || typeof cucumber !== 'object') {
    throw new Error(
      `wireCucumberHooks: [cucumber] must be the '@cucumber/cucumber' module object — received ${cucumber === null ? 'null' : typeof cucumber}`
    );
  }

  (['BeforeAll', 'Before', 'BeforeStep', 'After', 'AfterAll'] as const).forEach((hookName) => {
    if (typeof cucumber[hookName] !== 'function') {
      throw new Error(
        `wireCucumberHooks: [cucumber.${hookName}] must be a function — received ${typeof cucumber[hookName]}. Did you pass the '@cucumber/cucumber' module itself?`
      );
    }
  });

  cucumber.BeforeAll(LifecycleHooks.beforeSuite);

  // Runs before every step, in every feature — see guardStepDataTableExistance's
  // own doc comment for why this check belongs here, as a BeforeStep hook, rather than inside
  // any individual step definition's own handler.
  cucumber.BeforeStep(guardStepDataTableExistance);

  // Cucumber runs Before hooks in registration order. Settings.setContext runs before
  // beforeTest() — not after — because beforeTest() itself now resolves/applies
  // Logger.loggingLevel/maxLines from settings (see @controlium/framework's own doc comment
  // on beforeTest), and a profileParameterName-sourced setting (e.g. $.logLevel) can only
  // resolve correctly once Settings' context is actually bound to this test's World/parameters.
  cucumber.Before({ name: 'Controlium framework: Cucumber logging callback & settings context' }, async function (this: IWorld) {
    Logger.logOutputCallback = buildAttachCallback(this);
    Logger.writeLine(LogLevels.TestInformation, 'Started test.\n - Wired Framework logger output to Cucumber world.attach');
    // `this.parameters` — NOT `this` — is the object `profileParameterName` JSONPaths (e.g.
    // API_AUTWrapper.loadSettings's `$.testAUTs.<appName>.port`) actually need to
    // query: it's Cucumber's own worldParameters bag (from cucumber.js's `worldParameters`),
    // the thing a profile's settings actually land on. `this` itself is the World wrapper
    // (attach/log/link/parameters) — passing it directly would make every JSONPath miss,
    // since `testAUTs` lives at `this.parameters.testAUTs`, not `this.testAUTs`.
    // Confirmed against Cucumber-JS's own `IWorld` shape directly — `worldParameters` always
    // lands under `.parameters`, never spread onto the World object itself.
    Settings.setContext({ sourceName: 'World', parameters: this.parameters });
    //
    // Detokeniser defaultr delimiter is '|'.  This wont work with Cucumber due to | being used as
    // a column delimiter in a DataTable.  So change to ';'.
    Detokeniser.delimiter = ';';
    await LifecycleHooks.beforeTest();
  });

  // afterTest() itself now clears Settings' context and Logger's output callback — see
  // its own doc comment in @controlium/framework. That clearing moved there specifically so
  // no driver (this one, a future jest-driver, anything else) has to independently remember
  // to do it — a driver's own Before-side wiring only ever SETS this ambient state (which
  // afterTest() structurally can't do itself, since it never receives the runner's own
  // World/context), never clears it.
  cucumber.After({ name: 'Controlium framework: end test' }, LifecycleHooks.afterTest);

  cucumber.AfterAll(LifecycleHooks.afterSuite);
}

/**
 * The slice of the `@cucumber/cucumber` module `wireCucumberStepTimeout` actually needs.
 * See {@link CucumberHookAPI} for why this is deliberately narrow.
 */
export interface CucumberTimeoutAPI {
  setDefaultTimeout: typeof setDefaultTimeout;
}

/**
 * Resolves a default Cucumber step timeout via `@controlium/framework`'s
 * `SettingsRegistry.resolve('Default Step Timeout', overrides)` (env var, then npm package
 * config, then the given default) and applies it with `cucumber.setDefaultTimeout`. Separate
 * from {@link wireCucumberHooks} — order-independent, and a suite that wants to resolve/set
 * its own timeout is free to skip this entirely.
 *
 * Overrides the registered setting's own generic defaults with this driver's established env
 * var/npm-config naming (`CUCUMBER_STEP_TIMEOUT`/`testStepTimeout`) via `SettingsRegistry.resolve`'s
 * own per-call `overrides` parameter — unchanged from before this resolution logic moved into
 * `@controlium/framework`, so existing suites' configuration keeps working exactly as it did.
 *
 * @param cucumber - The `@cucumber/cucumber` module itself, same convention as
 *   {@link wireCucumberHooks}.
 * @param options - Setting-resolution overrides:
 *   - `processEnvName` — Environment variable checked first (default: `CUCUMBER_STEP_TIMEOUT`).
 *   - `npmPackageConfigName` — npm package config key checked second (default: `testStepTimeout`).
 *   - `defaultValue` — Fallback if neither source resolves (default: `30000`).
 *
 * @example
 * // features/support/hooks.ts
 * import * as Cucumber from '@cucumber/cucumber';
 * import { wireCucumberStepTimeout } from '@controlium/cucumber';
 *
 * wireCucumberStepTimeout(Cucumber);
 *
 * @throws {Error} if `cucumber` isn't an object exposing `setDefaultTimeout` as a function.
 */
export function wireCucumberStepTimeout(
  cucumber: CucumberTimeoutAPI,
  options?: {
    processEnvName?: string;
    npmPackageConfigName?: string;
    defaultValue?: number;
  }
): void {
  if (cucumber === null || typeof cucumber !== 'object') {
    throw new Error(
      `wireCucumberStepTimeout: [cucumber] must be the '@cucumber/cucumber' module object — received ${cucumber === null ? 'null' : typeof cucumber}`
    );
  }

  if (typeof cucumber.setDefaultTimeout !== 'function') {
    throw new Error(
      `wireCucumberStepTimeout: [cucumber.setDefaultTimeout] must be a function — received ${typeof cucumber.setDefaultTimeout}. Did you pass the '@cucumber/cucumber' module itself?`
    );
  }

  const timeoutMs = SettingsRegistry.resolve<number>('Default Step Timeout', {
    processEnvName: options?.processEnvName ?? 'CUCUMBER_STEP_TIMEOUT',
    npmPackageConfigName: options?.npmPackageConfigName ?? 'testStepTimeout',
    defaultValue: options?.defaultValue ?? 30000,
  });

  cucumber.setDefaultTimeout(timeoutMs);
}
