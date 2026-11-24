@full
Feature: Scratch example — response header absence, every structural combination

  Exercises exactly one step definition:
  `Then Response from (AUT|API|[name]) does not have header(s) named '...'` (and
  comma-separated lists of names) — the negation of presence, existence-only, case-
  insensitive name matching (same reasoning as the presence family's own feature file).

  Background: Scratch Target App is running
    Given Application [Scratch Target App] is running

  Scenario: does not have header named — singular wording, single absent name
    Given request headers for AUT are [merged] with '{"wibble": "aa"}'
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT does not have header named 'nonexistent'

  Scenario: does not have headers named — plural wording, comma-separated list, all absent
    Given request headers for AUT are [merged] with '{"wibble": "aa"}'
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT does not have headers named 'nope', 'nada'

  Scenario: does not have header named — absence check is also case-insensitive
    Given request headers for AUT are [merged] with '{"wibble": "aa"}'
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT does not have header named 'WOBBLE'
