import type { Given as CucumberGiven, Then as CucumberThen } from '@cucumber/cucumber';
import { API_AUTWrapper } from '@controlium/framework';
import { Log, LogLevels } from '@controlium/utils';

/**
 * The slice of `@cucumber/cucumber` `wireApiLaunchStepDefinitions` needs.
 */
export interface CucumberGivenThenAPI {
  Given: typeof CucumberGiven;
  Then: typeof CucumberThen;
}

function notImplemented(pattern: string): never {
  throw new Error(`[cucumber-driver stepdefs] "${pattern}" is registered but not implemented yet.`);
}

/**
 * Registers step definitions for launching a local API-based AUT (via
 * `@controlium/framework`'s `API_AUTWrapper`) and selecting which API version a
 * feature-set targets.
 *
 * Patterns only, for the still-stubbed ones. "Application [...] is running" is wired for
 * real, to {@link API_AUTWrapper.startApplication} — it only starts an app previously
 * configured by a suite's own `Before` hook calling {@link API_AUTWrapper.prepareApplication}
 * (see that method's own class-doc example in `@controlium/framework`). It does not call
 * `prepareApplication` itself: the handler functions (bootstrapper/closeHandler/
 * getUrlHandler) are app-specific code, not something a shared step library can supply.
 *
 * "AUT is running" is parked here for now, deliberately unimplemented — it's ambiguous
 * whether a tester means "the API-based AUT process is up" (this file's concern) or
 * "the Browser-based AUT/webserver is reachable" (`browser/`'s concern). Living in `api/`
 * is provisional, not a final call on its meaning.
 *
 * @param cucumber - The `@cucumber/cucumber` module itself, same convention as
 *   `wireCucumberHooks`.
 */
export function wireApiLaunchStepDefinitions(cucumber: CucumberGivenThenAPI): void {
  if (cucumber === null || typeof cucumber !== 'object') {
    throw new Error(
      `wireApiLaunchStepDefinitions: [cucumber] must be the '@cucumber/cucumber' module object — received ${cucumber === null ? 'null' : typeof cucumber}`
    );
  }

  const givenType = typeof cucumber.Given;
  if (givenType !== 'function') {
    throw new Error(
      `wireApiLaunchStepDefinitions: [cucumber.Given] must be a function — received ${givenType}. Did you pass the '@cucumber/cucumber' module itself?`
    );
  }

  const thenType = typeof cucumber.Then;
  if (thenType !== 'function') {
    throw new Error(
      `wireApiLaunchStepDefinitions: [cucumber.Then] must be a function — received ${thenType}. Did you pass the '@cucumber/cucumber' module itself?`
    );
  }

  const { Given, Then } = cucumber;

  /**
   * Starts a previously-configured AUT via {@link API_AUTWrapper.startApplication}. The
   * AUT must already have been registered — typically in a suite's own `Before` hook
   * calling {@link API_AUTWrapper.prepareApplication} with the app-specific
   * bootstrapper/closeHandler/getUrlHandler — this step only starts it, it never
   * configures one from scratch.
   *
   * No diagnostic dump here beyond the one-line `STEP` marker —
   * {@link API_AUTWrapper.startApplication} itself already logs the AUT's resolved
   * configuration (`loadSettings`'s own summary) and, once started, its live state (resolved
   * URL, `isControlled`, current headers), so every driver gets that for free without
   * reimplementing it.
   *
   * @example
   * Given Application [MyApp] is running
   */
  Given(/^Application \[(.*)\] is running$/, async function (appName: string) {
    Log.writeLine(LogLevels.TestInformation, `STEP Application [${appName}] is running`);
    await API_AUTWrapper.startApplication(appName);
  });

  Given(/^This feature-set will use version \[(v\d*)\] API$/, function () {
    notImplemented('This feature-set will use version [...] API');
  });

  Given(/^\[(.*)\] feature-set will use version \[(v\d*)\] API$/, function () {
    notImplemented('[...] feature-set will use version [...] API');
  });

  Then(/^AUT is running$/, function () {
    notImplemented('AUT is running');
  });
}
