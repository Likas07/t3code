import { CommandId, MessageId, ProjectId, ThreadId } from "@t3tools/contracts";
import { type CxOptions, cx } from "class-variance-authority";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: CxOptions) {
  return twMerge(cx(inputs));
}

export function isMacPlatform(platform: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function isWindowsPlatform(platform: string): boolean {
  return /^win(dows)?/i.test(platform);
}

function formatUuidV4(bytes: Uint8Array): string {
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

function randomBytesFromMath(): Uint8Array {
  return Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
}

export function createUuid(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;

  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  if (typeof cryptoApi?.getRandomValues === "function") {
    try {
      const bytes = new Uint8Array(16);
      cryptoApi.getRandomValues(bytes);
      return formatUuidV4(bytes);
    } catch {
      // Fall back to Math.random below.
    }
  }

  return formatUuidV4(randomBytesFromMath());
}

export const newCommandId = (): CommandId => CommandId.makeUnsafe(createUuid());

export const newProjectId = (): ProjectId => ProjectId.makeUnsafe(createUuid());

export const newThreadId = (): ThreadId => ThreadId.makeUnsafe(createUuid());

export const newMessageId = (): MessageId => MessageId.makeUnsafe(createUuid());
