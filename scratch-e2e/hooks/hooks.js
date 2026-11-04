import * as Cucumber from '@cucumber/cucumber';
import { API_AUTWrapper } from '@controlium/framework';

// Imports this repo's own compiled output, same convention as e2e-smoke — a real consumer
// imports from the published '@controlium/cucumber-driver' package instead.
import { wireCucumberHooks, wireCucumberStepTimeout } from '../../dist/esm/index.js';

import { startTargetApp } from '../target-app/server.js';

// --- The wiring itself — this is the part the whole example exists to show -------------
// Step-library linking (wireAllStepDefinitions) lives in ../steps/example.steps.js, not
// here — this file is lifecycle/bootstrap wiring only, kept separate from step definitions.

wireCucumberHooks(Cucumber);
wireCucumberStepTimeout(Cucumber);

Cucumber.Before(function () {
  // Resolves 'ScratchTargetApp' config from settings (see scratch-e2e/config/cucumber.js's
  // worldParameters.testAUTDetails) — does NOT start it yet. The feature file's own
  // "Given Application [ScratchTargetApp] is running" step (from
  // wireApiLaunchStepDefinitions, wired via wireAllStepDefinitions above) does that, via
  // API_AUTWrapper.startApplication.
  this.api = API_AUTWrapper.prepareApplication('Scratch Target App', {
    bootstrapper: (port) => startTargetApp(port),
    closeHandler: (server) =>
      new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
    getUrlHandler: (server) => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : undefined;
      return `http://localhost:${port}`;
    },
  });
  // `this.api` is the same instance startApplication() starts later — prepareApplication()
  // returns it up front so steps can use this.api.request()/this.api.lastResponse without
  // needing to look it up again by name.
});

// No suite-side After hook needed to stop this app — wireCucumberHooks' own After calls
// @controlium/framework's afterTest(), which now closes and deregisters every AUT the
// test registered (via create()/prepareApplication()) automatically, through
// API_AUTWrapper.closeAllRegistered(). A suite is never required to remember this itself.
