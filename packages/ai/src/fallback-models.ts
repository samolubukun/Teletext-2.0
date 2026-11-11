// Model fallback: try each model in order; move to the next one on any error (503, 404, timeout).
import type { ModelCall } from "./condense";

export type ModelAttempt = { model: string; ok: boolean; error?: string };

export function withModelFallback(
  models: readonly string[],
  callFor: (model: string) => ModelCall,
  onAttempt?: (attempt: ModelAttempt) => void,
): ModelCall {
  const list = models.filter((m, i) => m && models.indexOf(m) === i);
  if (list.length === 0) throw new Error("withModelFallback: no models configured");
  return async (request) => {
    const errors: string[] = [];
    for (const model of list) {
      try {
        const text = await callFor(model)(request);
        onAttempt?.({ model, ok: true });
        return text;
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        errors.push(`${model}: ${error}`);
        onAttempt?.({ model, ok: false, error });
      }
    }
    throw new Error(`All AI models failed. ${errors.join("; ")}`);
  };
}
