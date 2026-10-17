# Ward Evidence: frontend implementation plan

Status: implementation specification; this frontend repository has no application code yet.
Target: a hackathon prototype for the supplied synthetic microbiology dataset.

## 1. Product boundary and shared contract

Build a ward evidence application that helps clinicians inspect relevant susceptibility results and helps researchers examine the evidence behind a change. Retain the required annual, rolling 12-month and latest 28-day views throughout the clinician workflow.

The [backend implementation plan](../TyksXMylab-backend/IMPLEMENTATION_PLAN.md) defines the API, statistical methods, deduplication, eligibility rules, dates and replay behavior. Treat it as the normative data contract. Resolve differences there before changing the client. This document defines presentation and interaction behavior; it does not define a second calculation engine.

The prototype reports observed laboratory susceptibility. It cannot establish antibiotic efficacy, recovery probability, the source of an infection or transmission between patients. The dataset lacks diagnoses, medication, clinical outcomes, MIC values and result release timestamps.

Susceptibility and antibiotic comparisons require one organism and one specimen type. An explicitly labeled all-ward context may omit `ward_code`; never pool species into a susceptibility percentage or silently broaden a selected ward. Organism mixture belongs in count-based investigation context.

### Existing backend and the integration boundary

The backend at commit `b54015f` already contains a runnable AEI reference prototype. Its [README](../TyksXMylab-backend/README.md), [HTTP routes](../TyksXMylab-backend/aei/api.py) and [response models](../TyksXMylab-backend/aei/models.py) describe the current implementation. It imports the CSV archive/ZIP, persists append-only SQLite isolate revisions, calculates reference statistics and provides CLI replay, including days without arriving events.

| Existing route | Current behavior |
|---|---|
| `GET /health` | Reports storage, reference processor, event count and `rules_version=prototype-v1`. |
| `POST /events` | Appends one complete isolate revision. |
| `POST /events/batch` | Appends a batch transactionally; duplicate/conflict rules apply. |
| `GET /isolates/{id}/history` | Returns revisions of an isolate, not a patient's previous culture history. |
| `GET /statistics` | Calculates one requested period and returns legacy flat `rows` grouped by ward/organism/specimen/drug. |

The `/api/v1` endpoints specified below are a future additive facade over that existing backend work. HTTP playback controls, alerts, patient culture history and the new snapshot/status response model are not implemented yet. Preserve the backend's reference work and isolate these planned capabilities behind the agreed facade.

Use the shared typed client and contract fixtures until that facade exists. Do not point the new evidence components at legacy `/statistics`, assume its grouping or denominator rules match the new response, concatenate three calls into an alleged atomic snapshot, or sum ward rows to obtain hospital-wide percentages. The current legacy statuses and `prototype-v1` fields do not supply the target five-state window schema, intervals or snapshot context. Its event-conflict HTTP 409 also does not mean the planned `state_changed` error.

## 2. Scope and implementation order

| Priority | Deliverable | Completion condition |
|---|---|---|
| P0 | Shared cohort and date controls | Ward, specimen, organism, sex, age, primary antibiotic and dates produce reproducible requests. |
| P0 | Required susceptibility views | All three windows render from one response with counts, uncertainty, sparse states and source coverage warnings. |
| P0 | Antibiotic A/B comparison | Both percentages share `n_paired`; missing paired tests remain visible. |
| P0 | Patient microbiology history | Show all visible specimens from the preceding 12 months, strictly before the collection cutoff. |
| P0 | Investigation and provenance | Review an alert's actual cohort, descriptive breakdown and the calculation inputs. |
| P0 | Historical replay | Start, pause, step and reset a backend replay; all displayed results follow its snapshot. |
| P0 | Reliability and accessibility | Keyboard access, suppressed values, request races, reset and exact export all pass acceptance checks. |
| P1 | Saved research cohorts | Save named query definitions locally; reopening recomputes against an explicitly chosen snapshot. |
| P1 | Broader research comparisons | Add measured case-mix standardization only when the backend returns an agreed method and limitations. |
| P1 | Convenience improvements | Add printable summaries, additional count charts and an optional Finnish interface. |

