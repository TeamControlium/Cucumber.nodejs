// This module's own `export default` value IS the "default" profile — cucumber-js's ESM
// config loader unwraps the module's default export once already, so nesting another
// "default: {...}" key here would make it look one level too deep and silently produce an
// empty configuration (paths/require both resolve to []) with no error. Verified the hard
// way — see scratch-e2e/README.md.
export default {
  paths: ['scratch-e2e/features/**/*.feature'],
  import: ['scratch-e2e/hooks/**/*.js', 'scratch-e2e/steps/**/*.js'],
  format: ['json:scratch-e2e/results/results.json', 'summary:'],
  // `API_AUTWrapper.prepareApplication('Scratch Target App', ...)` (called from
  // scratch-e2e/hooks/hooks.js's Before hook) resolves its config from here — Cucumber
  // copies worldParameters onto the World instance, and wireCucumberHooks's Settings
  // context bracketing (Settings.setContext({ parameters: this }) in Before) is what lets
  // loadSettings() find `testAUTDetails['Scratch Target App'].*` on it.
  //
  // host/protocol/requestTimeout/autHandlerTimeout are stated explicitly below even though
  // they currently just restate API_AUTWrapper's own built-in defaults — this file is the
  // one place meant to show this AUT's actual intended configuration, same shape as a real
  // suite's testAUTDetails block (see e.g. ea-eq-bff's own bffDetails.js); leaving them
  // implicit means loadSettings()'s own per-field trail has nothing to resolve them from,
  // and just reports "not configured" for every one of them.
  worldParameters: {
    testAUTDetails: {
      "Scratch Target App": {
        host: 'localhost',
        port: 3999,
        protocol: 'http',
        requestTimeout: 30_000,
        autHandlerTimeout: 30_000,
        // Named prefixes requests-path-preamble.feature's `Given requests to ... use
        // resource path preamble [...]` step selects between — V1 prepends onto a route
        // the target app actually has (so the combined path still hits a real 200, not a
        // 404), V2 prepends onto nothing the app recognises (so the combined path falls
        // through to the 404 handler) — deliberately one of each, not two routes that'd
        // both just succeed.
        resourcePathPreambles: {
          V1: '/my-body',
          V2: '/does-not-exist',
        },
      },
    },
  },
};

// --- Named-export profiles, merged together via multiple `-p` flags on the CLI ----------
//
// This Cucumber-JS version (ESM, `@cucumber/cucumber@^13.2.1`) does NOT merge a base/default
// profile in automatically when `-p <name>` is given — requesting a single named profile
// REPLACES the entire configuration. Verified empirically (see run-scratch-e2e.sh and
// scratch-e2e/README.md). The fix is to split shared config and mode-specific config into
// separate named exports, then pass them all on the command line:
//
//   cucumber-js --config scratch-e2e/config/cucumber.js -p common -p full
//
// `common` carries everything every mode needs (paths/import/worldParameters/format);
// `full`/`debug` carry only what differs between modes — today that's just the target app's
// port (3999 vs 3899), so `full` and `debug` runs can both be left running without colliding.
// The actual full/debug tag filter (which scenarios each mode selects) lives in
// run-scratch-e2e.sh's CUCUMBER_TAGS, not here — every Feature file is tagged `@full`, and
// every Scenario/Scenario Outline that specifically exercises the logging-level axis (a
// `Given Logging level is set to ...` cross-product, see e.g. request/docstringbody.feature)
// is additionally tagged `@debug`.

// `@cucumber/cucumber`'s own built-in `json` formatter drops Before/After hook `name`s
// entirely (see @controlium/cucumber-driver's src/formatters/namedHookJsonFormatter.ts for
// the full why). `NamedHookJsonFormatter` is identical except it carries that name through —
// used here instead of the plain `json:` formatter so hook names actually show up in the
// generated HTML report (scratch-e2e/scripts/generate-report.js).
//
// A `format` entry's module specifier is resolved by dynamic `import()` from inside
// @cucumber/cucumber's own package — a bare `@controlium/cucumber-driver/...` specifier
// can't resolve there (it's not a dependency of @cucumber/cucumber), so resolve to a
// `file://` URL ourselves first. That URL contains colons, which collides with the
// formatter:target `name:target` syntax's own colon-separator — so it must be wrapped in
// double quotes, which Cucumber-JS's format-descriptor parser explicitly supports for
// exactly this reason. Verified both pieces empirically — see scratch-e2e/README.md.
const namedHookJsonFormatterUrl = import.meta.resolve('@controlium/cucumber-driver/formatters/named-hook-json');

export const common = {
  paths: ['scratch-e2e/features/**/*.feature'],
  import: ['scratch-e2e/hooks/**/*.js', 'scratch-e2e/steps/**/*.js'],
  // JSON output feeds scratch-e2e/scripts/generate-report.js's HTML report generation.
  format: ['summary', `"${namedHookJsonFormatterUrl}":scratch-e2e/results/results.json`],

};

// Only `port` differs from `common`'s own testAUTDetails (3999, vs `debug`'s 3899) — kept
// here, not in `common`, so `full`/`debug` can target genuinely different ports and never
// collide if a stray process from one mode is still listening while the other runs.
// run-scratch-e2e.sh's `CUCUMBER_TAGS="@full or @Full"` is the actual tag filter — every
// Feature file in scratch-e2e carries `@full`, so this mode runs the full structural/
// boundary sweep across every step pattern.
export const full = {
  worldParameters: {
    testAUTDetails: {
      "Scratch Target App": {
        host: 'localhost',
        port: 3999,
        protocol: 'http',
        requestTimeout: 30_000,
        autHandlerTimeout: 30_000,
        resourcePathPreambles: {
          V1: '/my-body',
          V2: '/does-not-exist',
        },
      },
    },
  },
};

// Same reasoning as `full`, different port. run-scratch-e2e.sh's
// `CUCUMBER_TAGS="@debug or @Debug"` selects only the Scenario/Scenario Outlines that
// specifically cross-product the logging-level axis — a deliberately narrower, log-level-
// focused subset, not a duplicate of the full structural sweep.
export const debug = {
  worldParameters: {
    testAUTDetails: {
      "Scratch Target App": {
        host: 'localhost',
        port: 3899,
        protocol: 'http',
        requestTimeout: 30_000,
        autHandlerTimeout: 30_000,
        resourcePathPreambles: {
          V1: '/my-body',
          V2: '/does-not-exist',
        },
      },
    },
  },
};
