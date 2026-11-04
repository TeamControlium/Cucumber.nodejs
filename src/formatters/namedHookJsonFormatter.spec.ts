import NamedHookJsonFormatter from './namedHookJsonFormatter.js';

/**
 * `getStepData` only reads `this.supportCodeLibrary` and calls `super.getStepData(params)` —
 * neither touches anything else the real `Formatter`/`JsonFormatter` constructors set up
 * (colorFns, snippetBuilder, eventBroadcaster, etc.), so a bare `Object.create` instance
 * with just `supportCodeLibrary` stubbed on it is enough to exercise this method directly,
 * without needing to satisfy the full, heavyweight `IFormatterOptions` constructor — same
 * "fake object, not a full mock" convention `index.spec.ts` already uses for Cucumber itself.
 */
function makeFormatter(hookDefinitions: { before?: { id: string; name?: string }[]; after?: { id: string; name?: string }[] }) {
  const instance = Object.create(NamedHookJsonFormatter.prototype) as NamedHookJsonFormatter;
  (instance as unknown as { supportCodeLibrary: unknown }).supportCodeLibrary = {
    beforeTestCaseHookDefinitions: hookDefinitions.before ?? [],
    afterTestCaseHookDefinitions: hookDefinitions.after ?? [],
  };
  return instance;
}

const PASSED_RESULT = { status: 'PASSED' } as Parameters<NamedHookJsonFormatter['getStepData']>[0]['testStepResult'];

describe('NamedHookJsonFormatter', () => {

  it('carries a named Before hook\'s name into the (still hidden) step data', () => {
    const formatter = makeFormatter({ before: [{ id: 'hook1', name: 'Prepare Scratch Target App' }] });

    const data = formatter.getStepData({
      isBeforeHook: true,
      gherkinStepMap: {},
      pickleStepMap: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      testStep: { hookId: 'hook1' } as any,
      testStepAttachments: [],
      testStepResult: PASSED_RESULT,
    });

    expect(data.name).toBe('Prepare Scratch Target App');
    expect(data.hidden).toBe(true);
  });

  it('carries a named After hook\'s name — looking it up in afterTestCaseHookDefinitions, not before', () => {
    const formatter = makeFormatter({
      before: [{ id: 'hook1', name: 'Should not match' }],
      after: [{ id: 'hook2', name: 'Stop Scratch Target App' }],
    });

    const data = formatter.getStepData({
      isBeforeHook: false,
      gherkinStepMap: {},
      pickleStepMap: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      testStep: { hookId: 'hook2' } as any,
      testStepAttachments: [],
      testStepResult: PASSED_RESULT,
    });

    expect(data.name).toBe('Stop Scratch Target App');
    expect(data.hidden).toBe(true);
  });

  it('leaves a hook step unnamed if the hook was registered without a name — same as upstream', () => {
    const formatter = makeFormatter({ before: [{ id: 'hook1' }] });

    const data = formatter.getStepData({
      isBeforeHook: true,
      gherkinStepMap: {},
      pickleStepMap: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      testStep: { hookId: 'hook1' } as any,
      testStepAttachments: [],
      testStepResult: PASSED_RESULT,
    });

    expect(data.name).toBeUndefined();
    expect(data.hidden).toBe(true);
  });

  it('does not touch Given/When/Then step data at all — pure passthrough to the upstream formatter', () => {
    const formatter = makeFormatter({});

    const data = formatter.getStepData({
      isBeforeHook: false,
      gherkinStepMap: { node1: { location: { line: 7 } } } as never,
      pickleStepMap: { pickleStep1: { text: 'Application [Scratch Target App] is running', astNodeIds: ['node1'] } } as never,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      testStep: { pickleStepId: 'pickleStep1' } as any,
      testStepAttachments: [],
      testStepResult: PASSED_RESULT,
    });

    expect(data.name).toBe('Application [Scratch Target App] is running');
    expect(data.hidden).toBeUndefined();
  });

});
