# Quillit v4.0 — Master Google AI Studio Build Prompt (Evaluation Redesign, Diagnostic Progress Dashboard, Minimal Editorial UI & Production Hardening)

> **How to use:** Paste this entire prompt directly into **Google AI Studio Build** on your `Kayilainathan/Quillit` project. It preserves your 5-generation Gemini API cascade and PSR-01–PSR-10 invariants while executing 4 sequential, verifiable engineering phases.

---

## Role & Execution Contract

You are a **Principal Full-Stack TypeScript Engineer and Editorial Product Designer** upgrading **Quillit** (`v3.1` → `v4.0`) into a calm, minimal, production-grade writing and communication mastery studio.

**Read these files first before editing:**
- `ENGINEERING_LOG.md`, `firestore.rules`, `package.json`, `tsconfig.json`
- `server.ts`, `server/lib/authMiddleware.ts`, `server/lib/geminiCascade.ts`, `server/lib/validation.ts`, `server/routes/evaluate.ts`
- `src/App.tsx`, `src/styles/tokens.css`, `src/utils/apiBase.ts`, `src/utils/cloudSync.ts`, `src/utils/analytics.ts`, `src/utils/evaluationRouter.ts`
- `src/components/WriteStudio.tsx`, `src/components/EvaluationReportView.tsx`, `src/components/DashboardView.tsx`, `src/components/ConverseStudio.tsx`

### Non-Negotiable Invariants (DO NOT BREAK)
1. **DO NOT change the Gemini API cascade or model-routing architecture:** Preserve `server/lib/geminiCascade.ts` and `src/utils/evaluationRouter.ts` (`gemini-4-hydrogen` → `gemini-3-flash-preview` → `gemini-3.1-flash-lite` → `gemini-2.5-flash` → `gemini-2.5-flash-lite`, model-safe `thinkingConfig`, cooldowns, and fast-tier utility routing). Optimize **evaluation latency and signal quality** via schema slimming, deterministic server-side derivation, and prompt compression—never by removing or downgrading the cascade.
2. **Preserve PSR-01 through PSR-10:** Atomic single-pass evaluation (zero score jump), strict verbatim grounding, persistent cross-tab mounting, forced Firestore long-polling, Offline Space AES-256-GCM encryption, and Local Desk zero-friction access.
3. **Execute Phases 1 → 4 sequentially.** After each phase, run `npm run lint`, `npm test`, and `npm run build:pages`, fixing every error immediately before moving to the next phase.

---

## Phase 1: High-Signal, Low-Latency Evaluation Engine Redesign (Same API Cascade, 35–50% Faster)

**Problem in current `server/routes/evaluate.ts`:**
The current `/api/evaluate` route forces the LLM to generate **23 required top-level JSON fields** on every call—including 7 mathematically derivable benchmarks (`cefrLevel`, `ieltsBand`, `toeflEquivalent`, `lexicalResource`, `coherenceCohesion`, `taskAchievement`, `registerControl`), duplicated rewrite fields (`rewrittenSample` mirroring `pinpointedRewrites[0]`, `whatImproved` duplicating `whatImprovedPoints`, overlapping `grammarFixes` + `pinpointedRewrites`), and optional fields (`suggestedTitle`, `drillVerdict`) even when not needed. Output token volume is the primary driver of LLM latency.

**Redesign requirements:**
1. **Slim the LLM JSON schema in `server/routes/evaluate.ts` from 23 required fields down to 10 high-signal fields** while preserving the exact same `executeDynamicEvaluationCall` cascade:
   - `scores`: 6 integer rubric scores (`1–10`): `naturalVoiceFlow`, `claritySimplicity`, `grammarMechanics`, `toneEngagement`, `sentenceVarietyCadence`, `concisenessDirectness`.
   - `metricNotes`: Ultra-concise evidence-backed notes (`<= 14 words` per metric) referencing this specific draft.
   - `spokenReadinessScore`: `0–100` integer measuring natural spoken-English fluency and absence of textbook stiffness/calques.
   - `toneCheck`: `{ match: 'On Target' | 'Slightly Off' | 'Mismatch', audienceReaction: string (1 sharp sentence from targetAudience), toneFix: string (1 concrete adjustment) }`.
   - `edits`: Single unified array (`2–6` items) of verbatim-grounded improvements, each with:
     - `original`: exact verbatim substring from the draft (must pass `filterGroundedGrammarFixes` verification).
     - `improved`: natural, spoken-ready rewrite.
     - `dimension`: `'grammar' | 'tone' | 'flow' | 'clarity' | 'calque'`.
     - `errorTag`: standardized diagnostic tag from a fixed enum (`subject-verb`, `tense-shift`, `article-preposition`, `run-on-sentence`, `word-choice`, `regional-calque`, `hedging-passive`, `tone-mismatch`, `repetition-filler`, `punctuation-spacing`).
     - `rule`: crisp 1-sentence transferable rule the writer can apply next time.
   - `vocabUpgrades`: `2–3` natural real-world phrase upgrades (`used`, `betterAlternative`, `explanation`, `contextTag`)—lowest scoring weightage, strictly banning thesaurus-slop (`utilize`, `delve`, `tapestry`, `myriad`, `plethora`, `endeavor`, `commence`, `facilitate`, `synergy`, `leverage`, `paramount`).
   - `strengths`: `2` crisp bullets (`{ title, detail }`) quoting what actually worked well.
   - `nextDraftPriority`: **1** single concrete, imperative action to practice in the very next session (used for closed-loop tracking).
   - `feedbackStatus`: `'Baseline' | 'Yes' | 'Partial' | 'No'` + short `feedbackNote` (only when `previousSessionSummary` is non-empty).
   - **Conditional schema fields:** Include `suggestedTitle` in `responseSchema` *only* when `shouldInferTitle === true`, and include `drillVerdict` *only* when `drillContext?.drillType && drillContext.drillType !== 'standard'`.
