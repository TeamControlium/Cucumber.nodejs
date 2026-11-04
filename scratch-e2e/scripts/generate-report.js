// Generates the multiple-cucumber-html-reporter output for this repo's own paths/metadata,
// with graceful no-results handling (see the try/catch below) — this package's package.json
// has "type": "module", so `require()` isn't available here.
import fs from 'fs';
import { generate } from 'multiple-cucumber-html-reporter';

const reportDefaults = {
  pageTitle: `${process.env.TEST_REPORT_TITLE} Test Report`,
  reportName: `${process.env.TEST_REPORT_TITLE} - Test Report`,
  jsonDir: './scratch-e2e/results/',
  reportPath: './scratch-e2e/results/html-report',
  // multiple-cucumber-html-reporter's own browser-opening goes through the `open` npm
  // package with `stdio: 'ignore'`/`detached: true` — confirmed NOT to actually produce a
  // visible browser on this machine (xdg-open loses something it needs from that fully
  // detached context). run-scratch-e2e.sh opens the report itself instead, via a plain
  // backgrounded `xdg-open` with inherited stdio, which does work.
  openReportInBrowser: false,
  pageFooter: '<div><p>Controlium scratch-e2e example — not a real regression suite</p></div>',
  displayDuration: false,
  displayReportTime: true,
  // hideMetadata deliberately omitted — confirmed dead in v4.5.0: it's threaded into the
  // data object (dist/generate-report.js) but no .liquid template ever reads it. Setting
  // it did nothing; the Device/OS/Browser columns and charts it used to hide in v3.6.2 are
  // now hidden by the CSS below instead (report-overrides.css), since no option does it.
  // v4 defaults to a compact "Attachments" chip grid that opens each log/attachment in a
  // modal popup. 'inline' restores the pre-4.x style — a "+ Show Info" link per step that
  // expands its content directly below the step, in place.
  attachmentLayout: 'inline',
  // Both paths are resolved relative to process.cwd() by multiple-cucumber-html-reporter
  // itself — see report-overrides.css/.js's own doc comments for what each works around.
  customStyle: './scratch-e2e/scripts/report-overrides.css',
  customScript: './scratch-e2e/scripts/report-overrides.js',
  // v4's customData is a flat object — any key outside its own predefined set
  // (projectName/release/etc.) becomes its own labelled info card automatically; no
  // title/data[] wrapper like v3.6.2 took.
  customData: {
    projectName: 'Controlium scratch-e2e example',
    cucumberTags: process.env.CUCUMBER_TAGS ?? 'Not Set!',
    logLevel: process.env.TEST_LOG_LEVEL ?? 'Not Set!',
    executionTime: process.env.TEST_TIMESTAMP ?? 'Not Set!',
    // username: false — not omitted. `username` is one of customData's own predefined
    // fields (dist/generate-report.js: `username: customData?.username ?? runtimeMetadata
    // .username`), so simply leaving it out still falls through to the OS username via
    // `??` (which only catches null/undefined, not a deliberate `false`). run_info_card
    // .liquid's own `{% if data.report.username %}` only suppresses the card on a falsy
    // value — `false` is the one value that both survives `??` AND reads falsy in Liquid.
    username: false,
  },
};

// Declared outside the try block so the catch block below can safely reference it for
// logging — a `const`/`let` declared inside a `try` is out of scope in its `catch`, so
// a naive `files?.join(...)` in catch would throw a ReferenceError on exactly the failure
// path (missing/unreadable results dir) it exists to handle gracefully.
let files;
try {
  files = fs.readdirSync(reportDefaults.jsonDir);
  if (files.length === 0) {
    console.log(
      `No files in [${reportDefaults.jsonDir}]. No report to generate.`,
    );
  } else {
    await generate({
      ...reportDefaults,
    });
  }
} catch (err) {
  if (
    err.message.includes(
      "Cannot read properties of undefined (reading 'metadata')",
    )
  ) {
    console.log(
      `No test results found in [${reportDefaults.jsonDir}] (Files:- ${files?.join(', ') ?? 'unknown'}). Did any tests run?`,
    );
  } else {
    console.log(
      `Error generating HTML report. multiple-cucumber-html-reporter says:\n${err.message}`,
    );
  }
}
