# Stocker AI

A household inventory agent that runs on Cloudflare Workers. You show it a grocery bill, a shelf, or a barcode, or leave it a voice note. It keeps the pantry list, watches expiry dates, and tells you what to buy next.

## How it works

| Step | What happens | Runs on |
|---|---|---|
| Perceive | Photo of a bill or shelf is read by a vision model. A voice note is transcribed. A barcode is looked up in Open Food Facts. | Workers AI, Open Food Facts |
| Structure | A language model turns what it read into "add" and "use" actions, with estimated shelf life and how long each item usually lasts. | Workers AI |
| Apply | Changes are saved straight away and recorded in the activity log. | D1 |
| Check | A short summary shows what changed. One tap takes back anything it got wrong, or undoes the lot. | Browser |
| Picture | Each item gets one generated picture the first time it appears, kept in the database and reused. | Workers AI, D1 |
| Cook | Suggests three dinners from what is at home, favouring what expires first; "I cooked this" deducts the ingredients. | Workers AI |
| Spend | Prices read from bills are totalled by month and area. | D1 |
| Advise | The briefing works out what to use soon and when to buy each item again. After you buy the same item twice it uses your own pace. | Browser |

## Deploy (about five minutes)

The database already exists in your Cloudflare account (`pantry-keeper`, with its tables created), and `wrangler.jsonc` points at it.

```sh
npm install
npm run golive
```

`npm run golive` signs you in to Cloudflare in the browser if needed, deploys, then asks you to choose a passcode (the app refuses to run without one).

`wrangler deploy` prints your URL (`https://stocker-ai.<your-subdomain>.workers.dev`). Open it on your phone, enter the passcode, and use "Add to Home Screen" to install it like an app.

The first time you photograph a bill, the app may ask you to accept the vision model's licence (Meta's Llama 3.2 terms). Tap the button once and retake the photo.

## Files

- `src/index.js` the Worker: passcode, API, and the perceive / structure / apply pipeline
- `public/index.html` the phone app: Today, Pantry, Shopping list and Activity tabs, plus camera, voice recorder, barcode scanner and the review step
- `schema.sql` database tables (already applied; `npm run db:init` re-applies them)
- `wrangler.jsonc` bindings and model names

## Changing models

Model names are plain variables in `wrangler.jsonc` (`VISION_MODEL`, `TEXT_MODEL`, `SPEECH_MODEL`). Swap one and redeploy.

## Limits to know

- Workers AI has a free daily allowance; heavy use is billed to your Cloudflare account.
- Photos and audio are sent to the models and not stored. Only the item list and activity log are kept.
- The passcode is a single shared secret. Use a long one, and do not put anything sensitive in the pantry.
- Barcode lookup covers food products in Open Food Facts; unknown products fall back to typing or voice.
- Everyone in a household shares one passcode and one list; names are for the activity log, not separate accounts.
- It does not send notifications. The briefing updates whenever you open it.