Keep clinical prescribing, diagnostic classification, efficacy prediction and autonomous treatment recommendations outside the MVP. Authentication and hospital-system integration require a separate deployment project; this plan concerns the local synthetic demo.

## 3. Frontend setup

Use React with TypeScript and Vite, TanStack Query for server state, and React Router for the two application routes. Use semantic HTML components and CSS variables; there is no need for a large dashboard framework.

Set TypeScript strict mode. Add ESLint, Vitest with Testing Library, MSW for API fixtures, and Playwright for the end-to-end checks below. Use an accessibility checker in browser tests alongside manual keyboard inspection.

Proposed scripts:

```json
{
  "dev": "vite --host 127.0.0.1",
  "build": "tsc -b && vite build",
  "preview": "vite preview --host 127.0.0.1",
  "lint": "eslint .",
  "test": "vitest run",
  "test:e2e": "playwright test"
}
```

Configure `VITE_API_BASE_URL` with the target local `/api/v1` prefix through the Vite development proxy. The existing backend documents localhost port 8000; follow the backend plan for the facade's origin and CORS behavior. Use an explicit development data mode, for example `VITE_DATA_MODE=fixtures|api`, and start with typed fixtures while the facade is pending. Display a fixture banner in that mode. Switch deliberately to API mode after the target contract passes integration checks; a real API error must never trigger fixture fallback or legacy-route substitution.

Choose a readable system sans-serif font, 16px body text and tabular numerals for values. Use a light neutral background, dark text and a restrained accent. Reserve warning and review colors for named states, and verify contrast before choosing final tokens. Motion should communicate loading or a changed state; avoid decorative chart animation and scrolling effects.

## 4. Information architecture

Provide two routes:

| Route | Purpose |
|---|---|
| `/ward` | Select a cohort, read the three windows, compare antibiotics and inspect patient history. |
| `/investigate/:investigationId` | Examine one alert or change with its exact cohort, baseline and evidence. |

The header contains the app name, the route links and a persistent synthetic-data label. Beneath it, keep the shared cohort controls and a readable context sentence. Patient history and provenance open in accessible side panels, preserving the active page.

Desktop layout: shared controls above a row of three period cards, then the antibiotic comparison and review list. Investigation uses a main evidence column with an adjacent context panel. On narrow screens, stack cards and panels in reading order; preserve the filter summary and the selected date.

Example context sentence:

> Urology / urine / Escherichia coli / women / all ages / samples through 27 September 2026

Below that sentence, show the replay status, source data range and displayed snapshot. The distinction between selected reporting dates and available source dates must remain visible.

## 5. Shared cohort controls

Use labeled controls for ward, specimen, organism and primary antibiotic. Add sex and age bounds in a compact secondary section with an active-filter count. Display a clear reset action, but preserve the chosen replay run when resetting filters.

`ward_code` omission means an explicit all-ward selection labeled "All wards". Require a single specimen and organism before requesting susceptibility. Populate options from `/meta`, including antibiotic test applicability and screening purpose.

The antibiotic catalog describes observed tested applicability, not clinical appropriateness. Use labels such as "Observed tests available" and "No recorded tests for this organism/specimen". Exclude cefoxitin screening code `FOX` from the therapeutic A/B comparison; keep laboratory screening results in patient history with their purpose identified.

The primary antibiotic drives the three period cards and acts as antibiotic A in the comparison. Store a separate antibiotic B selection. If the user changes the primary drug to B, clear B or ask them to choose another; avoid a meaningless A-versus-A request.

Validate numeric age bounds locally for input usability, then accept the server's normalized filter definition. Never round age groups or invent an unknown-sex category absent from the catalog. Distinguish a disabled incompatible option from a valid option whose current cohort has no tests.

Use an Apply action for the cohort form so keyboard users can change several filters without repeated requests. Updating an antibiotic or comparison window may submit immediately. Announce the applied context once after a successful update.

## 6. Dates, source coverage and the three window cards

Use date-only strings in requests. The backend supplies window bounds; the browser must not calculate rolling months, deduplication periods or baseline dates. Format date-only values without allowing a browser timezone conversion to move them to another day.

All three windows come from `GET /evidence` in one snapshot:

