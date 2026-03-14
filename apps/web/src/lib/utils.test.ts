import { afterEach, assert, describe, expect, it, vi } from "vitest";

import { createUuid, isWindowsPlatform } from "./utils";

const originalCrypto = globalThis.crypto;

afterEach(() => {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: originalCrypto,
  });
  vi.restoreAllMocks();
});

describe("isWindowsPlatform", () => {
  it("matches Windows platform identifiers", () => {
    assert.isTrue(isWindowsPlatform("Win32"));
    assert.isTrue(isWindowsPlatform("Windows"));
    assert.isTrue(isWindowsPlatform("windows_nt"));
  });

  it("does not match darwin", () => {
    assert.isFalse(isWindowsPlatform("darwin"));
  });
});

describe("createUuid", () => {
  it("builds an RFC 4122 v4 UUID from crypto.getRandomValues when randomUUID is missing", () => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues<T extends ArrayBufferView>(array: T): T {
          const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
          bytes.set(Uint8Array.from({ length: bytes.length }, (_, index) => index));
          return array;
        },
      } satisfies Pick<Crypto, "getRandomValues">,
    });

    expect(createUuid()).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  });

  it("falls back to Math.random when crypto APIs are unavailable", () => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: undefined,
    });
    vi.spyOn(Math, "random").mockReturnValue(0);

    expect(createUuid()).toBe("00000000-0000-4000-8000-000000000000");
  });
});
