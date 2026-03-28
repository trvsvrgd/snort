/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WebSocket URL for Yjs (default ws://localhost:1234). */
  readonly VITE_YJS_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