2. **Derive redundant fields deterministically on the server (zero extra LLM tokens):**
   - Compute `cefrLevel`, `ieltsBand`, `toeflEquivalent`, `lexicalResource`, `coherenceCohesion`, `taskAchievement`, and `registerControl` deterministically from the calibrated 6-metric scores using `deriveInternationalMetrics()` in `src/utils/analytics.ts`.
   - Derive `rewrittenSample` from the highest-impact item in `edits`.
   - Derive `whatImproved` from `strengths`, and map `edits` into backwards-compatible `pinpointedRewrites`, `grammarFixes`, and `calqueFixes` (while also returning the unified `edits` + `errorTag` array) so Firestore rules and existing sessions remain 100% compatible.
3. **Compress system instruction tokens by ~35%:**
   - Replace verbose prose instructions in `server/routes/evaluate.ts` with a tight, structured rubric table and concise rules—keeping strict, non-inflated grading and exact verbatim quoting.
4. **Update `src/types.ts` and `src/utils/fastEvaluate.ts`:**
   - Add `errorTag` to `GrammarFix` / unified edit items and emit matching `errorTag` values in `fastEvaluate.ts` so offline evaluations populate the exact same Dashboard mistake diagnostics.

---

## Phase 2: Diagnostic Progress Dashboard ("What Went Wrong & How to Improvise")

**Goal:** Transform `src/components/DashboardView.tsx` and `src/utils/analytics.ts` from a passive stats page into an active **Communication Improvement Engine** that shows exactly *what went wrong*, *whether mistakes are shrinking*, and *how to fix them*.

**Implement these 4 clean, high-signal dashboard modules:**
1. **Hero Fluency Pulse (Compact 4-Stat Strip):**
   - Overall Fluency Score (`/60` + 5-session trend delta), Spoken Readiness (`%` + delta), Active Streak & Weekly Cadence Ring, and Current CEFR / Target Focus.
2. **Recurring Mistake Radar ("What's Holding You Back"):**
   - Add `computeErrorPatternAnalytics(sessions)` in `src/utils/analytics.ts` that aggregates `errorTag` / `category` across `grammarFixes`, `calqueFixes`, and `edits` over the last 10 sessions (with filter: *Last 7 days* / *Last 30 days* / *All time*).
   - Display the **Top 5 Recurring Bottlenecks** (e.g., *Run-on Sentences*, *Subject-Verb Agreement*, *Regional Calques*, *Tone Mismatch*, *Filler & Repetition*) showing:
     - Frequency count + trend badge (`Improving`, `Recurring`, `New`).
     - One-line diagnosis of *why* it happens.
     - One-click **Inspect Examples** drawer showing 2–3 exact `Before → After` snippets pulled from the user's own past drafts.
3. **Skill Pillars & "How to Improvise" Playbook (Grammar · Tone · Communication · Vocabulary · Clarity · Conciseness):**
   - Clean 6-pillar grid with minimalist monochrome progress bars, 30-day score deltas (`+0.8`, `-0.3`), and sparklines (`src/components/Charts.tsx`).
   - Clicking any pillar opens a focused **How to Improvise** card containing:
     - Your weakest recurring rule in that pillar (derived from your real sessions).
     - A concrete **Micro-Habit** for your next draft.
     - A 1-click **"Practice This Weakness"** CTA that opens `WriteStudio` pre-loaded with a tailored topic, target tone/audience, and active reminder targeting that exact flaw.
4. **Closed-Loop Feedback Tracker & Clean Session Ledger:**
   - Show a compact **"Feedback Applied Rate"** indicator (`Yes` / `Partial` / `No` across recent sessions) so the user sees whether coaching advice is actually sticking.
   - Keep the session ledger minimal and scannable (Date, Title, Mode, Score, Spoken %, Top Issue Tag) with an inline slide-over/modal to inspect the full Before → After diff.

---

## Phase 3: Minimal, Aesthetic Editorial Frontend Redesign

**Design Direction:** Quiet-luxury literary stationery inspired by **iA Writer**, **Bear**, and **Hemingway Editor**—preserving Quillit's existing `src/styles/tokens.css` palette (Cotton Rag Paper `#FAF8F4` / Carbon Ink `#141413` in light mode; Nocturne Obsidian `#0E0E0D` / Warm Ivory `#F2F0EB` in dark mode), `Fraunces` display serif, `Plus Jakarta Sans` UI sans, and `JetBrains Mono` metrics. Zero neon glows, zero clutter, generous whitespace, crisp `1px` borders.

