# Quillit Engineering & Product Governance Log

> Living record of product strategy rules, release versions, architecture upgrades, and root-cause error post-mortems. Maintained continuously to enforce production discipline across every iteration.

---

## 1. Product Strategic Rules (Operating Constitution)

These non-negotiable engineering and product governance standards guide all Quillit architecture and release decisions:

1. **PSR-01 — Evaluation Engine First**: The Evaluation & Coaching Engine (`/api/evaluate`, `evaluationRouter.ts`, `evaluationCalibration.ts`, `EvaluationReportView.tsx`) is the core value engine of Quillit. Every release prioritizes scoring integrity, strict human-editor critique depth, latency efficiency, and zero-hallucination grounding over peripheral UI features.
2. **PSR-02 — Single-Source-of-Truth Scoring (Zero Score Jump)**: Users must never see a provisional local score flash and then mutate into a different AI score seconds later. Live evaluations run as an atomic single pass with an editorial progress state, revealing one authoritative scorecard and logging one clean session record. Offline local evaluation runs strictly as a transparent fallback when the API server is genuinely unreachable.
3. **PSR-03 — Report Hierarchy & Vocabulary Weightage Discipline**: Every evaluation report surfaces insights in strict learning priority order:
   1. **Scorecard & Rubric Notes** (highest weightage: clarity, spoken flow, grammar accuracy, cadence, conciseness)
   2. **Pinpointed Grammar Flaws, Error Corrections & Sentence Variations** (exact verbatim quotes -> natural spoken rewrites -> explicit grammar/cadence rules)
   3. **Alternative Vocabulary & Phrasing Upgrades** (lowest weightage: optional polish; plain, natural spoken English is never penalized for avoiding fancy words, and thesaurus-slop buzzwords are programmatically banned).
4. **PSR-04 — Dynamic Model & Thinking Tier Routing**: Model and reasoning budgets scale dynamically per request based on word count, topic/domain rigor, structural complexity, and live rate-limit cooldowns:
   - `gemini-4-hydrogen` (`HIGH` / `MEDIUM` / `LOW`) for deep/substantive/concise drafts
   - `gemini-3.1-flash-lite` (`HIGH` / `MEDIUM` / `LOW`) for ultra-brief entries, gibberish fast-rejection, and zero-stall rate-limit failover
   - Never cap `maxOutputTokens` artificially low on thinking models; never pass deprecated models or invalid thinking levels (`MINIMAL` is never sent to `gemini-4-hydrogen`).
5. **PSR-05 — Verbatim Grounding & Anti-Inflation Guardrails**: Every inline grammar fix, sentence-level pinpointed rewrite, and vocabulary upgrade is verified against the writer's actual draft before reaching the UI. Gibberish, keystroke spam, and ultra-short stubs are structurally capped so scores remain trustworthy.
6. **PSR-06 — Transport & Cloud Sync Resilience**: Firestore runs over forced HTTP long-polling (`experimentalForceLongPolling: true, useFetchStreams: false`) to prevent 10-second WebChannel hangs in sandboxed iframes and strict proxies. All cloud payloads are strictly schema-sanitized against `firestore.rules`.
7. **PSR-07 — Verification Gate Before Release**: No release is complete without:
   - 100% passing unit tests (`npx --yes tsx --test src/utils/*.test.ts`)
   - Clean TypeScript/Vite build + ESLint (`compile_applet` + `lint_applet`) + static Pages build (`npm run build:pages`)
   - Real-browser visual & console verification (`playwright-cli`) confirming zero runtime console errors.

---

## 2. Release & Upgrade Ledger

| Version | Date | Area | Summary of Upgrade |
| :--- | :--- | :--- | :--- |
| **v2.5.0** | 2026-11-22 | Core Evaluation Engine, Routing & Firestore Transport | Replaced two-pass score-jumping flow with single-pass atomic evaluation + `EvaluationLoadingCard`. Added dynamic word/topic model router (`evaluationRouter.ts`: Hydrogen High/Med/Low & Flash Lite High/Med/Low) with transient retry + cascade. Added structured Gemini H2 Detailed Coach Report (`Scorecard Table`, `1. Feedback Check`, `2. What Changed for the Better`, `3. Strict Improvements & Pinpointed Fixes`, `4. Vocabulary Upgrades` with lowest weightage) + Markdown copy + Summary/Detailed toggle in both Write Studio and Dashboard Session Inspection. Fixed Firestore 10s WebChannel timeout via forced long-polling. |
| **v2.4.0** | 2026-11-22 | Evaluation Calibration | Introduced `evaluationCalibration.ts` (draft integrity checks, gibberish/stub anti-inflation caps, verbatim grounding filters, thesaurus-slop banlist, CEFR/IELTS/TOEFL alignment) and upgraded `/api/evaluate` to `gemini-4-hydrogen`. |
| **v2.3.0** | 2026-11-22 | Brand, Onboarding & Curriculum | Removed raster AI-slop logo; shipped minimal vector nib SVG (`QuillitLogo.tsx`, `public/quillit-mark.svg`). Fixed onboarding `rebuildSchedule` default so new users receive the Welcome Topic Flashcard. Wired automatic month roll-on via `shouldAutoRollMonthSchedule`. |
| **v2.2.0** | 2026-11-22 | Curriculum, Vocabulary & Quick Add | Added 52-week non-repeating curriculum bank (`curriculum52Weeks.ts` + `curriculumEngine.ts`), A–Z AI-categorized Vocabulary Bank, Write Studio Quick Add Vocabulary modal, and non-past-date monthly scheduling. |
| **v2.1.0** | 2026-11-22 | GitHub Pages & Cloud Sync | Fixed relative Vite base path and static GitHub Pages build (`npm run build:pages`), decoupled Firebase optional config resolution (`firebaseConfig.ts`), and added Offline-to-Cloud migration flow. |

