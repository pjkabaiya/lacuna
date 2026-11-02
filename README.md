# No Nut November

Countdown + live visitor count + anonymous community quotes. Frontend in `public/`, Express API in `backend/`, data in MongoDB Atlas.

## Structure
- `public/index.html` the whole frontend (countdown, quotes, form, live count)
- `public/config.js` frontend API base URL
- `public/admin.html` protected quote moderation page
- `backend/server.js` Express server, CORS, and health check
- `backend/api/quotes.js` GET/POST quotes (anonymous names, filter, rate limit)
- `backend/api/ping.js` heartbeat for the "people here now" counter
- `backend/api/admin.js` moderation (approve/delete), protected by `ADMIN_KEY`
- `backend/lib/db.js` cached MongoDB connection + indexes

## Deploy the backend on Render
1. Create a MongoDB Atlas user. In **Network Access**, allow `0.0.0.0/0` because Render's free tier does not provide a fixed IP.
2. In Render, create a **Web Service** from this repository. Set **Root Directory** to `backend`, **Build Command** to `npm install`, **Start Command** to `npm start`, and **Health Check Path** to `/healthz`. The root `render.yaml` provides these settings as a Blueprint.
3. In the Render dashboard, set these environment variables:
   - `MONGODB_URI`: your MongoDB Atlas connection string
   - `DB_NAME`: `nonutnovember`
   - `IP_SALT`: a long random secret
   - `ADMIN_KEY`: a long random secret
   - `REQUIRE_APPROVAL`: `true` to hold submitted quotes for moderation
   - `CORS_ORIGIN`: your static site's exact origin, with no trailing slash
4. Deploy the service and copy its URL. Set `window.API_BASE` in `public/config.js` to `https://YOUR-SERVICE.onrender.com/api`.
5. Host the `public/` directory on a static host. Then set `CORS_ORIGIN` in Render to that site's exact URL (for example, `https://your-site.pages.dev`, with no trailing slash) and redeploy/restart the backend.

The Render free plan sleeps after about 15 minutes of inactivity, so the first request after a pause can take 30–60 seconds.

## Run locally
Export the environment variables listed above, then run `cd backend && npm install && npm start`. Serve `public/` with any static server. For local use, set `window.API_BASE` in `public/config.js` to `"/api"` if your static server proxies `/api` to the backend, or to the backend's local URL plus `/api`.

## Moderation
Open `https://your-static-site.example/admin.html` and enter the Render `ADMIN_KEY` to load and approve pending quotes. Keep `REQUIRE_APPROVAL=true` in Render to hold new submissions for review.

The API can also be moderated directly:
```
curl -H "x-admin-key: YOURKEY" "https://yoursite.com/api/admin?status=pending"
curl -X POST -H "x-admin-key: YOURKEY" -H "Content-Type: application/json" \
  -d '{"id":"QUOTE_ID","action":"approve"}' https://yoursite.com/api/admin
```
Extend the `BLOCKED` word list in `backend/api/quotes.js` as needed.

## Ads later
Apply to AdSense once you have steady traffic, add their script, and use the `#ad` block in `index.html`. Keep `REQUIRE_APPROVAL=true` so user content stays ad-friendly. Add a privacy policy page first.
