# Quillit v3.0 — Master Upgrade, Aesthetic Redesign & High-Impact Practice Prompt
> **Target Environment:** Google AI Studio Build (Long-Run Autonomous Full-Stack Engineering Mode)
> **Codebase Baseline:** Existing `Quillit` v2.7.0 repository (`server.ts`, `src/App.tsx`, `src/components/*`, `src/utils/*`, `firestore.rules`, `firebase-blueprint.json`, `ENGINEERING_LOG.md`)
> **Primary User:** 3rd-Year, 6th-Semester Electronics & Instrumentation Engineering (EIE) student practicing English fluency, technical interview clarity, professional emails/LinkedIn, and expressive storytelling in **4–5 focused 10-minute sessions per week**.

---

## 0. Strict Autonomous Execution Protocol for Google AI Studio (READ FIRST)

You are acting as a **Principal Full-Stack Engineer and Staff Design Engineer** upgrading the existing `Quillit` v2.7.0 repository to **v3.0.0**.

### Non-Negotiable Long-Run Directives
1. **Deep Discovery Before First Edit:** Before modifying a single line of code, inspect `ENGINEERING_LOG.md`, `src/types.ts`, `server.ts`, `src/utils/evaluationRouter.ts`, `src/utils/evaluationCalibration.ts`, `src/utils/conversationEngine.ts`, `src/utils/cloudSync.ts`, `firestore.rules`, `firebase-blueprint.json`, `src/styles/tokens.css`, `src/index.css`, and `src/components/WriteStudio.tsx`.
2. **Continuous End-to-End Execution (Do Not Stop Early):** Execute **Phase 1 through Phase 6** (Section 8) completely and systematically. Do **not** pause to ask permission between phases unless blocked by an unresolvable external secret/environment error. Do **not** leave placeholder stubs, `// TODO` comments, mocked responses for live API routes, or half-wired components.
3. **Preserve All Existing Governance Rules (`PSR-01` through `PSR-10`):** Read `ENGINEERING_LOG.md` carefully. Every existing Product Strategic Rule remains active and binding:
   - **`PSR-01`:** Evaluation Engine quality and scoring integrity always come first.
   - **`PSR-02`:** Single-Source-of-Truth atomic scoring (**zero score jump**; never flash a provisional local score and mutate it into an AI score seconds later).
   - **`PSR-03`:** Strict report hierarchy (1. Scorecard & Rubric Notes → 2. Pinpointed Grammar Flaws, Rewrites & Sentence Variations → 3. Vocabulary Upgrades at lowest weightage; zero thesaurus-slop).
   - **`PSR-05`:** Verbatim grounding & anti-inflation guardrails on every quote and fix.
   - **`PSR-06`:** Preserve Firestore forced long-polling (`experimentalForceLongPolling: true, useFetchStreams: false`) in `src/firebase.ts` so AI Studio iframe previews never hit the 10-second WebChannel timeout (`ERR-001`).
   - **`PSR-08`:** Persistent workspace continuity across all tab switches—never wipe active drafts, active drill rounds, running timers, or in-flight AI evaluations when switching tabs.
   - **`PSR-09`:** Keep `Converse` strictly for fast, realistic 1–3 sentence persona texting with end-of-chat evaluation grading only the learner's turns.
   - **`PSR-10`:** **DO NOT remove or downgrade the 5-generation Gemini cascade or lighter models** (see Section 2).
4. **Zero Regressions & Mandatory Verification Gate (`PSR-07`):** You may only declare the build complete after **all** of the following pass with zero errors:
   - `npx --yes tsx --test src/utils/*.test.ts` (all existing + new unit tests 100% green)
   - `npx --yes tsx --test firestore.rules.test.ts` (updated schema rules 100% green)
   - Full TypeScript + Vite build (`compile_applet` / `npm run build`) and ESLint (`lint_applet`)
   - Static Pages build (`npm run build:pages`)
   - Real-browser visual, interaction, and console audit (`playwright-cli`) verifying **zero console errors**, **zero React hydration/runtime errors**, both **Light & Dark themes**, desktop (`1440px`) + mobile (`390px`), live API responses, and every new drill flow end-to-end.
5. **Governance Logging:** Upon passing every gate, append a concise `v3.0.0` release entry to `ENGINEERING_LOG.md` documenting all new mechanics, UI upgrades, schema updates, and verification proof.

---

## 1. Realistic 10-Minute Weekly Practice Plan (4–5× / Week)

Design the entire experience around a calm, sustainable **10-minute session budget, 4 to 5 days per week**—eliminating overwhelm and ensuring every High-Impact Mechanic has a clear, logical home without clashing with the existing 52-week curriculum (`curriculum52Weeks.ts`):