| Window key | Visible label | Date detail |
|---|---|---|
| `annual` | Calendar year 2025, or Calendar year 2026 to date | Show selected year and actual bounds; identify partial source coverage. |
| `rolling_12m` | Last 12 months | Show exact inclusive user-facing date range. |
| `last_28d` | Last 28 days | Show exact inclusive user-facing date range. |

For `as_of=2026-09-27`, the agreed half-open bounds are `[2025-09-28, 2026-09-28)` for rolling 12 months and `[2026-08-31, 2026-09-28)` for 28 days. Render the latter as 31 August to 27 September, with the half-open convention available in provenance.

The source begins on 2 October 2023 and ends on 27 September 2026. Therefore 2023 annual results lack January through September, and 2026 lacks observations after 27 September. Label a reporting year "to date" only when the selected `as_of` lies within that year; source incompleteness remains a separate warning if the replay clock later moves into 2027. A count of 30 does not establish full period coverage.

Each available card contains:

- Percent susceptible as the main value, with the antibiotic and organism named in context.
- `n_s / n_tested` and a plain-language label, plus percent resistant as a secondary value.
- A 95% interval with its numeric endpoints and a named statistical method in provenance.
- `n_eligible`, `n_tested` and `n_not_tested`, so users can inspect testing completeness.
- Source coverage and snapshot information, with a "How calculated" action.

Use a horizontal dot-and-interval plot on a fixed 0-100% axis where it improves comparison. Provide the same values in text. Keep interval endpoints visible outside hover; a color block must never imply certainty the interval does not support.

### Window states

| API status | Presentation | Required behavior |
|---|---|---|
| `available` | Percentage, counts and interval | Use supplied values; distinguish incomplete source dates. |
| `insufficient_data` | "Insufficient data: 29 tested isolates" | Percentages and interval stay hidden; show counts and an explicit longer-window action. |
| `no_tests` | "No susceptibility tests recorded" | Show eligible count and test availability context. |
| `empty_cohort` | "No eligible isolates in this period" | Preserve filters and offer a clearly described change. |
| `not_applicable` | "This organism/specimen/drug comparison is not applicable" | Show the server's reason; avoid a zero or a green state. |

For suppressed results, `susceptibility_pct`, `resistance_pct` and both interval endpoints are null. Never calculate the hidden percentage from counts, render a proportional bar, or reveal it in a tooltip, accessible label or export preview.

### Explicit sparse-data fallback

Prefer the already-visible rolling window as the first alternative to a sparse 28-day result. If the backend offers a broader ward cohort, show the proposed filter change and its context before a user opens it. Keep the original card and label the broader evidence separately. Do not pool species or silently switch an organism, specimen, sex or ward.

## 7. Antibiotic comparison on a common isolate set

The comparison panel accepts A, B and one window: annual, rolling 12 months or 28 days. A follows the primary antibiotic; B has its own labeled select. Display the selected comparison period independently of the three overview cards.

The backend supplies `n_paired`, the count of retained isolates with both results. Both drug percentages use this denominator. Also show eligible isolates and missing paired tests, because standalone susceptibility cards can have different denominators.

Render the four paired result cells as a labeled table:

| Paired category | Meaning |
|---|---|
| `both_s` | Susceptible to A and B |
| `a_only_s` | Susceptible to A, resistant to B |
| `b_only_s` | Resistant to A, susceptible to B |
| `both_r` | Resistant to A and B |

Display net difference `B minus A` separately from B-only additional laboratory activity. A positive net difference can hide isolates susceptible only to A, so keep both discordant cells visible. Use server-provided percentage-point values and uncertainty when supplied; do not approximate a paired interval from standalone intervals.

The comparison requires `n_paired >= 30` to show percentages. For smaller samples, keep labeled counts and the suppression message. Do not let two standalone cards with 30 tests imply 30 paired tests.

Use descriptive labels such as "Historical laboratory susceptibility" and "Additional isolates susceptible to B". Avoid "recommended", "best antibiotic", "treatment success", "efficacy" or automatic combination prescriptions. Missing tests do not establish resistance, and observed S results do not establish clinical suitability for a patient's infection site or dosing needs.

## 8. Patient microbiology history panel

