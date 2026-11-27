# Quillit v4.1 — Master Google AI Studio Build Prompt (Editorial Session Brief Core & Closed-Loop Target Mastery)

> **How to use:** Paste this prompt into **Google AI Studio Build** right after your `v4.0` upgrade completes. It makes the calm, structured **Daily Session Brief** (Prompt + Topic Primer + Universal Pivot Rule + Dynamic Mechanics Check + Vocabulary to Try + Zero-Pressure Canvas) the centerpiece of Quillit's writing experience, wired end-to-end into `/api/evaluate`, the Vocabulary Bank, and the Diagnostic Dashboard.

---

## Role & Execution Contract

You are a **Principal Full-Stack TypeScript Engineer and Editorial Product Designer** upgrading **Quillit** (`v4.0` → `v4.1`).

**Read these files first before making edits:**
- `ENGINEERING_LOG.md`, `src/types.ts`, `src/data/curriculum52Weeks.ts`, `src/utils/curriculumEngine.ts`
- `src/components/WriteStudio.tsx`, `src/components/EvaluationReportView.tsx`, `src/components/DashboardView.tsx`, `src/components/CalendarView.tsx`
- `server/routes/evaluate.ts`, `server/lib/validation.ts`, `src/utils/analytics.ts`, `src/utils/vocabMastery.ts`, `src/utils/fastEvaluate.ts`

### Non-Negotiable Invariants
1. **DO NOT change the 5-generation Gemini API cascade or model-routing logic** (`server/lib/geminiCascade.ts`, `src/utils/evaluationRouter.ts`). Keep the v4.0 slim evaluation schema and deterministic server-side benchmark derivation intact.
2. **Preserve all `v3.4–v4.0` features:** EIE 6th-Sem Readiness, 4/3/2 Compression Sprint, Skeleton Studio, WPM cadence meter, Sentence Focus Mode, 3-tab Evaluation Report, 4-module Diagnostic Dashboard, Offline Space AES-256-GCM vault, Local Desk, and hardened Cloud Sync + Firestore rules.
3. **Minimal, quiet-luxury literary stationery aesthetic:** Preserve `src/styles/tokens.css` (Cotton Rag Paper `#FAF8F4` / Carbon Ink `#141413` light; Nocturne Obsidian `#0E0E0D` / Warm Ivory `#F2F0EB` dark), `Fraunces` serif headings, `Plus Jakarta Sans` UI text, `JetBrains Mono` codes/badges, crisp `1px` hairline borders, and generous whitespace.

---

## Core Product Vision for v4.1

When a writer opens **WriteStudio**, the primary experience should feel like sitting down with a sharp, personal editorial mentor—not configuring a complex form. Above the centered `65ch` writing canvas sits a single, calm **Session Brief** presenting:

1. **Slot & Prompt Header:** `{Weekday} · {Slot Label}` (e.g., *Friday · Slot 2: LinkedIn, Email & Soft Skills*), prompt code (`S08`), title (`Pitching Project Value`), and mode/register pill (`Professional Email`).
2. **Concrete Scenario Prompt:** 1–2 crisp sentences stating the exact communication task, audience, and goal.
3. **Topic Primer:** Practical audience-first framing explaining *how* to structure the response (e.g., lead with operational risk → explain real-time value → close with a low-friction next step).
4. **Universal Pivot Rule:** Quiet permission to pivot to any course capstone, mini-project, or lab improvement the writer knows well, paired with a subtle 1-click **Pivot Topic** button.
5. **Active Practice Targets (Personalized from Your Tracker):**
   - **Mechanics Check:** Automatically derived from the writer's real recurring mistakes (`errorTag`s, `grammarFixes`, and previous `nextDraftPriority`), phrased as 1 concrete, memorable line (e.g., *"Capitalize `I` and proper nouns, keep `Meanwhile` as one word, and double-check verb tenses (`was` vs. `were`, `rise` vs. `raise`)."*).
   - **Vocabulary to Try:** 2–3 unmastered words/phrases pulled from the writer's Vocabulary Bank with a short contextual hint showing how to weave them naturally into *today's* topic. As the writer types any target phrase into their draft, its chip quietly marks `✓ Used` in real time.
