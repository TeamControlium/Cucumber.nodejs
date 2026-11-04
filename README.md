# @controlium/cucumber-driver

Wires [`@controlium/framework`](https://github.com/TeamControlium/test-framework)'s
runner-agnostic lifecycle functions (`beforeSuite`/`afterSuite`/`beforeTest`/`afterTest`)
into Cucumber-JS's native hooks, and binds each test's Cucumber World to
[`@controlium/utils`](https://github.com/TeamControlium/utils)'s `Settings`
context for the duration of that test. Pure convenience — see
`docs/design/test-runner-interface.md` in `@controlium/framework` for why this is a
thin, optional wrapper rather than something a suite is required to use.

This is a starting point, not a finished package — see that same design doc for the
bigger picture and open questions.

## Usage

```ts
// features/support/hooks.ts
import * as Cucumber from '@cucumber/cucumber';
import { wireCucumberHooks, wireCucumberStepTimeout } from '@controlium/cucumber-driver';

wireCucumberHooks(Cucumber);
wireCucumberStepTimeout(Cucumber);
```

`wireCucumberHooks` is the core contract — `beforeSuite`/`beforeTest`/`afterTest`/
`afterSuite` get called from `BeforeAll`/`Before`/`After`/`AfterAll` respectively, and
`Settings.setContext`/`clearContext` bracket each test so `profileParameterName`-sourced
settings (Detokeniser, bootstrapping, anywhere else) can resolve against the World
without it being threaded through explicitly. No custom World class is required or
imposed — it works with the default Cucumber `World` or a suite's own.

`wireCucumberStepTimeout` is separate and optional — it resolves a default Cucumber step
timeout via `Utils.getSetting` (env var, then npm package config, then a default) and
applies it with `setDefaultTimeout`. A suite that wants to resolve/set its own timeout
can skip this call entirely.

A suite's own custom hooks can be registered before or after either call in the same
support file, same as any other Cucumber hook registration.

## Development

- `npm test` — unit tests for `wireCucumberHooks`/`wireCucumberStepTimeout` themselves
  (input validation, correct wiring, registration order), using fake Cucumber objects —
  no real Cucumber-JS process involved.
- `npm run test:e2e` — builds the package, then runs a real `cucumber-js` process
  against a trivial feature under `e2e-smoke/`, and asserts (by parsing its stdout) that
  all four lifecycle functions and the Settings-context set/clear fire in the right
  order. This is the test that matters most: `wireCucumberHooks` relies on Cucumber
  running `After` hooks in *reverse* registration order to bracket the Settings context
  correctly, and a fake-object unit test can't reproduce that real Cucumber behaviour —
  only this test can catch a regression there.
