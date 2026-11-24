@full
Feature: Scratch example — response validation (status, body, headers)

  Exercises `validation.steps.ts`/`headerValidation.steps.ts` — status, full/partial
  JSON/XML/text body, and header presence/value/subset — against the local target app's own
  real responses (`target-app/server.js`): `/status` (200, `{"status":"ok"}`, JSON), `/my-body`
  (echoes whatever was sent, verbatim, with a matching Content-Type), and a 404 fallback for
  anything else.

  `contains headers`, not `has headers` (exact-set), is used throughout for header checks —
  a real HTTP server response always carries extra headers this suite never asked about
  (`Date`, `Connection`, `Content-Length`, ...), so an exact-set check would be inherently
  flaky against a live server; `has headers` (exact-set) is already covered by
  `headerValidation.steps.spec.ts`'s own fully-controlled unit tests instead.

  Background: Scratch Target App is running
    Given Application [Scratch Target App] is running

  Scenario: status only
    When a 'GET' request to AUT path '/status'
    Then Response from AUT status is '200'

  Scenario: status + full JSON body, structural (key order doesn't matter)
    When a 'GET' request to AUT path '/status'
    Then Response from AUT status is '200', [json] body '{"status":"ok"}'

  Scenario: status + full text body, contains compare type
    When a 'GET' request to AUT path '/status'
    Then Response from AUT status is '200', [text] body [contains] 'ok'

  Scenario: status + a 404 fallback for an unrecognised path
    When a 'GET' request to AUT path '/does-not-exist'
    Then Response from AUT status is '404', [json] body '{"error":"not found"}'

  Scenario: partial JSON body validation via DataTable
    When a 'GET' request to AUT path '/status'
    Then Response from AUT status is '200', [json] body;
      | JSON-Path | Compare Types | Expected Value |
      | $.status  | equals        | ok             |

  Scenario: full XML body round-trip via /my-body's echo
    When a 'POST' request to AUT path '/my-body', [xml] body '<a><b>1</b></a>'
    Then Response from AUT status is '200', [xml] body '<a><b>1</b></a>'

  Scenario: partial text body validation via a RegExp DataTable row
    When a 'POST' request to AUT path '/my-body', body 'request-id: abc-123'
    Then Response from AUT status is '200', body;
      | RegExp                | Compare Types | Expected Value |
      | request-id: (\S+)     | equals        | abc-123        |

  Scenario: header presence — positive and negative
    When a 'GET' request to AUT path '/status'
    Then Response from AUT has header named 'Content-Type'
    Then Response from AUT does not have header named 'X-Does-Not-Exist'

  Scenario: header value, with a compare type
    When a 'GET' request to AUT path '/status'
    Then Response from AUT header 'Content-Type' has value [contains] 'json'

  Scenario: header subset — the real response carries more headers than this asks about
    When a 'GET' request to AUT path '/status'
    Then Response from AUT contains headers '{"Content-Type":"application/json"}'

  Scenario: header value via DataTable
    When a 'POST' request to AUT path '/my-body', [xml] body '<a>1</a>'
    Then Response from AUT contains header values;
      | Header Key   | Compare Types | Expected Value   |
      | Content-Type | equals        | application/xml  |
