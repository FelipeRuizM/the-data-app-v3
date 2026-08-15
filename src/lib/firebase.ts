import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  browserLocalPersistence,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth'
import { getDatabase, type Database } from 'firebase/database'

/**
 * Firebase init. Config is read from import.meta.env and injected at build time
 * by the Action.
 *
 * This config is PUBLIC BY DESIGN. It is not a secret, it ships in the bundle,
 * and hiding it would protect nothing. Security is enforced by
 * database.rules.json (CLAUDE.md §2). Never write auth logic that assumes
 * otherwise.
 */

const REQUIRED = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_DATABASE_URL',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_OWNER_UID',
] as const

/**
 * Missing build-time config produces a blank page and a cryptic SDK error deep
 * in a promise. Checking up front turns that into a named list — this is the
 * single most likely deployment failure, so it fails loudly.
 */
export function missingEnvVars(): string[] {
  const env = import.meta.env as unknown as Record<string, string | undefined>
  return REQUIRED.filter((key) => {
    const value = env[key]
    return typeof value !== 'string' || value.trim() === ''
  })
}

export const OWNER_UID: string = import.meta.env.VITE_OWNER_UID ?? ''

let app: FirebaseApp | null = null
let authInstance: Auth | null = null
let dbInstance: Database | null = null

function getApp(): FirebaseApp {
  if (!app) {
    app = initializeApp({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    })
  }
  return app
}

/**
 * Lazy so that a config-error screen can render without touching the SDK.
 *
 * `initializeAuth` rather than `getAuth`, and deliberately WITHOUT a
 * `popupRedirectResolver`.
 *
 * `getAuth` wires in the popup/redirect resolver, which loads
 * `<authDomain>/__/auth/iframe.js` plus Google's `apis.google.com` gapi
 * bundle on every page — measured at **133 KiB of third-party JavaScript** on
 * the login screen alone. All of it exists to support `signInWithPopup` and
 * `signInWithRedirect`, which this app does not have: D-27 made email/password
 * the only provider. Omitting the resolver drops the iframe, the extra origin,
 * and the requests.
 *
 * If a popup provider is ever reintroduced, this has to change back — calling
 * `signInWithPopup` without a resolver throws `auth/argument-error` rather
 * than failing silently, which is the right way round.
 */
export function auth(): Auth {
  if (!authInstance) {
    authInstance = initializeAuth(getApp(), {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    })
  }
  return authInstance
}

export function db(): Database {
  if (!dbInstance) dbInstance = getDatabase(getApp())
  return dbInstance
}
