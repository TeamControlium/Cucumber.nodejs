@full
Feature: Scratch example — DocString body requests, every structural combination

  Exercises:
  `When a '<method>' request to (AUT|[name]) path '<path>', [json|xml|yaml]?body(?: ('<escaped>' line endings))?:` + a DocString.
  Three areas of test;
  1. DocString a bare body of just text
  2. DocString in correctly declared json/xml/yaml
  3. DocString plain body, but with different line endings
  Test areas also excersize single/double-quotes usage for Method.
  Identifying target by name or AUT.
  Allowing JSON5 syntax for json when DocString is json.

  Background: Scratch Target App is running
    Given Application [Scratch Target App] is running

  
  Scenario Outline: DocString (<Logging Level>) bare body — <methodQuoted> to <target>
    Excersize Method quoting using single or double quotes across
    request target identified by name or AUT and plain DocString body.
    Given Logging level is set to [<Logging Level>]
    When a <methodQuoted> request to <target> path '/my-body', body:
      """
      plain text value
      """
    Examples:
      | Logging Level         | methodQuoted | target               |
      | Test Information      | 'GET'        | AUT                  |
      | Test Information      | "GET"        | AUT                  |
      | Test Information      | 'GET'        | [Scratch Target App] |
      | Test Information      | "GET"        | [Scratch Target App] |
      | Test Debug            | 'GET'        | AUT                  |
      | Test Debug            | "GET"        | AUT                  |
      | Test Debug            | 'GET'        | [Scratch Target App] |
      | Test Debug            | "GET"        | [Scratch Target App] |
      | Framework Information | 'GET'        | AUT                  |
      | Framework Information | "GET"        | AUT                  |
      | Framework Information | 'GET'        | [Scratch Target App] |
      | Framework Information | "GET"        | [Scratch Target App] |
      | Framework Debug       | 'GET'        | AUT                  |
      | Framework Debug       | "GET"        | AUT                  |
      | Framework Debug       | 'GET'        | [Scratch Target App] |
      | Framework Debug       | "GET"        | [Scratch Target App] |


  
  Scenario Outline: DocString (<Logging Level>) <bodyKind> body — <methodQuoted> to <target>
    Excersize Method quoting using single or double quotes across
    request target identified by name or AUT, with body declared json, xml or yaml.
    Given Logging level is set to [<Logging Level>]
    When a <methodQuoted> request to <target> path '/my-body', [<bodyKind>] body:
      """
      <docStringContent>
      """
    Examples:
      | Logging Level         | methodQuoted | target               | bodyKind | docStringContent |
      | Test Information      | 'POST'       | AUT                  | json     | {"a":1}          |
      | Test Information      | "POST"       | AUT                  | json     | {'a':1}          |
      | Test Information      | 'POST'       | [Scratch Target App] | json     | {"a":1}          |
      | Test Information      | "POST"       | [Scratch Target App] | json     | {'a':1}          |
      | Test Information      | 'PUT'        | AUT                  | xml      | <a>1</a>         |
      | Test Information      | "PUT"        | AUT                  | xml      | <a>1</a>         |
      | Test Information      | 'PUT'        | [Scratch Target App] | xml      | <a>1</a>         |
      | Test Information      | "PUT"        | [Scratch Target App] | xml      | <a>1</a>         |
      | Test Information      | 'DELETE'     | AUT                  | yaml     | a: 1             |
      | Test Information      | "WIBBLE"     | AUT                  | yaml     | a: 1             |
      | Test Information      | 'DELETE'     | [Scratch Target App] | yaml     | a: 1             |
      | Test Information      | "WIBBLE"     | [Scratch Target App] | yaml     | a: 1             |
      | Test Debug            | 'POST'       | AUT                  | json     | {"a":1}          |
      | Test Debug            | "POST"       | AUT                  | json     | {'a':1}          |
      | Test Debug            | 'POST'       | [Scratch Target App] | json     | {"a":1}          |
      | Test Debug            | "POST"       | [Scratch Target App] | json     | {'a':1}          |
      | Test Debug            | 'PUT'        | AUT                  | xml      | <a>1</a>         |
      | Test Debug            | "PUT"        | AUT                  | xml      | <a>1</a>         |
      | Test Debug            | 'PUT'        | [Scratch Target App] | xml      | <a>1</a>         |
      | Test Debug            | "PUT"        | [Scratch Target App] | xml      | <a>1</a>         |
      | Test Debug            | 'DELETE'     | AUT                  | yaml     | a: 1             |
      | Test Debug            | "WIBBLE"     | AUT                  | yaml     | a: 1             |
      | Test Debug            | 'DELETE'     | [Scratch Target App] | yaml     | a: 1             |
      | Test Debug            | "WIBBLE"     | [Scratch Target App] | yaml     | a: 1             |
      | Framework Information | 'POST'       | AUT                  | json     | {"a":1}          |
      | Framework Information | "POST"       | AUT                  | json     | {'a':1}          |
      | Framework Information | 'POST'       | [Scratch Target App] | json     | {"a":1}          |
      | Framework Information | "POST"       | [Scratch Target App] | json     | {'a':1}          |
      | Framework Information | 'PUT'        | AUT                  | xml      | <a>1</a>         |
      | Framework Information | "PUT"        | AUT                  | xml      | <a>1</a>         |
      | Framework Information | 'PUT'        | [Scratch Target App] | xml      | <a>1</a>         |
      | Framework Information | "PUT"        | [Scratch Target App] | xml      | <a>1</a>         |
      | Framework Information | 'DELETE'     | AUT                  | yaml     | a: 1             |
      | Framework Information | "WIBBLE"     | AUT                  | yaml     | a: 1             |
      | Framework Information | 'DELETE'     | [Scratch Target App] | yaml     | a: 1             |
      | Framework Information | "WIBBLE"     | [Scratch Target App] | yaml     | a: 1             |
      | Framework Debug       | 'POST'       | AUT                  | json     | {"a":1}          |
      | Framework Debug       | "POST"       | AUT                  | json     | {'a':1}          |
      | Framework Debug       | 'POST'       | [Scratch Target App] | json     | {"a":1}          |
      | Framework Debug       | "POST"       | [Scratch Target App] | json     | {'a':1}          |
      | Framework Debug       | 'PUT'        | AUT                  | xml      | <a>1</a>         |
      | Framework Debug       | "PUT"        | AUT                  | xml      | <a>1</a>         |
      | Framework Debug       | 'PUT'        | [Scratch Target App] | xml      | <a>1</a>         |
      | Framework Debug       | "PUT"        | [Scratch Target App] | xml      | <a>1</a>         |
      | Framework Debug       | 'DELETE'     | AUT                  | yaml     | a: 1             |
      | Framework Debug       | "WIBBLE"     | AUT                  | yaml     | a: 1             |
      | Framework Debug       | 'DELETE'     | [Scratch Target App] | yaml     | a: 1             |
      | Framework Debug       | "WIBBLE"     | [Scratch Target App] | yaml     | a: 1             |

  
  Scenario Outline: DocString (<Logging Level>) line-ending override — (<lineEnding> line endings)
    Excersize every line-ending escape form the DocString body step supports across a
    fixed method and target.
    Given Logging level is set to [<Logging Level>]
    When a 'GET' request to AUT path '/my-body', body ('<lineEnding>' line endings):
      """
      a
      b
      """
    Examples:
      | Logging Level         | lineEnding   |
      | Test Information      | /n           |
      | Test Information      | /r           |
      | Test Information      | /t           |
      | Test Information      | /b           |
      | Test Information      | /f           |
      | Test Information      | /v           |
      | Test Information      | /0           |
      | Test Information      | /#65;        |
      | Test Information      | /#0x41;      |
      | Test Information      | /#0o101;     |
      | Test Information      | /#0b1000001; |
      | Test Information      | //           |
      | Test Information      | /r/n         |
      | Test Debug            | /n           |
      | Test Debug            | /r           |
      | Test Debug            | /t           |
      | Test Debug            | /b           |
      | Test Debug            | /f           |
      | Test Debug            | /v           |
      | Test Debug            | /0           |
      | Test Debug            | /#65;        |
      | Test Debug            | /#0x41;      |
      | Test Debug            | /#0o101;     |
      | Test Debug            | /#0b1000001; |
      | Test Debug            | //           |
      | Test Debug            | /r/n         |
      | Framework Information | /n           |
      | Framework Information | /r           |
      | Framework Information | /t           |
      | Framework Information | /b           |
      | Framework Information | /f           |
      | Framework Information | /v           |
      | Framework Information | /0           |
      | Framework Information | /#65;        |
      | Framework Information | /#0x41;      |
      | Framework Information | /#0o101;     |
      | Framework Information | /#0b1000001; |
      | Framework Information | //           |
      | Framework Information | /r/n         |
      | Framework Debug       | /n           |
      | Framework Debug       | /r           |
      | Framework Debug       | /t           |
      | Framework Debug       | /b           |
      | Framework Debug       | /f           |
      | Framework Debug       | /v           |
      | Framework Debug       | /0           |
      | Framework Debug       | /#65;        |
      | Framework Debug       | /#0x41;      |
      | Framework Debug       | /#0o101;     |
      | Framework Debug       | /#0b1000001; |
      | Framework Debug       | //           |
      | Framework Debug       | /r/n         |
