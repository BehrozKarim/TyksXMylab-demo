# Ward Evidence — standalone demo

Independent copy of the current Ward Evidence frontend. The dashboard and lab-feed
demonstration run as a static website, with no Render backend, PostgreSQL or Python
service. Live AI summaries use an optional Vercel Function; the local summary
fallback works without an API key or network connection after the dataset loads.
The original frontend and backend repositories are unchanged.

## Run

Requires Node.js 22+.

```sh
npm ci
npm run dev
```

Open the address printed by Vite. To verify a production build:

```sh
npm run build
npm run preview
```

The default data mode is `standalone`; no `.env` file is necessary.

## Demonstrate the feed

1. The demo begins on **24 September 2026**, with 46,677 cultures published.
2. Open **Demo feed** in the header and choose **Send next lab batch**.
3. Each click reveals the next complete batch of up to 20 existing synthetic cultures.
   The first batch advances to 25 September and produces the Urology resistance alert.
4. Close the drawer to inspect refreshed evidence, paired comparisons and monthly charts.
   Open **Resistance alerts** to inspect the original detection and current analysis.
5. Six batches publish the remaining 115 cultures, finishing on 27 September with
   **46,792 cultures / 24,571 isolates / 172,381 AST results**.
6. Refreshing preserves progress in this tab. Choose **Restart demo** in the feed drawer
   to return to the seed. Progress belongs to each browser tab; there is no shared feed.

All data are synthetic. Publishing a batch changes local visibility only. It does
not send a network request, modify source records or deliver data to a laboratory.

## What works locally

- Every ward, organism, specimen, antibiotic, age, sex, date and first-isolate scope.
- Independent rolling 28-day and 12-month populations, missing tests, reporting
  suppression below 30 tests and 95% Wilson confidence intervals.
- Paired antibiotic comparisons on a shared tested denominator.
- Monthly trends and historical dates, with immediate refresh after batches.
- Patient search and paginated history, including negative and mixed-growth cultures.
- Precomputed resistance alerts, investigation composition, original detections and transitions.
- JSON/CSV snapshot downloads, retaining opened reports across later publications.
- **AI summary** on production builds: optional live OpenAI-assisted wording of
  the selected report, with a basic local summary when AI is unavailable. Local
  Vite development uses the basic summary by default.

## Data and calculations

`public/data/demo-v1.json` contains normalized synthetic cultures and isolates,
dictionary-indexed wards/organisms/antibiotics, source hashes, six batch boundaries
and precomputed alert analyses. It is about 4.1 MB before HTTP compression
(about 670 KB with gzip).
Raw CSVs, birth years, home areas, credentials and the original `.git` directory
are not copied into this repository.

`src/demo/engine.ts` performs evidence/comparison/history queries in a Web Worker
so calculations do not block the interface. It preserves first-isolate selection
**before** age/sex filters and antibiotic availability, including the difference
between selection within a ward and across wards. Frozen results are cached per
publication revision and query. Dataset parsing happens once per page; subsequent
queries and feed clicks need no network access.

Alert outputs are precomputed with the original Python implementation and the
existing **3 percentage point demo threshold**. No records or alert counts are
invented. Numerical parity tests compare browser calculations with reference
Python outputs from every batch stage.

`scripts/prepare-demo.py` can regenerate the committed data from the adjacent
`TyksXMylab-backend` source and synthetic dataset, using that backend's Python
environment. This maintainer export tool is **not** a build or runtime dependency.
The checked-in data are sufficient for a fresh clone to build and run independently.

## Deploy

Deploy this repository as a **static site** using the included `render.yaml`:

- Build command: `npm ci && npm run build`
- Publish directory: `dist`
- No API URL, database, secrets or paid backend instance.
- Rewrite application routes to `/index.html`.

For **Vercel**, import this repository with framework preset **Vite**, build
command `npm run build`, output directory `dist` and the repository root as the
Root Directory. The included `vercel.json` rewrites `/ward`, `/investigate` and
`/alerts` (including nested investigation URLs) to `index.html`, allowing React
Router to handle direct links and page refreshes. Assets, dataset files and future
`/api/*` functions keep their own routes. Vercel does not use `public/_redirects`
or `render.yaml` for this configuration. Redeploy after adding the configuration.
The large-JavaScript-chunk build warning is an optimization notice, not a route error.

Cloudflare Pages and Netlify can use the same build command and output directory;
`public/_redirects` supplies the SPA fallback. Deploy at the domain root. Keep HTTP
compression enabled and allow Web Workers from the same origin. HTTP/HTTPS hosting
is required; opening `index.html` using `file://` is unsupported.

