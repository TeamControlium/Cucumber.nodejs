import { afterSuite, afterTest, beforeSuite, beforeTest } from '@controlium/framework';
import { Logger, Settings } from '@controlium/utils';

import { wireCucumberHooks, wireCucumberStepTimeout } from './index';

function makeFakeCucumber() {
  return {
    BeforeAll: vi.fn(),
    Before: vi.fn(),
    After: vi.fn(),
    AfterAll: vi.fn(),
  };
}

function makeFakeTimeoutCucumber() {
  return {
    setDefaultTimeout: vi.fn(),
  };
}

describe('wireCucumberHooks', () => {

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers each framework lifecycle function against the matching Cucumber hook', () => {
    const cucumber = makeFakeCucumber();

    wireCucumberHooks(cucumber);

    expect(cucumber.BeforeAll).toHaveBeenCalledWith(beforeSuite);
    expect(cucumber.AfterAll).toHaveBeenCalledWith(afterSuite);

    // After's handler is afterTest directly (by reference) — afterTest() itself now owns
    // clearing Settings'/Logger's per-test ambient state (see @controlium/framework's own
    // lifecycle.spec.ts for that behaviour), so there's nothing left for a wrapper here to
    // do, unlike Before (which still has to SET that state, needing the World afterTest
    // structurally can't receive — see its own doc comment).
    expect(cucumber.After.mock.calls[0][1]).toBe(afterTest);

    // Before IS still a custom closure (beforeTest + Settings/Logger setup) — verify by
    // invoking the registered handler and confirming it runs without throwing, rather than
    // by reference equality.
    const fakeWorld = { attach: vi.fn(), log: vi.fn(), link: vi.fn(), parameters: {} };
    expect(() => cucumber.Before.mock.calls[0][1].call(fakeWorld)).not.toThrow();
  });

  it('rejects null', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => wireCucumberHooks(null as any)).toThrow(/\[cucumber\] must be the '@cucumber\/cucumber' module object/);
  });

  it('rejects a non-object', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => wireCucumberHooks('oops' as any)).toThrow(/\[cucumber\] must be the '@cucumber\/cucumber' module object/);
  });

  it('rejects an object missing one of the required hook functions', () => {
    const cucumber = makeFakeCucumber();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cucumber as any).After = 'not-a-function';

    expect(() => wireCucumberHooks(cucumber)).toThrow(/\[cucumber\.After\] must be a function/);
  });

  it('registers Before/After with a descriptive name so they show up as named entries in reports', () => {
    const cucumber = makeFakeCucumber();

    wireCucumberHooks(cucumber);

    expect(cucumber.Before.mock.calls[0][0]).toEqual(expect.objectContaining({ name: expect.any(String) }));
    expect(cucumber.After.mock.calls[0][0]).toEqual(expect.objectContaining({ name: expect.any(String) }));
  });

  it('sets the Settings context from the Cucumber World\'s own parameters (worldParameters), not the World wrapper itself', async () => {
    const cucumber = makeFakeCucumber();
    const setContextSpy = vi.spyOn(Settings, 'setContext').mockImplementation(() => undefined);
    // Shaped like a real Cucumber IWorld: worldParameters land under `.parameters`, not
    // spread onto the World object directly — see @cucumber/cucumber's own World class.
    const fakeWorldParameters = { testAUTDetails: { SomeApp: { port: 1234 } } };
    const fakeWorld = { attach: vi.fn(), log: vi.fn(), link: vi.fn(), parameters: fakeWorldParameters };

    wireCucumberHooks(cucumber);
    const contextHook = cucumber.Before.mock.calls[0][1] as (this: object) => Promise<void>;
    await contextHook.call(fakeWorld);

    expect(setContextSpy).toHaveBeenCalledWith({ sourceName: 'World', parameters: fakeWorldParameters });
  });

  // Same env var/npm-config/profile-param/default convention as the legacy framework's own
  // equivalent (EACucumberUtils.setLoggingLevel) — see docs/design note in the commit this
  // landed in. Resolved per-scenario (inside the same Before hook as Settings.setContext),
  // not once at suite start, so parallel Cucumber workers each pick it up independently.
  describe('log level', () => {

    afterEach(() => {
      delete process.env.TEST_LOG_LEVEL;
      delete process.env.npm_package_config_testLogLevel;
      Logger.loggingLevel = 'Framework Debug';
    });

    async function invokeBeforeHook(cucumber: ReturnType<typeof makeFakeCucumber>, worldParameters: object = {}) {
      const fakeWorld = { attach: vi.fn(), log: vi.fn(), link: vi.fn(), parameters: worldParameters };
      await (cucumber.Before.mock.calls[0][1] as (this: object) => Promise<void>).call(fakeWorld);
    }

    it('applies the built-in default (Framework Debug) when no overriding source is set', async () => {
      const cucumber = makeFakeCucumber();
      wireCucumberHooks(cucumber);

      await invokeBeforeHook(cucumber);

      expect(Logger.loggingLevel).toBe(Logger.Levels.FrameworkDebug);
    });

    it('applies a value resolved from the TEST_LOG_LEVEL env var', async () => {
      process.env.TEST_LOG_LEVEL = 'Test Information';
      const cucumber = makeFakeCucumber();
      wireCucumberHooks(cucumber);

      await invokeBeforeHook(cucumber);

      expect(Logger.loggingLevel).toBe(Logger.Levels.TestInformation);
    });

    it('applies a value resolved from the World profile parameters ($.logLevel), when no env var is set', async () => {
      const cucumber = makeFakeCucumber();
      wireCucumberHooks(cucumber);

      await invokeBeforeHook(cucumber, { logLevel: 'Warning' });

      expect(Logger.loggingLevel).toBe(Logger.Levels.Warning);
    });

    it('an env var takes precedence over the World profile parameters', async () => {
      process.env.TEST_LOG_LEVEL = 'Error';
      const cucumber = makeFakeCucumber();
      wireCucumberHooks(cucumber);

      await invokeBeforeHook(cucumber, { logLevel: 'Warning' });

      expect(Logger.loggingLevel).toBe(Logger.Levels.Error);
    });
  });

});