Place a "Patient microbiology history" action near the cohort summary. Search by the synthetic patient identifier through `/patients?search=`; debounce typing and allow cancellation. Empty search, no matches and request failure need distinct messages.

The history panel uses `/patients/{id}/history` with the agreed cutoff parameters. Request all visible specimens in the preceding 12 months, strictly before the collection cutoff. Do not carry the ward, organism or specimen filters into this panel as hidden exclusions. Search can identify a patient with a published specimen on the selected date, while that patient's strictly earlier history can be empty; present this as no prior samples rather than an unknown patient.

Group results by culture date and culture identifier, then by isolate. Show specimen, collection ward, organism, phenotype flags and the available S/R results. Negative and mixed-growth culture entries provide context where the API includes them. Mark screening tests as screening rather than treatment alternatives.

Use the wording "Samples collected before [date]". A specimen's collection date does not establish when its results became available, so never say "known at the time" or "information available to the prescriber". Display no current or future specimen at the strict cutoff boundary.

Offer compact and expanded susceptibility tables for long histories. Show missing results as "No recorded result". An empty panel reads "No recorded samples in this lookback period", with the date range visible; it must not imply the patient has no resistance history anywhere.

Open the panel with focus on its heading or search, trap focus while modal, support Escape, and return focus to the trigger on close. Use a full-height dialog on small screens.

## 9. Review list and investigation route

The ward page requests `/alerts` for the current monitoring snapshot. The response names `monitoring_as_of`, independently of the selected reporting date. The review list shows organism, specimen, antibiotic, exact alert cohort, recent/baseline counts, percentage-point change, status and an "Inspect evidence" action. In P0, hide the current review list when a pinned report date differs from `monitoring_as_of`; explain that monitoring flags belong to the replay date and offer "Follow replay date". Do not display later flags under an older report date or invent historical evaluations in the browser.

The initial alert rule is a versioned heuristic: resistance increased by at least 10 percentage points in the latest 28 days compared with the preceding non-overlapping 12 calendar months, and both tested counts meet 30. The baseline ends at the recent period's start. Read rule configuration and values from the server; do not implement the threshold in a component.

Call these "Review flags" or "Changes for review". They carry no p-value or statistical-significance claim. Render `new`, `ongoing`, `cleared` and `insufficient_evidence` distinctly. "Insufficient evidence" does not mean a previously observed increase resolved.

If an alert uses broader filters than the active screen, state its full cohort on the list item and investigation header. Never reuse the active patient-population label for an alert computed from another population.

`/investigate/:investigationId` fetches `/investigations/{id}` and displays the returned context as authoritative. Opening an alert preserves the user's ward query for return navigation but does not overwrite the alert's calculation cohort.

The investigation page includes a recent-versus-baseline count table and a compact chronology. Add count-based organism mixture, age/sex composition, early/late collection, culture volume, repeat-removal and testing-completeness panels only when the backend supplies those breakdowns.

Explain observed associations without assigning a cause. For example: "The share of samples from patients aged 80 and older increased". Use "later collection after admission" for the dataset timing proxy; do not turn it into proof of hospital acquisition or ward transmission.

Provide a selected-dimension table beneath charts, and show suppression or incomplete source coverage within each breakdown. If P1 standardization is available, name the reference distribution and adjustment variables; keep the unadjusted evidence beside it and identify unmeasured clinical factors.

## 10. Provenance and export

Every evidence card, comparison and investigation needs an accessible "How calculated" action tied to its own `analysis_id`. The panel shows source date range, reporting bounds, filters, the first-isolate rule, counts removed, missing tests, interval method, method version, run ID and revision.

Request `/analyses/{analysis_id}/export?format=csv` or `format=json` using the ID actually displayed. Do not recompute the current filters during export or replace the ID after a background update. Make the exported snapshot date visible beside the download action.

CSV should serve tabular review; JSON should retain the agreed analysis metadata. Follow backend content types and filenames. Analysis exports remain immutable and available after revision changes or replay reset, retaining their original context. A failed download offers Retry for that same ID; never silently export a different snapshot.

## 11. Replay and snapshot consistency

Keep a separate replay toolbar with Start, Pause, Step and Reset. State that this replays historical synthetic samples. A replay clock is a demonstration mechanism, not an active clinical feed.

