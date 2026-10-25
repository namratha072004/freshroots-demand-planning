# Freshroots Demand Planning (draft-only)

Decision support for the Senior Demand Planner (Raghav) at Freshroots. It reads sales and stock files, applies
Raghav's 5 rules in code, asks Gemini to explain the flags, shows a dashboard where Raghav approves or rejects each
flag, and creates a **draft** purchase order in Zoho Inventory for the approved lines. Procurement adds the price and
places the order inside Zoho. This system never places, issues, sends or approves a purchase order.

**Principles:** all numbers, flags and quantities come from deterministic code. The AI only writes text and is
checked (it may quote only numbers the rules calculated). Cases outside the rules are marked NEEDS_RAGHAV and the
system does not guess.

## Status

| Part | State |
|---|---|
| Data tables, CSV loader, one row per SKU, missing/stale checks | Built |
| Rules engine (5 rules, A1-A5) | Built, unit-tested, matches the expected seed flags |
| Run pipeline (manual "Run now" and `npm run run-planning`) | Built |
| Gemini reasons, triage, sourced new-launch leads | Built |
| Dashboard: Flag list and New launches tabs, login | Built |
| Kill switch (alert 10%, stop 25%, 4 weeks, resume with note) | Built |
| Zoho draft PO (one real draft PO verified in Zoho) | Built |
| Scheduled run (Vercel Cron, Mon + Thu 08:00 IST) | Built: `GET /api/cron/run`, registered on Vercel |
| Deployed on Vercel | Done: https://freshroots-demand-planning-nu.vercel.app |

## Setup

Needs Node 20.9 or newer (developed on Node 24) and a Neon Postgres database.

```bash
npm install
cp .env.example .env.local      # then fill in the values (see below)
npm run migrate                 # creates the tables in Neon
npm run dev                     # http://localhost:3000, open mode accepts any password
```

Press **Run now** on the dashboard. A run loads the CSVs in `/data` into Neon, validates, applies the rules, saves
the flags, then adds Gemini reasons and launch leads. A full run takes about 1-2 minutes (real web searches are slow).

### Scripts

| Command | What it does |
|---|---|
| `npm run migrate` | Applies the SQL files in `/migrations` in order (safe to re-run) |
| `npm run load-data` | Loads the 5 CSVs from `/data` into Neon and checks the row counts (4 / 15 / 240 / 15 / 24) |
| `npm run run-planning` | Runs the planning pipeline from the command line |
| `npm run zoho-sync` | Fetches Zoho item ids by SKU and stores the SKU-to-item mapping |
| `npm test` | Unit tests |
| `CONFIRM_WIPE=yes npx tsx scripts/check-po-flow.ts` | **Destructive.** Checks the draft-PO safeguards against the database with a pretend Zoho. Development database only |

## Environment variables

Secrets live only in environment variables (`.env.local` locally, never in git). See `.env.example`.

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | Neon pooled connection string |
| `ASOF_OVERRIDE` | "Today" for the stale-data and festival-month checks (default 2026-10-19, D1). The kill-switch window and launch-lead recency use the real clock, never this |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini access. Tested with `gemini-3.8-flash` |
| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_ORG_ID` | Zoho Self Client credentials and organisation |
| `ZOHO_ACCOUNTS_URL`, `ZOHO_API_URL` | India data centre: `https://accounts.zoho.in`, `https://www.zohoapis.in` |
| `ZOHO_DRY_RUN` | `true` = build and show the PO request but never create it. Default `false` |
| `AUTH_MODE` | `open` (any password) or `password` (checks `DASHBOARD_PASSWORD`). Switching is this one setting and logs everyone out. In `password` mode with no password set, nobody can log in |
| `DASHBOARD_PASSWORD` | Used when `AUTH_MODE=password` |
| `CRON_SECRET` | Protects `/api/cron/run`. Vercel sends it as `Authorization: Bearer <CRON_SECRET>`; without it the endpoint answers 401 |

## Deployment (Vercel)

