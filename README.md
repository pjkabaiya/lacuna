# lacuna

Lacuna helps absolute beginners learn Python one small piece at a time: read a short note, choose the missing code, type it, and see the pre-authored output. Lessons are static JSON. The app does not execute learner code. Accounts are optional; without one, progress remains on the current device.

## Project structure

- `public/index.html`: home page and lesson list
- `public/lesson.html`: choose-then-type lesson player
- `public/css/lacuna.css`, `public/js/`: styles, player, local-first storage, API sync, and admin stats
- `public/lessons/`: lesson JSON files and ordered manifest
- `public/config.js`: API base URL and public Firebase web settings
- `public/js/auth.js`: Firebase email/password and Google sign-in
- `public/admin.html`: password-protected learning difficulty dashboard
- `backend/server.js`: Express API, CORS allow-list, security headers, and health check
- `backend/api/`: progress, learning events, and admin stats endpoints
- `backend/lib/db.js`: cached MongoDB connection and indexes

## Add a lesson

1. Add a JSON file in `public/lessons/`, following an existing `py-*.json` file.
2. Give the lesson a unique kebab-case `id`, and make the filename match it.
3. Add its `id`, title, summary, order, and language to `public/lessons/index.json`.
4. Run `cd backend` then `npm run validate:lessons`.

Each lesson has 6–8 steps. Every step has one idea in its note, a code array whose final line contains `___`, three or four choices, a zero-based `answer` index, a helpful explanation, a `typeMode` (`copy`, `recall`, or `none`), a `typeScope` (`blank` or `line`), and a pre-authored `output`. `finalOutput` is shown only when the learner presses Run. This text is never evaluated as code.

Keep each step focused on one concept. Use realistic beginner mistakes as distractors and explain each mistake kindly. In `copy` mode, show the selected answer while typing; `recall` hides it; `none` skips the typing prompt. The validator checks the manifest, IDs, step count, blank marker, choices, and required fields.

## Local development

Install the backend dependencies and start the API:

```powershell
cd backend
npm install
$env:MONGODB_URI = "your MongoDB connection string"
$env:DB_NAME = "lacuna"
$env:IP_SALT = "a-long-random-secret"
$env:ADMIN_KEY = "a-different-long-random-secret"
$env:CORS_ORIGIN = "http://localhost:8000"
$env:FIREBASE_PROJECT_ID = "your-firebase-project-id"
$env:FIREBASE_CLIENT_EMAIL = "your-service-account@your-firebase-project.iam.gserviceaccount.com"
$env:FIREBASE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nreplace-with-a-rotated-private-key\n-----END PRIVATE KEY-----\n"
npm start
```

In another terminal, serve `public/` on `http://localhost:8000` with any static file server. `public/config.js` points at the deployed API by default; change `window.API_BASE` to `http://localhost:3000/api` for local API testing. The frontend works without an API: progress is stored on the device and sync failures remain in a retryable offline queue.

## Accounts and cross-device progress

Firebase Authentication provides optional email/password and Google sign-in. In Firebase Console, enable both providers and add the deployed frontend origin to Authentication's authorized domains. Set the Firebase web app's `apiKey`, `authDomain`, `projectId`, and `appId` in `public/config.js`; these web settings are public and are not service-account credentials.

Set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` in the Render service's environment. Keep the private key only in Render or an ignored local `.env`, with newlines represented as `\n` if needed. The Render blueprint declares these as unsynced secrets. Do not put service-account JSON or private keys in the repository or `public/`.

Progress and learning-event endpoints require a valid Firebase ID token. The API takes the learner identity from that verified token rather than from request data. When someone signs in, local progress is merged with account progress (furthest step, completion, and highest mistake count are retained) and pending events are uploaded. Existing progress attached to old anonymous browser IDs is not automatically associated with accounts; local progress on that device is merged when its learner signs in.

Validate lesson content with:

```powershell
cd backend
npm run validate:lessons
```

Run backend tests with `npm test`.

## Environment variables

Copy `backend/.env.example` to a local `.env` file or set these variables in the hosting dashboard:

- `MONGODB_URI`: MongoDB connection string
- `DB_NAME`: use `lacuna` (the API defaults to this)
- `IP_SALT`: long random secret used to hash request IPs for rate limiting; raw IP addresses are not stored
- `ADMIN_KEY`: long random secret for `/api/admin`
- `CORS_ORIGIN`: exact frontend origin, or a comma-separated allow-list
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`: private Firebase Admin credentials used to verify sign-in tokens

The application uses a new `lacuna` database. It does not read, migrate, or delete the previous `nonutnovember` database or its collections. If you later decide to remove the old `quotes` or `presence` collections, do so manually after confirming they are no longer needed.

## Render API deployment

The existing Render service is retained in `render.yaml` to avoid changing its service identity or URL. The blueprint now uses `DB_NAME=lacuna` and no longer requires `REQUIRE_APPROVAL`. Changing the service name to `lacuna-api` in a Render Blueprint can create a new service instead of renaming the existing one; do not rename it until you choose whether to migrate to a new service.

Set `MONGODB_URI`, `DB_NAME=lacuna`, `IP_SALT`, `ADMIN_KEY`, and `CORS_ORIGIN` in the existing Render service, then deploy the backend from the `backend` root directory. The Render build command validates all static lessons before deployment. Keep the health check path at `/healthz`. `GET /healthz` does not require a database connection.

The static frontend is configured in `public/config.js` to keep using the current API URL. Set the Firebase web app config there and set the Render `CORS_ORIGIN` to the exact Vercel origin before enabling sync from the deployed site.

## Vercel static deployment and site URL

Deploy the repository as a static site with `public/` as the output/root directory. There is no build step. Replace the `SITE_URL` placeholder with the canonical HTTPS origin in:

- `public/index.html` (canonical, Open Graph, Twitter, and JSON-LD URLs)
- `public/robots.txt`
- `public/sitemap.xml`

Set the same exact origin in Render's `CORS_ORIGIN`. The repository does not include third-party analytics or tracking scripts. Vercel Insights is not enabled.

## Admin learning stats

Open `/admin.html` and enter `ADMIN_KEY`. The page requests `/api/admin?view=stats` and shows anonymous totals: unique learners, completion rates, hardest steps, wrong-option counts, typing failures, and answer reveals. The admin key is sent only in the request header and is not saved by the page.

## Privacy and data

Learner progress is saved locally first. Signed-in learners sync progress under their Firebase account UID; unsigned learners keep their progress on-device. Firebase manages account credentials. Learning events are batched and aggregated into step statistics. The backend does not store raw IP addresses; rate limits use salted IP hashes with a TTL. If local storage is unavailable or the API is unreachable, the lesson remains playable in the current tab.
