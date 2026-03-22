import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { errorMessage, isErrnoException } from "./formatting.ts";

function readTokenFromFile(): string | null {
  try {
    const tokenPath = join(homedir(), ".kagi_session_token");
    const token = readFileSync(tokenPath, "utf8").trim();
    return token === "" ? null : token;
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return null;
    }
    throw new Error(`Failed to read token file: ${errorMessage(error)}`, { cause: error });
  }
}

/** Resolves the Kagi session token from `KAGI_SESSION_TOKEN` env var or `~/.kagi_session_token` file. */
export function resolveToken(): string {
  const envToken = process.env.KAGI_SESSION_TOKEN;
  if (envToken !== undefined && envToken.trim() !== "") {
    return envToken.trim();
  }

  const fileToken = readTokenFromFile();
  if (fileToken !== null) {
    return fileToken;
  }

  throw new Error(
    "No valid Kagi session token found. Please either:\n" +
      "1. Set KAGI_SESSION_TOKEN environment variable, or\n" +
      "2. Save your token to ~/.kagi_session_token file\n\n" +
      "Get your token from: https://kagi.com/settings?p=api",
  );
}
