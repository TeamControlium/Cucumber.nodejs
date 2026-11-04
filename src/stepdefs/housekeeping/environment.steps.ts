import type { Given as CucumberGiven } from '@cucumber/cucumber';
import { Utils, Log, LogLevels } from '@controlium/utils';

/**
 * The slice of `@cucumber/cucumber` `wireEnvironmentStepDefinitions` needs.
 */
export interface CucumberGivenAPI {
  Given: typeof CucumberGiven;
}

/**
 * Registers step definitions for setting/resetting process environment variables for the
 * duration of a test — runner-agnostic, AUT-agnostic housekeeping, not specific to API-based
 * or Browser-based AUTs (hence living under `housekeeping/`, not `api/`).
 *
 * @param cucumber - The `@cucumber/cucumber` module itself, same convention as
 *   `wireCucumberHooks`.
 */
export function wireEnvironmentStepDefinitions(cucumber: CucumberGivenAPI): void {
  if (cucumber === null || typeof cucumber !== 'object') {
    throw new Error(
      `wireEnvironmentStepDefinitions: [cucumber] must be the '@cucumber/cucumber' module object — received ${cucumber === null ? 'null' : typeof cucumber}`
    );
  }

  const givenType = typeof cucumber.Given;
  if (givenType !== 'function') {
    throw new Error(
      `wireEnvironmentStepDefinitions: [cucumber.Given] must be a function — received ${givenType}. Did you pass the '@cucumber/cucumber' module itself?`
    );
  }

  const { Given } = cucumber;

  /**
   * Sets a process environment variable for the duration of the test, via
   * {@link Utils.setProcessEnv} — which remembers the variable's original value (or its
   * absence) the first time it's touched, so {@link Utils.resetProcessEnv} can restore it
   * later regardless of how many times it's overwritten in between.
   *
   * @example
   * Given Environment variable [NODE_ENV] is set to 'test'
   */
  Given(/^Environment variable \[(.*)\] is set to '(.*)'$/, async function (varName: string, varValue: string) {
    Log.writeLine(LogLevels.TestInformation, `STEP Environment variable [${varName}] is set to '${varValue}'`);
    Utils.setProcessEnv(varName, varValue);
  });

  /**
   * Restores a process environment variable to whatever it was before this test first set
   * it (or removes it entirely, if it wasn't set at all) — via {@link Utils.resetProcessEnv}.
   *
   * @example
   * Given Environment variable [NODE_ENV] is reset to original value
   */
  Given(/^Environment variable \[(.*)\] is reset to original value$/, async function (varName: string) {
    Log.writeLine(LogLevels.TestInformation, `STEP Environment variable [${varName}] is reset`);
    Utils.resetProcessEnv(varName);
  });
}
