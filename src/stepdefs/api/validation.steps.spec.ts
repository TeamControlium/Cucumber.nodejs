import { wireApiValidationStepDefinitions } from './validation.steps.js';

/**
 * Captures every pattern registered against a fake `Then`, in registration order, so each
 * test matches sample step text against the *real* regex
 * `wireApiValidationStepDefinitions` registers — not a hand-copied duplicate of it.
 */
function registerAndCapture() {
  const then: RegExp[] = [];
  const cucumber = { Then: vi.fn((pattern: RegExp) => { then.push(pattern); }) };
  wireApiValidationStepDefinitions(cucumber as never);
  return then;
}

describe('wireApiValidationStepDefinitions', () => {

  it('rejects null', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => wireApiValidationStepDefinitions(null as any)).toThrow(/\[cucumber\] must be the '@cucumber\/cucumber' module object/);
  });

  it('rejects an object missing Then', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => wireApiValidationStepDefinitions({} as any)).toThrow(/\[cucumber\.Then\] must be a function/);
  });

  it('registers exactly 8 patterns', () => {
    expect(registerAndCapture()).toHaveLength(8);
  });

  it('status only — either quote style', () => {
    const then = registerAndCapture();
    expect("Response status is '200'".match(then[0])?.slice(1)).toEqual(['200', undefined]);
    expect('Response status is "200"'.match(then[0])?.slice(1)).toEqual([undefined, '200']);
  });

  it('status + body literal — independent quote styles, embedded apostrophe survives', () => {
    const then = registerAndCapture();
    const match = `Response status is '200', body "it's fine"`.match(then[1]);
    expect(match?.slice(1)).toEqual(['200', undefined, undefined, "it's fine"]);
  });

  it('status + body at jsonPath, literal expected value', () => {
    const then = registerAndCapture();
    const match = "Response status is '200', body [energyAddress.customerType] 'RESIDENTIAL'".match(then[2]);
    expect(match?.slice(1)).toEqual(['200', undefined, 'energyAddress.customerType', 'RESIDENTIAL', undefined]);
  });

  it('status + body from test data file', () => {
    const then = registerAndCapture();
    const match = "Response status is '200', body from test data file [a/b.json]".match(then[3]);
    expect(match?.slice(1)).toEqual(['200', undefined, 'a/b.json']);
  });

  it('status + body at jsonPath from test data file', () => {
    const then = registerAndCapture();
    const match = "Response status is '200', body [energyAddress] from test data file [a/b.json]".match(then[4]);
    expect(match?.slice(1)).toEqual(['200', undefined, 'energyAddress', 'a/b.json']);
  });

  it('status + json DataTable-only (required)', () => {
    const then = registerAndCapture();
    expect("Response status is '200', json data".match(then[5])?.slice(1)).toEqual(['200', undefined]);
  });

  it('status + json literal (DataTable override optional)', () => {
    const then = registerAndCapture();
    const match = `Response status is '200', json data '{"a":1}'`.match(then[6]);
    expect(match?.slice(1)).toEqual(['200', undefined, '{"a":1}', undefined]);
  });

  it('status + json from test data file (DataTable override optional)', () => {
    const then = registerAndCapture();
    const match = "Response status is '200', json data from test data file [a/b.json]".match(then[7]);
    expect(match?.slice(1)).toEqual(['200', undefined, 'a/b.json']);
  });

  it('json-data-only pattern does not swallow a literal value meant for the literal-json pattern', () => {
    const then = registerAndCapture();
    expect(`Response status is '200', json data '{"a":1}'`.match(then[5])).toBeNull();
  });
});
