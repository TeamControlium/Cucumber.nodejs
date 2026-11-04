# Step-definition structure — design note

**Status:** agreed direction, mid-implementation. Captures the reasoning behind the
folder/file split and the single-vs-per-category wiring decision, so the "why" survives
past the chat it came from.

## The split

Step definitions are organised by what a tester is actually doing, not by which Gherkin
file they happened to land in first:

```
src/stepdefs/
  housekeeping/   — utility steps with no AUT-interaction meaning of their own
                    (env vars, log level, anything else generic)
  mocking/        — common shape across API-based and Browser-based AUTs, even though the
                    underlying mechanism differs a lot between them
  api/            — API-based (and non-interfacing, e.g. file-processing) AUT steps:
                    launch, headers, request execution, response validation
  browser/        — Browser-based AUT steps
```

Each file keeps the existing narrow `wireXSteps(cucumber)` convention — a function that
takes just the slice of the `@cucumber/cucumber` module it needs and registers its own
patterns. Nothing about the current pattern list is considered settled; the current step
wording is a starting point that learnings from actually using it will very likely
reshape.

## Why folders, not one file

Beyond readability as the list grows, the folder split doubles as a visible progress
board for "vertical" development — walking one slice (e.g. header configuration) from
step pattern through to a working `API_AUTWrapper` call, fully, before moving to the
next slice. A flat file (or one giant one) hides that progress; a folder per concern
makes "what's wired vs. still a stub" visible at a glance.

## Wiring: all-in-one as sugar over per-category

Two entry points, not one:

- Each category exports its own `wireXStepDefinitions(cucumber)` — a suite that only
  needs, say, API steps can wire exactly that and nothing else.
- A single top-level `wireAllStepDefinitions(cucumber)` calls every category's wire
  function — convenience for the common case of "just wire everything".

The all-in-one is sugar, not the primary contract — a suite is never required to go
through it, matching [[feedback_framework_primitives_not_policy]]: this package
supplies the pieces, it doesn't force a suite through one specific door to get them.

## The real issue: wiring must never force an engine choice

`@controlium/framework`'s whole philosophy is "supply the bricks, don't dictate what's
built with them" — `API_AUTWrapper` never assumes NestJS vs. Fastify vs. raw `http`, for
exactly this reason. The same principle applies here, and it's sharper for `browser/`
and `mocking/`:

- **Browser interaction** could be driven by Playwright, WebDriver (Selenium/
  WebdriverIO), Puppeteer, or something not yet invented. This package must not bake in
  one.
- **Mocking's shape** has the same problem one layer down — whatever intercepts outbound
  calls for a Browser-based AUT is very likely a different mechanism entirely from what
  intercepts them for an API-based AUT, even though the Gherkin-level step ("the AUT's
  call to X is mocked to return Y") looks identical from a tester's perspective.

If `wireAllStepDefinitions` (or even just importing `browser/index.ts` on its own)
statically imported a real engine package at the top of the module — `import { chromium }
from 'playwright'`, say — then **every** consumer of this package would need that engine
installed just to register step patterns, even an API-only suite that never writes a
single browser-flavoured Gherkin step. Wiring (registering a regex → handler with
Cucumber) and executing (actually driving a browser) are two different costs, and they
must stay decoupled:

- `browser/*.steps.ts` (and, later, whichever `mocking/*.steps.ts` files need a specific
  interception mechanism) use `import type { ... } from 'playwright'` — or whichever
  engine — for types only. Type-only imports are erased at compile time; they cost
  nothing at runtime and require nothing installed to typecheck against.
- The real import is a lazy `await import('playwright')` **inside the step handler's own
  body**, resolved only the first time that specific step actually fires during a
  scenario run.
- The engine package itself is listed as an **optional peer dependency**
  (`peerDependenciesMeta: { optional: true }`) — resolvable from the consuming suite's
  own `node_modules` if they've installed it, but `npm install` never fails or warns
  loudly if they haven't, because wiring alone never touches it.

Net effect: `wireAllStepDefinitions` is always safe to call, for any suite, regardless
of what it's testing. An API-only suite that never writes a browser-flavoured step never
triggers the lazy import, so the engine package never needs to exist on disk. A suite
that *does* write one gets a clear, step-execution-time "Cannot find module 'playwright'
— did you install it?" rather than a confusing failure (or forced install) the moment it
imports this package at all.

This isn't fully built yet — `browser/` and `mocking/` are still placeholder folders, no
real engine-specific code exists to apply the pattern to. It's recorded here so whoever
writes the first real browser or mocking step (very possibly a future session) applies
it from the start rather than discovering the problem after the fact.
