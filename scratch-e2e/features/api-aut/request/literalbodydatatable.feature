@full
Feature: Scratch example — quoted-literal body requests with DataTable, every structural combination

  Exercises:
  `When a '<method>' request to (AUT|[name]) path '<path>', [json|xml] body '<content>';` + a DataTable.
  Two areas of test;
  1. Literal json body with a JSON-Path/Value DataTable override
  2. Literal xml body with an XPath/Value DataTable override
  Test areas also excersize single/double-quotes usage for Method and body, and a spread of
  ValueExpression casts on the DataTable's own Value column (plain string, number:, boolean:).
  Identifying target by name or AUT.
  Bare body cannot take a DataTable at all, so it is not an area of test here.

  Background: Scratch Target App is running
    Given Application [Scratch Target App] is running

  Scenario Outline: literal json body + DataTable — <methodQuoted> to <target>, <bodyQuoted>
    Excersize Method and body quoting using single or double quotes across
    request target identified by name or AUT, with a JSON-Path/Value DataTable override —
    including number:/boolean: casts on the Value column.
    When a <methodQuoted> request to <target> path '/my-body', [json] body <bodyQuoted>;
      | JSON-Path | Value        |
      | $.a       | 2            |
      | $.b       | new          |
      | $.c       | number:99    |
      | $.d       | boolean:true |
    Examples:
      | methodQuoted | target               | bodyQuoted |
      | 'POST'       | AUT                  | '{"a":1}'  |
      | "POST"       | AUT                  | "{'a':1}"  |
      | 'POST'       | [Scratch Target App] | '{"a":1}'  |
      | "POST"       | [Scratch Target App] | "{'a':1}"  |
      | 'PUT'        | AUT                  | '{"a":1}'  |
      | "DELETE"     | AUT                  | "{'a':1}"  |
      | 'PUT'        | [Scratch Target App] | '{"a":1}'  |
      | "DELETE"     | [Scratch Target App] | "{'a':1}"  |

  Scenario Outline: literal xml body + DataTable — <methodQuoted> to <target>, <bodyQuoted>
    Excersize Method and body quoting using single or double quotes across
    request target identified by name or AUT, with an XPath/Value DataTable override.
    When a <methodQuoted> request to <target> path '/my-body', [xml] body <bodyQuoted>;
      | XPath | Value   |
      | /a    | updated |
    Examples:
      | methodQuoted | target               | bodyQuoted |
      | 'POST'       | AUT                  | '<a>1</a>' |
      | "POST"       | AUT                  | "<a>1</a>" |
      | 'POST'       | [Scratch Target App] | '<a>1</a>' |
      | "POST"       | [Scratch Target App] | "<a>1</a>" |
      | 'PUT'        | AUT                  | '<a>1</a>' |
      | "DELETE"     | AUT                  | "<a>1</a>" |
      | 'PUT'        | [Scratch Target App] | '<a>1</a>' |
      | "DELETE"     | [Scratch Target App] | "<a>1</a>" |

  
  Scenario Outline: literal <bodyKind> body + DataTable (<Logging Level>)
    Excersize every logging level against a representative json/xml literal body +
    DataTable override, same axes as the structural outlines above, just crossed with
    logging level instead of exhaustively combined.
    Given Logging level is set to [<Logging Level>]
    When a 'POST' request to AUT path '/my-body', [<bodyKind>] body <bodyQuoted>;
      | <pathColumn> | Value   |
      | <path>       | updated |
    Examples:
      | Logging Level         | bodyKind | bodyQuoted | pathColumn | path |
      | Test Information      | json     | '{"a":1}'  | JSON-Path  | $.a  |
      | Test Information      | xml      | '<a>1</a>' | XPath      | /a   |
      | Test Debug            | json     | '{"a":1}'  | JSON-Path  | $.a  |
      | Test Debug            | xml      | '<a>1</a>' | XPath      | /a   |
      | Framework Information | json     | '{"a":1}'  | JSON-Path  | $.a  |
      | Framework Information | xml      | '<a>1</a>' | XPath      | /a   |
      | Framework Debug       | json     | '{"a":1}'  | JSON-Path  | $.a  |
      | Framework Debug       | xml      | '<a>1</a>' | XPath      | /a   |
