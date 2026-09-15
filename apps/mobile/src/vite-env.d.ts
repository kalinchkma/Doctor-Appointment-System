/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Payload API. The app never talks to the RAG service directly. */
  readonly VITE_PAYLOAD_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