| Action | API | Frontend response |
|---|---|---|
| Start | `POST /replay/start` | Disable duplicate submission, then display authoritative running state. |
| Pause | `POST /replay/pause` | Await server acknowledgment; avoid an optimistic claim that ingestion stopped. |
| Step | `POST /replay/step` | Await a complete culture-bundle transaction, then refresh the snapshot. |
| Reset | `POST /replay/reset` | Switch to the new run ID, cancel old requests and remove old analysis caches. |

Poll `GET /state` every two seconds while the application is active, including paused mode. Invalidate analysis queries when `run_id` or `state_revision` changes. The backend advances windows as its clock moves even if no culture arrives, so a clock-only revision can expire old observations and change support states.

The default date mode follows the replay clock. Manual historical date selection enters an explicit pinned-date mode labeled with its cutoff; provide "Follow replay date" to return. Follow the backend's allowed date range rather than treating the last observed specimen as the maximum possible logical clock.

Use optional `expected_run_id` and `expected_revision` on coordinated GET requests to guard the intended snapshot. On `409 state_changed`, refresh state, cancel superseded analysis requests and retry once against the new context. If replay advances again, keep a visible updating state and wait for the next state poll; do not loop without a bound.

The evidence endpoint already returns all three windows atomically. Commit comparison results only if their context matches the displayed cohort, reporting date and snapshot. The alert list must match the current run/revision and its explicit monitoring date, and each alert retains its own cohort label; apply the pinned-date rule above. While new results load, use placeholders under the new context or clearly retain the old context; never put the previous ward's numbers under a changed ward heading.

Reset requires more than `invalidateQueries`: abort prior work, clear old-run cache entries, replace the run token, and reject any late response from the prior run. Close an old patient/provenance panel or preserve it with an explicit archived-snapshot label; choose closing for the MVP.

If a deliberate anomaly scenario changes observations, identify the altered dataset/run in the header and provenance. Keep it separate from untouched source replay. Do not manufacture an alert in browser code for a presentation.

## 12. State ownership and request identity

| State | Owner | Examples |
|---|---|---|
| Shareable applied context | URL search parameters | `ward_code`, `specimen`, `organism`, `sex`, `age_min`, `age_max`, `as_of`, `calendar_year`, `antibiotic_code`, `antibiotic_b`, comparison `window` |
| Server state | TanStack Query | Catalog, replay state, evidence, comparison, alerts, investigation, history and export availability |
| Temporary interaction | Component state | Unapplied form draft, patient search text, open panel, selected history row and expanded help |
| Follow-clock preference | Small application context | Follow versus pinned date; synchronize the resulting `as_of` into applied query state |

Serialize query values consistently, omit empty optional filters and validate URL values against the catalog. Browser back/forward must restore the applied cohort. A malformed URL shows useful validation and safe explicit defaults; it must not start a different analysis without a visible context change.

Centralize query keys. An evidence key includes every applied cohort field, `as_of`, `calendar_year`, primary antibiotic, run ID, state revision and method version. A comparison key adds A, B and the selected comparison window. History keys include patient ID, cutoff/lookback and the snapshot; investigation keys include investigation ID and its agreed run context.

Pass the query cancellation signal to `fetch`. Validate response context before display. Retain a response's `analysis_id` with its values, rather than keeping a separate global "latest analysis" ID.

Retry read-only transient network failures at most once in the MVP; surface persistent errors beside the affected panel. Do not automatically retry replay mutations unless the backend's idempotency behavior explicitly permits it. Preserve the user's applied filters when retrying.

## 13. API integration and typed fixtures

Use `/api/v1` as the target base. None of the endpoints in the following table exist in the current `aei/api.py`; they are implementation work described by the backend plan. Implement one typed API client and feature-specific hooks against this future contract, with the same request/response types in MSW fixtures. Components should not build arbitrary URLs, interpret transport errors themselves or depend on legacy `AnalysisResult.rows`.