| Day | Session Role | Time Budget | Active High-Impact Mechanic | Core Focus |
| :--- | :--- | :--- | :--- | :--- |
| **Monday** *(Core 1)* | Cadence & Imitation | **10 min** *(2m study · 5m reconstruct · 3m diff & review)* | **Benjamin Franklin Skeleton Reconstruction** | Absorb crisp phrasing, strong verbs, and natural sentence endings from a 4-sentence master model (EIE technical, LinkedIn, or story). |
| **Wednesday** *(Core 2 — Slot 1)* | Technical & Interview | **10 min** *(3m + 2m + 1m rounds · 4m evaluation)* | **4 / 3 / 2 Compression Sprint** *(toggleable with Standard Technical)* | Explain one EIE/hardware/interview concept 3 times under shrinking limits (`~160w → ~105w → ~55w`) to kill rambling and lock crisp interview articulation. |
| **Friday** *(Core 3 — Slot 2)* | Email, LinkedIn & Soft Skills | **10 min** *(7m draft · 3m evaluation)* | **"3 Rooms" Audience Ladder** OR **Single-Constraint Card** | Adapt one core point for two contrasting rooms (**Curious 10-Year-Old** vs. **Skeptical Senior Interviewer/Manager**) OR snap on one playful constraint card. |
| **Saturday** *(Optional 5th Flex)* | Live Spoken/Text Agility | **10 min** *(6m chat · 4m evaluation)* | **Converse Studio** *(existing `PSR-09`)* | Fast realistic persona texting (1–3 sentence human cadence) + end-of-chat evaluation & Vocab Mastery promotion. |
| **Sunday** *(Core 4 — Slot 3)* | Creative Storytelling | **10 min** *(3m flow sprint · 4m shape · 3m evaluation)* | **3-Min "No-Backspace" Flow Warmup** + Creative Draft | Shut off inner self-editing during a 3-minute momentum burst, then sculpt the raw prose and run full evaluation. |
| **Monthly Auto-Slot** *(Replaces 1 Day)* | Long-Term Proof of Growth | **10 min** *(replaces that day's slot—never adds an extra day)* | **"Retest Your Day-1 Self" Time Capsule** | Every 30 days (with an early-unlock preview available once ≥3 sessions exist so it can be tested immediately), resurfaces a past prompt **without** showing the old draft; reveals **Past You vs. Today You** side-by-side upon submit. |

*Rule:* Weekly goal defaults to **4 core sessions/week** (with Saturday Converse as an effortless 5th bonus). Missed days show a calm, zero-guilt `"Still open — 10 min"` card. Never show red overdue warnings or punishing streak-reset alerts.

---

## 2. API & Gemini Model Architecture — Strict Preservation (`PSR-10`)

**CRITICAL CONSTRAINT: Keep all existing API endpoints, dynamic routing logic, and lighter models intact. Do NOT remove `gemini-3.1-flash-lite` or `gemini-2.5-flash-lite`, and do NOT collapse the 5-generation cascade.**

### Exact 5-Generation Zero-Stall Cascade to Preserve
Maintain the exact non-deprecated cascade order and capability guards across `server.ts`, `src/utils/evaluationRouter.ts`, and `src/utils/conversationEngine.ts`:
1. `gemini-4-hydrogen` (`HIGH` / `MEDIUM` / `LOW` — **NEVER** pass `MINIMAL`)
2. `gemini-3-flash-preview`
3. `gemini-3.1-flash-lite` (`HIGH` / `MEDIUM` / `LOW` / `MINIMAL`)
4. `gemini-2.5-flash` (**NEVER** pass `thinkingConfig.thinkingLevel`)
5. `gemini-2.5-flash-lite` (**NEVER** pass `thinkingConfig.thinkingLevel`)

### Mandatory Routing & Quota Protection Rules
- **Deep Evaluation (`POST /api/evaluate`):** Continues routing via `evaluationRouter.ts` (`gemini-4-hydrogen` for substantive/technical/multi-round drafts; `gemini-3.1-flash-lite` for ultra-brief drafts, gibberish fast-reject, and zero-stall rate-limit failover), cascading cleanly across all 5 generations with `Promise.race` timeouts (`42s` Hydrogen / `22s` Flash Lite / `20s` fallback), `failedModelsThisRequest` skip sets, and 30-minute self-healing `404` skips.
- **Fast Utility & New Mechanic Routes:** Keep `POST /api/realtime-assist`, `POST /api/topics`, `POST /api/pivot`, `POST /api/categorize-vocab`, `POST /api/converse`, AND add **one** lightweight route:
  - **`POST /api/skeleton-passage`** — Generates a concise 4-sentence master passage (calibrated to the user's EIE profile or chosen mode) + 4-word skeleton clues per sentence + key rhetorical moves, routed **Flash Lite / 2.5 Flash Lite first** (`gemini-3.1-flash-lite` → `gemini-2.5-flash-lite` → `gemini-2.5-flash` → `gemini-3-flash-preview` → `gemini-4-hydrogen`) with a strict `15s` per-step `Promise.race` timeout and a curated offline static fallback bank of 12 high-craft passages so it never fails even offline.
- **Evaluating New Drill Modes (Reuse `POST /api/evaluate` — Zero Endpoint Bloat):** Extend the existing `POST /api/evaluate` request schema cleanly with optional structured `drillContext`:
  - `drillType?: 'standard' | 'compression-432' | 'skeleton' | 'three-rooms' | 'time-capsule'`
  - `drillPayload?: { rounds?: string[]; masterPassage?: string; roomA?: string; roomB?: string; constraintLabel?: string; constraintPassed?: boolean; pastDraft?: string; pastScore?: number; noBackspaceUsed?: boolean }`
  - `server.ts` injects concise drill-specific grading criteria into the existing strict H2 Coach prompt (e.g., for `compression-432`, evaluate how cleanly Round 3 kept the core engineering logic while shedding filler; for `three-rooms`, evaluate register contrast between the 10-year-old analogy and senior-interviewer trade-off; for `skeleton`, compare verb precision and sentence-ending punch against the master model; for `time-capsule`, highlight concrete growth vs. `pastDraft` without inflating scores).
  - Return the exact same authoritative `EvaluationReport` schema (preserving `PSR-02`, `PSR-03`, `PSR-05`), plus an optional compact `drillVerdict` summary block (`headline`, `comparisonNote`, `constraintStatus`).

---

## 3. Detailed Specification of Every New High-Impact Mechanic (Clash-Free Logic)

Build pure, unit-tested logic modules in `src/utils/` for each mechanic so UI components stay clean and testable:

### 3.1 "4 / 3 / 2" Compression Sprint (`src/utils/compressionSprint.ts`)
- **Structure:** 3 sequential timed rounds explaining the **exact same core idea** under tightening constraints:
  - **Round 1 (Explore):** `3:00` timer · Target `140–170` words.
  - **Round 2 (Tighten):** `2:00` timer · Target `90–115` words (Round 1 text collapses into a quiet read-only toggleable reference drawer—hidden by default so you recall and rephrase freshly, not copy-paste).
  - **Round 3 (Razor Cut):** `1:00` timer · Target `45–65` words.
- **UX Details:** Subtle 3-step segmented pill (`R1 3:00` → `R2 2:00` → `R3 1:00`) at the top of the canvas. Pressing `Next Round` (or timer hitting `0:00`, which gently pulses without locking you out mid-word) snapshots the round and advances smoothly.
- **Evaluation:** Submitting after Round 3 sends Round 3 as the primary graded text + Rounds 1 & 2 in `drillPayload.rounds`, rendering a **Compression Ratio Metric** (e.g., `164w → 102w → 54w · 67% tighter`) inside `EvaluationReportView`.

### 3.2 Benjamin Franklin "Skeleton Reconstruction" (`src/utils/skeletonDrill.ts`)
- **Flow (3 Clean Phases):**
  1. **Study (`2:00` optional timer):** Display a crisp 4-sentence master passage (tailored to EIE technical clarity, LinkedIn storytelling, or creative fiction). User reads for rhythm, verb choice, and cadence, then clicks **`Hide & Reconstruct`**.
  2. **Reconstruct (`5:00`):** The master passage folds away with a smooth curtain transition; a slim pinned **Skeleton Rail** displays only the 4-word clues for each sentence (e.g., `1. loop oscillates → gain high → damp derivative`). User reconstructs the idea in their own natural English.
  3. **Compare & Evaluate:** Submitting reveals a clean **Side-by-Side Diff Card** (`Your Reconstruction` vs. `Master Passage`) highlighting verb strength and sentence cadence alongside the single-pass AI Coach Report.

### 3.3 "3 Rooms" Audience Ladder (`src/utils/audienceLadder.ts`)
- **Flow:** One shared prompt at the top; two clean tabbed/stacked mini-canvases below (side-by-side on desktop `≥1024px`, segmented toggle on mobile):
  - **Room A — Curious 10-Year-Old (`50–90 words`):** Pure everyday analogy, zero unexplained jargon. Live deterministic check flags unexplained technical jargon density gently.
  - **Room B — Skeptical Senior Interviewer (`70–120 words`):** Crisp claim, mechanism, and concrete trade-off.
- **Evaluation:** Both rooms submit together in a single `POST /api/evaluate` pass; the report scores overall mastery plus a **Register Shift Score** confirming whether the writer genuinely adapted voice instead of copying the same paragraph twice.

### 3.4 Single-Constraint Micro-Challenges (`src/utils/constraintChallenges.ts`)
- **Curated Library (18 Constraints across 4 categories):**
  - *Anti-Filler:* `"Zero 'very', 'really', 'actually', or 'basically'"`
  - *Rhythm:* `"Open with a crisp sentence of 6 words or fewer"` / `"Include at least one 3–5 word punch sentence"`
  - *Precision:* `"Zero vague nouns ('thing', 'stuff', 'something')"` / `"End every paragraph on a strong concrete noun"`
  - *Clarity:* `"Keep every sentence under 24 words"` / `"State your main ask or claim in the first 2 sentences"`
- **Deterministic Real-Time Checker:** Runs locally (zero API calls, debounced `300ms`) and displays a subtle **1-line Constraint Pill** (`Constraint: 0/0 violations ✓` or `2 filler words found`). Passing/violating never causes a score jump (`PSR-02`); it passes `constraintLabel` + `constraintPassed` cleanly into the evaluation context.

### 3.5 "No-Backspace" 3-Minute Flow Sprint (`src/utils/noBackspaceGuard.ts`)
- **Activation:** One quiet toggle pill in the editor utility strip (`Flow Sprint · 3m`), available in any Free Write, Journal, or Creative Sunday slot.
- **Cross-Platform Ironclad Interception (Desktop + Mobile IME Safe):**
  - While the countdown is active, intercept **both**:
    1. `onKeyDown`: block `Backspace`, `Delete`, `Ctrl/Cmd+X`, `Ctrl/Cmd+Z` with `e.preventDefault()`.
    2. `onBeforeInput`: block `deleteContentBackward`, `deleteContentForward`, `deleteByCut`, `historyUndo` (essential for Android/iOS mobile keyboards where `keydown` fires `Unidentified`).
  - Give a subtle, tactile **120ms micro-shake** on the Flow Sprint pill + whisper tooltip (`"Keep moving — editing unlocks in 1:42"`) whenever Backspace is pressed—never an annoying popup!
  - Include an explicit **`End Early & Unlock Editing`** link inside the pill popover so the user is never trapped.
  - When `3:00` finishes, play a whisper-soft visual ink-ripple transition and immediately unlock full editing so the user can sculpt their raw draft for 4 minutes before clicking `Evaluate`.

### 3.6 "Retest Your Day-1 Self" Time Capsule (`src/utils/timeCapsule.ts`)
- **Trigger Logic:** Scans `sessions` for completed sessions older than `30 days` (plus an optional `"Preview Time Capsule (7+ days / ≥3 sessions)"` button in Dashboard/Write Desk so the user can experience it in week 1).
- **Blind Retest Rule:** Loads the original `topicDescription`, `mode`, and `tone` into `WriteStudio` with a subtle **Time Capsule Seal** badge (`"Blind Retest · Original draft sealed until submit"`). The original draft is strictly hidden while writing.
- **Reveal:** The instant `Evaluate` finishes, `EvaluationReportView` displays a dedicated **Time Capsule Comparison Drawer**: `Past Draft (Date · Score)` side-by-side with `Today's Draft (Score · +Δ)` plus the coach's concrete breakdown of what matured. Saves as a **new session document** referencing `timeCapsuleParentId` (preserving Firestore immutability rules!).

---

## 4. Exact UI Placement Map (Zero Clutter, Zero Clashes)

Every new capability has **one clear, calm home**. Do not scatter buttons across multiple screens or add extra top-level navigation tabs:

| UI Surface | Exact Placement & Visual Hierarchy | Strict Declutter Rule |
| :--- | :--- | :--- |
| **Top Navigation (`Header.tsx`)** | Slim `56px` bar: Left = crisp vector `QuillitLogo` + wordmark. Center = clean segmented pill (`Write`, `Converse`, `Dashboard`, `Calendar`, `Vocabulary`). Right = quiet Theme toggle (`Light/Dark/System`), compact **10-Min Weekly Rhythm Indicator** (`3/4 this week`), and `Settings` icon button. Keep `PSR-08` subtle pulsing/ready dot on `Write` & `Converse` when background AI work is active. | Max 5 center nav pills. Settings moves to a clean right-hand icon button + slide-over/view so the header stays airy. |
| **Write Studio Entry (`WriteStudio.tsx` Top Desk Strip)** | **11 PM Tired Test:** Opening `Write` puts the writing canvas immediately in view—zero blocking modals. Above the `66ch` canvas sits a collapsible **Session Ribbon** with: (1) Today's 10-Min Scheduled Prompt chip (or `Time Capsule Ready` pill when due), (2) a clean **Practice Mechanic Selector** (`Free / Standard` · `4/3/2 Sprint` · `Skeleton` · `3 Rooms`), and (3) a 1-tap **`+ Constraint`** pill chip. | Never show all 4 mechanic panels at once. Only the currently selected mechanic renders its slim contextual bar. |
| **Zen Canvas Controls (`WriteStudio.tsx` Footer Whisper Bar)** | Left: live word count + subtle `InkDropGoalWell` hairline bar (`2px` accent fill along the bottom edge) + active Constraint live status pill. Right: **`Flow Sprint (No-Backspace)`** toggle pill, **`Focus Mode (Esc)`** toggle, **`Quick Vocab`** icon, and solid primary **`Evaluate`** button. | After `2s` of continuous typing, header and ribbon smoothly fade to `opacity: 0.18` (returning instantly on pointer move or `Esc`). |
| **Evaluation Inspector (`EvaluationReportView.tsx`)** | Asymmetric **Desktop Split-Pane (`58%` Left Report / `42%` Right Interactive Draft Margin)** on `≥1080px` (clean tabbed toggle on smaller screens). Top strip: Drill Verdict banner (if 4/3/2, Skeleton, 3 Rooms, or Time Capsule), followed strictly by `PSR-03` order: (1) Scorecard & Rubric Table + Before/After Ink Diff toggle, (2) Pinpointed Fixes (hovering/clicking a fix smoothly highlights & scrolls to the exact verbatim quote in the draft pane), (3) Vocabulary Upgrades (lowest weightage). | Keep `Summary / Detailed` toggle and `Copy Markdown` button cleanly tucked in the report header. |
| **Calendar (`CalendarView.tsx`)** | Upgrade the schedule grid to display the **4–5×/Week 10-Min Rhythm** badges (`Mon · Skeleton`, `Wed · 4/3/2 Tech`, `Fri · 3 Rooms / Constraint`, `Sat · Converse Flex`, `Sun · Story + Flow`). Clicking any slot launches directly into `WriteStudio` or `ConverseStudio` with that mechanic pre-armed. | Preserve `WelcomeTopicFlashcard` (`ERR-004` fix) and auto-month rollover (`shouldAutoRollMonthSchedule`). |
| **Dashboard (`DashboardView.tsx`)** | Clean Editorial Bento Grid (`max-width: 1120px`, `20px` gap, `1px` hairline cards): Hero Score Trend + Weekly 10-Min Cadence Ring (4/5 dots), Six-Metric Breakdown bars, Fluency Heatmap, and a compact **Time Capsule / Growth Delta Card** showing your latest Blind Retest lift. | Remove loud gradients and stacked redundant stat boxes. |

---

## 5. Aesthetic Redesign, Dual Theme & Tactile Hover Choreography

### 5.1 Visual Philosophy ("Cotton Rag Paper & Nocturne Obsidian")
Maintain Quillit's refined typographic identity (**`Fraunces`** optical serif for editorial headings & creative prose, **`Plus Jakarta Sans`** for crisp UI and technical writing, **`JetBrains Mono`** with `tabular-nums` for scores, timers, and word counts), and purge ad-hoc overrides in `src/index.css` into strict semantic tokens in `src/styles/tokens.css`.

### 5.2 Exact Design Tokens (`src/styles/tokens.css`)
```css
:root,
[data-theme="light"] {
  color-scheme: light;
  --bg-canvas: #FAF8F4;           /* Warm Cotton Rag Paper — never sterile #FFFFFF */
  --bg-surface: #FFFFFF;          /* Elevated cards, writing sheet, drawers */
  --bg-subtle: #F2EFE9;           /* Hover washes, segmented pill tracks, soft badges */
  --bg-elevated: #FFFFFF;         /* Popovers, floating tooltips */

  --ink-primary: #171614;         /* Warm Carbon Ink */
  --ink-secondary: #59564F;       /* Labels, captions, rubric notes */
  --ink-muted: #8B877E;           /* Timestamps, hints, placeholders */
  --ink-inverse: #FAF8F4;         /* Text on primary solid buttons */

  --border-subtle: rgba(23, 22, 20, 0.08);
  --border-default: rgba(23, 22, 20, 0.14);
  --border-strong: rgba(23, 22, 20, 0.26);

  --accent-primary: #1F4E46;      /* Deep Forest Ink (calm, literary, technical) */
  --accent-hover: #183E37;
  --accent-soft: rgba(31, 78, 70, 0.09);
  --focus-ring: rgba(31, 78, 70, 0.28);

  --status-success: #246A49;
  --status-warn: #A3651B;         /* Muted Ochre */
  --status-error: #B44537;        /* Muted Terracotta */

  --shadow-sm: 0 1px 2px rgba(23, 22, 20, 0.04), 0 1px 1px rgba(23, 22, 20, 0.02);
  --shadow-md: 0 8px 24px -6px rgba(23, 22, 20, 0.09), 0 2px 6px -2px rgba(23, 22, 20, 0.04);
  --shadow-lg: 0 20px 44px -12px rgba(23, 22, 20, 0.14), 0 4px 12px -2px rgba(23, 22, 20, 0.05);
}

[data-theme="dark"] {
  color-scheme: dark;
  --bg-canvas: #0E0E0D;           /* Nocturne Obsidian */
  --bg-surface: #161614;          /* Stepped dark desk surface */
  --bg-subtle: #1F1F1C;           /* Hover washes & pill tracks */
  --bg-elevated: #252521;         /* Floating layers */

  --ink-primary: #F1EFEA;         /* Warm Ivory Ink */
  --ink-secondary: #A3A097;
  --ink-muted: #6E6B64;
  --ink-inverse: #10100F;

  --border-subtle: rgba(255, 255, 255, 0.07);
  --border-default: rgba(255, 255, 255, 0.13);
  --border-strong: rgba(255, 255, 255, 0.25);

  --accent-primary: #6FB3A4;      /* Muted Sage Ink */
  --accent-hover: #83C2B4;
  --accent-soft: rgba(111, 179, 164, 0.13);
  --focus-ring: rgba(111, 179, 164, 0.34);

  --status-success: #56B385;
  --status-warn: #DDA75D;
  --status-error: #DF7A6D;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  --shadow-md: 0 10px 28px -6px rgba(0, 0, 0, 0.58), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  --shadow-lg: 0 24px 56px -12px rgba(0, 0, 0, 0.74), inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
```

### 5.3 Fix Existing Theme Boot Bug (`index.html`)
- Fix the broken FOUC script in `index.html` where `(prefersDark ? 'dark' : 'dark')` forced dark mode even on light OS preferences.
- Support `quillit_theme` (`'light' | 'dark' | 'system'`) with transparent fallback read of legacy `cadence_theme`.

### 5.4 Animation & Hover Choreography (Hardware-Precision Restraint)
```css
:root {
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-snappy: cubic-bezier(0.2, 0, 0, 1);
  --dur-instant: 100ms;
  --dur-fast: 165ms;
  --dur-normal: 240ms;
}
```
Apply consistently across every interactive component:
1. **Primary Buttons:** Subtle brightness shift + `translateY(-1px)` + `--shadow-sm` on hover; tactile press `transform: translateY(0) scale(0.985)` over `100ms` on `:active`.
2. **Secondary / Pill / Mechanic Chips:** Border sharpens from `--border-default` to `--border-strong`, soft fill shifts to `--bg-subtle` over `165ms`; active selected chip uses `--accent-soft` fill + `1px solid var(--accent-primary)` border (zero loud neon fills).
3. **Interactive Cards (Calendar Slots, Session Rows, Vocab Cards):** `1px solid --border-subtle` at rest; on hover, border brightens to `--border-strong`, clickable cards lift `translateY(-1.5px)` with `--shadow-md`, and any trailing chevron nudges `translateX(3px)`. Static display cards **never** lift.
4. **Navigation Pills:** Smooth `--bg-subtle` pill wash on hover; active pill displays `--ink-primary` medium weight with crisp `2px` underline/dot accent—zero layout shift (`font-weight` width jitter forbidden).
5. **Drill & Report Micro-Animations:**
   - **Skeleton Curtain Reveal:** Smooth `opacity + translateY(6px)` (`240ms --ease-out-expo`) when folding away the master passage and sliding in the 4-word Skeleton Rail.
   - **No-Backspace Micro-Shake:** Crisp `120ms` horizontal `3px` shake keyframe on the Flow Sprint pill when Backspace is intercepted.
   - **Linked Quote Highlight:** Hovering a pinpointed fix in `EvaluationReportView` smoothly transitions a warm `--accent-soft` ink highlight onto the exact matching sentence in the draft pane.
   - **Atomic Evaluation Breathing Card:** Calm single-line rotating editorial progress cues (*"Analyzing cadence & clarity…" → "Verifying verbatim quotes…" → "Calibrating strict rubric…"*) with a subtle ink-nib pulse during `/api/evaluate`.
6. **Device & Accessibility Guards (Mandatory):**
   - Wrap all hover lifts/washes in `@media (hover: hover) and (pointer: fine)` so touch devices never suffer sticky hover states.
   - Respect `@media (prefers-reduced-motion: reduce)` by disabling transforms/shakes and falling back to short `100ms` opacity fades.
   - Every interactive control must show a high-contrast `:focus-visible` ring (`0 0 0 2px var(--bg-canvas), 0 0 0 4px var(--focus-ring)`).

### 5.5 Anti-"AI Slop" Banned List (Zero Tolerance)
Audit every screen before finishing:
- ❌ No purple/indigo/blue-violet gradients, neon glows, or floating sparkle animations.
- ❌ No heavy blurred glassmorphism stacked over busy backgrounds.
- ❌ No gamified clutter (streak fire emojis, confetti bursts, XP bars, red guilt banners).
- ❌ No oversized drop shadows, thick `4px` colored side borders on cards, or card zoom (`scale(1.05)`).
- ❌ No color-only status cues (always pair icon, pattern, or crisp text label).

---

## 6. Clash & Bug Prevention Checklist (Mandatory Fixes)

Prevent every known schema, runtime, and mobile edge case while implementing v3.0:

1. **Firestore Rules & Blueprint Lockstep (`firestore.rules` + `firebase-blueprint.json` + `cloudSync.ts` + `firestore.rules.test.ts`):**
   - Add optional validated fields to `isValidWritingSession` (`hasOnly`):
     - `drillType` (`'standard' | 'compression-432' | 'skeleton' | 'three-rooms' | 'time-capsule'`)
     - `drillMeta` (bounded `map` storing compression word counts, constraint label/passed flag, `noBackspaceUsed`, `timeCapsuleParentId`, or room labels)
     - `drillVerdict` (bounded `map` ≤ 1500 chars summary)
   - Add optional validated mastery fields to `isValidVocabEntry` (`hasOnly`): `category` (`string ≤ 60`), `usageCount` (`number 0..500`), `masteryStage` (`'new' | 'emerging' | 'building' | 'mastered'`).
   - Add `'converse'` to `isValidMode(m)` so Converse sessions sync cleanly without workarounds.
   - Keep `isValidWritingSession` immutability intact for completed sessions; Time Capsule retests always save as a **brand-new session doc** linking `drillMeta.timeCapsuleParentId`.
   - Update `cloudSync.ts` payload sanitizer so zero disallowed keys ever reach Firestore.
2. **Timer & Tab-Switch Continuity (`PSR-08`):**
   - Persist active drill state (`drillType`, 4/3/2 round snapshots, Skeleton clues, 3 Rooms texts, active Constraint, No-Backspace remaining seconds) cleanly while switching tabs. Pause active countdown timers automatically when the tab hides or window loses focus (`visibilitychange`), showing a calm `Paused` pill when returning so the user never loses time accidentally.
3. **No-Backspace Mobile & IME Safety:**
   - Guard both `keydown` and `beforeinput` (`deleteContentBackward`, `deleteContentForward`, `deleteByCut`, `historyUndo`) so mobile Android/iOS keyboards cannot bypass or corrupt cursor position.
4. **Clean `public/` Hygiene:**
   - Do not expose new internal prompt docs under `public/`. Keep bundle lean and `npm run build:pages` 100% functional even when backend APIs are offline (all 5 high-impact mechanics gracefully support offline local drafting + static fallback skeleton passages).
5. **Zero Hardcoded Hex in Components:**
   - All updated and newly created components must reference semantic CSS variables / Tailwind token classes strictly—zero raw `#hex` colors inside `.tsx` files.

---

## 7. Phased Implementation Plan (Execute Continuously M1 → M6)

Execute every phase cleanly in order without skipping tests or stopping early:

- **Phase 1 — Theme Engine, Tokens, Hover Physics & Boot Fix:**
  - Fix `index.html` light/dark/system boot script (`quillit_theme` + `cadence_theme` migration).
  - Refactor `src/styles/tokens.css` with exact Cotton Rag Paper & Nocturne Obsidian variables + motion/hover utility classes (`@media (hover: hover)`, `prefers-reduced-motion`).
  - Prune conflicting overrides in `src/index.css`; polish `Header.tsx` (slim 56px bar, 10-min weekly cadence pill, clean right-side Settings & Theme controls).
- **Phase 2 — Pure Mechanic Engines + Comprehensive Unit Tests:**
  - Create and unit-test:
    - `src/utils/compressionSprint.ts` + `.test.ts` (round transitions, targets, compression ratio math)
    - `src/utils/skeletonDrill.ts` + `.test.ts` (12-passage curated EIE/LinkedIn/Story offline bank + clue parser + word-overlap/verb-strength diff helper)
    - `src/utils/audienceLadder.ts` + `.test.ts` (two-room validation + jargon-density check for Room A)
    - `src/utils/constraintChallenges.ts` + `.test.ts` (18 constraints + deterministic live violation detectors)
    - `src/utils/noBackspaceGuard.ts` + `.test.ts` (blocked key & `beforeinput` event classifier)
    - `src/utils/timeCapsule.ts` + `.test.ts` (30-day eligibility + early-unlock preview selector + delta calculator)
- **Phase 3 — Backend API & Schema Synchronization (Preserving `PSR-10`):**
  - Extend `src/types.ts`, `firebase-blueprint.json`, `firestore.rules`, `src/utils/cloudSync.ts`, and `firestore.rules.test.ts` with all new drill/vocab/converse fields.
  - Add `POST /api/skeleton-passage` in `server.ts` using the existing **Flash Lite-first 5-generation cascade** + `15s` `Promise.race` timeout.
  - Extend `POST /api/evaluate` in `server.ts` (preserving the exact `gemini-4-hydrogen` → `gemini-3-flash-preview` → `gemini-3.1-flash-lite` → `gemini-2.5-flash` → `gemini-2.5-flash-lite` cascade and `evaluationCalibration.ts` guardrails) to accept optional `drillContext` and return `drillVerdict` alongside the strict `PSR-03` report.
- **Phase 4 — WriteStudio Zen Upgrade & All 6 Interactive Mechanics:**
  - Upgrade `WriteStudio.tsx` with the collapsible Session Ribbon, Practice Mechanic Selector (`Standard` · `4/3/2 Sprint` · `Skeleton` · `3 Rooms`), `+ Constraint` chip with live deterministic pill, `Flow Sprint (No-Backspace)` 3-min toggle with micro-shake feedback, 2-second fade-on-type vanishing desk, and Blind Time Capsule seal.
  - Ensure 100% `PSR-08` tab-switch persistence for every drill state.
- **Phase 5 — Split-Pane Evaluation Inspector, 10-Min Calendar & Pulse Polish:**
  - Upgrade `EvaluationReportView.tsx` with desktop Split-Pane layout (Report + Interactive Draft with linked hover-to-highlight verbatim quotes), Drill Verdict banner (Compression Ratio / Skeleton Side-by-Side / 3 Rooms Register Shift / Time Capsule Past-vs-Today Delta), and Before/After Ink Diff toggle.
  - Upgrade `CalendarView.tsx` & `curriculumEngine.ts` to schedule the logical **4–5×/week × 10-minute** rhythm (`Mon Skeleton`, `Wed 4/3/2 Tech`, `Fri 3 Rooms/Constraint`, `Sat Converse Flex`, `Sun Story + Flow`) while keeping 52-week non-repeating topics intact.
  - Polish `DashboardView.tsx`, `ConverseStudio.tsx`, and `VocabularyView.tsx` to match the unified Cotton Rag / Nocturne Obsidian token system and hover matrix.
- **Phase 6 — Full Automated Verification, Browser Audit & Governance Log:**
  - Run `npx --yes tsx --test src/utils/*.test.ts` and `npx --yes tsx --test firestore.rules.test.ts` — fix any failure until 100% pass.
  - Run `compile_applet`, `lint_applet`, and `npm run build:pages` — fix any TypeScript, ESLint, or bundle error.
  - Run real-browser verification (`playwright-cli`) testing:
    1. Light mode & Dark mode theme switching + reload persistence (zero FOUC, zero forced dark bug).
    2. `4/3/2 Compression Sprint` across all 3 rounds + single-pass `/api/evaluate`.
    3. `Skeleton Reconstruction` curtain hide → reconstruct → side-by-side compare.
    4. `3 Rooms` dual-room drafting + `Single-Constraint` live violation count.
    5. `No-Backspace` Flow Sprint blocking Backspace with micro-shake + clean unlock.
    6. Cross-tab persistence (`Write` → `Dashboard` → `Converse` → `Write`) preserving active draft & drill state.
    7. Mobile viewport (`390×844`) layout check & zero console errors.
  - Update `ENGINEERING_LOG.md` with the verified `v3.0.0` release entry and provide a concise final report summarizing changed files, test counts, and verification results.