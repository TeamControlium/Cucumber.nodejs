@full
Feature: Scratch example — requests to a non-AUT API (Postman Echo)

  Scenario Outline: no-body request — <methodQuoted> to <target> path <pathQuoted>
    Excersize Method and path quoting using single or double quotes across request target
    identified by name or API, against a real external API rather than any AUT.
    When a <methodQuoted> request to <target> path <pathQuoted>
    Examples:
      | methodQuoted | target          | pathQuoted    |
      | 'GET'        | API             | '/get'        |
      | "GET"        | API             | "/get"        |
      | 'GET'        | [Postman Echo]  | '/get'        |
      | "GET"        | [Postman Echo]  | "/get"        |
      | 'GET'        | API             | '/headers'    |
      | 'GET'        | [Postman Echo]  | '/status/201' |
      | 'DELETE'     | API             | '/delete'     |
      | 'PUT'        | [Postman Echo]  | '/put'        |

  Scenario Outline: literal json body — <methodQuoted> to <target>, body <bodyQuoted>
    Excersize a JSON literal body request against the real external API, by API
    and by name, mirroring features/api-aut/request/literalbody.feature's own json cases
    but without any local AUT involved — including the JSON5-leniency boundary (single
    quotes, unquoted keys inside the body) that step already supports.
    When a <methodQuoted> request to <target> path '/post', [json] body <bodyQuoted>
    Examples:
      | methodQuoted | target          | bodyQuoted |
      | 'POST'       | API             | '{"a":1}'  |
      | "POST"       | [Postman Echo]  | "{'a':1}"  |
      | 'PUT'        | API             | '{"a":1}'  |

  Scenario Outline: query string embedded in the path — <target> path <pathQuoted>
    Excersize a query string embedded directly in the path (same no-body request step as
    the outline above, not queryString.steps.ts's own session-level step — see
    features/api-aut/request/nobody.feature's own "WIBBLE" example for the equivalent
    against the local AUT) against the real external API — Postman Echo's own `/get`
    route echoes back whatever query string it actually received, as JSON, under `args`.
    When a 'GET' request to <target> path <pathQuoted>
    Examples:
      | target          | pathQuoted             |
      | API             | '/get?foo=bar'         |
      | [Postman Echo]  | "/get?foo=bar&baz=qux" |

  Scenario Outline: no-body request (<Logging Level>) — <target> path <pathQuoted>
    Excersize every logging level against a representative no-body request to the real
    external API, same target axis as the structural outline above, just crossed with
    logging level instead of exhaustively combined.
    Given Logging level is set to [<Logging Level>]
    When a 'GET' request to <target> path <pathQuoted>
    Examples:
      | Logging Level         | target          | pathQuoted |
      | Test Information      | API             | '/get'     |
      | Test Debug            | [Postman Echo]  | '/get'     |
      | Framework Information | API             | '/get'     |
      | Framework Debug       | [Postman Echo]  | '/get'     |
