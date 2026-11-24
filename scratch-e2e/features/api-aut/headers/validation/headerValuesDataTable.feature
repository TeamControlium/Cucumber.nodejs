@full
Feature: Scratch example — response header values via DataTable, every structural combination

  Exercises two step definitions, exact-set and subset counterparts of each other, both with
  a `Header Key | Compare Types | Expected Value | ?Description` DataTable — the per-row
  sibling of the position-matched pattern in headerValueCompareTypes.feature, letting each
  header have its own compare type in a single step rather than one shared bracket for every
  pair:
  - `Then Response from (AUT|API|[name]) contains header values;` — every row's own
  comparison must pass; the actual response is free to carry other headers beyond what's
  listed.
  - `Then Response from (AUT|API|[name]) has header values;` — same per-row comparisons,
  plus the DataTable's own *distinct* header keys (not row count — a key may appear on
  several rows, each a separate compare-type assertion against the same header) must equal
  the actual response's header keys exactly, nothing extra.

  Background: Scratch Target App is running
    Given Application [Scratch Target App] is running


  Scenario: contains header values — per-row compare types, including count, in one table
    'wibble' is sent twice (checked by occurrence count via 'count', not by content);
    'wobble' is sent once with mixed case, checked once case-insensitively ('contains') and
    once case-sensitively ('casesensitive') — same actual value, two different rows, two
    different outcomes of what "matches" means. The optional Description column is only
    populated on the rows where it adds something a reader wouldn't already get from the
    Header Key/Compare Types/Expected Value columns alone. Subset mode — the actual response
    also carries Content-Type/Date/Connection/etc., never listed here, and that's fine.
    Given request headers for AUT are [merged] with '{"wibble": ["aa", "bb"], "wobble": "Hello World"}'
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT contains header values;
      | Header Key | Compare Types      | Expected Value | Description                              |
      | wibble     | count              | 2              | sent twice — checked by count, not value |
      | wobble     | contains           | world          |                                          |
      | wobble     | casesensitive      | Hello World    | exact case required                      |
      | wobble     | casesensitive, not | Hello WoRld    | exact case required and result inverted  |

  Scenario: has header values — exact set, every header /echo actually sends accounted for
    Unlike the literal/file/DataTable `has headers` family (hardcoded to exact-text
    equality), every row here carries its own compare type — the one genuinely dynamic
    header, Date, is matched with 'regexp' against the RFC 7231 HTTP-date shape instead of a
    fixed value, so this passes on every run despite Date's value changing every request.
    Given request headers for AUT are [merged] with '{"wibble": "aa"}'
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT has header values;
      | Header Key        | Compare Types | Expected Value                                               | Description                                  |
      | wibble            | equals        | aa                                                           | the one header this scenario actually set    |
      | content-type      | equals        | application/json                                             | fixed by /echo itself                        |
      | date              | regexp        | ^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$ | dynamic value — matched by shape, not text   |
      | connection        | equals        | keep-alive                                                   |                                              |
      | keep-alive        | contains      | timeout=                                                     | exact timeout value isn't worth pinning down |
      | transfer-encoding | equals        | chunked                                                      | no Content-Length — body length isn't fixed  |
