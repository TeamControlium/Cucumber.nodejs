@full
Feature: Scratch example — response headers contain subset (DataTable), every structural combination

  Exercises exactly one step definition:
  `Then Response from (AUT|API|[name]) contains headers;` with a `Header Key | Value`
  DataTable — same subset semantics as the literal form, built entirely from a table instead
  of an inline JSON object.

  Background: Scratch Target App is running
    Given Application [Scratch Target App] is running

  Scenario: contains headers — DataTable, mixing a plain value and a repeated-header array value
    The 'wibble' row's Value column uses the `json:[...]` cast so a single DataTable cell can
    express a repeated header's multiple values — same convention a header-*setting* DataTable
    cell uses.
    Given request headers for AUT are [merged] with '{"wobble": "hello"}';
      | Header Key | Value             |
      | wibble     | json:["aa", "bb"] |
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT contains headers;
      | Header Key | Value             |
      | wobble     | hello             |
      | wibble     | json:["aa", "bb"] |
