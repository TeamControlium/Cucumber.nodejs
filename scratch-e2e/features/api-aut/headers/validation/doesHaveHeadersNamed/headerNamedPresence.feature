@full
Feature: Scratch example — response header presence, every structural combination

  Exercises exactly one step definition:
  `Then Response from (AUT|API|[name]) has header(s) named '...'` (and comma-separated lists
  of names) — existence only, no value comparison. HTTP header names are case-insensitive by
  spec, so matching is deliberately case-insensitive here regardless of how the name was
  typed either when set or when checked.

  /echo (Scratch Target App) reflects every request header back as a real response header —
  see server.js's own handleEcho doc comment — so setting a request header is how every
  scenario below puts something in place to check presence of.

  Background: Scratch Target App is running
    Given Application [Scratch Target App] is running

  Scenario: has header named — singular wording, single name
    Given request headers for AUT are [merged] with '{"wibble": "aa"}'
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT does have header named 'wibble'

  Scenario: has headers named — plural wording, comma-separated list of names
    Given request headers for AUT are [merged] with '{"wibble": "aa", "wobble": "bb"}'
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT does have headers named 'wibble', 'wobble'

  Scenario: has header named — matches regardless of case, on either side
    Given request headers for AUT are [merged] with '{"Wibble": "aa"}'
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT does have header named 'WIBBLE'

  Scenario: has header named — target identified by [name] rather than AUT
    Given request headers for [Scratch Target App] are [merged] with '{"wibble": "aa"}'
    When a 'GET' request to [Scratch Target App] path '/echo', body 'x'
    Then Response from [Scratch Target App] does have header named 'wibble'