| Endpoint | Client consumer |
|---|---|
| `GET /meta` | Catalogs, source coverage, defaults and method information |
| `GET /state` | Replay toolbar and snapshot invalidation |
| `GET /evidence` | Primary antibiotic's three window cards |
| `GET /comparisons` | Common-denominator antibiotic comparison |
| `GET /patients?search=` | Synthetic patient identifier search |
| `GET /patients/{id}/history` | Complete visible lookback history before cutoff |
| `GET /alerts` | Review list and status changes |
| `GET /investigations/{id}` | Research evidence page |
| `GET /analyses/{analysis_id}/export?format=csv\|json` | Exact displayed snapshot export |
| `POST /replay/start`, `/pause`, `/step`, `/reset` | Replay mutations |

Evidence accepts the shared cohort query plus `antibiotic_code`. Comparison accepts that cohort plus `antibiotic_a`, `antibiotic_b` and `window=annual|rolling_12m|last_28d`. Use the backend plan for replay bodies, snapshot guards, history parameters and pagination; agree those schemas before parallel implementation.

Prefer generated TypeScript definitions from the backend OpenAPI document. Until generation is available, maintain an agreed contract file and MSW fixtures shaped exactly like the server responses. Do not spread fixture-specific fields through components.

Minimum typed concepts:

```ts
type WindowKey = 'annual' | 'rolling_12m' | 'last_28d';
type WindowStatus =
  | 'available' | 'insufficient_data' | 'no_tests'
  | 'empty_cohort' | 'not_applicable';

interface WindowMeasure {
  status: WindowStatus;
  n_eligible: number;
  n_tested: number;
  n_s: number;
  n_r: number;
  n_not_tested: number;
  susceptibility_pct: number | null;
  resistance_pct: number | null;
  ci95: {
    susceptibility: { lower: number | null; upper: number | null };
    resistance: { lower: number | null; upper: number | null };
  };
}

interface PairedComparison {
  status: WindowStatus;
  antibiotic_a: string;
  antibiotic_b: string;
  window: WindowKey;
  n_eligible: number;
  n_paired: number;
  n_missing_a: number;
  n_missing_b: number;
  n_missing_either: number;
  cells: {
    both_s: number;
    a_only_s: number;
    b_only_s: number;
    both_r: number;
  };
  a_susceptibility_pct: number | null;
  b_susceptibility_pct: number | null;
  net_difference_pp: number | null;
  b_only_added_pct: number | null;
  at_least_one_s_pct: number | null;
}
```

Generate these concepts from the exact backend schema. Both interval endpoints remain null for suppressed results, and percentage/interval values use the 0-100 scale. Every analysis response carries `analysis_id` and `context` with `run_id`, `state_revision`, `method_version`, `as_of`, `date_bounds` and `filters`. Do not omit context from fixtures just to simplify rendering.

Create deterministic fixtures for each window status; a paired count below 30 despite standalone counts above 30; different missing-test patterns; incomplete 2023/2026 annual source coverage; a broader-cohort alert; history with boundary-date samples; a replay clock revision with no new bundles; a reset to a new run; and a `409` response followed by a fresh snapshot.

## 14. Proposed source structure

```text
src/
  app/
    App.tsx
    routes.tsx
    providers.tsx
    queryClient.ts
  api/
    client.ts
    generated.ts
    errors.ts
    queryKeys.ts
  domain/
    cohort.ts
    context.ts
    formatters.ts
  features/
    cohort/
      CohortControls.tsx
      CohortSummary.tsx
      useCohortUrl.ts
    evidence/
      ThreeWindowSummary.tsx
      WindowCard.tsx
      SupportMessage.tsx
      IntervalPlot.tsx
      useEvidence.ts
    comparison/
      AntibioticComparison.tsx
      PairedCountsTable.tsx
      useComparison.ts
    patients/
      PatientHistoryDrawer.tsx
      HistoryCulture.tsx
      usePatientHistory.ts
    investigations/
      ReviewChangesList.tsx
      InvestigationPage.tsx
      CompositionBreakdown.tsx
    provenance/
      ProvenanceDrawer.tsx
      ExportAnalysis.tsx
    replay/
      ReplayContext.tsx
      useReplayState.ts
  components/
    AppShell.tsx
    Dialog.tsx
    DataTable.tsx
    StatusMessage.tsx
    ErrorPanel.tsx
  styles/
    tokens.css
    global.css
  mocks/
    handlers.ts
    fixtures.ts
tests/
  e2e/
```

