import { describe, expect, test } from "bun:test";

import {
  checkNotAuthOrChallengeResponse,
  checkResponseStatus,
  isAuthOrChallengeBody,
  isAuthOrChallengeUrl,
  isHtmlDocument,
  safeFetch,
} from "../../src/kagi/http.ts";

function responseWithUrl(url: string, body = ""): Response {
  const response = new Response(body, { status: 200 });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

describe("Kagi HTTP response helpers", () => {
  test("maps auth status codes to session token error", () => {
    const unauthorized = checkResponseStatus(new Response("", { status: 401 }));
    expect(unauthorized.isErr()).toBe(true);
    expect(unauthorized._unsafeUnwrapErr()).toMatchObject({
      type: "AuthError",
      message: "Invalid or expired session token",
    });

    const forbidden = checkResponseStatus(new Response("", { status: 403 }));
    expect(forbidden.isErr()).toBe(true);
    expect(forbidden._unsafeUnwrapErr()).toMatchObject({
      type: "AuthError",
      message: "Invalid or expired session token",
    });
  });

  test("detects auth and challenge URLs", () => {
    expect(isAuthOrChallengeUrl("https://kagi.com/turnstile?r=/html/search%3Fq%3Dtest")).toBe(
      true,
    );
    expect(isAuthOrChallengeUrl("https://kagi.com/login")).toBe(true);
    expect(isAuthOrChallengeUrl("https://kagi.com/html/search?q=test")).toBe(false);
  });

  test("detects auth and challenge bodies", () => {
    expect(isAuthOrChallengeBody('<div class="cf-turnstile"></div>')).toBe(true);
    expect(isAuthOrChallengeBody("Sign in to Kagi to continue")).toBe(true);
    expect(isAuthOrChallengeBody("ordinary search response")).toBe(false);
  });

  test("returns clear error for successful challenge response", () => {
    const challengeUrl = checkNotAuthOrChallengeResponse(responseWithUrl("https://kagi.com/turnstile"));
    expect(challengeUrl.isErr()).toBe(true);
    expect(challengeUrl._unsafeUnwrapErr()).toMatchObject({
      type: "KagiChallengeError",
      message: expect.stringContaining("Kagi requires additional browser verification"),
    });

    const challengeBody = checkNotAuthOrChallengeResponse(
      responseWithUrl("https://kagi.com/html/search"),
      "turnstile",
    );
    expect(challengeBody.isErr()).toBe(true);
    expect(challengeBody._unsafeUnwrapErr()).toMatchObject({
      type: "KagiChallengeError",
      message: expect.stringContaining("Kagi requires additional browser verification"),
    });
  });

  test("short-circuits challenge URLs before inspecting response body", () => {
    const body = {
      toLowerCase() {
        throw new Error("body should not be inspected");
      },
    } as unknown as string;

    const result = checkNotAuthOrChallengeResponse(responseWithUrl("https://kagi.com/turnstile"), body);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({ type: "KagiChallengeError" });
  });

  test("detects HTML documents", () => {
    expect(isHtmlDocument("<!DOCTYPE html><html></html>")).toBe(true);
    expect(isHtmlDocument('{"state":"done"}')).toBe(false);
  });

  test("safeFetch maps synchronous fetch throws to Err", async () => {
    const result = await safeFetch("https://example.com", {
      headers: { Cookie: "invalid\nheader" },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({ type: "UnexpectedError" });
  });
});
