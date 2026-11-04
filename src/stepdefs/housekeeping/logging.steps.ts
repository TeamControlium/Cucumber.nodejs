import type { When as CucumberWhen } from '@cucumber/cucumber';
import { resolveLogLevelFromSettings } from '@controlium/framework';
import { Log, Logger, LogLevels } from '@controlium/utils';

/**
 * The slice of `@cucumber/cucumber` `wireLoggingStepDefinitions` needs.
 */
export interface CucumberWhenAPI {
  When: typeof CucumberWhen;
}

/**
 * Registers step definitions for dynamically changing the logging level mid-scenario —
 * runner-agnostic, AUT-agnostic housekeeping, not specific to API-based or Browser-based
 * AUTs (hence living under `housekeeping/`, not `api/`).
 *
 * `wireCucumberHooks` already resolves the logging level fresh at the start of every
 * scenario (env var → npm config → profile parameter → default, via
 * {@link resolveLogLevelFromSettings}) — these two steps let a scenario override that for
 * its own remaining duration (e.g. "turn on debug logging right before the one step I'm
 * actually investigating") and discard the override back to whatever settings resolve to,
 * without needing a whole separate scenario or tag.
 *
 * No restriction to a fixed set of level names in the pattern itself (the legacy
 * framework's equivalent did restrict it, to 5 of `Logger.Levels`' 7 actual values,
 * excluding `Warning`/`NoOutput` for no apparent reason) — `Logger.loggingLevel`'s own
 * setter already validates the string and falls back safely (with a warning) on anything
 * unrecognised, so a second, narrower enum here would only risk drifting out of sync with
 * it.
 *
 * @param cucumber - The `@cucumber/cucumber` module itself, same convention as
 *   `wireCucumberHooks`.
 */
export function wireLoggingStepDefinitions(cucumber: CucumberWhenAPI): void {
  if (cucumber === null || typeof cucumber !== 'object') {
    throw new Error(
      `wireLoggingStepDefinitions: [cucumber] must be the '@cucumber/cucumber' module object — received ${cucumber === null ? 'null' : typeof cucumber}`
    );
  }

  const whenType = typeof cucumber.When;
  if (whenType !== 'function') {
    throw new Error(
      `wireLoggingStepDefinitions: [cucumber.When] must be a function — received ${whenType}. Did you pass the '@cucumber/cucumber' module itself?`
    );
  }

  const { When } = cucumber;

  /**
   * Overrides the logging level for the rest of the current scenario, via
   * {@link Logger.loggingLevel}'s own setter — accepts any of `Logger.Levels`' 7 actual
   * values (not a narrower fixed enum; see this file's own class doc for why), and falls
   * back safely, with a warning, on anything unrecognised.
   *
   * @example
   * When Logging level is set to [Framework Debug]
   * When Logging level is set to [Test Debug]
   */
  When(/^Logging level is set to \[(.*)\]$/, function (level: string) {
    Log.writeLine(LogLevels.TestInformation, `STEP Logging level is set to [${level}]`);
    Logger.loggingLevel = level;
    Log.writeLine(LogLevels.TestInformation, `Logging level set to '${Logger.loggingLevel}'`);
  });

  /**
   * Discards any mid-scenario override from the step above, re-resolving the level fresh
   * via {@link resolveLogLevelFromSettings} — the same env var → npm config → profile
   * parameter → default chain `wireCucumberHooks` already runs at the start of every
   * scenario.
   *
   * @example
   * When Logging level is reset to settings
   */
  When(/^Logging level is reset to settings$/, function () {
    Log.writeLine(LogLevels.TestInformation, 'STEP Logging level is reset to settings');
    Logger.loggingLevel = resolveLogLevelFromSettings();
    Log.writeLine(LogLevels.TestInformation, `Logging level set to '${Logger.loggingLevel}'`);
  });
}
