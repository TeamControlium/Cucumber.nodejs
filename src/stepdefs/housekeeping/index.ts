import { wireEnvironmentStepDefinitions } from './environment.steps.js';
import type { CucumberGivenAPI } from './environment.steps.js';
import { wireLoggingStepDefinitions } from './logging.steps.js';
import type { CucumberWhenAPI } from './logging.steps.js';

export { wireEnvironmentStepDefinitions } from './environment.steps.js';
export type { CucumberGivenAPI } from './environment.steps.js';

export { wireLoggingStepDefinitions } from './logging.steps.js';
export type { CucumberWhenAPI as CucumberLoggingWhenAPI } from './logging.steps.js';

/**
 * The slice of `@cucumber/cucumber` `wireHousekeepingStepDefinitions` needs — the union of
 * every `housekeeping/` file's own narrower requirement.
 */
export interface CucumberGivenWhenAPI {
  Given: CucumberGivenAPI['Given'];
  When: CucumberWhenAPI['When'];
}

/**
 * Registers every `housekeeping` step definition — utility/AUT-agnostic steps with no
 * meaning specific to API-based or Browser-based AUTs. Sugar over calling each file's own
 * `wireXStepDefinitions` individually; see `docs/design/step-definition-structure.md`.
 */
export function wireHousekeepingStepDefinitions(cucumber: CucumberGivenWhenAPI): void {
  wireEnvironmentStepDefinitions(cucumber);
  wireLoggingStepDefinitions(cucumber);
}
