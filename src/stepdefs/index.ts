export {
  wireHousekeepingStepDefinitions,
  wireEnvironmentStepDefinitions,
  wireLoggingStepDefinitions,
} from './housekeeping/index.js';
export type { CucumberGivenWhenAPI as CucumberHousekeepingGivenWhenAPI } from './housekeeping/index.js';

export {
  wireApiStepDefinitions,
  wireApiLaunchStepDefinitions,
  wireApiHeaderStepDefinitions,
  wireApiQueryStringStepDefinitions,
  wireApiRequestStepDefinitions,
  wireApiValidationStepDefinitions,
} from './api/index.js';
export type {
  CucumberGivenWhenThenAPI,
  CucumberGivenThenAPI,
  CucumberHeadersGivenWhenAPI,
  CucumberQueryStringGivenWhenAPI,
  CucumberRequestGivenWhenAPI,
  CucumberThenAPI,
} from './api/index.js';

// `mocking/` and `browser/` have no real step definitions yet — see their own README.md
// placeholders and docs/design/step-definition-structure.md. Once either has real content,
// wire its own category function in here too, same pattern as housekeeping/api below.

import { wireHousekeepingStepDefinitions } from './housekeeping/index.js';
import type { CucumberGivenWhenAPI } from './housekeeping/index.js';
import { wireApiStepDefinitions } from './api/index.js';
import type { CucumberGivenWhenThenAPI } from './api/index.js';

/**
 * The slice of `@cucumber/cucumber` `wireAllStepDefinitions` needs — the union of every
 * category's own requirement.
 */
export type CucumberAllStepDefinitionsAPI = CucumberGivenWhenAPI & CucumberGivenWhenThenAPI;

/**
 * Registers every step definition this package currently ships, across every category —
 * convenience for the common case of "just wire everything". Sugar over calling each
 * category's own `wireXStepDefinitions` individually; a suite that only needs one category
 * (e.g. an API-only suite skipping `browser/`) should call that category's function
 * directly instead. See `docs/design/step-definition-structure.md` for the full reasoning,
 * including why this being "safe to always call" depends on no category statically
 * importing a specific interaction/mocking engine.
 */
export function wireAllStepDefinitions(cucumber: CucumberAllStepDefinitionsAPI): void {
  wireHousekeepingStepDefinitions(cucumber);
  wireApiStepDefinitions(cucumber);
}