Keep `domain` limited to URL normalization, context equality and display formatting. Statistical calculations belong in the backend. Share one interval component and one support-state component so cards and investigation panels follow the same display rules.

## 15. Accessibility, readability and error behavior

Use semantic forms, buttons, links, fieldsets and tables with captions. Give selects visible labels; make filter errors programmatically associated with their fields. Each route has one main heading, and route navigation moves focus appropriately without resetting browser history.

Keep text contrast at least 4.5:1 for normal text and provide visible focus boundaries. Do not encode S/R, interval support or alert status through color alone. Write "Susceptible" and "Resistant" next to abbreviated labels where context needs it.

All chart data must remain available as readable text or a table. Confidence intervals need numeric endpoints; touch and keyboard users must not depend on a hover tooltip. Avoid tiny chart labels, clipped antibiotic names and species names truncated without another accessible full label.

Support 200% zoom and a 375px viewport. Allow a labeled table region to scroll when necessary, while the page itself stays within the viewport. Stack comparison content instead of shrinking text. Preserve document order when responsive layout changes.

Announce request completion and review-count changes through a restrained polite live region. Mark loading regions with `aria-busy`; avoid announcing every chart cell at each two-second poll. Respect reduced-motion settings. Replay always exposes a keyboard-operable pause action.

Display errors near the panel they affect. A missing interval, invalid null percentage or inconsistent response context must result in an unavailable state and an actionable error, not a guessed value. An API outage shows "Could not load evidence" with Retry while keeping filters intact.

## 16. Phased implementation tasks

### Phase A: contract and application shell

Create the Vite app, strict types, routes, CSS tokens and test setup. Review the existing AEI routes with the backend owner, then agree the additive facade's OpenAPI/fixtures, including status/null rules, context guards and history cutoff. Build the typed client, catalog query, shared controls and URL normalization against explicit fixture mode; do not create a frontend adapter that guesses new semantics from legacy statistics rows.

Acceptance: a deep link restores all applied filters; a keyboard user can apply a cohort; fixture mode and source coverage remain visible. No client calculation determines susceptibility.

### Phase B: usable ward workflow

Build the three window cards, every support state and interval display. Add the primary antibiotic selector, common-denominator comparison and patient history drawer. Connect through the shared client once the new `/api/v1` facade and its contract tests pass; the current `/statistics` endpoint is not a substitute for that milestone.

Acceptance: the 29/30 boundary, missing paired tests, incomplete annual source coverage and strict history cutoff all behave correctly. The evidence response supplies all three displayed windows.

### Phase C: investigation and exact exports

Build the review list, investigation route, context breakdowns and provenance drawer. Add CSV/JSON export using each displayed analysis ID. Keep alert cohort labels independent of the currently applied ward filters.

Acceptance: opening a broader-cohort flag names that cohort, back navigation restores the prior ward query, and an export matches the values and snapshot the user inspected.

### Phase D: replay and race handling

Add the replay mutations, two-second state polling, run/revision query keys and bounded `409` recovery. Support follow-clock versus pinned dates. Implement reset cancellation and old-run cache removal.

Acceptance: a clock-only advance expires window observations, reset cannot restore old results through a late response, and all three cards remain within one snapshot. The demo can run without a browser refresh.

### Phase E: verification and presentation

Complete the meaningful browser checks below, keyboard/zoom review and API-backed smoke test. Fix ambiguous labels before adding P1 features. Record a short demo path using the actual replay/scenario behavior and identify any altered observations.

Acceptance: build and lint pass; the user can complete the ward, comparison, history and investigation workflows with the keyboard and inspect the exact data behind a displayed result.

## 17. Test strategy and end-to-end acceptance

Use unit tests for URL serialization, date-only formatting, context equality and status presentation. Component tests should exercise suppression, missingness, interval labels and dialog behavior. Avoid tests that reimplement backend percentage calculations.

