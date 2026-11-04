import { wireApiLaunchStepDefinitions } from './launch.steps.js';
import { wireApiHeaderStepDefinitions } from './headers.steps.js';
import { wireApiQueryStringStepDefinitions } from './queryString.steps.js';
import { wireApiRequestStepDefinitions } from './request.steps.js';
import { wireApiValidationStepDefinitions } from './validation.steps.js';

export { wireApiLaunchStepDefinitions } from './launch.steps.js';
export type { CucumberGivenThenAPI } from './launch.steps.js';

export { wireApiHeaderStepDefinitions } from './headers.steps.js';
export type { CucumberGivenWhenAPI as CucumberHeadersGivenWhenAPI } from './headers.steps.js';

export { wireApiQueryStringStepDefinitions } from './queryString.steps.js';
export type { CucumberGivenWhenAPI as CucumberQueryStringGivenWhenAPI } from './queryString.steps.js';

export { wireApiRequestStepDefinitions } from './request.steps.js';
export type { CucumberGivenWhenAPI as CucumberRequestGivenWhenAPI } from './request.steps.js';

export { wireApiValidationStepDefinitions } from './validation.steps.js';
export type { CucumberThenAPI } from './validation.steps.js';

/**
 * The slice of `@cucumber/cucumber` `wireApiStepDefinitions` needs — the union of every
 * `api/` file's own narrower requirement.
 */
export interface CucumberGivenWhenThenAPI {
  Given: Parameters<typeof wireApiLaunchStepDefinitions>[0]['Given'];
  When: Parameters<typeof wireApiRequestStepDefinitions>[0]['When'];
  Then: Parameters<typeof wireApiValidationStepDefinitions>[0]['Then'];
}

/**
 * Registers every `api` step definition — launch, header configuration, query-param
 * configuration, request execution, response validation — for a local API-based (or
 * non-interfacing, e.g. file-processing) AUT. Sugar over calling each file's own
 * `wireXStepDefinitions` individually; see `docs/design/step-definition-structure.md`.
 */
export function wireApiStepDefinitions(cucumber: CucumberGivenWhenThenAPI): void {
  wireApiLaunchStepDefinitions(cucumber);
  wireApiHeaderStepDefinitions(cucumber);
  wireApiQueryStringStepDefinitions(cucumber);
  wireApiRequestStepDefinitions(cucumber);
  wireApiValidationStepDefinitions(cucumber);
}
