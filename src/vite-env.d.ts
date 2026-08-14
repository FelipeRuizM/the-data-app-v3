/// <reference types="vite/client" />

/**
 * All six ship in the client bundle and are public by design (CLAUDE.md §2).
 * They are repository *variables*, not secrets. Security comes from
 * database.rules.json, never from hiding these.
 */
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_DATABASE_URL: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_APP_ID: string
  readonly VITE_OWNER_UID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
