import * as Cucumber from '@cucumber/cucumber';
import { Log, LogLevels, Settings } from '@controlium/utils';

import { wireCucumberHooks, wireCucumberStepTimeout } from '../../../dist/esm/index.js';

// Make the framework's FrameworkDebug-level markers visible on stdout so the e2e
// smoke test (a real cucumber-js child process) can assert on them.
Log.logToConsole = true;
Log.loggingLevel = LogLevels.FrameworkDebug;

// Instrumentation only, not part of the driver itself — proves wireCucumberHooks' internal
// Before/After registration order actually brackets beforeTest/afterTest with the Settings
// context under real Cucumber-JS hook execution (Before: registration order; After: REVERSE
// registration order). A unit test against a fake Cucumber object can register-order-check
// this but can't observe Cucumber's own execution-order behaviour — only a real run can.
const originalSetContext = Settings.setContext.bind(Settings);
Settings.setContext = (...args) => {
  Log.writeLine(LogLevels.FrameworkDebug, 'Controlium framework: settings context set');
  return originalSetContext(...args);
};
const originalClearContext = Settings.clearContext.bind(Settings);
Settings.clearContext = (...args) => {
  Log.writeLine(LogLevels.FrameworkDebug, 'Controlium framework: settings context cleared');
  return originalClearContext(...args);
};

wireCucumberHooks(Cucumber);
wireCucumberStepTimeout(Cucumber);
