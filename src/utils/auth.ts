import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { err, ok, type Result } from "neverthrow";
import { match, P } from "ts-pattern";

import { errorMessage, isErrnoException, type AppError } from "./errors.ts";

const tokenPath = () => join(homedir(), ".kagi_session_token");

const missingTokenError = (): AppError => ({
  type: "AuthError",
  message:
    "No valid Kagi session token found. Please either:\n" +
    "1. Set KAGI_SESSION_TOKEN environment variable, or\n" +
    "2. Save your token to ~/.kagi_session_token file\n\n" +
    "Get your token from: https://kagi.com/settings?p=api",
});

function readTokenFromFile(): Result<string | null, AppError> {
  try {
    const token = readFileSync(tokenPath(), "utf8").trim();
    return ok(
      match(token)
        .with("", () => null)
        .otherwise((token) => token),
    );
  } catch (error: unknown) {
    return match(error)
      .when(
        (error) => isErrnoException(error) && error.code === "ENOENT",
        () => ok(null),
      )
      .otherwise((cause) =>
        err({
          type: "TokenFileError",
          message: `Failed to read token file: ${errorMessage(cause)}`,
          cause,
        }),
      );
  }
}

/** Resolves the Kagi session token from `KAGI_SESSION_TOKEN` env var or `~/.kagi_session_token` file. */
export function resolveToken(): Result<string, AppError> {
  return match(process.env.KAGI_SESSION_TOKEN?.trim())
    .with(P.string.minLength(1), (token) => ok(token))
    .otherwise(() =>
      readTokenFromFile().andThen((fileToken) =>
        match(fileToken)
          .with(P.string.minLength(1), (token) => ok(token))
          .otherwise(() => err(missingTokenError())),
      ),
    );
}
