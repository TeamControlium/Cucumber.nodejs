@full
Feature: Scratch example — resource path preamble selection, every structural combination

  Exercises:
  `Given requests to (AUT|[name]) use resource path preamble [...]`.
  One area of test;
  1. Resource path preamble selection, crossed with target identification
  Test areas also excersize both configured preambles — one landing on a real route,
  one on the 404 fallback.
  Identifying target by name or AUT.

  Background: Scratch Target App is running
    Given Application [Scratch Target App] is running

  Scenario Outline: resource path preamble — <target> uses [<preamble>]
    Excersize resource path preamble selection across
    request target identified by name or AUT.
    Given requests to <target> use resource path preamble [<preamble>]
    When a 'GET' request to <target> path ''
    Examples:
      | target                | preamble |
      | AUT                   | V1       |
      | AUT                   | V2       |
      | [Scratch Target App] | V1       |
      | [Scratch Target App] | V2       |

  Scenario: switching preamble twice in the same session replaces, never accumulates
    Selecting V2 after V1 must land on <base>/V2's own path, never the corrupted
    <base>/V1's-path/V2's-path a naive always-append implementation would produce.
    Given requests to AUT use resource path preamble [V1]
    Given requests to AUT use resource path preamble [V2]
    When a 'GET' request to AUT path ''

  
  Scenario Outline: resource path preamble (<Logging Level>) — [<preamble>]
    Excersize every logging level against both configured preambles.
    Given Logging level is set to [<Logging Level>]
    Given requests to AUT use resource path preamble [<preamble>]
    When a 'GET' request to AUT path ''
    Examples:
      | Logging Level         | preamble |
      | Test Information      | V1       |
      | Test Information      | V2       |
      | Test Debug            | V1       |
      | Test Debug            | V2       |
      | Framework Information | V1       |
      | Framework Information | V2       |
      | Framework Debug       | V1       |
      | Framework Debug       | V2       |
