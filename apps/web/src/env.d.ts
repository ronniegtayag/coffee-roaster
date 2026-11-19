/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin, e.g. https://api.example.com. Empty in dev: requests go through the Vite proxy. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
