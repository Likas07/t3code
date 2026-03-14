import { afterEach, describe, expect, it } from "vitest";

import {
  REMOTE_AUTH_TOKEN_SESSION_STORAGE_KEY,
  resolveBrowserServerOrigin,
  resolveBrowserWsUrl,
} from "./serverUrls";

type WindowStub = Omit<Window & typeof globalThis, "location"> & {
  location: Window["location"];
};

const originalWindow = globalThis.window;

function createStorage(initialEntries?: Record<string, string>): Storage {
  const entries = new Map(Object.entries(initialEntries ?? {}));

  return {
    get length() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    getItem(key) {
      return entries.get(key) ?? null;
    },
    key(index) {
      return Array.from(entries.keys())[index] ?? null;
    },
    removeItem(key) {
      entries.delete(key);
    },
    setItem(key, value) {
      entries.set(key, value);
    },
  } as Storage;
}

function toLocationStub(href: string): Window["location"] {
  const url = new URL(href);
  return {
    href: url.href,
    origin: url.origin,
    protocol: url.protocol,
    host: url.host,
    hostname: url.hostname,
    port: url.port,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
  } as Window["location"];
}

function installWindow(options: {
  href: string;
  bridgeWsUrl?: string | null;
  sessionStorage?: Storage;
}): { setHref: (href: string) => void; sessionStorage: Storage } {
  const sessionStorage = options.sessionStorage ?? createStorage();
  const windowStub = {
    location: toLocationStub(options.href),
    sessionStorage,
    desktopBridge:
      options.bridgeWsUrl === undefined
        ? undefined
        : { getWsUrl: () => options.bridgeWsUrl ?? null },
  } as WindowStub;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowStub,
  });

  return {
    sessionStorage,
    setHref(href: string) {
      windowStub.location = toLocationStub(href);
    },
  };
}

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
    return;
  }

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
});

describe("serverUrls", () => {
  it("appends the page token to the resolved websocket URL and persists it", () => {
    const { sessionStorage } = installWindow({ href: "http://host.test:3773/?token=secret-token" });

    expect(resolveBrowserWsUrl()).toBe("ws://host.test:3773/?token=secret-token");
    expect(sessionStorage.getItem(REMOTE_AUTH_TOKEN_SESSION_STORAGE_KEY)).toBe("secret-token");
  });

  it("recovers the token from sessionStorage after internal navigation drops the query", () => {
    const context = installWindow({ href: "http://host.test:3773/?token=secret-token" });

    expect(resolveBrowserWsUrl()).toBe("ws://host.test:3773/?token=secret-token");

    context.setHref("http://host.test:3773/dc711a38-9590-42ac-993b-c3141222672d");

    expect(resolveBrowserWsUrl()).toBe("ws://host.test:3773/?token=secret-token");
  });

  it("keeps an explicit websocket token instead of overriding it from the page", () => {
    const { sessionStorage } = installWindow({ href: "http://host.test:3773/?token=page-token" });

    expect(resolveBrowserWsUrl("wss://remote.test/socket?token=url-token")).toBe(
      "wss://remote.test/socket?token=url-token",
    );
    expect(sessionStorage.getItem(REMOTE_AUTH_TOKEN_SESSION_STORAGE_KEY)).toBe("url-token");
  });

  it("derives the HTTP origin from the same websocket source", () => {
    installWindow({
      href: "http://client.test:3773/?token=page-token",
      bridgeWsUrl: "wss://remote.test:3773/ws",
    });

    expect(resolveBrowserServerOrigin()).toBe("https://remote.test:3773");
  });
});
