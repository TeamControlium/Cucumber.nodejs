import { StringUtils } from '@controlium/utils';

/**
 * Resolves a step's `(AUT|[name])` capture into the `appName` `API_AUTWrapper.getApplication()`
 * expects — `undefined` for the unqualified "AUT" case (resolves to the single registered
 * AUT), the bracket-stripped name otherwise. Shared by every API step-def file with a
 * `(AUT|[name])` capture — `headers.steps.ts`, `request.steps.ts`, and (once wired)
 * `validation.steps.ts`.
 */
export function resolveAppName(requestTarget: string): string | undefined {
  return requestTarget === 'AUT' ? undefined : StringUtils.trimChar(StringUtils.trimChar(requestTarget, '['), ']');
}
