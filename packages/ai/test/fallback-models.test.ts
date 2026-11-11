import { describe, expect, it } from "vitest";
import { withModelFallback, type ModelAttempt } from "../src/fallback-models";

const req = { system: "s", prompt: "p", schema: {} };

describe("withModelFallback", () => {
  it("uses the primary model when it works", async () => {
    const used: string[] = [];
    const call = withModelFallback(["primary", "backup"], (m) => async () => {
      used.push(m);
      return `from ${m}`;
    });
    expect(await call(req)).toBe("from primary");
    expect(used).toEqual(["primary"]);
  });

  it("falls back when the primary fails (e.g. 503)", async () => {
    const attempts: ModelAttempt[] = [];
    const call = withModelFallback(
      ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"],
      (m) => async () => {
        if (m === "gemini-3.5-flash-lite") throw new Error("503 Server Unavailable");
        return "ok";
      },
      (a) => attempts.push(a),
    );
    expect(await call(req)).toBe("ok");
    expect(attempts.map((a) => [a.model, a.ok])).toEqual([
      ["gemini-3.5-flash-lite", false],
      ["gemini-3.1-flash-lite", true],
    ]);
  });

  it("reports every failure when all models fail", async () => {
    const call = withModelFallback(["a", "b"], (m) => async () => {
      throw new Error(`${m} down`);
    });
    await expect(call(req)).rejects.toThrow(/a: a down; b: b down/);
  });

  it("ignores empty and duplicate model names", async () => {
    const used: string[] = [];
    const call = withModelFallback(["a", "", "a"], (m) => async () => {
      used.push(m);
      throw new Error("x");
    });
    await expect(call(req)).rejects.toThrow();
    expect(used).toEqual(["a"]);
  });
});
