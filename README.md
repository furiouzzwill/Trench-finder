# Shortlist

The weekly scanner from Trench Bot, turned into a phone app on Vercel.

- **Once a day**, Vercel runs the scan for you. Your Mac doesn't need to be on.
- **It only pings your phone when something changes:** a new coin makes the list, a coin you hold starts failing checks, or a coin you hold hits 3x (your cue to take your original money out). Quiet days stay quiet.
- **Add it to your home screen** and it opens like an app.
- **Read-only.** It never buys or sells anything.

It runs the same checks as `npm run scan`: age, mint/freeze authority, top holders, dev bag, liquidity, holder count and trend, organic trading score, fake volume, and RugCheck flags. All the data comes from free public sources (Jupiter, RugCheck, DexScreener).

---

## Deploy it (about 10 minutes, all free)

### 1. Put it on Vercel

**Option A: GitHub (easiest to update later)**
1. Make a new **private** repo on GitHub called `trench-scanner` and upload this folder's files (or `git push` them).
2. In Vercel: **Add New → Project → Import** that repo → **Deploy**. The defaults are fine.

**Option B: straight from your Mac**
```bash
cd ~/Documents/trench-scanner
npx vercel          # log in, accept the defaults
npx vercel --prod
```

### 2. Add storage (where the scans are saved)
Vercel → your project → **Storage → Create → Blob** → pick **Private** → connect it to the project for all environments. Vercel adds the keys for you.

### 3. Set two secrets (optional)
Without these it still works: the daily scan runs, and the buttons need no passcode (so anyone with your URL can use them). To lock it down, go to Vercel → project → **Settings → Environment Variables**:
- `CRON_SECRET`: any random 16+ characters (mash the keyboard).
- `APP_PASSCODE`: a short code you'll type once on your phone.

Then **Deployments → ⋯ → Redeploy** so the new settings take effect.

### 4. Get phone alerts
Pick one or both:
- **ntfy (simplest):** install **ntfy** from the App Store → **+** → subscribe to a topic with a long random name, like `will-shortlist-8f3k2q9x`. Put the same name in Vercel as `NTFY_TOPIC`. Anyone who knows the name can read it, so keep it random.
- **Discord:** create a webhook in a private channel and set `DISCORD_WEBHOOK_URL`.

Redeploy again after adding these.

### 5. Put it on your iPhone
Open your Vercel URL in **Safari → Share → Add to Home Screen**. Open it, tap **Run first scan**, and enter your passcode. The first scan takes about a minute and a half. After that it runs on its own every morning around 9 AM Eastern (8 AM in winter). Vercel's free plan picks a time within that hour.

---

## Using it

- **I bought this:** tap it on any coin you actually buy. It moves to **Your coins**, where it gets checked every day. You'll get a ping if it starts failing checks (holders leaving, a whale showing up, a RugCheck danger flag) or hits 3x since you marked it.
- **The plan stays on top:** one amount for the year, 3–5 coins, buy once, don't add on dips, take your original money out at 3x. Set `MOONSHOT_BUDGET_USD` to show your number.
- **No "scan now" spam:** the button only works if the last scan is 20+ hours old. That's on purpose.
- **Before you buy:** check the bubble map, make sure the contract address matches the real X account, and look at the dev's history on GMGN. The app links to all of them.

This list filters out junk. It doesn't predict winners, and most coins on it will still fade. Not financial advice.

## Changing the checks
Every threshold is a setting. See `.env.example`, add the ones you want to change in Vercel, then redeploy.

## Running it on your Mac (optional)
```bash
npm install
cp .env.example .env.local   # set CRON_SECRET and APP_PASSCODE
npm run dev                  # http://localhost:3000
```
Without a Blob store, it saves to a local `.data/` folder. Add `SCAN_FIXTURE=fixtures/scan-sample.json` to try it on made-up sample coins with no internet.

## Troubleshooting
- **Empty list / "couldn't reach"**: one of the free APIs was down or rate-limited. It tries again the next day, or you can tap the button once it's been 20+ hours.
- **Cron not running**: check Vercel → project → **Settings → Cron Jobs**, and make sure `CRON_SECRET` is set. Cron only runs on the production deployment.
- **Passcode keeps getting asked**: it's saved per browser. Adding to the home screen counts as its own browser, so enter it there once.
