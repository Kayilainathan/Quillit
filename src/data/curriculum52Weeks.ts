import type { ToneSetting, TriWeeklyPillar, WritingMode } from '../types';

export type CurriculumRegister = 'Casual' | 'Semi-Formal' | 'Formal' | 'Report';

export interface CurriculumTopic {
  id: string; // e.g. 'W01.1'
  week: number; // 1..52
  quarter: 1 | 2 | 3 | 4;
  slotIndex: 1 | 2 | 3;
  category: string;
  register: CurriculumRegister;
  topic: string;
  mode: WritingMode;
  tone: ToneSetting;
  pillar: TriWeeklyPillar;
  topicPrimer: string;
  pivotRule: string;
  targetWords: number;
  suggestions: string[];
}

type RawRow = readonly [
  id: string,
  week: number,
  category: string,
  register: CurriculumRegister,
  topic: string,
];

const RAW_CURRICULUM_ROWS: readonly RawRow[] = [
  // Quarter 1: Foundations, Spoken Flow & Clarity (Weeks 01-13)
  ['W01.1', 1, 'Interview Speech', 'Semi-Formal', 'Explain how a sensor and ADC convert heat or pressure into numbers as if talking to a curious friend.'],
  ['W01.2', 1, 'LinkedIn Post', 'Semi-Formal', 'Share a short story about a wiring mistake or lab bug and the one debugging habit it taught you.'],
  ['W01.3', 1, 'Creative Fantasy', 'Casual', 'Describe an ancient clockwork observatory gearing up for a rare eclipse, focusing on sound and motion.'],

  ['W02.1', 2, 'Technical Doc', 'Report', 'Write a clean 1-page README overview for a microcontroller project: what it does, hardware needed, and setup steps.'],
  ['W02.2', 2, 'Formal Email', 'Formal', 'Email a professor asking for 15 minutes of feedback on your capstone hardware block diagram.'],
  ['W02.3', 2, 'Creative Fantasy', 'Casual', 'Write a tense dialogue between a weary alchemist and a runaway apprentice sheltering from a storm.'],

  ['W03.1', 3, 'Interview Speech', 'Semi-Formal', 'Explain negative feedback loops (like cruise control or a thermostat) in plain English without equations.'],
  ['W03.2', 3, 'Everyday English', 'Casual', 'Explain to a non-engineering relative what Electronics & Instrumentation Engineering actually is in 60 seconds.'],
  ['W03.3', 3, 'Creative Fantasy', 'Casual', 'Narrate an artificer trying to wake a dormant stone golem using a humming elemental core.'],

  ['W04.1', 4, 'Lab Report', 'Report', 'Write a concise failure-analysis summary for a circuit that failed on the breadboard (symptom, root cause, fix).'],
  ['W04.2', 4, 'LinkedIn Post', 'Semi-Formal', 'Write a punchy post on why embedded work is 90% probing pins with a multimeter and 10% writing code.'],
  ['W04.3', 4, 'Creative Fantasy', 'Casual', 'Tell the folklore legend of a valley where iron rusts into gold dust under a violet moon.'],

  ['W05.1', 5, 'Interview Speech', 'Semi-Formal', 'Explain electrical noise and low-pass filtering using the analogy of a noisy cafeteria or radio static.'],
  ['W05.2', 5, 'Formal Email', 'Formal', 'Send a crisp cold email to an industry engineer on LinkedIn requesting a 10-minute informational chat.'],
  ['W05.3', 5, 'Creative Fantasy', 'Casual', 'Sketch a portrait of a solitary clockmaker whose brass prosthetic hand starts acting on its own.'],

  ['W06.1', 6, 'Technical Doc', 'Report', 'Document a clean pinout and wiring checklist so a junior teammate can reproduce your sensor circuit without errors.'],
  ['W06.2', 6, 'Workplace Comm', 'Semi-Formal', 'Write a diplomatic team message nudging a lab partner who missed an agreed testing deadline.'],
  ['W06.3', 6, 'Creative Fantasy', 'Casual', 'Describe a rooftop chase across a storm-powered steampunk city using short, high-momentum sentences.'],

  ['W07.1', 7, 'Interview Speech', 'Semi-Formal', 'Explain microcontroller timers and interrupts by comparing them to kitchen alarms while cooking.'],
  ['W07.2', 7, 'LinkedIn Post', 'Semi-Formal', 'Contrast what your circuit simulation predicted versus what the oscilloscope waveform actually showed.'],
  ['W07.3', 7, 'Creative Fantasy', 'Casual', "Write a quiet campfire monologue by an elder recounting the night the sky's constellation clock froze."],

  ['W08.1', 8, 'Technical Doc', 'Report', 'Write a clear GitHub issue or bug report for an intermittent I2C communication freeze (steps, expected vs. actual).'],
  ['W08.2', 8, 'Formal Email', 'Formal', "Write a polite follow-up email to a recruiter or HR contact who hasn't replied after 7 days."],
  ['W08.3', 8, 'Creative Fantasy', 'Casual', 'Describe an underground market where merchants trade bottled memories instead of coins.'],

  ['W09.1', 9, 'Interview Speech', 'Semi-Formal', 'Explain why an op-amp is needed between a tiny microvolt sensor and an ADC without using heavy jargon.'],
  ['W09.2', 9, 'Everyday English', 'Casual', 'Give a 2-minute casual talk recommending a book, movie, or hobby and why it stuck with you.'],
  ['W09.3', 9, 'Creative Fantasy', 'Casual', 'Write a negotiation between a ship captain and a sea-witch over safe passage through a cursed strait.'],

  ['W10.1', 10, 'Test Report', 'Report', 'Summarize a sensor calibration test (reference standard, readings, observed drift, pass/fail verdict).'],
  ['W10.2', 10, 'LinkedIn Post', 'Semi-Formal', 'Reflect on why learning to read a 60-page component datasheet is an underrated superpower for students.'],
  ['W10.3', 10, 'Creative Fantasy', 'Casual', 'Narrate the first five minutes after magic abruptly stops working in a floating sky-citadel.'],

  ['W11.1', 11, 'Interview Speech', 'Semi-Formal', 'Explain sampling and aliasing using the movie illusion of wagon wheels spinning backward.'],
  ['W11.2', 11, 'Formal Email', 'Formal', 'Request a lab equipment booking or component procurement from your department lab-in-charge.'],
  ['W11.3', 11, 'Creative Fantasy', 'Casual', 'Describe a library where unread books whisper to passersby and forbidden ones are chained shut.'],

  ['W12.1', 12, 'Technical Doc', 'Report', 'Write a short troubleshooting FAQ (5 common errors and fixes) for a microcontroller board you use often.'],
  ['W12.2', 12, 'Workplace Comm', 'Semi-Formal', "Write a clean weekly status update for a project guide: done this week, blockers, next week's plan."],
  ['W12.3', 12, 'Creative Fantasy', 'Casual', 'Write a rivalry scene between two guild engineers racing to unlock a sealed vault before sunset.'],

  ['W13.1', 13, 'Interview Speech', 'Semi-Formal', 'Deliver a crisp 90-second "Tell me about yourself" tailored for a core electronics and instrumentation interview.'],
  ['W13.2', 13, 'LinkedIn Post', 'Semi-Formal', 'Share one honest lesson learned from balancing semester exams with hands-on hardware projects.'],
  ['W13.3', 13, 'Creative Fantasy', 'Casual', 'Write a letter from an explorer stranded on an island where time flows slower near the shoreline.'],

  // Quarter 2: Technical Depth & Workplace Precision (Weeks 14-26)
  ['W14.1', 14, 'Design Memo', 'Report', 'Compare two microcontrollers (e.g., ESP32 vs. STM32) for a sensor-logging task and justify your pick.'],
  ['W14.2', 14, 'Formal Email', 'Formal', 'Write a gracious thank-you email after a mock interview or technical mentoring session, citing one specific takeaway.'],
  ['W14.3', 14, 'Creative Fantasy', 'Casual', 'Describe a blacksmith forging armor inside a frozen volcano using captured winter lightning.'],

  ['W15.1', 15, 'Interview Speech', 'Semi-Formal', 'Explain how a Kalman filter blends a noisy sensor with a physics prediction (use a GPS-in-a-tunnel analogy).'],
  ['W15.2', 15, 'LinkedIn Post', 'Semi-Formal', 'Pitch your capstone or favorite mini-project in 3 short paragraphs focusing on the real-world problem it solves.'],
  ['W15.3', 15, 'Creative Fantasy', 'Casual', 'Write a dialogue where a royal spy tries to pass a coded warning during a polite dinner conversation.'],

  ['W16.1', 16, 'Technical Doc', 'Report', 'Write a step-by-step Standard Operating Procedure (SOP) for safely powering up and testing a new PCB.'],
  ['W16.2', 16, 'Everyday English', 'Casual', 'Politely decline an invitation or extra commitment while keeping the relationship warm and respectful.'],
  ['W16.3', 16, 'Creative Fantasy', 'Casual', 'Narrate a cartographer mapping a forest whose trails rearrange themselves after every rainfall.'],

  ['W17.1', 17, 'Interview Speech', 'Semi-Formal', 'Explain SPI vs. I2C vs. UART out loud: when would you pick each one on a real board?'],
  ['W17.2', 17, 'Formal Email', 'Formal', 'Send an internship inquiry email to a hiring manager highlighting one concrete project result.'],
  ['W17.3', 17, 'Creative Fantasy', 'Casual', 'Describe an abandoned lighthouse whose beam reveals ghostly ships from a century ago.'],

  ['W18.1', 18, 'Incident Report', 'Report', 'Write a post-mortem for a demo-day hardware failure: timeline, root cause, immediate workaround, prevention.'],
  ['W18.2', 18, 'LinkedIn Post', 'Semi-Formal', 'Share a relatable takeaway about collaborating with teammates when a prototype fails an hour before review.'],
  ['W18.3', 18, 'Creative Fantasy', 'Casual', 'Write a tense argument between two siblings who inherited a single wish-granting compass.'],

  ['W19.1', 19, 'Interview Speech', 'Semi-Formal', 'Explain PID control (Proportional, Integral, Derivative) using the analogy of steering a car back into a lane.'],
  ['W19.2', 19, 'Workplace Comm', 'Formal', 'Escalate a missing lab component or vendor delay to a faculty coordinator clearly without sounding panicked.'],
  ['W19.3', 19, 'Creative Fantasy', 'Casual', 'Describe a train journey across an endless desert of glass where the conductor never speaks.'],

  ['W20.1', 20, 'Technical Doc', 'Report', 'Write a concise system architecture brief explaining how data flows from field sensor to cloud dashboard.'],
  ['W20.2', 20, 'Everyday English', 'Casual', 'Tell a short, funny story about a travel mishap or everyday inconvenience with clean pacing and a punchline.'],
  ['W20.3', 20, 'Creative Fantasy', 'Casual', 'Narrate a duel of wits between a storm-weaver and a rune-smith inside an echoing cavern.'],

  ['W21.1', 21, 'Interview Speech', 'Semi-Formal', 'Explain why industrial plants prefer 4-20 mA current loops over 0-5 V voltage signals over long cables.'],
  ['W21.2', 21, 'LinkedIn Post', 'Semi-Formal', 'Break down one core concept you struggled with in class until a single analogy finally made it click.'],
  ['W21.3', 21, 'Creative Fantasy', 'Casual', "Describe an apothecary's shop at midnight through smell, texture, and flickering candlelight."],

  ['W22.1', 22, 'Test Report', 'Report', 'Write a battery-life and power-consumption benchmark summary comparing active mode vs. deep-sleep mode.'],
  ['W22.2', 22, 'Formal Email', 'Formal', 'Write a clear email asking a professor for a Letter of Recommendation (LOR) with context and deadlines.'],
  ['W22.3', 22, 'Creative Fantasy', 'Casual', 'Write a short scene where a tired dragon interviews a nervous knight applying to guard its hoard.'],

  ['W23.1', 23, 'Interview Speech', 'Semi-Formal', 'Explain PWM (Pulse Width Modulation) to a high schooler: how digital on/off pulses dim an LED or control motor speed.'],
  ['W23.2', 23, 'Workplace Comm', 'Semi-Formal', "Disagree diplomatically with a teammate's design choice and propose a lower-risk alternative."],
  ['W23.3', 23, 'Creative Fantasy', 'Casual', 'Narrate the awakening of an ancient sunken city rising slowly out of a calm ocean at dawn.'],

  ['W24.1', 24, 'Technical Doc', 'Report', 'Write a clean changelog or release note for v1.2 of a firmware project (new features, bug fixes, known limits).'],
  ['W24.2', 24, 'LinkedIn Post', 'Semi-Formal', 'Share a short breakdown comparing MQTT vs. HTTP for edge IoT devices, focusing on practical trade-offs.'],
  ['W24.3', 24, 'Creative Fantasy', 'Casual', 'Describe a festival of floating lanterns where one lantern refuses to drift with the wind.'],

  ['W25.1', 25, 'Interview Speech', 'Semi-Formal', 'Explain ground loops and why tying grounds cleanly matters in mixed-signal circuits.'],
  ['W25.2', 25, 'Formal Email', 'Formal', 'Write an email apologizing professionally for missing a meeting or sending the wrong attachment, with the fix.'],
  ['W25.3', 25, 'Creative Fantasy', 'Casual', 'Write a quiet conversation between a ghost who forgot their name and a night watchman on his last shift.'],

  ['W26.1', 26, 'Progress Report', 'Report', 'Write a half-year self-review report: 3 skills improved, 2 recurring gaps, and your focus for the next 6 months.'],
  ['W26.2', 26, 'Everyday English', 'Casual', 'Summarize a podcast episode, tech talk, or article you enjoyed in 5 crisp spoken-style sentences.'],
  ['W26.3', 26, 'Creative Fantasy', 'Casual', 'Describe a clockwork bird delivering an urgent message across a war-torn mountain pass.'],

  // Quarter 3: Interviews, Reports & Persuasive Communication (Weeks 27-39)
  ['W27.1', 27, 'Interview Speech', 'Semi-Formal', 'Answer a behavioral interview prompt using STAR: "Tell me about a time a project didn\'t go as planned."'],
  ['W27.2', 27, 'LinkedIn Post', 'Semi-Formal', 'Write a crisp post on what preparing for core engineering placements (TI, Bosch, PSUs) has taught you about fundamentals.'],
  ['W27.3', 27, 'Creative Fantasy', 'Casual', 'Narrate a heist inside a gravity-shifting tower where the floor changes direction every chime.'],

  ['W28.1', 28, 'Design Memo', 'Report', 'Write a component-selection memo justifying an RTD vs. thermocouple vs. thermistor for an industrial oven.'],
  ['W28.2', 28, 'Formal Email', 'Formal', 'Send a crisp project proposal email to a lab sponsor or club faculty advisor requesting a small budget.'],
  ['W28.3', 28, 'Creative Fantasy', 'Casual', 'Write a monologue by a villain who genuinely believes their harsh rule is saving the kingdom.'],

  ['W29.1', 29, 'Interview Speech', 'Semi-Formal', 'Explain how an FFT turns a time-domain vibration signal into frequency spikes that reveal bearing faults.'],
  ['W29.2', 29, 'Workplace Comm', 'Semi-Formal', 'Write crisp meeting minutes from an imaginary 30-minute project sync (decisions, owners, due dates).'],
  ['W29.3', 29, 'Creative Fantasy', 'Casual', 'Describe an ancient bridge that only appears when two enemies agree to cross it together.'],

  ['W30.1', 30, 'Technical Doc', 'Report', 'Write an API or serial-command reference table for a simple sensor node (5 commands, inputs, outputs).'],
  ['W30.2', 30, 'Everyday English', 'Casual', 'Explain why you agree or disagree with a common campus or tech opinion without sounding aggressive.'],
  ['W30.3', 30, 'Creative Fantasy', 'Casual', 'Narrate an apprentice mage accidentally summoning a tiny, overly sarcastic weather spirit.'],

  ['W31.1', 31, 'Interview Speech', 'Semi-Formal', 'Defend a design trade-off out loud: why you chose simplicity and reliability over extra features in a prototype.'],
  ['W31.2', 31, 'LinkedIn Post', 'Semi-Formal', 'Share a quick story about a mentor, senior, or professor whose one-line advice changed how you approach work.'],
  ['W31.3', 31, 'Creative Fantasy', 'Casual', 'Describe a ruined space-dock overgrown with glowing alien vines after a thousand years of silence.'],

  ['W32.1', 32, 'Safety Report', 'Report', 'Write a concise lab safety and ESD-handling brief for new students entering an electronics bench for the first time.'],
  ['W32.2', 32, 'Formal Email', 'Formal', 'Write an email asking an alumnus for advice on preparing for interviews at their company (specific, low-friction).'],
  ['W32.3', 32, 'Creative Fantasy', 'Casual', 'Write a fast-paced dialogue between two pilots trying to restart a failing airship engine mid-storm.'],

  ['W33.1', 33, 'Interview Speech', 'Semi-Formal', 'Explain PLC ladder logic and why factories still rely on PLCs instead of regular consumer laptops.'],
  ['W33.2', 33, 'Workplace Comm', 'Semi-Formal', 'Hand off an unfinished task cleanly to a teammate before leaving for the weekend (status, files, next step).'],
  ['W33.3', 33, 'Creative Fantasy', 'Casual', 'Describe a winter market lit by captured starlight, focusing on warmth versus bitter cold.'],

  ['W34.1', 34, 'Technical Doc', 'Report', 'Write a 1-page executive summary of a technical project meant for a non-technical manager or judge.'],
  ['W34.2', 34, 'LinkedIn Post', 'Semi-Formal', 'Write a post debunking a common myth students believe about hardware or embedded careers.'],
  ['W34.3', 34, 'Creative Fantasy', 'Casual', 'Narrate a detective investigating a locked-room theft in a city where everyone can read surface thoughts.'],

  ['W35.1', 35, 'Interview Speech', 'Semi-Formal', 'Answer: "Explain a complex technical concept from your resume to someone with zero engineering background."'],
  ['W35.2', 35, 'Formal Email', 'Formal', 'Write a polite email negotiating a deadline extension on a deliverable while proposing a realistic partial milestone.'],
  ['W35.3', 35, 'Creative Fantasy', 'Casual', 'Describe a music box that plays the sound of whatever memory its listener misses most.'],

  ['W36.1', 36, 'Comparison Report', 'Report', 'Compare SAR vs. Sigma-Delta ADCs in a crisp decision brief: speed, resolution, noise rejection, and ideal use cases.'],
  ['W36.2', 36, 'Everyday English', 'Casual', 'Give a short, warm farewell or appreciation speech for a senior batch or club teammate.'],
  ['W36.3', 36, 'Creative Fantasy', 'Casual', 'Write a scene where a cartographer discovers a blank spot on every map that nobody dares to name.'],

  ['W37.1', 37, 'Interview Speech', 'Semi-Formal', 'Explain why thermal drift and calibration matter in precision instrumentation (use a bathroom scale analogy).'],
  ['W37.2', 37, 'LinkedIn Post', 'Semi-Formal', 'Share 3 specific habits that improved your technical writing or debugging speed this semester.'],
  ['W37.3', 37, 'Creative Fantasy', 'Casual', 'Narrate a lone messenger crossing a frozen lake that begins to crack under rhythmic footsteps.'],

  ['W38.1', 38, 'Technical Doc', 'Report', 'Write a concise risk register (4 risks, likelihood, impact, mitigation) for a hardware prototype demo.'],
  ['W38.2', 38, 'Formal Email', 'Formal', 'Respond professionally to critical feedback from a reviewer or professor without sounding defensive.'],
  ['W38.3', 38, 'Creative Fantasy', 'Casual', 'Write a sharp dialogue between a retired swordsmith and a brash hero demanding an impossible blade.'],

  ['W39.1', 39, 'Interview Speech', 'Semi-Formal', 'Answer: "Why Electronics & Instrumentation, and why this specific role?" in a grounded, non-cliche 60-second pitch.'],
  ['W39.2', 39, 'Workplace Comm', 'Semi-Formal', "Write a clear announcement inviting juniors to a technical workshop you are hosting (hook, what they'll build, logistics)."],
  ['W39.3', 39, 'Creative Fantasy', 'Casual', "Describe an ancient automaton waking up after 300 years to find its creator's city turned into a forest."],

  // Quarter 4: Mastery, Leadership & Expressive Range (Weeks 40-52)
  ['W40.1', 40, 'Architecture Doc', 'Report', 'Write a clean Request for Comments (RFC) proposing a modular firmware structure for a team project.'],
  ['W40.2', 40, 'LinkedIn Post', 'Semi-Formal', 'Break down a real-world engineering failure or recall in the news and the instrumentation lesson behind it.'],
  ['W40.3', 40, 'Creative Fantasy', 'Casual', 'Narrate an auction of forbidden artifacts where the strangest item is a plain iron key.'],

  ['W41.1', 41, 'Interview Speech', 'Semi-Formal', 'Explain state-space observability in plain English: how measuring two easy variables lets you estimate a hidden one.'],
  ['W41.2', 41, 'Formal Email', 'Formal', 'Write an email following up after an interview, reaffirming interest and clarifying one technical point briefly.'],
  ['W41.3', 41, 'Creative Fantasy', 'Casual', 'Describe a storm at sea from the perspective of a lighthouse keeper who refuses to let the lamp die.'],

  ['W42.1', 42, 'Validation Report', 'Report', 'Write a concise test-plan summary detailing how you will verify accuracy, latency, and safety before final sign-off.'],
  ['W42.2', 42, 'Everyday English', 'Casual', 'Deliver a 2-minute persuasive talk on a habit every college student should drop, using vivid everyday examples.'],
  ['W42.3', 42, 'Creative Fantasy', 'Casual', 'Write a quiet conversation between two guards on a castle wall debating whether the distant signal fire is real.'],

  ['W43.1', 43, 'Interview Speech', 'Semi-Formal', 'Explain RTOS (Real-Time Operating System) vs. bare-metal super-loop firmware: when does an RTOS actually pay off?'],
  ['W43.2', 43, 'LinkedIn Post', 'Semi-Formal', 'Reflect on a project you started that felt intimidating at first, and how breaking it into small milestones worked.'],
  ['W43.3', 43, 'Creative Fantasy', 'Casual', "Narrate a scholar decoding a brass cylinder that projects a star map of a sky that doesn't exist yet."],

  ['W44.1', 44, 'Technical Doc', 'Report', 'Write a clean onboarding guide for a new teammate joining your capstone mid-semester (repo, hardware, first task).'],
  ['W44.2', 44, 'Formal Email', 'Formal', 'Write a tactful email resolving a misunderstanding between two sub-teams (hardware vs. software) over an interface spec.'],
  ['W44.3', 44, 'Creative Fantasy', 'Casual', 'Describe a hidden courtyard in a bustling desert metropolis where a single silver tree grows.'],

  ['W45.1', 45, 'Interview Speech', 'Semi-Formal', 'Answer a tough behavioral question: "Tell me about a time you made a technical mistake and how you owned it."'],
  ['W45.2', 45, 'Workplace Comm', 'Semi-Formal', 'Summarize a complex 10-page technical paper or datasheet into a 5-bullet briefing for your team chat.'],
  ['W45.3', 45, 'Creative Fantasy', 'Casual', 'Write a suspenseful scene where a thief realizes the treasure chest they cracked open is actually a trapdoor.'],

  ['W46.1', 46, 'Field Report', 'Report', 'Write an industrial visit or plant-tour observation report: process observed, key instruments used, and one improvement idea.'],
  ['W46.2', 46, 'LinkedIn Post', 'Semi-Formal', "Share what you'd tell your 1st-year engineering self, keeping it grounded in specific lessons rather than generic quotes."],
  ['W46.3', 46, 'Creative Fantasy', 'Casual', 'Tell an oral legend about a river that reverses its flow once every hundred years.'],

  ['W47.1', 47, 'Interview Speech', 'Semi-Formal', 'Explain EMC/EMI shielding and PCB layout hygiene out loud: why trace routing can break an otherwise good schematic.'],
  ['W47.2', 47, 'Formal Email', 'Formal', 'Write a crisp email accepting or politely declining an internship or project offer with professionalism.'],
  ['W47.3', 47, 'Creative Fantasy', 'Casual', 'Write a dialogue between a royal astronomer and a skeptical general on the eve of a predicted comet.'],

  ['W48.1', 48, 'Technical Doc', 'Report', 'Write a concise Bill of Materials (BOM) rationale note explaining cost vs. availability trade-offs for key parts.'],
  ['W48.2', 48, 'Everyday English', 'Casual', 'Explain a nuanced personal lesson you learned this year in a natural, conversational voice.'],
  ['W48.3', 48, 'Creative Fantasy', 'Casual', 'Describe a city built inside the ribcage of a colossal ancient leviathan.'],

  ['W49.1', 49, 'Interview Speech', 'Semi-Formal', 'Pitch your strongest engineering project as a 3-minute spoken walkthrough: problem, architecture, toughest bug, impact.'],
  ['W49.2', 49, 'LinkedIn Post', 'Semi-Formal', "Write a short, high-signal post celebrating a teammate's or mentor's contribution without sounding performative."],
  ['W49.3', 49, 'Creative Fantasy', 'Casual', 'Narrate an apprentice watchmaker repairing a pocket watch that can rewind exactly ten seconds of time.'],

  ['W50.1', 50, 'Final Report', 'Report', 'Draft the abstract and conclusion of a formal capstone report: crisp, quantified, and completely free of fluff.'],
  ['W50.2', 50, 'Formal Email', 'Formal', 'Write a networking check-in email to a past mentor or contact sharing a brief progress update and asking nothing in return.'],
  ['W50.3', 50, 'Creative Fantasy', 'Casual', 'Write a bittersweet farewell between two travelers parting ways at a crossroads under an autumn sky.'],

  ['W51.1', 51, 'Interview Speech', 'Semi-Formal', 'Answer: "Where do you see your engineering skills growing over the next two years, and how do you learn fast?"'],
  ['W51.2', 51, 'Workplace Comm', 'Formal', 'Write a formal project-closure memo documenting final deliverables, lessons learned, and handover links.'],
  ['W51.3', 51, 'Creative Fantasy', 'Casual', 'Describe a grand hall of mirrors where each mirror reflects a different version of the person standing before it.'],

  ['W52.1', 52, 'Capstone Speech', 'Semi-Formal', 'Deliver a 2-minute closing keynote summarizing what a full year of deliberate communication practice changed for you.'],
  ['W52.2', 52, 'LinkedIn Post', 'Semi-Formal', 'Write a grounded year-in-review LinkedIn post highlighting 3 concrete engineering and communication milestones.'],
  ['W52.3', 52, 'Creative Fantasy', 'Casual', "Return to Week 01's clockwork observatory: write the final scene as the eclipse ends and a new era begins."],
];

