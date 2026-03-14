/// <reference types="vite/client" />

import type { NativeApi, DesktopBridge } from "@t3tools/contracts";

interface ImportMetaEnv {
  readonly APP_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    nativeApi?: NativeApi;
    desktopBridge?: DesktopBridge;
  }
}

declare module "@rolldown/plugin-babel" {
  import type { PluginOption } from "vite";

  export default function babel(options?: {
    parserOpts?: unknown;
    presets?: readonly unknown[];
  }): PluginOption;
}

declare module "@vitejs/plugin-react" {
  import type { PluginOption } from "vite";

  export default function react(...args: readonly unknown[]): PluginOption;
  export function reactCompilerPreset(...args: readonly unknown[]): unknown;
}
