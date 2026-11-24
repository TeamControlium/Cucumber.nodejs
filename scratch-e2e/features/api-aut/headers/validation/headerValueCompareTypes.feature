@full
Feature: Scratch example — response header value(s) with compare types, every structural combination

  Exercises exactly one step definition:
  `Then Response from (AUT|API|[name]) header(s) '...' has value|have values [<compareTypes>] '...'`
  — a position-matched quoted list of header names and a quoted list of values, with an
  optional compare-type bracket applied to every pair (defaults to `equals`, case-
  insensitive). Validated via `validateHeaderItemValue`, shared with the DataTable form in
  its own sibling feature file.

  Every compare-type scenario below reuses the same actual value ("Hello World") so only
  the compare-type bracket and expected value change between scenarios — isolating what
  each flag actually does. A Scenario Outline with the bracket as a table column was tried
  first and doesn't work here: Gherkin trims trailing whitespace from table cells, but the
  step pattern requires a literal space between `]` and the opening quote
  (`(?:\[(.*)\] )?`) — a table cell can't carry that space through, so each variant is its
  own literal Scenario instead.

  Background: Scratch Target App is running
    Given Application [Scratch Target App] is running

  Scenario: header has value — no bracket, defaults to equals, case-insensitive
    Given request headers for AUT are [merged] with '{"wibble": "Hello World"}'
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT header 'wibble' has value 'hello world'

  Scenario: header has value — [contains]
    Given request headers for AUT are [merged] with '{"wibble": "Hello World"}'
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT header 'wibble' has value [contains] 'lo Wo'

  Scenario: header has value — [not,contains]
    Given request headers for AUT are [merged] with '{"wibble": "Hello World"}'
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT header 'wibble' has value [not,contains] 'xyz'

  Scenario: header has value — [starts with]
    Given request headers for AUT are [merged] with '{"wibble": "Hello World"}'
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT header 'wibble' has value [starts with] 'Hello'

  Scenario: header has value — [ends with]
    Given request headers for AUT are [merged] with '{"wibble": "Hello World"}'
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT header 'wibble' has value [ends with] 'World'

  Scenario: header has value — [casesensitive] exact case required
    Given request headers for AUT are [merged] with '{"wibble": "Hello World"}'
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT header 'wibble' has value [casesensitive] 'Hello World'

  Scenario: header has value — [regexp]
    `\s` is deliberately avoided here — the expected value passes through `Detokeniser`,
    which treats `\` as its own escape character and would silently drop it, turning
    `\s` into a literal `s`. `.` (any character) sidesteps that without relying on a fix to
    Detokeniser, which is tracked separately as needing a deliberate redesign.
    Given request headers for AUT are [merged] with '{"wibble": "Hello World"}'
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT header 'wibble' has value [regexp] '^Hello.World$'

  Scenario: header has value — [count] checks occurrence count, not content
    'count' is unique to headers — the expected value is read as a number, compared against
    how many times the header actually occurred, never against the values themselves.
    Given request headers for AUT are [merged] with '{"wibble": ["aa", "bb"]}'
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT header 'wibble' has value [count] '2'

  Scenario: headers have values — plural wording, multiple position-matched pairs, no bracket
    Given request headers for AUT are [merged] with '{"wibble": "aa", "wobble": "bb"}'
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT headers 'wibble', 'wobble' have values 'aa', 'bb'

  Scenario: headers have values — shared compare-type bracket applies to every pair
    Given request headers for AUT are [merged] with '{"wibble": "hello", "wobble": "world"}'
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT headers 'wibble', 'wobble' have values [contains] 'ell', 'orl'