function mapRowToMode(slotIndex: 1 | 2 | 3, category: string): WritingMode {
  if (slotIndex === 3 || category === 'Creative Fantasy') return 'creative';
  if (slotIndex === 1) return 'technical';
  const lower = category.toLowerCase();
  if (lower.includes('linkedin')) return 'linkedin';
  if (lower.includes('email') || lower.includes('workplace')) return 'email';
  return 'friend';
}

function mapRowToTone(
  slotIndex: 1 | 2 | 3,
  register: CurriculumRegister,
  category: string
): ToneSetting {
  if (slotIndex === 3 || category === 'Creative Fantasy') return 'narrative-vivid';
  if (register === 'Formal') return 'formal-executive';
  if (register === 'Report') return 'crisp-direct';
  if (register === 'Casual') return 'conversational';
  if (slotIndex === 1) return 'academic-technical';
  return 'professional-warm';
}

function buildPrimer(
  slotIndex: 1 | 2 | 3,
  category: string,
  register: CurriculumRegister
): string {
  if (slotIndex === 1) {
    if (register === 'Report') {
      return `Aim for crisp ${category.toLowerCase()} clarity: lead with the bottom line, organize steps cleanly, and cut vague filler words so a busy engineer can scan it in seconds.`;
    }
    return 'Speak the idea aloud before typing so your explanation sounds natural under interview pressure. Use concrete everyday analogies instead of hiding behind textbook equations.';
  }
  if (slotIndex === 2) {
    if (register === 'Formal') {
      return 'Respect the reader’s time from sentence one: state brief context, make one specific low-friction ask, and keep the close warm and direct.';
    }
    if (register === 'Casual') {
      return 'Keep your voice relaxed, rhythmic, and human. Anchor your point in one vivid real-life example so it lands effortlessly.';
    }
    return 'Open with a genuine hook grounded in real hands-on work, keep paragraphs tight, and finish with one crisp takeaway your peers can actually use.';
  }
  return 'Build the scene through sound, texture, and short natural dialogue. Let pauses and small physical gestures carry the tension rather than over-explaining emotion.';
}