- Live at https://freshroots-demand-planning-nu.vercel.app (Vercel team `mesa-ai1`, Hobby plan). The 13 settings below are set as Vercel Production environment variables.
- **Online settings:** `AUTH_MODE=open` (no dashboard password yet, so anyone with the link can use the dashboard) and `ZOHO_DRY_RUN=false` (the Create draft PO button creates a real draft PO in Zoho; set it to `true` to make the button show the request without creating anything). Before wider use, set `DASHBOARD_PASSWORD` and `AUTH_MODE=password` in the Vercel project's environment variables and redeploy.
- **Schedule:** `vercel.json` registers `/api/cron/run` at `30 2 * * 1,4` (UTC) = Monday and Thursday 08:00 IST. Vercel calls it with GET and `Authorization: Bearer <CRON_SECRET>`. Per Vercel's docs, Hobby cron timing is only precise within the hour (so the run can start any time from 07:30 to 08:29 IST), delivery is best effort with no retries, and a schedule can occasionally be delivered twice. The endpoint therefore skips a scheduled run if one already started in the last 30 minutes. A stopped kill switch refuses the scheduled run (HTTP 423).
- The cron endpoint sits outside the dashboard login and protects itself with `CRON_SECRET` (fails closed if it is not set).
- The CSVs in `/data` are bundled into the server build through `outputFileTracingIncludes` in `next.config.ts`.
- A run takes about 75 seconds on Vercel; the function limit is 300 seconds (Fluid compute).
- Redeploy from this repo with `vercel deploy --prod`.

## Design

A dark forest sidebar with the last run shown as a pipeline, a row of headline numbers, and flag cards that show the two things the rules used: a weeks-of-cover meter against the safe zone and a 16-week sales sparkline (last 4 weeks highlighted, hover for the weekly value). The rejection rate is a meter with the 10% and 25% lines. Light and dark themes follow the system setting; it works on a phone. The header always shows a **Purchase orders** glimpse (latest draft POs with links to Zoho), **Run now**, and **Sign out**.

Motion: cards rise in, KPI numbers count up, the sales line draws itself, the cover marker slides into place, buttons lift and sweep on hover, and the run button animates while a run is in progress. Everything respects the system "reduce motion" setting (the page then shows with no movement).

- Status is never colour alone: every chip has an icon and a label. Chip text contrast is at least 4.5:1 in light and dark, and the status colours were checked with a colour-vision separation tool (the red/green pair relies on its icons and labels).
- Inspiration came from free sources: the open-source shadcn/ui and Tremor dashboard patterns and Dribbble dashboard searches. No artwork was copied.
- Fonts: Plus Jakarta Sans and Geist Mono (SIL Open Font License, loaded with `next/font`). Icons: `lucide-react` (ISC licence).

## Pages

The dashboard is split so no single page is crowded. The **Overview** is one screen: four headline cards and a "What to do next" panel. Each card opens its own page, which shows only that list, one line per flag:

| Card / sidebar item | Page | What it shows |
|---|---|---|
| To review | `/review` | Only the flags waiting for a decision (Order now, Pause the next order, and "Needs your judgment"), with Approve / Reject on each row. Decided flags move to a "Decided in this run" section. |
| Proposed order quantity | `/orders` | The ORDER_NOW flags that have not been rejected, with approved / still-waiting totals. |
| Rejection rate | `/rejections` | Every rejection in the kill-switch window across runs, the reason given, when and from which run, and a split by reason. An Approved tab shows the approvals. |
| Draft POs in Zoho | `/purchase-orders` | The approved lines ready for a draft PO, the Create draft PO button, and every draft PO created in Zoho. |
| New launches | `/launches` | Sourced launch leads. |
| Activity log | `/logs` | Time log of every action, and the Adjustments view (system vs you). |
| Settings | `/settings` | Editable rules, kill switch, launch limits, PO live/dry run, appearance. |

Each flag is a one-line row (product, action, stock cover, weekly sales, decision). Click a row to open its charts, flags and the AI reason. All pages refresh after a decision, run or settings change.

## Changing the order quantity (human in the loop)

The rules suggest a quantity and the planner has the last word. On every ORDER_NOW row the system's suggestion ("Order 750") stays exactly as it is, with **Approve · Edit · Reject** on the right:

- **Approve** approves exactly what the system suggested.
- **Edit** opens a small panel: the system's number (read-only), **your quantity**, a live difference (for example −450, −60%), a **required reason** (demand is changing / stock already on the way / supplier minimum or availability / budget or cash limit / the data looks wrong / my own judgment) and an optional note. **Approve [your number]** then approves your quantity. The order, the draft PO and every total use your number.
- You can change the quantity **after approving** too (Edit quantity, with a reason) until a draft PO is created. Once a draft PO carries the line it is locked, because Zoho already has the number.
- The system's suggestion is never overwritten: `recommendations.quantity` keeps it, `approved_quantity` holds the planner's number, `adjustment_reason` / `adjustment_note` hold why, and every change is kept in `quantity_audit`.
- Checks: whole number from 1 to 1,000,000; a change must come with a reason; an order above twice the suggestion asks for a second confirmation; only orders have a quantity. An approval with an edited quantity still counts as an approval in the kill switch.