describe('wireCucumberStepTimeout', () => {

  afterEach(() => {
    delete process.env.CUCUMBER_STEP_TIMEOUT;
    delete process.env.npm_package_config_testStepTimeout;
  });

  it('applies the built-in default when no overriding source is set', () => {
    const cucumber = makeFakeTimeoutCucumber();

    wireCucumberStepTimeout(cucumber);

    expect(cucumber.setDefaultTimeout).toHaveBeenCalledWith(30000);
  });

  it('applies a caller-supplied default value', () => {
    const cucumber = makeFakeTimeoutCucumber();

    wireCucumberStepTimeout(cucumber, { defaultValue: 5000 });

    expect(cucumber.setDefaultTimeout).toHaveBeenCalledWith(5000);
  });

  it('parses a numeric value that comes back as a string from an env var', () => {
    process.env.CUCUMBER_STEP_TIMEOUT = '12345';
    const cucumber = makeFakeTimeoutCucumber();

    wireCucumberStepTimeout(cucumber);

    expect(cucumber.setDefaultTimeout).toHaveBeenCalledWith(12345);
  });

  it('rejects a resolved value that is not a valid number', () => {
    process.env.CUCUMBER_STEP_TIMEOUT = 'not-a-number';
    const cucumber = makeFakeTimeoutCucumber();

    expect(() => wireCucumberStepTimeout(cucumber)).toThrow(/must be a positive finite number/);
  });

  it('rejects null', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => wireCucumberStepTimeout(null as any)).toThrow(/\[cucumber\] must be the '@cucumber\/cucumber' module object/);
  });

  it('rejects an object missing setDefaultTimeout', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => wireCucumberStepTimeout({} as any)).toThrow(/\[cucumber\.setDefaultTimeout\] must be a function/);
  });
});
