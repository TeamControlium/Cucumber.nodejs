Feature: Smoke test for the Cucumber driver wiring

  This feature exists only to prove wireCucumberHooks() actually fires the
  framework's beforeSuite/beforeTest/afterTest/afterSuite lifecycle functions
  at the right points when run by real Cucumber-JS, not a mock of Cucumber.

  Scenario: A trivial scenario runs
    Given a step that does nothing of note
