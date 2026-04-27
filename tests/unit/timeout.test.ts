import { describe, expect, test } from "bun:test";

import { TimeoutError, withTimeout } from "../../src/utils/timeout.ts";

describe("withTimeout", () => {
  test("returns operation result before timeout", async () => {
    const result = await withTimeout(async (signal) => {
      expect(signal.aborted).toBe(false);
      return "ok";
    }, 100, "too slow");

    expect(result).toBe("ok");
  });

  test("aborts and rejects with TimeoutError when operation exceeds timeout", async () => {
    let signalWasAborted = false;

    await expect(
      withTimeout(
        (signal) =>
          new Promise<string>((resolve) => {
            signal.addEventListener("abort", () => {
              signalWasAborted = true;
            });
            setTimeout(() => resolve("late"), 50);
          }),
        5,
        "operation timed out",
      ),
    ).rejects.toThrow("operation timed out");

    expect(signalWasAborted).toBe(true);
  });

  test("uses TimeoutError for timeout failures", async () => {
    try {
      await withTimeout(() => new Promise(() => {}), 5, "timed out");
      throw new Error("expected timeout");
    } catch (error) {
      expect(error).toBeInstanceOf(TimeoutError);
      expect((error as Error).name).toBe("TimeoutError");
    }
  });
});
