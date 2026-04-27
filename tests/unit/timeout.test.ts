import { describe, expect, test } from "bun:test";
import { okAsync, ResultAsync } from "neverthrow";

import { withTimeout } from "../../src/utils/timeout.ts";

describe("withTimeout", () => {
  test("returns operation result before timeout", async () => {
    const result = await withTimeout((signal) => {
      expect(signal.aborted).toBe(false);
      return okAsync("ok");
    }, 100, "too slow");

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe("ok");
  });

  test("aborts and returns TimeoutError when operation exceeds timeout", async () => {
    let signalWasAborted = false;

    const result = await withTimeout(
      (signal) =>
        ResultAsync.fromSafePromise(
          new Promise<string>((resolve) => {
            signal.addEventListener("abort", () => {
              signalWasAborted = true;
            });
            setTimeout(() => resolve("late"), 50);
          }),
        ),
      5,
      "operation timed out",
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      type: "TimeoutError",
      message: "operation timed out",
    });
    expect(signalWasAborted).toBe(true);
  });

  test("uses TimeoutError for timeout failures", async () => {
    const result = await withTimeout(
      () => ResultAsync.fromSafePromise(new Promise(() => {})),
      5,
      "timed out",
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      type: "TimeoutError",
      message: "timed out",
    });
  });

  test("converts synchronous operation throws into UnexpectedError", async () => {
    const result = await withTimeout(() => {
      throw new Error("sync failure");
    }, 100, "too slow");

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      type: "UnexpectedError",
      message: "sync failure",
    });
  });
});
