# scratch-e2e — illustrative example, not a real suite

This folder is a worked example of the wiring pattern documented in
`@controlium/framework`'s `docs/consumer/AGENTS.md` ("API-only suites") — a Cucumber suite
that boots a tiny local API AUT via `API_AUTWrapper`, wired into Cucumber-JS via
`@controlium/cucumber-driver`'s `wireCucumberHooks`/`wireCucumberStepTimeout`, then drives
and validates it.

**Not published, not part of the package, not a real regression suite** — it exists purely
so the wiring can be read and actually run, rather than only described in prose. It writes
plain `.js` (ESM) rather than the TypeScript AGENTS.md itself recommends, specifically so it
runs directly against this repo's already-built `dist/esm` with zero extra tooling (no
`ts-node`) — a real consumer suite should follow AGENTS.md's TypeScript convention; this
folder is about the wiring shape, not the exact language tooling.

## Layout

```
scratch-e2e/
├── target-app/
│   └── server.js      # the "AUT" — a trivial Node http server, no framework of its own
├── config/
│   └── cucumber.js     # Cucumber-JS profiles (common/full/debug)
├── hooks/
│   └── hooks.js         # the wiring: wireCucumberHooks + wireCucumberStepTimeout + API_AUTWrapper
├── steps/
│   └── example.steps.js
└── features/
    └── api-aut/
        ├── request/        # request.steps.ts's own patterns — one file per body/kind
        │   ├── nobody.feature
        │   ├── literalbody.feature
        │   ├── literalbodydatatable.feature
        │   ├── docstringbody.feature
        │   ├── filebody.feature
        │   ├── filebodydatatable.feature
        │   ├── databuiltbody.feature
        │   └── resourcepathpreamble.feature
        ├── headers/
        │   └── headersquoting.feature
        └── queryparams/
            └── queryparams.feature
```

Every Feature file is tagged `@full` (the structural/boundary sweep for that step pattern);
any Scenario/Scenario Outline that specifically cross-products the logging-level axis (`Given
Logging level is set to ...` against Test Information/Test Debug/Framework Information/
Framework Debug) is additionally tagged `@debug` — see `config/cucumber.js`'s own comments
for exactly how `run-scratch-e2e.sh full`/`debug` select between them.

## Run it

```
npm run build
npm run test:scratch-e2e
```

(`npm run build` first — `hooks.js` imports this package's own compiled `dist/esm/index.js`,
same as `e2e-smoke` does.)

## Known issues

- **HTML report mangles DocString content (`<`/`>` become `(`/`)`)** — e.g. an `xml body:`
  DocString's `<a>1</a>` renders as `(a)1(/a)` in the generated HTML report. Confirmed this
  is entirely a `multiple-cucumber-html-reporter` bug, not ours: the raw JSON results
  already carry the DocString correctly, unmangled (`arguments: [{ content: "<a>1</a>",
  ... }]`) — the mangling happens only in that package's own rendering template,
  `node_modules/multiple-cucumber-html-reporter/templates/components/scenarios.tmpl`,
  line 253: `step.arguments[i]["content"].replace(/</g, '(').replace(/>/g, ')')` — a crude
  substitution instead of proper `&lt;`/`&gt;` HTML-entity escaping (which that same
  package *does* do correctly elsewhere, for the older, no-longer-used `doc_string.value`
  shape). Cosmetic only — nothing in our own pipeline is affected. Worth a PR against
  `multiple-cucumber-html-reporter` upstream to fix that template properly.