6. **Zero-Pressure Writing Invitation:** No rigid word-count gates—just a calm invitation (*"Write your draft directly below whenever you're ready (no word-count limits), and I'll run a strict evaluation, suggest vocabulary upgrades, and log your progress."*) and an open `65ch` canvas.

---

## Phase 1 — Dynamic Session Brief Engine (`src/utils/sessionBrief.ts`)

Create a pure, well-tested module `src/utils/sessionBrief.ts` (keep under 25 KB):

1. **`buildSessionBrief(params)`:**
   - Inputs: `activeSlot` (or auto-selected next due `CalendarSlot` / fallback from `curriculum52Weeks.ts`), `sessions` (completed writing history), `vocabulary` (`VocabEntry[]`), `studentProfile`.
   - Outputs a clean `SessionBrief` object:
     - `slotContext`: e.g. `"Friday · Slot 2: LinkedIn, Email & Soft Skills"`
     - `promptCode`: e.g. `"S08"` (from `slot.curriculumTopicId` or sequential session code)
     - `title`, `modeLabel`, `toneLabel`, `taskPrompt`
     - `topicPrimer`: from `slot.topicPrimer` (with rich, audience-first fallback per mode/pillar if absent)
     - `pivotRule`: from `slot.pivotRule` (defaulting to a concise universal pivot rule tailored to the student's degree/context)
     - `mechanicsCheck`: string synthesized by `buildMechanicsCheck(sessions)` from the top 2–3 recurring `errorTag`s / `grammarFixes` / latest `nextDraftPriority` across the last 5–10 sessions (with a crisp starter checklist for brand-new users with 0 sessions)
     - `vocabTargets`: array of 2–3 `{ id, phrase, hint }` selected by `selectTargetVocab(vocabulary, mode, topic)` prioritizing unmastered entries (`!mastered`, `new`/`emerging`/`building` stages, matching mode first, then recent additions), plus a 1-line contextual weaving cue referencing today's topic
2. **`detectUsedTargetVocab(draftText, vocabTargets)`:**
   - Case-insensitive, word-boundary-aware matcher (handling simple inflectional forms like plural/past/gerund where safe) returning the set of target phrases already woven into the current draft for live `✓ Used` pill feedback.
3. **Contextual Vocab Hint Enrichment (Optional, Zero Extra Latency):**
   - When `/api/schedule-triweekly` or `/api/pivot-topic` generates or pivots a slot, optionally include a 1-sentence `vocabWeaveExample` when `practicingVocab` is passed—never blocking `WriteStudio` load if offline or uncached.

---

## Phase 2 — Editorial Session Brief UI & Zero-Clutter WriteStudio (`src/components/SessionBriefCard.tsx`, `src/components/WriteStudio.tsx`)

1. **Create `src/components/SessionBriefCard.tsx`:**
   - Clean, literary stationery card rendered directly above the `65ch` editor in `WriteStudio.tsx`.
   - Exact visual hierarchy:
     - Subtle `JetBrains Mono` eyebrow: `{slotContext}` + `promptCode` pill + `modeLabel` pill.
     - `Fraunces` title + crisp 1–2 sentence task prompt.
     - Structured, scannable blocks with thin left-border ink accents (`1px solid var(--border-default)`):
       - **Topic Primer**
       - **Universal Pivot Rule** (with subtle inline `Pivot Topic` and `Free Write` text actions—no loud buttons)
       - **Active Practice Targets**:
         - **Mechanics Check** (1 crisp, actionable line)
         - **Vocabulary to Try** (2–3 monochrome pills that softly transition to `var(--status-success)` + `✓` in real time as the writer uses them in the draft, plus the 1-line contextual usage hint underneath)
     - Quiet italic footer cue: *"Write your draft directly below whenever you're ready (no word-count limits). Run a strict evaluation when finished to verify your targets and log progress."*
   - **Auto-Calm Collapse:** Include a 1-click **Collapse Brief** toggle (and compact 1-line sticky bar showing `S08 · Pitching Project Value · 2/3 Vocab Used · Expand Brief`) so once the writer is in flow, the canvas stays completely serene while targets remain one click away.
2. **Auto-Load Today's Brief on Studio Open (`WriteStudio.tsx`):**
   - When opening `WriteStudio` without a manually picked slot, automatically bind today's next incomplete `CalendarSlot` (or generate a clean brief from the curriculum) so the user immediately sees their personalized Session Brief instead of empty dropdowns.
   - Remove any hard minimum word-count blocker for standard writing sessions (keep only a minimal 20-character non-empty guard in `/api/evaluate`, and keep the 4/3/2 sprint's Pass 3 `>= 45w` rule strictly scoped to the 4/3/2 sprint drill).
   - Keep secondary studio controls (Drills, Audience, Coach Presets, EIE Text Analysis Drawer, Sentence Focus Mode) neatly tucked inside the quiet collapsible ribbon so the Brief + Canvas stay front and center.

---

## Phase 3 — Closed-Loop Target Verification & Auto-Mastery (`server/routes/evaluate.ts`, `EvaluationReportView.tsx`, `App.tsx`)

1. **Pass Active Brief Targets to `/api/evaluate`:**
   - Extend `EvaluateRequestSchema` in `server/lib/validation.ts` with optional `activeMechanicsCheck: z.string().max(400).optional()` (reusing existing `practicingVocab`).
   - Inject `Active Mechanics Check` and `Vocabulary to Try` cleanly into the compressed evaluation prompt in `server/routes/evaluate.ts` without expanding token bloat.
   - Add a compact `targetCheck` object to the evaluation response (and mirror it in `src/utils/fastEvaluate.ts` for offline parity):
     - `mechanicsStatus`: `'Cleared' | 'Partial' | 'Missed' | 'Baseline'`
     - `mechanicsNote`: 1 sharp sentence citing exact evidence from this draft
     - `vocabUsed`: array of target phrases genuinely used naturally in the draft
     - `vocabMissed`: array of target phrases not used
2. **Surface Target Results in `EvaluationReportView.tsx` (Tab 1 — Overview & Verdict):**
   - Render a clean, compact **Active Practice Targets Check** card right below the Verdict/Priority callout showing:
     - **Mechanics Check** badge (`Cleared ✓` / `Partial` / `Needs Another Pass`) + 1-line evidence.
     - **Vocabulary Targets** chips (`✓ Used naturally` vs. `Not used this round`).
3. **Auto-Advance Vocabulary Mastery & Close the Loop (`src/App.tsx`):**
   - Whenever a target phrase from `Vocabulary to Try` is confirmed in `vocabUsed`, automatically increment its `usageCount` and advance `masteryStage` (`new` → `emerging` → `building` → `mastered` via `src/utils/vocabMastery.ts`), syncing the update to Firestore / Local Vault.
   - Automatically mark the linked `CalendarSlot` completed and feed the session's `nextDraftPriority` + `errorTag`s directly into the next session's `Mechanics Check` so every session visibly builds on the last.
   - Keep `firestore.rules` and `cloudSync.ts` in lockstep if persisting `targetCheck` (or store within existing allowed fields / whitelist `targetCheck` in `isValidWritingSession` + `affectedKeys`).

---

## Phase 4 — Tests, Visual Polish & Verification

1. **Add Unit Tests (`src/utils/sessionBrief.test.ts`):**
   - Test `buildMechanicsCheck` extracting concrete rules from recurring `errorTag`s & `grammarFixes`, plus clean cold-start defaults.
   - Test `selectTargetVocab` prioritizing unmastered mode-matched vocabulary without duplicates.
   - Test `detectUsedTargetVocab` matching multi-word phrases (`operates blind to`, `critical bottleneck`) and simple word forms accurately.
   - Test closed-loop evaluation target parsing in `server/routes/evaluate.ts` and `src/utils/fastEvaluate.ts`.
2. **Run Full Verification Suite:**
   - `npm run lint`
   - `npm test`
   - `npm run build` and `npm run build:pages`
   - ESLint on `firestore.rules` (and deploy rules if modified)
   - Chromium visual inspection on Desktop (`1440×900`) and Mobile (`390×844`) in both Light and Dark themes verifying: Session Brief readability, live `✓ Used` vocab pill updates while typing, collapse-to-sticky-bar behavior, zero word-count blocking on standard drafts, and Active Practice Targets Check in Tab 1 of the Evaluation Report.
3. Update `ENGINEERING_LOG.md` with the `v4.1.0` release entry.
