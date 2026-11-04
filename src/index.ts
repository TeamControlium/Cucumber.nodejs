import type { After, AfterAll, Before, BeforeAll, IWorld, setDefaultTimeout } from '@cucumber/cucumber';
import he from 'he';

import { afterSuite, afterTest, beforeSuite, beforeTest, resolveStepTimeoutFromSettings } from '@controlium/framework';
import { Logger, LogLevels, Settings, Utils } from '@controlium/utils';

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
} from './stepdefs/index.js';

export { getDataTableRows } from './dataTable/cucumberDataTable.js';

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
  After: typeof After;
  AfterAll: typeof AfterAll;
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
 * import { wireCucumberHooks } from '@controlium/cucumber-driver';
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
 * import { wireCucumberHooks } from '@controlium/cucumber-driver';
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

  (['BeforeAll', 'Before', 'After', 'AfterAll'] as const).forEach((hookName) => {
    if (typeof cucumber[hookName] !== 'function') {
      throw new Error(
        `wireCucumberHooks: [cucumber.${hookName}] must be a function — received ${typeof cucumber[hookName]}. Did you pass the '@cucumber/cucumber' module itself?`
      );
    }
  });

  cucumber.BeforeAll(beforeSuite);

  // Cucumber runs Before hooks in registration order. Settings.setContext runs before
  // beforeTest() — not after — because beforeTest() itself now resolves/applies
  // Logger.loggingLevel/maxLines from settings (see @controlium/framework's own doc comment
  // on beforeTest), and a profileParameterName-sourced setting (e.g. $.logLevel) can only
  // resolve correctly once Settings' context is actually bound to this test's World/parameters.
  cucumber.Before({ name: 'Controlium framework: Cucumber logging callback & settings context' }, async function (this: IWorld) {
    Logger.logOutputCallback = buildAttachCallback(this);
    Logger.writeLine(LogLevels.TestInformation,'Started test.\n - Wired Framework logger output to Cucumber world.attach');
    // `this.parameters` — NOT `this` — is the object `profileParameterName` JSONPaths (e.g.
    // API_AUTWrapper.loadSettings's `$.testAUTDetails.<appName>.port`) actually need to
    // query: it's Cucumber's own worldParameters bag (from cucumber.js's `worldParameters`),
    // the thing a profile's settings actually land on. `this` itself is the World wrapper
    // (attach/log/link/parameters) — passing it directly would make every JSONPath miss,
    // since `testAUTDetails` lives at `this.parameters.testAUTDetails`, not `this.testAUTDetails`.
    // Confirmed against Cucumber-JS's own `IWorld` shape directly — `worldParameters` always
    // lands under `.parameters`, never spread onto the World object itself.
    Settings.setContext({ sourceName: 'World', parameters: this.parameters });
    await beforeTest();
  });

  // afterTest() itself now clears Settings' context and Logger's output callback — see
  // its own doc comment in @controlium/framework. Per [[feedback_test_atomicity_non_negotiable]],
  // that clearing moved there specifically so no driver (this one, a future jest-driver,
  // anything else) has to independently remember to do it — a driver's own Before-side
  // wiring only ever SETS this ambient state (which afterTest() structurally can't do
  // itself, since it never receives the runner's own World/context), never clears it.
  cucumber.After({ name: 'Controlium framework: end test' }, afterTest);

  cucumber.AfterAll(afterSuite);
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
 * {@link resolveStepTimeoutFromSettings} (env var, then npm package config, then the given
 * default) and applies it with `cucumber.setDefaultTimeout`. Separate from
 * {@link wireCucumberHooks} — order-independent, and a suite that wants to resolve/set its
 * own timeout is free to skip this entirely.
 *
 * Overrides `resolveStepTimeoutFromSettings`'s own generic defaults with this driver's
 * established env var/npm-config naming (`CUCUMBER_STEP_TIMEOUT`/`testStepTimeout`) — unchanged
 * from before this resolution logic moved into `@controlium/framework`, so existing suites'
 * configuration keeps working exactly as it did.
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
 * import { wireCucumberStepTimeout } from '@controlium/cucumber-driver';
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

  const timeoutMs = resolveStepTimeoutFromSettings({
    processEnvName: options?.processEnvName ?? 'CUCUMBER_STEP_TIMEOUT',
    npmPackageConfigName: options?.npmPackageConfigName ?? 'testStepTimeout',
    defaultValue: options?.defaultValue ?? 30000,
  });

  cucumber.setDefaultTimeout(timeoutMs);
}
