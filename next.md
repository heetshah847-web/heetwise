# NEXT — finish the UI overhaul (5b), then Phase 6 hardening

## Where we are
Phase 5b delivered the **UI foundation** (Tailwind v4, design system, page
transitions, quick-add FAB + 3-step add-expense wizard, Currencies page) and one
**additive** backend route (`POST /rates/sync`). See STATUS.md. The owner approved
**minimal additive backend changes** to wire up UI features, and **foundation-first**
delivery. Nothing here has been `npm install`-ed or run yet.

## Before continuing (setup — still outstanding)
1. `cd frontend && npm install` (Tailwind, framer-motion, radix, lucide, etc.);
   `cd backend && npm install` (node-cron, node-cache).
2. Backend `.env` (already has DATABASE_URL/JWT_SECRET/EXCHANGE_RATE_API_KEY set);
   `frontend/.env` from example.
3. `npx prisma migrate dev` (no migrations exist yet — creates the whole schema);
   `npm run sync-rates` once.
4. Run both dev servers; verify the FAB, wizard, currencies page, and that existing
   pages still work. **The smart-split, multi-currency, stats, AND this UI code have
   never been executed — verify and fix real issues before adding more.**

## Phase 5b — remaining UI work (the "iterate" list)
Each item notes the additive backend it needs (allowed). Build on the design system
(`Button`, `Money`, `CurrencySelect`, `PageTransition`, `lib/currencies`).

1. **Migrate existing pages to Tailwind/design system** (Login, Register, Dashboard,
   Groups, GroupDetail, the 3 stats pages) — replace inline styles; add a **sidebar**
   layout (Groups, Currencies w/ chart icon, profile avatar at bottom).
2. **Splitwise-style expense list** (GroupDetail): category icon, date/desc/payer,
   right-side original amount + you-owe/you-lent, click-to-expand split breakdown,
   framer-motion **swipe-to-delete**. (Delete uses existing endpoint.)
3. **Expense categories** — needs additive backend: add `category` (String/enum) to
   `Expense` + accept it in `createExpense`/return it. Then category pills in the
   wizard + emoji icon on rows.
4. **Balance redesign** — horizontal owed/owe bars, Splitwise-style debt cards with
   avatars + animated count-up amount + settle button. Display uses existing
   `/balances`; the **settle action needs the settlement endpoint** (Phase 6 task 1).
5. **Dashboard recent-expenses feed** — timeline of 10 latest across groups (can be
   done client-side by merging `listGroups`+`listExpenses`, or add a small additive
   `GET /me/recent` endpoint for efficiency).
6. **Currency filter bar** on the expense list (All/USD/INR/EUR/…); client-side filter
   + filtered original-currency total.
7. **Group activity feed tab** — needs additive backend: an `ActivityLog` table +
   write on expense add/delete, member join, settle; `GET /groups/:id/activity`.
8. **Notification center** (slide-in panel, unread badge) — needs additive backend:
   `Notification` table + `GET /notifications` + mark-read; emit on relevant events.
9. **Profile/settings page** — needs additive backend: update profile/display name,
   change password, preferred currency (add column), delete account (typed-DELETE
   confirm). Add the endpoints + wire the UI.
10. **Consistent currency formatting everywhere** via `<Money/>` — sweep all amount
    displays (already started; finish during page migration).

## Phase 6 — security hardening + ship-readiness (final)
1. **Debt settlement**: `Settlement` model + record/list/delete endpoints; fold into
   balance math (`simplifyDebts` minimum-transactions); call `invalidateGroupStats`
   on settle (hook noted in `createExpense`). Unblocks the settle button + the
   "unsettled" semantics in stats.
2. **IDOR protection / authorization on every mutation** — audit all routes so each
   verifies ownership/membership; no endpoint trusts a path id blindly.
3. **helmet.js** security headers; **CSRF protection** (cookie auth → CSRF tokens /
   double-submit / SameSite hardening).
4. **Input sanitization + length limits** via **express-validator** across endpoints.
5. **Replace all `console.log`/`console.error` with a winston logger** (`index.js`,
   `errorHandler.js`, `syncRates.js`, `app.js`); keep API-key redaction.
6. **Final `.env.example` audit** — every read var present + documented.
7. **User-facing `README.md`** — clone-and-run from scratch (prereqs, install, `.env`,
   `prisma migrate`, `npm run sync-rates`, start both servers, run tests, feature tour).

### Carried-over follow-ups
- **PATCH expense** still EQUAL/EXACT only (legacy shape) — move onto splitService +
  validateSplit so updates support PERCENTAGE/WEIGHT + currency.
- **bcrypt on Node 24** likely fails to build on Windows — switch to `bcryptjs`.
- **getBalances** loads all group expenses to sum — consider a SQL aggregate.

### Constraints (unchanged — CLAUDE.md)
- UUIDs; base money in integer cents (never floats); JWT only in httpOnly cookies;
  secrets server-side only (rate API key only in `rateService` + the redactor);
  parameterized Prisma/$queryRaw; `{ data, error, status }` envelope; async/await.
- Don't change `balance.js`'s contract; don't run aggregations outside `statsService`;
  don't call the external rate API outside `rateService` / the cron / the new sync route.

## After completion
Mark the project feature-complete in STATUS.md; close out or reseed NEXT.md.
