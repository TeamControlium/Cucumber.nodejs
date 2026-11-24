@full
Feature: Scratch example — response headers contain subset (literal), every structural combination

  Exercises exactly one step definition:
  `Then Response from (AUT|API|[name]) contains headers '...'`/`"..."` — every given
  header/value must be present; the actual response is free to carry more (unlike the
  exact-set `has headers` family, deliberately not covered by this suite — see this
  directory's own notes on why a real HTTP response's automatic Date/Connection/
  Transfer-Encoding headers make exact-set untestable against a genuine network response).
  Source is a flat JSON(5) object literal — same quoting convention (either `'...'` or
  `"..."`, verbatim) as `headers.steps.ts` uses for *setting* request headers.

  Background: Scratch Target App is running
    Given Application [Scratch Target App] is running

  Scenario: contains headers — single-quote delimiter, single header
    Given request headers for AUT are [merged] with '{"wibble": "aa"}'
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT contains headers '{"wibble": "aa"}'

  Scenario: contains headers — double-quote delimiter wrapping single-quoted JSON5 content
    Given request headers for AUT are [merged] with "{'wibble': 'aa'}"
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT contains headers "{'wibble': 'aa'}"

  Scenario: contains headers — actual response carries extras beyond the expected subset
    The response always carries more than just 'wibble' (Content-Type, Date, Connection,
    etc., from the real HTTP response) — this passing is itself the proof that "contains"
    tolerates extras, unlike exact-set.
    Given request headers for AUT are [merged] with '{"wibble": "aa"}'
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT contains headers '{"wibble": "aa"}'

  Scenario: contains headers — expected value is itself an array (a repeated header)
    Given request headers for AUT are [merged] with '{"wibble": ["aa", "bb"]}'
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT contains headers '{"wibble": ["aa", "bb"]}'

  Scenario: contains headers — target identified by [name] rather than AUT
    Given request headers for [Scratch Target App] are [merged] with '{"wibble": "aa"}'
    When a 'GET' request to [Scratch Target App] path '/echo', body 'x'
    Then Response from [Scratch Target App] contains headers '{"wibble": "aa"}'

  Scenario: contains headers — DataTable override on top of the literal; overrides a value and deletes a key via _undefined
    The literal base deliberately gets 'wibble' wrong and adds a 'wobble' key the actual
    response never carries — the DataTable override corrects 'wibble' to the real value and
    deletes 'wobble' entirely via the `_undefined` sentinel (same convention
    `JsonUtils.resolveSentinels`/`API_AUTWrapper.setHeaders` already use for request headers)
    before validation runs, so only the corrected, reduced set is ever actually checked.
    Given request headers for AUT are [merged] with '{"wibble": "aa"}'
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT contains headers '{"wibble": "wrong value", "wobble": "never sent"}';
      | Header Key | Value      |
      | wibble     | aa         |
      | wobble     | _undefined |
