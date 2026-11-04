import { JsonFormatter } from '@cucumber/cucumber';

/**
 * `@cucumber/cucumber`'s own built-in `json` formatter drops `Before`/`After` hook names
 * entirely — its `getStepData` hardcodes `{ keyword: 'Before' | 'After', hidden: true }` for
 * any hook step and never looks up the hook's own definition, unlike the newer
 * message-based formatter path (`test_case_attempt_parser.js`), which does. This is a real
 * gap in that (Cucumber-JS's own JSDoc calls it "in maintenance mode") formatter, not
 * something specific to this project — confirmed with a completely standalone repro against
 * bare `@cucumber/cucumber` with no other wiring involved.
 *
 * `NamedHookJsonFormatter` is `JsonFormatter`, unchanged, except `getStepData` additionally
 * looks up the firing hook's definition (mirroring the same lookup Cucumber's own
 * `test_case_attempt_parser.js` already does) and carries its `name` — if one was given via
 * `Before({ name: '...' }, fn)`/`After({ name: '...' }, fn)` — into the JSON output. The step
 * stays `hidden: true` exactly as before (so {@link https://www.npmjs.com/package/multiple-cucumber-html-reporter | `multiple-cucumber-html-reporter`}'s
 * own pass/fail tallying — which explicitly skips hidden steps with no name/text/attachment
 * — is unaffected); only the step's displayed `name` changes, from blank to whatever was
 * given. Confirmed `multiple-cucumber-html-reporter` renders that name once present, on each
 * scenario's own detail page, right next to the `Before`/`After` keyword — exactly like a
 * `Given`/`When`/`Then` step's own text.
 *
 * Use it wherever a `json:<path>` formatter entry would otherwise go — on the CLI:
 * ```
 * cucumber-js --format @controlium/cucumber-driver/formatters/named-hook-json:results.json
 * ```
 * or the same string inside a `cucumber.js` config's own `format` array:
 * ```js
 * export const common = {
 *   format: ['summary', '@controlium/cucumber-driver/formatters/named-hook-json:results.json'],
 * };
 * ```
 * Cucumber-JS resolves a `format` entry's module specifier identically either way — there is
 * no difference between CLI and config usage.
 */
export default class NamedHookJsonFormatter extends JsonFormatter {
  override getStepData(
    params: Parameters<JsonFormatter['getStepData']>[0]
  ): ReturnType<JsonFormatter['getStepData']> {
    const data = super.getStepData(params);
    if (data.hidden === true && params.testStep.hookId != null) {
      const definitions = params.isBeforeHook
        ? this.supportCodeLibrary.beforeTestCaseHookDefinitions
        : this.supportCodeLibrary.afterTestCaseHookDefinitions;
      const hookDefinition = definitions.find((definition) => definition.id === params.testStep.hookId);
      if (hookDefinition?.name) {
        data.name = hookDefinition.name;
      }
    }
    return data;
  }
}