| Scenario | Observable acceptance result |
|---|---|
| Tested count 29, then 30 | At 29, no percentage/interval appears anywhere in the UI or accessibility tree; at 30, server values display. |
| Sparse 28-day cohort | Counts and the suppression message remain; a longer-window action does not change ward/specimen/species silently. |
| Explicit all-ward alternative | The user sees the changed cohort label and can return to the original ward; no cross-species percentage appears. |
| Paired denominator mismatch | Standalone N values can exceed 30 while paired N remains below 30; the comparison stays suppressed. |
| B-only versus net difference | Both discordant cells remain visible, and labels distinguish additional B-only activity from B-minus-A. |
| No tests / empty / not applicable | Each state has different wording; no state renders as 0%, 100% or a favorable color-only result. |
| 2023 and 2026 calendar years | Both display the appropriate source coverage warning even when the tested count exceeds 30. |
| Window date boundaries | At 2026-09-27, card labels match agreed rolling/28-day bounds; no browser timezone moves dates. |
| History strict cutoff | A sample on the cutoff date and a later sample stay absent; all visible earlier specimen types within lookback appear. |
| Broader alert population | The flag and investigation show their own sex/age/ward cohort rather than inheriting the active page label. |
| Pinned historical report | Later monitoring flags stay hidden; the interface names their monitoring date and offers an explicit return to the replay date. |
| Rapid filter changes | Delay the previous ward's response; only the currently applied context can populate the new headings. |
| Replay clock without arrivals | Backend revision changes and the window result refreshes even though bundle count stays constant. |
| Replay reset | A new run ID clears old analysis caches; delayed old-run responses cannot return to the page. |
| `409 state_changed` | The client refreshes state and retries within the bound; users see updating/error status rather than mixed snapshots. |
| Snapshot export during replay/reset | Download requests the analysis ID displayed when Export was invoked; an old ID retains its original values and context after reset. |
| Network failure | Real API failure never substitutes fixtures; Retry keeps the selected cohort. |
| Legacy response at the target endpoint | A legacy `prototype-v1` rows payload fails contract validation and shows an integration error; the UI does not aggregate or reinterpret those rows. |
| Keyboard dialogs | Focus enters the panel, stays within a modal, closes on Escape and returns to its trigger. |
| Zoom and narrow screen | At 200% zoom and 375px width, labels/counts stay readable and controls remain reachable. |

Run an API-backed smoke test with the backend's deterministic dataset and replay scenario after fixture tests pass. The frontend test must verify displayed values against the returned response, not duplicate the backend's scientific logic. Preserve source/scenario labels in demo screenshots.

## 18. Sources and implementation references

- [Backend implementation plan](../TyksXMylab-backend/IMPLEMENTATION_PLAN.md): normative project API and data definitions.
- [Existing AEI backend README](../TyksXMylab-backend/README.md), [API](../TyksXMylab-backend/aei/api.py) and [models](../TyksXMylab-backend/aei/models.py): current legacy routes and `prototype-v1` response; keep separate from the planned facade.
- [Dataset README](../TyksXMylab-backend/synthetic_microbiology_dataset/README.md): schema, limitations, first-isolate and reporting rules.
- [React documentation](https://react.dev/learn): component and state organization.
- [Vite documentation](https://vite.dev/guide/): frontend development and build setup.
- [TanStack Query documentation](https://tanstack.com/query/latest/docs/framework/react/overview): queries, request identity and server state.
- [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): keyboard and focus behavior.
- [Xie et al., 2025](https://link.springer.com/article/10.1186/s12941-025-00787-7): ward/specimen stratification and the workload of subgroup reports.
- [Ilmavirta et al., 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10604539/): Finnish specimen/sex differences and diagnostic sampling limitations.
- [Ilmavirta et al., 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12514435/): clinical linkage needed for origin, comorbidity and outcome analysis.
- [CDC NHSN resistance FAQ](https://www.cdc.gov/nhsn/faqs/faq-ar.html): tested denominators, testing completeness and reporting considerations; apply this project's specified deduplication method.
- [EUCAST category definitions](https://www.eucast.org/bacteria/clinical-breakpoints-and-interpretation/definition-of-s-i-and-r/): laboratory interpretation and exposure context.

Pin dependency versions at implementation time and keep the lockfile. This plan specifies workflow and behavior rather than assuming an unverified library version.
