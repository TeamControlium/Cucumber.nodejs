#!/usr/bin/env node
// Real end-to-end proof that wireCucumberHooks() fires @controlium/framework's four
// lifecycle functions — and brackets them with the Settings context set/clear — in order,
// when driven by actual Cucumber-JS, not a mock of Cucumber. See
// docs/design/test-runner-interface.md in @controlium/framework for why this is the
// validation this driver needs, rather than just a unit test of the wiring function in
// isolation. The Settings-context ordering in particular relies on Cucumber running After
// hooks in REVERSE registration order — a real behaviour a fake Cucumber object in a unit
// test can't reproduce, so this is the only test that can actually catch a regression there.
import { spawnSync } from 'node:child_process';

const result = spawnSync(
  'npx',
  [
    'cucumber-js',
    'e2e-smoke/features',
    '--import', 'e2e-smoke/features/support/*.js',
    '--import', 'e2e-smoke/features/step_definitions/*.js',
  ],
  { encoding: 'utf-8' }
);

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

if (result.status !== 0) {
  console.error(`FAIL: cucumber-js exited with status ${result.status}\n\n${output}`);
  process.exit(1);
}

const expectedInOrder = [
  'Controlium framework: suite starting',
  'Controlium framework: settings context set',
  'Controlium framework: test starting',
  'Controlium framework: test ending',
  'Controlium framework: settings context cleared',
  'Controlium framework: suite ending',
];

// Deliberately independent indexOf lookups compared pairwise, NOT a moving-searchFrom scan —
// a moving scan only proves each marker exists *somewhere* after the previous one, which
// can't detect two markers landing in the wrong relative order (e.g. "settings context
// cleared" appearing before "test ending" due to a Before/After registration-order bug).
// Pairwise index comparison catches that; the previous version of this check would not have.
const indices = expectedInOrder.map((marker) => output.indexOf(marker));

const missingAt = indices.findIndex((index) => index === -1);
if (missingAt !== -1) {
  console.error(`FAIL: expected marker not found: "${expectedInOrder[missingAt]}"\n\nFull cucumber-js output:\n${output}`);
  process.exit(1);
}

for (let i = 1; i < indices.length; i++) {
  if (indices[i] <= indices[i - 1]) {
    console.error(
      `FAIL: markers out of order — "${expectedInOrder[i - 1]}" must come before "${expectedInOrder[i]}"\n\nFull cucumber-js output:\n${output}`
    );
    process.exit(1);
  }
}

console.log('PASS: all lifecycle functions and Settings-context wiring fired, in the right order, against real Cucumber-JS.');
process.exit(0);
