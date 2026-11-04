import { Logger } from '@controlium/utils';

import { wireLoggingStepDefinitions } from './logging.steps.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StepHandler = (...args: any[]) => unknown;

/**
 * Captures every pattern + handler registered against a fake `When`, in registration
 * order, so tests exercise the *real* regex and handler `wireLoggingStepDefinitions`
 * registers — not a hand-copied duplicate of either.
 */
function registerAndCaptureHandlers() {
  const when: { pattern: RegExp; handler: StepHandler }[] = [];
  const cucumber = { When: vi.fn((pattern: RegExp, handler: StepHandler) => { when.push({ pattern, handler }); }) };
  wireLoggingStepDefinitions(cucumber as never);
  return { when };
}

describe('wireLoggingStepDefinitions', () => {

  it('rejects null', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => wireLoggingStepDefinitions(null as any)).toThrow(/\[cucumber\] must be the '@cucumber\/cucumber' module object/);
  });

  it('rejects an object missing When', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => wireLoggingStepDefinitions({} as any)).toThrow(/\[cucumber\.When\] must be a function/);
  });

  it('registers exactly 2 patterns', () => {
    const { when } = registerAndCaptureHandlers();
    expect(when).toHaveLength(2);
  });

  describe('"Logging level is set to [...]" — pattern matching', () => {

    it('captures the level verbatim', () => {
      const { when } = registerAndCaptureHandlers();
      expect('Logging level is set to [Test Debug]'.match(when[0].pattern)?.slice(1)).toEqual(['Test Debug']);
      expect('Logging level is set to [Warning]'.match(when[0].pattern)?.slice(1)).toEqual(['Warning']);
    });

    it('is not restricted to a fixed enum of level names — any bracketed text matches', () => {
      const { when } = registerAndCaptureHandlers();
      expect('Logging level is set to [NoOutput]'.match(when[0].pattern)?.slice(1)).toEqual(['NoOutput']);
      expect('Logging level is set to [Not A Real Level]'.match(when[0].pattern)?.slice(1)).toEqual(['Not A Real Level']);
    });
  });

  describe('wired behaviour', () => {

    afterEach(() => {
      delete process.env.TEST_LOG_LEVEL;
      Logger.loggingLevel = 'Framework Debug';
    });

    it('"set to" applies the given level directly', () => {
      const { when } = registerAndCaptureHandlers();

      when[0].handler('Test Information');

      expect(Logger.loggingLevel).toBe(Logger.Levels.TestInformation);
    });

    it('"reset to settings" re-resolves from settings, discarding a "set to" override', () => {
      process.env.TEST_LOG_LEVEL = 'Warning';
      const { when } = registerAndCaptureHandlers();

      when[0].handler('Test Debug');
      expect(Logger.loggingLevel).toBe(Logger.Levels.TestDebug);

      when[1].handler();
      expect(Logger.loggingLevel).toBe(Logger.Levels.Warning);
    });
  });
});
