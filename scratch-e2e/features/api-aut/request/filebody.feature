@full
Feature: Scratch example — test-data-file body requests, every structural combination

  Exercises:
  `When a '<method>' request to (AUT|[name]) path '<path>', [json|xml|yaml|text|bin]?file [<filename>]`.
  Three areas of test;
  1. File-sourced bare body — no kind word at all, and the explicit "text" keyword
  2. File-sourced body declared json, xml, yaml, or bin (raw bytes, untouched)
  3. A token embedded in the filename itself, resolved before the file is loaded
  Test areas also excersize single/double-quotes usage for Method, and target identification
  by name or AUT. Fixtures live under this package's own testdata/request-body/ (the same
  ones @controlium/cucumber-driver's own request.steps.spec.ts uses) — scratch-e2e has no
  CONTROLIUM_TEST_DATA_PATH override, so the default (process.cwd()/testdata, i.e. this
  package's root testdata/ folder) already resolves there.

  Background: Scratch Target App is running
    Given Application [Scratch Target App] is running

  Scenario Outline: bare file body — <methodQuoted> to <target>, file [<filename>]
    Excersize Method quoting using single or double quotes across request target identified
    by name or AUT, with a file-sourced body and no kind word at all (opaque text, the
    default).
    When a <methodQuoted> request to <target> path '/my-body', file [<filename>]
    Examples:
      | methodQuoted | target               | filename               |
      | 'GET'        | AUT                  | request-body/plain.txt |
      | "GET"        | [Scratch Target App] | request-body/plain.txt |
      | 'POST'       | AUT                  | request-body/plain.txt |
      | "DELETE"     | [Scratch Target App] | request-body/plain.txt |

  Scenario Outline: explicit "text" file body — <methodQuoted> to <target>
    Excersize the explicit "text" kind word — behaves identically to the bare form above,
    just spelled out.
    When a <methodQuoted> request to <target> path '/my-body', [text] file [request-body/plain.txt]
    Examples:
      | methodQuoted | target               |
      | 'POST'       | AUT                  |
      | "DELETE"     | [Scratch Target App] |

  Scenario Outline: <bodyKind> file body — <methodQuoted> to <target>, <bodyKind> file [<filename>]
    Excersize Method quoting using single or double quotes across request target identified
    by name or AUT, with every structured/binary file-sourced body kind.
    When a <methodQuoted> request to <target> path '/my-body', [<bodyKind>] file [<filename>]
    Examples:
      | methodQuoted | target               | bodyKind | filename               |
      | 'POST'       | AUT                  | json     | request-body/base.json |
      | "POST"       | [Scratch Target App] | json     | request-body/base.json |
      | 'PUT'        | AUT                  | xml      | request-body/base.xml  |
      | "PUT"        | [Scratch Target App] | xml      | request-body/base.xml  |
      | 'DELETE'     | AUT                  | yaml     | request-body/base.yaml |
      | "WIBBLE"     | [Scratch Target App] | yaml     | request-body/base.yaml |
      | 'POST'       | AUT                  | bin      | request-body/base.bin  |
      | "PUT"        | [Scratch Target App] | bin      | request-body/base.bin  |

  Scenario: file path itself carries a token, resolved before the file is loaded
    Token embedded in the filename (not the file's content) is resolved first — the
    settings default below is never actually set, so this always falls through to its
    defaultValue, "request-body/base" — proving the path, not just the content, is
    detokenised. The token deliberately starts the whole filename (nothing, especially not
    literal "/", immediately precedes the opening "[[") — Detokeniser's own escape
    character is "/", a known, separately-tracked collision with URL/file paths, not
    something this scratch example exists to probe.
    When a 'POST' request to AUT path '/my-body', [json] file [[[setting|processEnvName: "SCRATCH_E2E_FILEBODY_TOKEN_NOT_SET", defaultValue: "request-body/base"]].json]

  
  Scenario Outline: file body (<Logging Level>) — <bodyKind> file [<filename>]
    Excersize every logging level against a representative json/bin file-sourced body —
    bin specifically, since byte-exact content is the one case most likely to interact
    oddly with a beautified log line.
    Given Logging level is set to [<Logging Level>]
    When a 'POST' request to AUT path '/my-body', [<bodyKind>] file [<filename>]
    Examples:
      | Logging Level         | bodyKind | filename               |
      | Test Information      | json     | request-body/base.json |
      | Test Information      | bin      | request-body/base.bin  |
      | Test Debug            | json     | request-body/base.json |
      | Test Debug            | bin      | request-body/base.bin  |
      | Framework Information | json     | request-body/base.json |
      | Framework Information | bin      | request-body/base.bin  |
      | Framework Debug       | json     | request-body/base.json |
      | Framework Debug       | bin      | request-body/base.bin  |