**Key UI & UX refinements:**
1. **Distraction-Free `WriteStudio.tsx`:**
   - Center the editor canvas at a comfortable `65ch` reading measure with generous vertical breathing room.
   - Collapse secondary controls (drills, audience selector, coach presets, live diagnostics) into a quiet, low-contrast top/bottom ribbon that stays out of the way while typing.
   - Add an optional **Sentence Focus Mode** (gently dims non-active paragraphs while writing) and subtle, calm inline underlines/highlights (never harsh neon) when clicking an edit item.
2. **Scannable 3-Section `EvaluationReportView.tsx`:**
   - Replace the long stacked wall of cards with a clean, tabbed/segmented editorial report:
     1. **Overview & Verdict:** Score pill, Spoken Readiness, 1-sentence **Target Audience Gut-Reaction**, and a prominent bordered **Next-Draft Priority** callout.
     2. **Pinpointed Fixes & Live Diff:** Unified, filterable fix list (*All · Grammar · Tone & Flow · Calques · Vocab*) paired with an interactive **Original vs. Improved** toggle where clicking any fix smoothly scrolls to and highlights the exact phrase in the draft.
     3. **Rubric & Benchmarks:** Compact 6-metric bar breakdown with `<= 14-word` notes and collapsible CEFR/IELTS detail.
3. **Modularize Monolithic Components:**
   - Extract reusable hooks/subcomponents where you touch `App.tsx` (3,398 LOC) and `WriteStudio.tsx` (4,132 LOC) so new Evaluation and Dashboard logic stays cleanly separated and easy to test.

---

## Phase 4: Production Hardening, Bug Fixes & Verification

Fix all verified backend, cloud-sync, and repo bugs identified in the audit:

1. **Cloud Sync & Firestore Rules (`src/utils/cloudSync.ts`, `firestore.rules`):**
   - Fix `docToSession` (`src/utils/cloudSync.ts`): convert Firestore `Timestamp` objects properly (`typeof raw.createdAt?.toDate === 'function' ? raw.createdAt.toDate().toISOString() : ...`) instead of overwriting `createdAt` with `new Date().toISOString()`.
   - Add `'converse'` to `VALID_MODES` in `src/utils/cloudSync.ts` so Converse sessions and slots are not coerced to `'technical'`.
   - Allow Draft updates to persist `content`, `wordCount`, and `topicDescription` in both `firestore.rules` (`sessions` update `affectedKeys`) and `syncSessionToCloud`.
   - In `ensureUserProfileDoc`, hydrate existing cloud `dailyWordGoal`, `autoSaveVocab`, `focusModeDefault`, `autoReloadSchedule`, and `semesterLabel` on fresh devices instead of overwriting them with local defaults.
2. **Backend Security, Auth, CORS & Validation (`server.ts`, `server/lib/authMiddleware.ts`, `server/lib/validation.ts`, `server/routes/*`, `src/utils/apiBase.ts`):**
   - Fix the `/api/health` bypass in `authMiddleware.ts` (`req.path === '/health'`, since middleware is mounted at `/api`).
   - Remove the unverified `parseJwtPayloadUnverified` fallback—fail closed (`500`/`401`) if `ALLOWED_OWNER_EMAILS` is configured without `FIREBASE_WEB_API_KEY`.
   - Configure Express `trust proxy` and use `req.ip` in `apiRateLimiter`, plus periodic pruning of expired `rateBuckets` entries.
   - Add CORS middleware in `server.ts` supporting `ALLOWED_ORIGINS` (plus localhost in dev) with proper `OPTIONS` preflight handling so GitHub Pages (`VITE_API_BASE_URL`) can call `/api/*`.
   - Add an `apiFetch` helper in `src/utils/apiBase.ts` that attaches `Authorization: Bearer <firebaseIdToken>` when signed in, and route all frontend `/api/*` calls through `apiFetch`.
   - Add Zod request validation schemas in `server/lib/validation.ts` for the remaining 7 `POST` routes (`/api/evaluate-conversation`, `/api/converse-opening`, `/api/topics`, `/api/schedule-triweekly`, `/api/pivot-topic`, `/api/suggest-first-month`, `/api/categorize-vocab`).
3. **Privacy, Scripts & Verification (`package.json`, tests):**
   - Add `"test": "tsx --test \"src/**/*.test.ts\" \"server/**/*.test.ts\""` in `package.json`, and add unit tests covering:
     - Slim evaluation schema mapping + deterministic benchmark derivation (`server/routes/evaluate.ts`)
     - `computeErrorPatternAnalytics` (`src/utils/analytics.ts`)
     - `authMiddleware` (`/health` bypass, forged JWT rejection)
     - `cloudSync` (`Timestamp` parsing, `'converse'` mode preservation)
   - Update `ENGINEERING_LOG.md` with the `v4.0` release summary.
   - Run `npm run lint`, `npm test`, and `npm run build:pages`—confirm all pass cleanly with zero errors.
