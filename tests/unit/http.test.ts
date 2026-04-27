import { describe, expect, test } from "bun:test";

import {
  assertNotAuthOrChallengeResponse,
  checkResponseStatus,
  isAuthOrChallengeBody,
  isAuthOrChallengeUrl,
  isHtmlDocument,
} from "../../src/kagi/http.ts";

function responseWithUrl(url: string, body = ""): Response {
  const response = new Response(body, { status: 200 });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

describe("Kagi HTTP response helpers", () => {
  test("maps auth status codes to session token error", () => {
    expect(() => checkResponseStatus(new Response("", { status: 401 }))).toThrow(
      "Invalid or expired session token",
    );
    expect(() => checkResponseStatus(new Response("", { status: 403 }))).toThrow(
      "Invalid or expired session token",
    );
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

  test("throws clear error for successful challenge response", () => {
    expect(() =>
      assertNotAuthOrChallengeResponse(responseWithUrl("https://kagi.com/turnstile")),
    ).toThrow("Kagi requires additional browser verification");

    expect(() =>
      assertNotAuthOrChallengeResponse(responseWithUrl("https://kagi.com/html/search"), "turnstile"),
    ).toThrow("Kagi requires additional browser verification");
  });

  test("detects HTML documents", () => {
    expect(isHtmlDocument("<!DOCTYPE html><html></html>")).toBe(true);
    expect(isHtmlDocument('{"state":"done"}')).toBe(false);
  });
});
