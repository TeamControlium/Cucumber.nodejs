@full
Feature: Scratch example — JSON body built entirely from a DataTable, every structural combination

  Exercises:
  `When a '<method>' request to (AUT|[name]) path '<path>', json body;` + a DataTable —
  no literal/file base at all; the body is built from nothing (an empty `{}`) purely by the
  DataTable's own JSON-Path/Value rows.
  Two areas of test;
  1. A single flat row
  2. Multiple rows, nested paths, and a spread of ValueExpression casts on the Value column
     (plain string, number:, boolean:, json:)
  "xml"/"yaml"/bare body have no equivalent — there's no established "build a whole
  document from path-mutations against nothing" convention for them (JsonUtils.updateJSONObject
  happily creates missing intermediate objects/arrays; nothing else here does) — so neither
  is an area of test here. Identifying target by name or AUT.

  Background: Scratch Target App is running
    Given Application [Scratch Target App] is running

  Scenario Outline: JSON body built entirely from a DataTable — <methodQuoted> to <target>
    Excersize Method quoting using single or double quotes across request target identified
    by name or AUT, with a single flat JSON-Path/Value row.
    When a <methodQuoted> request to <target> path '/my-body', json body;
      | JSON-Path | Value |
      | $.name    | Bob   |
    Examples:
      | methodQuoted | target               |
      | 'POST'       | AUT                  |
      | "POST"       | [Scratch Target App] |
      | 'PUT'        | AUT                  |
      | "DELETE"     | [Scratch Target App] |

  Scenario: multiple rows, nested paths, and a spread of ValueExpression casts
    Excersize nested-path creation (JsonUtils.updateJSONObject building missing intermediate
    objects/arrays along the way) and every cast kind a DataTable Value cell supports.
    When a 'POST' request to AUT path '/my-body', json body;
      | JSON-Path          | Value         |
      | $.name              | Bob           |
      | $.age               | number:42     |
      | $.active            | boolean:true  |
      | $.address.city      | London        |
      | $.tags[0]           | admin         |
      | $.tags[1]           | json:"editor" |
      | $.profile           | json:{"nested": true} |

  
  Scenario Outline: JSON body built entirely from a DataTable (<Logging Level>)
    Excersize every logging level against a representative DataTable-built JSON body.
    Given Logging level is set to [<Logging Level>]
    When a 'POST' request to AUT path '/my-body', json body;
      | JSON-Path | Value     |
      | $.name    | Bob       |
      | $.age     | number:42 |
    Examples:
      | Logging Level         |
      | Test Information      |
      | Test Debug            |
      | Framework Information |
      | Framework Debug       |
