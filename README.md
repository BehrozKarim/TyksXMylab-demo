# Ward Evidence — standalone demo

Independent copy of the current Ward Evidence frontend. The complete demonstration
runs as a static website: no Render backend, PostgreSQL, Python service or API key.
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
- **Report summary**, a deterministic local template based on the selected report.
  It is labelled as a basic summary; no live AI model is called.

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

## Optional live AI summaries

The current summary is a local template and works offline. For live generation,
add a same-origin Vercel Function such as `api/summarize.ts`. The browser sends
only the selected report's aggregate facts and snapshot identity to that function;
the function validates those facts, calls OpenAI and returns the summary tagged
with the same report identity. Dataset filtering, charts and lab batches can
continue to run entirely in the browser; no PostgreSQL or separate Render backend
is needed for this approach.

Set `OPENAI_API_KEY` as a server-side Vercel environment variable. Never prefix
it with `VITE_` or place it in frontend source. Keep the local template as a fallback,
cache results by the full report content and method version, and limit requests
before exposing a publicly callable model endpoint. A local analysis ID alone
is not enough for that function: it cannot access the browser worker's saved reports.
AI text should explain the calculated values rather than calculate new statistics.

For a strictly static alternative, generate summaries in advance for a finite set
of cohorts and batch stages and bundle them with the demo. That avoids live API
calls but cannot cover arbitrary age/date/filter combinations without a fallback.

## Verification

```sh
npm run build
npm run lint
npm test
npm run test:e2e
```

Standalone browser tests run against the production build and block every API
request. They cover feed publication/completion/reset, refresh persistence,
filtering, history, exports, summaries, alerts and desktop/mobile rendering.
The copied fixture browser suite remains available with `npm run test:fixtures`.
Historical design notes and fixture tests are retained from the source frontend.

Verified on 18 October 2026: production build and lint pass, **95 unit tests**
and **6 standalone production-browser tests** pass. The browser suite includes
an actual offline batch publication and WCAG A/AA checks at desktop width, plus
mobile overflow and feed-control visibility checks.
