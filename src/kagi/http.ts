import { isErrnoException } from "../utils/formatting.ts";

export { isErrnoException };

export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";

export function kagiHeaders(token: string): Record<string, string> {
  return {
    "User-Agent": USER_AGENT,
    Cookie: `kagi_session=${token}`,
  };
}

export function checkResponse(response: Response): void {
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Invalid or expired session token");
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
}

export function isNetworkError(error: unknown): error is NodeJS.ErrnoException {
  return isErrnoException(error) && (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED");
}

export function rethrowAsNetworkError(error: unknown): never {
  if (isNetworkError(error)) {
    throw new Error("Network error: Unable to connect to Kagi");
  }
  throw error;
}
