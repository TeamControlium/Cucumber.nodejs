@full
Feature: Scratch example — no-body requests, every structural combination

  Exercises:
  `When a '<method>' request to (AUT|[name]) path '<path>'`.
  One area of test;
  1. No-body request, crossing method and path quoting with target identification
  Test areas also excersize a representative spread of method and path values — non-standard
  method, query string, apostrophe-containing path, and the 404 fallback path.
  Identifying target by name or AUT.

  Background: Scratch Target App is running
    Given Application [Scratch Target App] is running

  Scenario Outline: no-body request — <methodQuoted> to <target> path <pathQuoted>
    Excersize Method and path quoting using single or double quotes across
    request target identified by name or AUT.
    When a <methodQuoted> request to <target> path <pathQuoted>
    Examples:
      | methodQuoted | target               | pathQuoted          |
      | 'GET'        | AUT                  | '/status'           |
      | "GET"        | AUT                  | "/status"           |
      | 'GET'        | [Scratch Target App] | '/status'           |
      | "GET"        | [Scratch Target App] | "/status"           |
      | 'POST'       | AUT                  | '/my-body'          |
      | "DELETE"     | AUT                  | "/my-body"          |
      | 'PUT'        | [Scratch Target App] | '/my-query'         |
      | "WIBBLE"     | AUT                  | "/my-query?a=1&b=2" |
      | 'GET'        | AUT                  | "/o'brien"          |
      | 'GET'        | AUT                  | '/asdf'             |

  
  Scenario Outline: no-body request (<Logging Level>) — <methodQuoted> to <target> path <pathQuoted>
    Excersize every logging level against a representative spread of the no-body request
    step, same method/target/path axes as the structural outline above, just crossed with
    logging level instead of exhaustively combined.
    Given Logging level is set to [<Logging Level>]
    When a <methodQuoted> request to <target> path <pathQuoted>
    Examples:
      | Logging Level         | methodQuoted | target               | pathQuoted |
      | Test Information      | 'GET'        | AUT                  | '/status'  |
      | Test Information      | "DELETE"     | [Scratch Target App] | "/asdf"    |
      | Test Debug            | 'GET'        | AUT                  | '/status'  |
      | Test Debug            | "DELETE"     | [Scratch Target App] | "/asdf"    |
      | Framework Information | 'GET'        | AUT                  | '/status'  |
      | Framework Information | "DELETE"     | [Scratch Target App] | "/asdf"    |
      | Framework Debug       | 'GET'        | AUT                  | '/status'  |
      | Framework Debug       | "DELETE"     | [Scratch Target App] | "/asdf"    |