## Activity log

`/logs` has two views:

- **Activity**: a time log (IST, newest first, grouped by day) of every action: approvals (with the suggested and ordered numbers, the difference and the reason), rejections (with the reason), quantity changes, runs, draft POs (created, dry run, re-checked, failed), kill-switch stops and resumes, launch marks, settings changes, PO mode switches, sign in and sign out. Filter by kind and by who. Actions taken on the dashboard are shown as the planner (`config.ui.plannerName`, "Raghav"; the dashboard has one login, so every dashboard action is attributed to that name); things the app did on its own (scheduled runs, an automatic kill-switch stop) are shown as System. Existing history was filled in when the log was created. Logging never blocks the action it records.
- **Adjustments (system vs you)**: where the planner's numbers differ from the suggestions: how often you agreed with the system, how many orders were adjusted (lowered and raised), the typical size of the change, the net units, a count by reason, each adjusted order (system number → yours, the difference, the reason and note, when) and a by-SKU rollup, so it is easy to see which products the rules get least right and why.

`npx tsx scripts/check-quantity-edit.ts` checks all of this against the database using temporary rows (and temporary log entries) that it removes; it never touches real flags.

## Colour themes

Five themes (Forest, Ocean, Grape, Rose, Graphite) and Light / Dark / Match my device, from the palette button in the header or the Settings page. The choice is kept in a cookie so the server renders it with no flash. Every text/background pair was checked for contrast in all ten theme-and-mode combinations; the status colours (order, pause, approved, rejected) are the same in every theme on purpose.

## Settings page

`/settings` lets you edit Raghav's rubric without touching code: Rule 1 (high-demand threshold and reorder multiplier), Rule 2 (stockout line), Rule 3 (overstock line), Rule 4 (festival uplift), Rule 5 (perishable windows), the data checks (minimum history, stale days), the kill-switch levels, and the launch-search limits. It also switches the Create draft PO button between **Live** and **Dry run** (going live asks first) and has a **Go to the login page** button.

- Edited values are saved in Neon (`app_settings`) and override the defaults in `src/config.ts`. A value set back to its default removes the override. The next run (scheduled or manual) uses them; flags already on the list keep the numbers they were calculated with.
- Every change is recorded in `settings_audit` with the old and new value and the time, and shown under "Change history".
- Values are validated on the server: ranges, whole numbers where needed, minimum cover below maximum cover (normal and perishable), alert level below stop level.
- The AI's number check uses the edited thresholds, so its sentences can quote them.
- The login mode (`AUTH_MODE` / `DASHBOARD_PASSWORD`) is deliberately not editable here: with an open login anyone could otherwise set a password and lock the owner out. Change it in the Vercel environment variables.
- Anyone who can open the dashboard can edit the settings while the login is open, so set a password before wider use.

## Configuration

Every default is in one file, `src/config.ts`, each with a comment (values edited on the Settings page override these): rule thresholds, stale days, kill-switch
levels (including `minDecisions`), Gemini settings, launch-search limits, Zoho vendor name and timeouts.

## Assumptions to confirm with Raghav

The case does not settle these, so these are provisional defaults (in `src/config.ts` and `src/lib/rules.ts`):