The data download is public by design. This architecture is for synthetic
demonstrations and must not be populated with real patient records.

## Enable AI summaries on Vercel

1. Open this project's **Settings → Environment Variables**.
2. Add **`OPENAI_API_KEY`** with your OpenAI API project key. Select **Production**
   and also **Preview** if you want AI in preview deployments. Use an OpenAI API
   project with API billing/credits available. Never prefix the key with `VITE_`.
3. Optionally add **`OPENAI_SUMMARY_MODEL=gpt-4.1-mini`**. This is already the
   default; the model must support the Responses API and strict structured output.
4. Deploy the latest `main` commit. If it already deployed before you saved the
   environment variable, use **Deployments → latest deployment → Redeploy**.
5. Open `/ward` and click **AI summary**. Successful generation displays
   **AI-assisted summary**. A missing key, provider error or offline browser
   displays **Basic summary** instead, without a failure notice or retry button.

The included `api/summarize.ts` is deployed automatically as a Node.js Vercel
Function. Leave the framework preset **Vite**, build command `npm run build` and
output directory `dist`. No separate backend URL, database, CORS configuration
or additional frontend secret is needed. These instructions do not require
changing your existing deployment's environment variables other than the key.

Optional switches:

| Variable               | Purpose                                                                  |
| ---------------------- | ------------------------------------------------------------------------ |
| `OPENAI_API_KEY`       | Required server-only key for live generation.                            |
| `OPENAI_SUMMARY_MODEL` | Server-only model choice; defaults to `gpt-4.1-mini`.                    |
| `AI_SUMMARY_ENABLED=0` | Disable provider calls while retaining the basic summary.                |
| `VITE_AI_SUMMARY=0`    | Build a strictly static client that never requests the summary function. |

Live requests are enabled automatically in production builds. They happen only
after a summary action, never during dashboard loading or lab-batch publication.
The frontend sends aggregate windows, applied filters and the exact report
identity; no patient records or entire dataset are sent. The server validates
counts, percentages, dates and reporting suppression, then asks OpenAI to select
approved sentence variants, following the original backend's summary approach.
Unknown facts, extra claims, refusals and incomplete output fall back to the basic
summary. The model does not calculate statistics or choose treatments.

The server key is read from `process.env` and is never returned to the browser.
Responses use `Cache-Control: no-store` to avoid sharing report identity through
the CDN. A bounded in-memory cache reuses successful wording for identical report
content, revision and model for ten minutes, then attaches each caller's own
analysis ID. Concurrent identical requests share work. This cache is per warm
function instance, not a persistent or globally shared database.

The function has a 20-second provider timeout, a 30-second execution limit,
bounded request size, same-origin browser checks, at most three simultaneous
provider requests per instance and best-effort in-memory limits of 20 requests
per client/minute and 40 provider requests per instance/minute. These counters
reset on cold starts and are **not a global spending cap or authentication**.
For a public demo, add a Vercel Firewall rate-limiting rule for POST requests to
`/api/summarize` (for example, ten requests per minute per IP), and monitor API
usage. Do not put a shared protection token in frontend source.

On static hosts without Vercel Functions, a failed summary request uses the local
template. Use `VITE_AI_SUMMARY=0` to avoid that request entirely. To develop with
the actual function locally, use Vercel CLI's `vercel dev`; ordinary `npm run dev`
continues to run the local demo without needing credentials.

## Verification

```sh
npm run build
npm run lint
npm test
npm run test:e2e
```

Standalone browser tests run against the production build and block every API
request except the optional summary endpoint. They cover feed publication/completion/reset, refresh persistence,
filtering, history, exports, summaries, alerts and desktop/mobile rendering.
The summary function and browser client are tested with mocked OpenAI responses;
tests do not make paid API calls. They cover key absence, invalid input, timeouts,
provider failures/refusals, safe sentence validation, caching, explicit retries,
report identity, per-client limiting and offline fallback.
The copied fixture browser suite remains available with `npm run test:fixtures`.
Historical design notes and fixture tests are retained from the source frontend.

The production build also type-checks function dependencies with Node's ESM
module-resolution rules. The browser suite includes
an actual offline batch publication and WCAG A/AA checks at desktop width, plus
mobile overflow and feed-control visibility checks.

Verified on 18 October 2026: **119 unit tests**, **8 production-browser tests**,
production build, Node ESM function smoke check and lint pass. OpenAI responses
were mocked; live generation is enabled by your Vercel API key configuration.
