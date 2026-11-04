@full
Feature: Scratch example — test-data-file body requests with DataTable, every structural combination

  Exercises:
  `When a '<method>' request to (AUT|[name]) path '<path>', [json|xml|yaml] file [<filename>];` + a DataTable.
  Three areas of test;
  1. File-sourced json body with a JSON-Path/Value DataTable override
  2. File-sourced xml body with an XPath/Value DataTable override
  3. File-sourced yaml body with a JSON-Path/Value DataTable override (yaml shares json's
     JSON-Path convention — see APIUtils.resolveRequestHTTPBody's own doc comment for why)
  "bin" and bare/text files cannot take a DataTable at all — opaque/binary content has no
  structure to mutate — so neither is an area of test here.

  Background: Scratch Target App is running
    Given Application [Scratch Target App] is running

  Scenario Outline: <bodyKind> file body + DataTable — <methodQuoted> to <target>
    Excersize Method quoting using single or double quotes across request target identified
    by name or AUT, with a path/value DataTable override on top of a file-sourced
    json/xml/yaml body.
    When a <methodQuoted> request to <target> path '/my-body', [<bodyKind>] file [<filename>];
      | <pathColumn> | Value   |
      | <path>       | updated |
    Examples:
      | methodQuoted | target               | bodyKind | filename               | pathColumn | path |
      | 'POST'       | AUT                  | json     | request-body/base.json | JSON-Path  | $.a  |
      | "POST"       | [Scratch Target App] | json     | request-body/base.json | JSON-Path  | $.a  |
      | 'PUT'        | AUT                  | xml      | request-body/base.xml  | XPath      | /a   |
      | "PUT"        | [Scratch Target App] | xml      | request-body/base.xml  | XPath      | /a   |
      | 'DELETE'     | AUT                  | yaml     | request-body/base.yaml | JSON-Path  | $.a  |
      | "WIBBLE"     | [Scratch Target App] | yaml     | request-body/base.yaml | JSON-Path  | $.a  |

  
  Scenario Outline: file body + DataTable (<Logging Level>) — <bodyKind>
    Excersize every logging level against a representative json file-sourced body +
    DataTable override.
    Given Logging level is set to [<Logging Level>]
    When a 'POST' request to AUT path '/my-body', [<bodyKind>] file [<filename>];
      | JSON-Path | Value   |
      | $.a       | updated |
    Examples:
      | Logging Level         | bodyKind | filename               |
      | Test Information      | json     | request-body/base.json |
      | Test Debug            | json     | request-body/base.json |
      | Framework Information | json     | request-body/base.json |
      | Framework Debug       | json     | request-body/base.json |
