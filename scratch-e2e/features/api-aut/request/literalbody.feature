@full
Feature: Scratch example — quoted-literal body requests, every structural combination

  Exercises:
  `When a '<method>' request to (AUT|[name]) path '<path>', [json|xml]?body '<content>'`.
  Two areas of test;
  1. Literal bare body of just text
  2. Literal body declared json or xml
  Test areas also excersize single/double-quotes usage for Method and body.
  Identifying target by name or AUT.
  Allowing JSON5 syntax for json body content.

  Background: Scratch Target App is running
    Given Application [Scratch Target App] is running

  Scenario Outline: literal bare body — <methodQuoted> to <target>, body <bodyQuoted>
    Excersize Method and body quoting using single or double quotes across
    request target identified by name or AUT.
    When a <methodQuoted> request to <target> path '/my-body', body <bodyQuoted>
    Examples:
      | methodQuoted | target                | bodyQuoted           |
      | 'GET'        | AUT                   | 'plain text value'   |
      | "GET"        | AUT                   | "plain text value"   |
      | 'GET'        | [Scratch Target App]  | 'plain text value'   |
      | "GET"        | [Scratch Target App]  | "plain text value"   |
      | 'DELETE'     | AUT                   | 'plain text value'   |
      | "WIBBLE"     | AUT                   | "plain text value"   |
      | 'POST'       | [Scratch Target App]  | 'plain text value'   |
      | "PUT"        | [Scratch Target App]  | "plain text value"   |

  Scenario Outline: literal <bodyKind> body — <methodQuoted> to <target>, <bodyKind> body <bodyQuoted>
    Excersize Method and body quoting using single or double quotes across
    request target identified by name or AUT, with body declared json or xml — including the
    JSON5-leniency boundary (unquoted key, trailing comma) and the "other quote character
    embedded unescaped" boundary (a single-quoted body containing double quotes, and vice
    versa).
    When a <methodQuoted> request to <target> path '/my-body', [<bodyKind>] body <bodyQuoted>
    Examples:
      | methodQuoted | target                | bodyKind | bodyQuoted      |
      | 'POST'       | AUT                   | json     | '{"a":1}'       |
      | "POST"       | AUT                   | json     | "{'a':1}"       |
      | 'POST'       | [Scratch Target App]  | json     | '{"a":1}'       |
      | "POST"       | [Scratch Target App]  | json     | "{'a':1}"       |
      | 'DELETE'     | [Scratch Target App]  | json     | '{"a":1}'       |
      | "WIBBLE"     | [Scratch Target App]  | json     | "{'a':1}"       |
      | 'POST'       | AUT                   | json     | '{a:1,}'        |
      | 'PUT'        | AUT                   | xml      | '<a>1</a>'      |
      | "PUT"        | AUT                   | xml      | "<a>1</a>"      |
      | 'PUT'        | [Scratch Target App]  | xml      | '<a>1</a>'      |
      | "PUT"        | [Scratch Target App]  | xml      | "<a>1</a>"      |
      | 'DELETE'     | AUT                   | xml      | '<a>1</a>'      |
      | "WIBBLE"     | AUT                   | xml      | "<a>1</a>"      |

  
  Scenario Outline: literal bare body (<Logging Level>)
    Excersize every logging level against the bare literal body, same quoting/target axes
    as the structural outline above, just crossed with logging level instead of
    exhaustively combined.
    Given Logging level is set to [<Logging Level>]
    When a 'POST' request to AUT path '/my-body', body 'plain text value'
    Examples:
      | Logging Level         |
      | Test Information      |
      | Test Debug            |
      | Framework Information |
      | Framework Debug       |

  
  Scenario Outline: literal <bodyKind> body (<Logging Level>) — <bodyQuoted>
    Excersize every logging level against a representative json/xml literal body, same
    quoting/target axes as the structural outline above, just crossed with logging level
    instead of exhaustively combined.
    Given Logging level is set to [<Logging Level>]
    When a 'POST' request to AUT path '/my-body', [<bodyKind>] body <bodyQuoted>
    Examples:
      | Logging Level         | bodyKind | bodyQuoted |
      | Test Information      | json     | '{"a":1}'  |
      | Test Information      | xml      | '<a>1</a>' |
      | Test Debug            | json     | '{"a":1}'  |
      | Test Debug            | xml      | '<a>1</a>' |
      | Framework Information | json     | '{"a":1}'  |
      | Framework Information | xml      | '<a>1</a>' |
      | Framework Debug       | json     | '{"a":1}'  |
      | Framework Debug       | xml      | '<a>1</a>' |
