/**
 * THE deployed version, shown beside the app name in the header and on the
 * login screen.
 *
 * **Bump this in the same commit as every deploy** (CLAUDE.md §0). It is the
 * only place the number lives — `package.json` stays at `0.0.0` because this
 * app is never published to a registry, and a second version string is a second
 * thing to forget.
 *
 * Format is `major.minor`, not semver: it marks deploys, not API compatibility.
 */
export const APP_VERSION = '3.0'
