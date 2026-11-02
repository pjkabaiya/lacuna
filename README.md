# No Nut November

Countdown + live visitor count + anonymous community quotes. Frontend in `public/`, serverless API in `api/`, data in MongoDB Atlas.

## Structure
- `public/index.html` the whole frontend (countdown, quotes, form, live count)
- `api/quotes.js` GET/POST quotes (anonymous names, filter, rate limit)
- `api/ping.js` heartbeat for the "people here now" counter
- `api/admin.js` moderation (approve/delete), protected by `ADMIN_KEY`
- `lib/db.js` cached MongoDB connection + indexes

## Deploy on Vercel (free)
1. Create a MongoDB Atlas user and in **Network Access** allow `0.0.0.0/0` (Vercel uses changing IPs; the password is what protects you).
2. Push this folder to a GitHub repo (the `.gitignore` keeps secrets out), or run `npx vercel` in this folder.
3. In Vercel: **Project > Settings > Environment Variables**, add everything from `.env.example` with your real values.
4. Deploy. Add your domain under **Settings > Domains**.
5. Rotate your Atlas password if it was ever shared anywhere.

## Moderation
Set `REQUIRE_APPROVAL=true` to hold new quotes. Then:
```
curl -H "x-admin-key: YOURKEY" "https://yoursite.com/api/admin?status=pending"
curl -X POST -H "x-admin-key: YOURKEY" -H "Content-Type: application/json" \
  -d '{"id":"QUOTE_ID","action":"approve"}' https://yoursite.com/api/admin
```
Extend the `BLOCKED` word list in `api/quotes.js` as needed.

## Other hosts
Netlify and Cloudflare need small changes to the function format; the logic carries over.

## Ads later
Apply to AdSense once you have steady traffic, add their script, and use the `#ad` block in `index.html`. Keep `REQUIRE_APPROVAL=true` so user content stays ad-friendly. Add a privacy policy page first.
