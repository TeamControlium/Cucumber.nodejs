@full
Feature: Scratch example — response headers contain subset (test data file), every structural combination

  Exercises exactly one step definition:
  `Then Response from (AUT|API|[name]) contains headers in test data file [<filename>]` —
  same subset semantics as the literal form, sourced from a JSON test-data file instead.
  Fixtures live under this package's own testdata/headers/ — scratch-e2e has no
  CONTROLIUM_TEST_DATA_PATH override, so the default (process.cwd()/testdata) already
  resolves there.

  Reuses testdata/headers/base.json ({"Authorization": "Bearer file-token", "X-From-File":
  "yes"}) on both sides of the round trip — set as request headers from the same file, then
  checked back against that same file once /echo reflects them — so the fixture is the
  single source of truth for what's expected, not duplicated inline.

  Background: Scratch Target App is running
    Given Application [Scratch Target App] is running

  Scenario: contains headers in test data file — round trip through the same fixture, with a DataTable override adding a key
    Given request headers for AUT are [merged] using test data file [headers/base.json];
      | Header Key | Value           |
      | my-test    | different value |
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT contains headers in test data file [headers/base.json];
      | Header Key | Value           |
      | my-test    | different value |

  Scenario: contains headers in test data file — DataTable override deletes keys via _undefined before validation
    The request here never sets 'Authorization' or 'my-test' at all — only 'X-From-File',
    via its own literal. Checking the file's other two entries as-is would fail, since the
    actual response never carries them. The DataTable override deletes both from the
    expected set entirely via the `_undefined` sentinel before validation runs, so only
    'X-From-File' (which the request did send) is ever actually checked.
    Given request headers for AUT are [merged] using test data file [headers/base.json];
      | Header Key    | Value      |
      | Authorization | _undefined |
      | my-test       | _undefined |
    When a 'GET' request to AUT path '/echo', body 'x'
    Then Response from AUT contains headers in test data file [headers/base.json];
      | Header Key    | Value      |
      | Authorization | _undefined |
      | my-test       | _undefined |
