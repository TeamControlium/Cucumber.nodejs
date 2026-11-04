@full
Feature: Scratch example — query-param requests, every structural combination

  Exercises:
  `Given request query params for (AUT|[name]) are [replaced|merged] with/using ...` (session-level)
  `When next API request query params are [replaced|merged] with/using ...` (one-shot)
  against the target app's `/my-query` endpoint, which echoes every query param it
  actually received back as a flat JSON object — so a live run's own logged response
  dump is the evidence these steps really reached the wire, not just that no step threw.

  Background: Scratch Target App is running
    Given Application [Scratch Target App] is running

  Scenario: session-level query params from an inline JSON literal
    Given request query params for AUT are '{"name": "blahblah"}'
    When a 'GET' request to AUT path '/my-query'

  Scenario: session-level query params, merged mode, combines onto what was already set
    Given request query params for AUT are '{"name": "blahblah"}'
    Given request query params for AUT are [merged] with '{"page": 2}'
    When a 'GET' request to AUT path '/my-query'

  Scenario: session-level query params with a DataTable override — DataTable key wins on collision
    Given request query params for AUT are '{"page": 1, "name": "blahblah"}';
      | Query Param | Value     |
      | page        | number:2  |
    When a 'GET' request to AUT path '/my-query'

  Scenario: session-level query params built entirely from a DataTable
    Given request query params for AUT are [replaced] with;
      | Query Param | Value    |
      | name        | blahblah |
      | page        | number:2 |
    When a 'GET' request to AUT path '/my-query'

  Scenario: a query param embedded directly in the path is combined with session query params
    Given request query params for AUT are '{"page": "2"}'
    When a 'GET' request to AUT path '/my-query?name=blahblah'

  Scenario: next-request-only query params override session query params for one request, then revert
    Given request query params for AUT are '{"name": "blahblah"}'
    When next API request query params are [replaced] with '{"name": "overridden-once"}'
    And a 'GET' request to AUT path '/my-query'
    And a 'GET' request to AUT path '/my-query'

  Scenario: next-request-only query params built entirely from a DataTable
    Given request query params for AUT are '{"name": "blahblah"}'
    When next API request query params are;
      | Query Param | Value |
      | debug       | true  |
    And a 'GET' request to AUT path '/my-query'

  
  Scenario Outline: session-level query params (<Logging Level>)
    Excersize every logging level against a representative session-level query param.
    Given Logging level is set to [<Logging Level>]
    Given request query params for AUT are '{"name": "blahblah"}'
    When a 'GET' request to AUT path '/my-query'
    Examples:
      | Logging Level         |
      | Test Information      |
      | Test Debug            |
      | Framework Information |
      | Framework Debug       |
