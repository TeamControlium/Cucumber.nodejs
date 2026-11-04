import { wireAllStepDefinitions } from '../../dist/esm/index.js';
import * as Cucumber from '@cucumber/cucumber';

// A test suite never defines its own steps here — this file's only job is linking the shared step
// library in; every pattern it provides is on record under src/stepdefs/ (housekeeping/,
// api/, mocking/, browser/ — see docs/design/step-definition-structure.md), including which
// ones are still notImplemented() stubs. wireAllStepDefinitions is sugar over wiring each
// category individually — a real API-only suite would more likely call
// wireHousekeepingStepDefinitions + wireApiStepDefinitions directly, skipping browser/.
wireAllStepDefinitions(Cucumber);
