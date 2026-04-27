import { describe, expect, test } from "bun:test";

import { errorMessage } from "../../src/utils/errors.ts";

describe("errorMessage", () => {
  test("uses Error messages directly", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  test("does not collapse undefined object messages to the literal string undefined", () => {
    expect(errorMessage({ message: undefined })).toBe("{}");
  });

  test("stringifies non-string message values", () => {
    expect(errorMessage({ message: 404 })).toBe("404");
  });
});
