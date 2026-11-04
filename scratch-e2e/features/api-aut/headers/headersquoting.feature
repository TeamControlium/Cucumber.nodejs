@full
Feature: Scratch example — header literal quote style, every structural combination

  Exercises:
  `Given request headers for AUT are [merged] with '<content>'`.
  One area of test;
  1. Header literal quoting, a double-quoted header literal carrying single-quoted JSON content
  Identifying target by name or AUT.
  All with every logging level: Test Information, Test Debug, Framework Information, and
  Framework Debug.

  Background: Scratch Target App is running
    Given Application [Scratch Target App] is running

  
  Scenario Outline: Literal text quotes swapped (Logging level: <Logging Level>)
    Excersize header literal quoting using a double-quoted delimiter around
    single-quoted JSON content.
    Given Logging level is set to [<Logging Level>]
    Given request headers for AUT are [merged] with "{'Content-Type': 'text/plain'}"
    When a 'GET' request to AUT path '/my-body', body 'asdf'
    Examples:
      | Logging Level          |
      | Test Information       |
      | Test Debug             |
      | Framework Information  |
      | Framework Debug        |