function buildPivotRule(slotIndex: 1 | 2 | 3): string {
  if (slotIndex === 1) {
    return 'Universal Pivot: Swap to any familiar sensor, circuit, lab project, or everyday tool you know well and focus on clear spoken flow.';
  }
  if (slotIndex === 2) {
    return 'Universal Pivot: Swap to any real email, LinkedIn reflection, team update, or everyday conversation you need right now.';
  }
  return 'Universal Pivot: Swap to any two characters, setting, or short scene that sparks your imagination today.';
}

function buildSuggestions(slotIndex: 1 | 2 | 3, register: CurriculumRegister): string[] {
  if (slotIndex === 1) {
    return register === 'Report'
      ? [
          'Lead with the core summary before listing technical details.',
          'Use concrete numbers, symptoms, or verification checks.',
          'Cut hedging fillers so every sentence carries weight.',
        ]
      : [
          'Open with a plain-English analogy anyone can picture.',
          'Walk through cause and effect in short spoken sentences.',
          'Close with one practical bench or design takeaway.',
        ];
  }
  if (slotIndex === 2) {
    return [
      'Hook in the very first line with real context or stakes.',
      'Trim weak qualifiers so your voice sounds confident and warm.',
      'End with a clear next step or memorable reflection.',
    ];
  }
  return [
    'Ground the opening sentence in sound, light, or motion.',
    'Keep spoken dialogue brief and loaded with subtext.',
    'Vary short punchy lines with longer rhythmic sentences.',
  ];
}

export const CURRICULUM_52_WEEKS: CurriculumTopic[] = RAW_CURRICULUM_ROWS.map(
  ([id, week, category, register, topic]) => {
    const slotNum = Number(id.split('.')[1] || 1) as 1 | 2 | 3;
    const quarter = (Math.min(4, Math.ceil(week / 13)) as 1 | 2 | 3 | 4);
    const pillar: TriWeeklyPillar =
      slotNum === 1
        ? 'technical-concept'
        : slotNum === 2
          ? 'linkedin-email'
          : 'creative-story';

    return {
      id,
      week,
      quarter,
      slotIndex: slotNum,
      category,
      register,
      topic,
      mode: mapRowToMode(slotNum, category),
      tone: mapRowToTone(slotNum, register, category),
      pillar,
      topicPrimer: buildPrimer(slotNum, category, register),
      pivotRule: buildPivotRule(slotNum),
      targetWords: slotNum === 3 ? 230 : register === 'Formal' ? 170 : 210,
      suggestions: buildSuggestions(slotNum, register),
    };
  }
);

export const CURRICULUM_BY_ID: ReadonlyMap<string, CurriculumTopic> = new Map(
  CURRICULUM_52_WEEKS.map((item) => [item.id, item])
);
