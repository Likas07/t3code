export const REMOTE_AUTH_TOKEN_SESSION_STORAGE_KEY = "t3code:remote-auth-token:v1";

function normalizeRemoteAuthToken(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  return token.length > 0 ? token : null;
}

function resolveBrowserLocationUrl(): URL | null {
  if (typeof window === "undefined") return null;

  const href = window.location?.href;
  if (typeof href === "string" && href.length > 0) {
    try {
      return new URL(href);
    } catch {
      // Fall through to rebuilding from individual location parts.
    }
  }

  const protocol =
    typeof window.location?.protocol === "string" && window.location.protocol.length > 0
      ? window.location.protocol
      : "http:";
  const host =
    typeof window.location?.host === "string" && window.location.host.length > 0
      ? window.location.host
      : [window.location?.hostname, window.location?.port]
          .filter((part): part is string => typeof part === "string" && part.length > 0)
          .join(":");
  if (host.length === 0) return null;

  try {
    return new URL(`${protocol}//${host}`);
  } catch {
    return null;
  }
}

function parseUrl(candidate: string): URL | null {
  const browserLocation = resolveBrowserLocationUrl();

  try {
    return browserLocation ? new URL(candidate, browserLocation.href) : new URL(candidate);
  } catch {
    return null;
  }
}

function readStoredRemoteAuthToken(): string | null {
  if (typeof window === "undefined" || window.sessionStorage == null) return null;

  try {
    return normalizeRemoteAuthToken(
      window.sessionStorage.getItem(REMOTE_AUTH_TOKEN_SESSION_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

function persistRemoteAuthToken(token: string): void {
  if (typeof window === "undefined" || window.sessionStorage == null) return;

  try {
    window.sessionStorage.setItem(REMOTE_AUTH_TOKEN_SESSION_STORAGE_KEY, token);
  } catch {
    // Ignore storage failures so URL resolution still works.
  }
}

function resolveRemoteAuthToken(): string | null {
  const browserLocation = resolveBrowserLocationUrl();
  const pageToken = normalizeRemoteAuthToken(browserLocation?.searchParams.get("token"));
  if (pageToken) {
    persistRemoteAuthToken(pageToken);
    return pageToken;
  }

  return readStoredRemoteAuthToken();
}

function resolveDefaultBrowserWsUrl(): string {
  if (typeof window === "undefined") return "";

  const bridgeWsUrl = window.desktopBridge?.getWsUrl?.();
  if (typeof bridgeWsUrl === "string" && bridgeWsUrl.length > 0) {
    return bridgeWsUrl;
  }

  const envWsUrl = import.meta.env.VITE_WS_URL as string | undefined;
  if (typeof envWsUrl === "string" && envWsUrl.length > 0) {
    return envWsUrl;
  }

  const browserLocation = resolveBrowserLocationUrl();
  if (!browserLocation) return "";

  return `${browserLocation.protocol === "https:" ? "wss:" : "ws:"}//${browserLocation.host}`;
}

export function resolveBrowserWsUrl(candidate?: string): string {
  const rawUrl =
    typeof candidate === "string" && candidate.length > 0
      ? candidate
      : resolveDefaultBrowserWsUrl();
  if (rawUrl.length === 0) return rawUrl;

  const wsUrl = parseUrl(rawUrl);
  if (!wsUrl) return rawUrl;

  const existingToken = normalizeRemoteAuthToken(wsUrl.searchParams.get("token"));
  if (existingToken) {
    persistRemoteAuthToken(existingToken);
    return wsUrl.toString();
  }

  const remoteAuthToken = resolveRemoteAuthToken();
  if (remoteAuthToken) {
    wsUrl.searchParams.set("token", remoteAuthToken);
  }

  return wsUrl.toString();
}

export function resolveBrowserServerOrigin(candidate?: string): string {
  const wsUrl = parseUrl(resolveBrowserWsUrl(candidate));
  if (!wsUrl) {
    return resolveBrowserLocationUrl()?.origin ?? "";
  }

  if (wsUrl.protocol === "wss:") {
    wsUrl.protocol = "https:";
  } else if (wsUrl.protocol === "ws:") {
    wsUrl.protocol = "http:";
  }

  wsUrl.pathname = "";
  wsUrl.search = "";
  wsUrl.hash = "";
  return wsUrl.origin;
}
