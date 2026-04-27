import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { err, ok, type Result } from "neverthrow";

import { errorMessage, isErrnoException, type AppError } from "./errors.ts";

function readTokenFromFile(): Result<string | null, AppError> {
  try {
    const tokenPath = join(homedir(), ".kagi_session_token");
    const token = readFileSync(tokenPath, "utf8").trim();
    return ok(token === "" ? null : token);
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return ok(null);
    }

    return err({
      type: "TokenFileError",
      message: `Failed to read token file: ${errorMessage(error)}`,
      cause: error,
    });
  }
}

/** Resolves the Kagi session token from `KAGI_SESSION_TOKEN` env var or `~/.kagi_session_token` file. */
export function resolveToken(): Result<string, AppError> {
  const envToken = process.env.KAGI_SESSION_TOKEN;
  if (envToken !== undefined && envToken.trim() !== "") {
    return ok(envToken.trim());
  }

  return readTokenFromFile().andThen((fileToken) => {
    if (fileToken !== null) {
      return ok(fileToken);
    }

    return err({
      type: "AuthError" as const,
      message:
        "No valid Kagi session token found. Please either:\n" +
        "1. Set KAGI_SESSION_TOKEN environment variable, or\n" +
        "2. Save your token to ~/.kagi_session_token file\n\n" +
        "Get your token from: https://kagi.com/settings?p=api",
    });
  });
}
