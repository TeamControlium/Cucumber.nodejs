@full @api @request @body
Feature: Scratch example — Detokeniser tokens resolved inside a request body, every area of body-building

  Exercises token resolution across every mechanism this package uses to build a request
  body — plain literal text, literal json/xml content, file-sourced json/yaml content, a
  plain DataTable Value cell, and a DataTable Value cell wrapped in a ValueExpression cast
  (`number:`/`json:`). That last area is the one `resolveDataTableRows` fixes: before it
  detokenised every DataTable cell unconditionally at read time, a token inside a cast
  argument (e.g. `number:[[random;digits;2]]`) failed outright — the cast tried to convert
  the literal, unresolved token text itself, not the value it was meant to resolve to.
  This suite sets `Detokeniser.delimiter` to `;` (see src/index.ts's own `Before` hook —
  `|` collides with a DataTable's own column separator), so every token below uses `;`
  between verb and arguments, not `|`.
  Literal yaml body isn't reachable through this file's token-in-literal-content area —
  see literalbody.feature's own doc comment for why — so the file-sourced-content area
  below covers both json and yaml.

  Background: Scratch Target App is running
    Given Application [Scratch Target App] is running

  Scenario: token in a plain/bare literal body
    When a 'POST' request to AUT path '/my-body', body '[[random;letters;5]]'

  Scenario: token embedded as a string value inside literal json body content
    When a 'POST' request to AUT path '/my-body', [json] body '{"ref":"[[random;digits;6]]"}'

  Scenario: token embedded inside literal xml body content
    When a 'POST' request to AUT path '/my-body', [xml] body '<ref>[[random;digits;6]]</ref>'

  Scenario: token embedded in file-sourced json body content
    Fixture (testdata/request-body/tokenised.json) has the token baked into its own
    content, not its filename — see filebody.feature's "file path itself carries a token"
    scenario for the filename case, not duplicated here.
    When a 'POST' request to AUT path '/my-body', [json] file [request-body/tokenised.json]

  Scenario: token embedded in file-sourced yaml body content
    When a 'POST' request to AUT path '/my-body', [yaml] file [request-body/tokenised.yaml]

  Scenario: token in a plain DataTable Value cell, no cast
    Same shape already exercised incidentally in databuiltbody.feature's own
    logging-crossed outline ($.name | [[random;letters;5]]) — restated here as its own,
    explicit area for completeness.
    When a 'POST' request to AUT path '/my-body', json body;
      | JSON-Path | Value                 |
      | $.ref     | [[random;letters;5]] |

  Scenario: token nested inside a DataTable Value cell's number: cast argument
    The exact shape that failed before resolveDataTableRows started detokenising every
    cell at read time, ahead of any ValueExpression cast — number:[[...]] used to try
    casting the literal token text itself, rather than the digits it resolves to.
    When a 'POST' request to AUT path '/my-body', json body;
      | JSON-Path | Value                       |
      | $.count   | number:[[random;digits;2]] |

  Scenario: token nested inside a DataTable Value cell's json: cast argument
    Same class of fix as the number: case above, for a token embedded inside a json:
    cast's own JSON-shaped argument.
    When a 'POST' request to AUT path '/my-body', json body;
      | JSON-Path | Value                                      |
      | $.nested  | json:{"ref":"[[random;letters;4]]"}        |


  Scenario Outline: token in body (<Logging Level>)
    Excersize every logging level against a representative token-in-body case — the
    DataTable-cell-cast one, since that's the area this file exists to prove.
    Given Logging level is set to [<Logging Level>]
    When a 'POST' request to AUT path '/my-body', json body;
      | JSON-Path | Value                       |
      | $.count   | number:[[random;digits;2]] |
    Examples:
      | Logging Level         |
      | Test Information      |
      | Test Debug            |
      | Framework Information |
      | Framework Debug       |