- **A1.** "Average weekly sales" for weeks of cover is the 12-week average, and the 12 weeks include the latest 4.
- **A2.** In a festival month (per `calendar`, using `ASOF_OVERRIDE`) the 25% uplift multiplies that average, **for weeks of cover only**. HIGH_DEMAND compares the last 4 weeks with the plain 12-week average (this is the only reading that matches the expected seed table).
- **A3.** When several flags fire, ORDER_NOW wins over PAUSE_ORDER. With HIGH_DEMAND the quantity is 1.5x the standard. HIGH_DEMAND with healthy stock is an order flagged for review. HIGH_DEMAND together with OVERSTOCK_RISK is NEEDS_RAGHAV. (The brief's example "stock 1,600 gives PAUSE_ORDER" has HIGH_DEMAND firing too; A3 was followed.)
- **A4.** Under 12 weeks of history, or missing inventory or master data, is NEEDS_RAGHAV.
- **A5.** Cover exactly on a threshold is not flagged. The same is applied to the +20% HIGH_DEMAND line.

Extra defaults added while building (also to confirm):

- Perishable SKUs use 3-4 weeks of cover instead of 6-14, and HIGH_DEMAND still applies to them.
- ORDER_NOW from stockout alone is 1x the standard quantity; fractional quantities round up.
- Zero average sales (cover undefined) is NEEDS_RAGHAV.
- Stale data (stock snapshot or latest sales week more than 7 days before `ASOF_OVERRIDE`) is shown as a warning on the flag and does not change the rule result.
- Several stock locations for one SKU are summed.
- Only ORDER_NOW lines go into a draft PO. PAUSE_ORDER approvals create nothing.
- The AI's "needs Raghav" is only a badge. Those flags keep their buttons and their decisions count in the kill switch. Only the rules' own NEEDS_RAGHAV removes the buttons and the count.

## Kill switch

Rejection rate = rejected / (approved + rejected) over the last 4 weeks (real clock). NEEDS_RAGHAV, SUPERSEDED and
undecided items never count. Alert at 10% or more, stop at 25% or more. Below `minDecisions` (20) decided items it
shows "collecting data": the rate and the 10% alert still show, but it never stops. The check runs after each
decision is saved and protects the next run: on a stop, scheduled and manual runs refuse, "Create draft PO" is blocked,
and a banner explains. No owner or notification channel is defined (the brief leaves that open); the alert is shown on
the dashboard only.

**To reset (resume):** on the dashboard banner type a note and press **Resume**. The note is stored in
`kill_switch_events`, and only decisions made after the resume count towards the next check. If the dashboard is not
available, the same effect in SQL (only valid while the latest event is STOPPED):
`INSERT INTO kill_switch_events (kind, note) VALUES ('RESUMED', 'why it is safe to resume');`

**Demo:** lower `killSwitch.minDecisions` in `src/config.ts` to 4, reject 1 of 4 decided flags (25%) to see the stop,
then restore it to 20.

## Zoho Inventory

- Create one vendor named as in `config.zoho.defaultVendorName` and import `zoho/items_import.csv` (15 items, no purchase price).
- Scopes used at runtime: `ZohoInventory.purchaseorders.CREATE`, `ZohoInventory.purchaseorders.READ`, `ZohoInventory.items.READ`, `ZohoInventory.contacts.READ`. Nothing broader.
- The code can only create a PO (Zoho creates it as a draft; the stored Zoho status is checked and a warning is shown if it is not "draft"). It has no call that issues, sends, submits or approves a PO, and a test scans the source for that.
- One PO per batch of approved ORDER_NOW lines, all under the default vendor (D3). The batch is recorded with its Zoho id, so the same batch is never created twice. Each PO carries a reference number (`FR-...`); after a network failure the next click looks Zoho up by that number before creating anything.
- Zoho shows the missing price as 0.

## Gemini

- Reasons and triage use JSON output with a low thinking level (typically 5-10 seconds for all flags, up to about 45 seconds when the network or Gemini is slow).
- New-launch leads use Google Search. Asking for strict JSON made the model skip the search most of the time, so the search call asks a plain question and the list is read from the answer. Each lead needs a grounded source; the source page is read for its own publication date, and leads older than 180 days or without a readable date are dropped. Leads are unverified references: no demand estimate and no advice to stock.
- If the AI step fails, the run still completes and flags appear without reasons.

## Decisions from the brief

D1 `ASOF_OVERRIDE`. D2 a new run marks earlier PENDING flags SUPERSEDED (never counted as rejections; the dashboard asks first). D3 one draft PO per batch, one default vendor. D4 login screen with `AUTH_MODE`. D5 Zoho is live, with `ZOHO_DRY_RUN`.

## Known limitations

- The online dashboard has no password while the PO button creates real drafts in Zoho, so anyone with the link can create a draft PO (see Deployment).
- On the Hobby plan the scheduled run can start anywhere in the 02:xx UTC hour (07:30-08:29 IST).
- Gemini sometimes returns no sources for a search; those answers are dropped, so a run finds roughly 4-9 leads.
- Many news sites block automated readers, so about half of candidate leads are dropped for lack of a readable date.
- There is only one stock snapshot, so past stockouts cannot be backtested.
- No price or supplier data exists, so the PO price stays blank.