---

## 3. Root-Cause Error Registry (Post-Mortems)

| ID | Severity | Symptom / Error | Root Cause | Resolution | Verification | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ERR-001** | High | `@firebase/firestore: Could not reach Cloud Firestore backend. Backend didn't respond within 10 seconds` + `Please check your Firebase configuration.` | `getFirestore(app, dbId)` defaulted to HTTP/2 WebChannel streaming (`useFetchStreams: true`), which silently stalled inside proxied/iframe previews even though Firestore REST HTTPS responded immediately (verified via `curl` HTTP 404 on `/test/connection`). | Switched `src/firebase.ts` to `initializeFirestore(app, { experimentalForceLongPolling: true, useFetchStreams: false }, dbId)` with safe `getFirestore` fallback. | 13s Playwright dwell test with zero `@firebase/firestore` timeout or config errors. | **Resolved (v2.5.0)** |
| **ERR-002** | High | Evaluation score appeared immediately and then jumped/changed 3–5 seconds later after AI finished refining. | `WriteStudio.tsx` ran `buildInstantLocalEvaluation()` synchronously, rendered and logged that provisional score, and then overwrote it when `/api/evaluate` resolved. | Removed dual-score flash in `WriteStudio.tsx`; replaced with `EvaluationLoadingCard` during `/api/evaluate` and atomic single-pass render + persist. Local rubric now activates strictly on offline/static fallback. | Playwright Write Studio journey confirms smooth single-pass reveal with zero score mutation. | **Resolved (v2.5.0)** |
| **ERR-003** | High | Evaluation engine graded superficially ("dumb master"), handed out inflated scores to short/gibberish input, and suggested thesaurus-slop buzzwords. | Over-compressed system prompt, `gemini-3.1-flash-lite` + `MINIMAL` thinking on evaluation, no gibberish/grounding calibration layer. | Upgraded to dynamic `gemini-4-hydrogen` (High/Med/Low) & `gemini-3.1-flash-lite` (High/Med/Low) routing, full-depth Gemini H2 editorial rubric, verbatim grounding, and `evaluationCalibration.ts`. | Unit tests (`evaluationCalibration.test.ts`, `evaluationRouter.test.ts`) + live `/api/evaluate` curl audit. | **Resolved (v2.4.0–v2.5.0)** |
| **ERR-004** | Medium | New-user Welcome Topic Flashcard did not trigger after onboarding. | `OnboardingProfileModal.tsx` defaulted `rebuildSchedule` to `true`, immediately populating calendar slots and suppressing the empty-calendar welcome flashcard condition. | Changed `rebuildSchedule` default to `false` on initial onboarding so brand-new local and cloud users see the welcome flashcard cleanly. | Unit test in `curriculumEngine.test.ts` + browser check. | **Resolved (v2.3.0)** |
| **ERR-005** | Medium | Low-taste AI-generated raster logo (`quillit-logo.jpg`) conflicted with clean editorial aesthetic. | Generated raster JPEG had visual artifacts and mismatched theme surfaces. | Deleted raster `.jpg` assets and replaced with crisp vector SVG nib mark (`QuillitLogo.tsx` + `public/quillit-mark.svg`). | Build + visual check. | **Resolved (v2.3.0)** |
| **ERR-006** | Medium | GitHub Pages build failed or showed blank page when `firebase-applet-config.json` or backend API was absent. | Hardcoded root asset paths and unguarded JSON responses on static hosts. | Added `build:pages` relative base path, `import.meta.glob` optional Firebase config loader, and `safeParseJsonResponse` guard. | `npm run build:pages` verified clean. | **Resolved (v2.1.0)** |
