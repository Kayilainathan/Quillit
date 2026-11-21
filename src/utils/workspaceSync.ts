import type {
  CalendarSlot,
  StudentProfile,
  ToneSetting,
  VaultPayload,
  VocabEntry,
  WritingMode,
  WritingSession,
} from '../types';
import { deriveInternationalMetrics, MODE_LABELS, TONE_LABELS } from './analytics';

const TRACKER_SPREADSHEET_TITLE = 'Quillit · Writing Progress & Evaluation Tracker';
const LEGACY_TRACKER_SPREADSHEET_TITLE = 'Quilit — Writing Progress & Evaluation Tracker';
const ARCHIVE_DOC_TITLE = 'Quillit · Writing Journal & Evaluation Archive';
const LEGACY_ARCHIVE_DOC_TITLE = 'Quilit — Writing Journal & Evaluation Archive';

const SHEET_TABS = {
  profile: 'Profile',
  evaluations: 'Evaluations Log',
  schedule: 'Topic Rotation Schedule',
  vocabulary: 'Vocabulary & Expression Bank',
} as const;

export interface WorkspaceSyncResult {
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  docId?: string;
  docUrl?: string;
  syncedAt: string;
  summary: string;
}

async function googleFetch(
  url: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const errJson = (await res.json()) as {
        error?: { message?: string };
      };
      if (errJson?.error?.message) {
        detail = errJson.error.message;
      }
    } catch {
      // keep status text
    }
    throw new Error(`Google Workspace API error: ${detail}`);
  }
  return res;
}

async function findExistingFileByTitle(
  accessToken: string,
  title: string,
  mimeType: string
): Promise<string | null> {
  const escaped = title.replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `name = '${escaped}' and mimeType = '${mimeType}' and trashed = false`
  );
  try {
    const res = await googleFetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`,
      accessToken,
      { method: 'GET' }
    );
    const data = (await res.json()) as { files?: Array<{ id: string }> };
    return data.files?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function ensureTrackerSpreadsheet(
  accessToken: string,
  existingSpreadsheetId?: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; sheetTitles: string[] }> {
  let spreadsheetId = existingSpreadsheetId || null;

  if (spreadsheetId) {
    try {
      const checkRes = await googleFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,spreadsheetUrl,sheets.properties.title`,
        accessToken
      );
      const meta = (await checkRes.json()) as {
        spreadsheetId: string;
        spreadsheetUrl: string;
        sheets?: Array<{ properties?: { title?: string } }>;
      };
      const sheetTitles = (meta.sheets || [])
        .map((s) => s.properties?.title || '')
        .filter(Boolean);
      return {
        spreadsheetId: meta.spreadsheetId,
        spreadsheetUrl:
          meta.spreadsheetUrl ||
          `https://docs.google.com/spreadsheets/d/${meta.spreadsheetId}/edit`,
        sheetTitles,
      };
    } catch {
      spreadsheetId = null;
    }
  }

  if (!spreadsheetId) {
    spreadsheetId =
      (await findExistingFileByTitle(
        accessToken,
        TRACKER_SPREADSHEET_TITLE,
        'application/vnd.google-apps.spreadsheet'
      )) ||
      (await findExistingFileByTitle(
        accessToken,
        LEGACY_TRACKER_SPREADSHEET_TITLE,
        'application/vnd.google-apps.spreadsheet'
      ));
    if (spreadsheetId) {
      const checkRes = await googleFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,spreadsheetUrl,sheets.properties.title`,
        accessToken
      );
      const meta = (await checkRes.json()) as {
        spreadsheetId: string;
        spreadsheetUrl: string;
        sheets?: Array<{ properties?: { title?: string } }>;
      };
      return {
        spreadsheetId: meta.spreadsheetId,
        spreadsheetUrl:
          meta.spreadsheetUrl ||
          `https://docs.google.com/spreadsheets/d/${meta.spreadsheetId}/edit`,
        sheetTitles: (meta.sheets || [])
          .map((s) => s.properties?.title || '')
          .filter(Boolean),
      };
    }
  }

  // Create fresh structured spreadsheet with all 4 tabs
  const createRes = await googleFetch(
    'https://sheets.googleapis.com/v4/spreadsheets',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        properties: { title: TRACKER_SPREADSHEET_TITLE },
        sheets: [
          { properties: { title: SHEET_TABS.profile } },
          { properties: { title: SHEET_TABS.evaluations } },
          { properties: { title: SHEET_TABS.schedule } },
          { properties: { title: SHEET_TABS.vocabulary } },
        ],
      }),
    }
  );
  const created = (await createRes.json()) as {
    spreadsheetId: string;
    spreadsheetUrl: string;
  };
  return {
    spreadsheetId: created.spreadsheetId,
    spreadsheetUrl:
      created.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${created.spreadsheetId}/edit`,
    sheetTitles: Object.values(SHEET_TABS),
  };
}

async function ensureRequiredTabs(
  accessToken: string,
  spreadsheetId: string,
  existingTitles: string[]
): Promise<void> {
  const existingSet = new Set(existingTitles);
  const missing = Object.values(SHEET_TABS).filter((t) => !existingSet.has(t));
  if (missing.length === 0) return;

  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        requests: missing.map((title) => ({
          addSheet: { properties: { title } },
        })),
      }),
    }
  );
}

/**
 * Syncs profile, sessions, monthly schedule, and vocabulary bank into a structured Google Sheet.
 * MUST ONLY be called after explicit user confirmation via WorkspaceSyncConfirmModal.
 */
export async function syncVaultToGoogleSheets(
  accessToken: string,
  vault: VaultPayload
): Promise<WorkspaceSyncResult> {
  const { spreadsheetId, spreadsheetUrl, sheetTitles } =
    await ensureTrackerSpreadsheet(
      accessToken,
      vault.settings.googleSpreadsheetId
    );
  await ensureRequiredTabs(accessToken, spreadsheetId, sheetTitles);

  const profile = vault.settings.studentProfile;
  const profileRows: Array<Array<string | number | boolean>> = [
    [
      'College Degree',
      'Semester',
      'College Name',
      'Age',
      'Daily Word Goal',
      'Updated At',
    ],
    [
      profile?.collegeDegree || '',
      profile?.semester || vault.settings.semesterLabel || '',
      profile?.collegeName || '',
      profile?.age || '',
      vault.settings.dailyWordGoal,
      new Date().toISOString(),
    ],
  ];

  const evaluationRows: Array<Array<string | number>> = [
    [
      'Session ID',
      'Date',
      'Day Slot',
      'Mode',
      'Tone',
      'Topic',
      'Word Count',
      'Voice/10',
      'Clarity/10',
      'Grammar/10',
      'Tone/10',
      'Cadence/10',
      'Conciseness/10',
      'Total/60',
      'Score %',
      'CEFR',
      'IELTS',
      'TOEFL',
      'Feedback Implemented',
      'What Improved',
      'Strict Fixes',
      'Draft Content',
    ],
    ...vault.sessions.map((s) => {
      const intl = deriveInternationalMetrics(s);
      return [
        s.id,
        s.date,
        s.daySlot,
        s.mode,
        s.tone,
        s.topicDescription,
        s.wordCount,
        s.scores.naturalVoiceFlow,
        s.scores.claritySimplicity,
        s.scores.grammarMechanics,
        s.scores.toneEngagement,
        s.scores.sentenceVarietyCadence,
        s.scores.concisenessDirectness,
        s.totalScore,
        s.percentage,
        s.cefrLevel,
        intl.ieltsBand,
        intl.toeflEquivalent,
        s.feedbackImplemented,
        s.whatImproved,
        s.strictImprovements,
        s.content.slice(0, 12000),
      ];
    }),
  ];

  const scheduleRows: Array<Array<string | number | boolean>> = [
    [
      'Slot ID',
      'Date',
      'Day',
      'Slot Label',
      'Mode',
      'Tone',
      'Pillar',
      'Topic',
      'Target Words',
      'Completed',
      'Topic Primer',
    ],
    ...vault.calendarSlots.map((slot) => [
      slot.id,
      slot.scheduledDate,
      slot.dayOfWeek,
      slot.slotLabel,
      slot.mode,
      slot.tone,
      slot.pillar || '',
      slot.topic,
      slot.targetWords,
      slot.completed ? 'Completed' : 'Pending',
      slot.topicPrimer || '',
    ]),
  ];

  const vocabRows: Array<Array<string | boolean>> = [
    [
      'Vocab ID',
      'Date Added',
      'Mode',
      'Used',
      'Better Alternative',
      'Explanation',
      'Context',
      'Status',
    ],
    ...vault.vocabulary.map((v) => [
      v.id,
      v.dateAdded,
      v.mode,
      v.used,
      v.betterAlternative,
      v.explanation,
      v.contextSnippet,
      v.mastered ? 'Mastered' : 'Practicing',
    ]),
  ];

  // Clear existing ranges first so deleted rows don't linger
  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        ranges: [
          `'${SHEET_TABS.profile}'!A1:Z10`,
          `'${SHEET_TABS.evaluations}'!A1:Z2000`,
          `'${SHEET_TABS.schedule}'!A1:Z1000`,
          `'${SHEET_TABS.vocabulary}'!A1:Z2000`,
        ],
      }),
    }
  );

  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: `'${SHEET_TABS.profile}'!A1`, values: profileRows },
          { range: `'${SHEET_TABS.evaluations}'!A1`, values: evaluationRows },
          { range: `'${SHEET_TABS.schedule}'!A1`, values: scheduleRows },
          { range: `'${SHEET_TABS.vocabulary}'!A1`, values: vocabRows },
        ],
      }),
    }
  );

  const syncedAt = new Date().toISOString();
  return {
    spreadsheetId,
    spreadsheetUrl,
    syncedAt,
    summary: `Synced ${vault.sessions.length} session${vault.sessions.length === 1 ? '' : 's'}, ${vault.calendarSlots.length} scheduled task${vault.calendarSlots.length === 1 ? '' : 's'}, and ${vault.vocabulary.length} vocabulary item${vault.vocabulary.length === 1 ? '' : 's'} to Google Sheets.`,
  };
}

/**
 * Reads back saved profile, schedule, sessions, and vocabulary from the user's Quilit Google Sheet.
 */
export async function pullVaultFromGoogleSheets(
  accessToken: string,
  existingSpreadsheetId?: string
): Promise<{
  spreadsheetId: string;
  spreadsheetUrl: string;
  profile?: StudentProfile;
  sessions: WritingSession[];
  calendarSlots: CalendarSlot[];
  vocabulary: VocabEntry[];
} | null> {
  const spreadsheetId =
    existingSpreadsheetId ||
    (await findExistingFileByTitle(
      accessToken,
      TRACKER_SPREADSHEET_TITLE,
      'application/vnd.google-apps.spreadsheet'
    )) ||
    (await findExistingFileByTitle(
      accessToken,
      LEGACY_TRACKER_SPREADSHEET_TITLE,
      'application/vnd.google-apps.spreadsheet'
    ));
  if (!spreadsheetId) return null;

  const ranges = [
    `'${SHEET_TABS.profile}'!A2:F2`,
    `'${SHEET_TABS.evaluations}'!A2:V500`,
    `'${SHEET_TABS.schedule}'!A2:K500`,
    `'${SHEET_TABS.vocabulary}'!A2:H1000`,
  ]
    .map((r) => `ranges=${encodeURIComponent(r)}`)
    .join('&');

  const res = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${ranges}`,
    accessToken
  );
  const data = (await res.json()) as {
    valueRanges?: Array<{ values?: string[][] }>;
  };

  const profileRow = data.valueRanges?.[0]?.values?.[0];
  let profile: StudentProfile | undefined;
  if (profileRow && (profileRow[0] || profileRow[2])) {
    const parsedAge = Number(profileRow[3]);
    profile = {
      collegeDegree: String(profileRow[0] || ''),
      semester: String(profileRow[1] || ''),
      collegeName: String(profileRow[2] || ''),
      age: Number.isFinite(parsedAge) && parsedAge >= 14 ? parsedAge : 20,
      onboardingCompleted: true,
    };
  }

  const evalRows = data.valueRanges?.[1]?.values ?? [];
  const sessions: WritingSession[] = evalRows
    .filter((r) => r[0] && r[1])
    .map((r) => {
      const scores = {
        naturalVoiceFlow: Number(r[7]) || 7,
        claritySimplicity: Number(r[8]) || 7,
        grammarMechanics: Number(r[9]) || 7,
        toneEngagement: Number(r[10]) || 7,
        sentenceVarietyCadence: Number(r[11]) || 7,
        concisenessDirectness: Number(r[12]) || 7,
      };
      return {
        id: String(r[0]),
        date: String(r[1]),
        daySlot: String(r[2] || 'Studio Session'),
        mode: (r[3] as WritingMode) || 'technical',
        promptCategory: MODE_LABELS[(r[3] as WritingMode) || 'technical'] || 'Technical & Interview',
        tone: (r[4] as ToneSetting) || 'academic-technical',
        topicDescription: String(r[5] || 'Untitled'),
        wordCount: Number(r[6]) || 0,
        scores,
        totalScore: Number(r[13]) || 42,
        percentage: Number(r[14]) || 70,
        cefrLevel: String(r[15] || 'B2'),
        toneVerdict: '',
        flowVerdict: '',
        feedbackImplemented:
          (['Baseline', 'Yes', 'Partial', 'No'].includes(String(r[18]))
            ? (r[18] as WritingSession['feedbackImplemented'])
            : 'Baseline'),
        whatImproved: String(r[19] || ''),
        strictImprovements: String(r[20] || ''),
        content: String(r[21] || ''),
        grammarFixes: [],
        vocabUpgrades: [],
        status: 'Completed',
        createdAt: `${String(r[1])}T12:00:00.000Z`,
      };
    });

  const schedRows = data.valueRanges?.[2]?.values ?? [];
  const calendarSlots: CalendarSlot[] = schedRows
    .filter((r) => r[0] && r[1] && r[7])
    .map((r) => ({
      id: String(r[0]),
      scheduledDate: String(r[1]),
      dayOfWeek: String(r[2] || 'Wednesday'),
      slotLabel: String(r[3] || 'Writing Slot'),
      slotTime: '18:19',
      mode: (r[4] as WritingMode) || 'technical',
      tone: (r[5] as ToneSetting) || 'academic-technical',
      pillar: (r[6] || undefined) as CalendarSlot['pillar'],
      promptCategory: MODE_LABELS[(r[4] as WritingMode) || 'technical'] || 'Writing Practice',
      topic: String(r[7]),
      targetWords: Number(r[8]) || 200,
      completed: String(r[9]).toLowerCase() === 'completed',
      topicPrimer: r[10] ? String(r[10]) : undefined,
      isTriWeekly: true,
    }));

  const vocRows = data.valueRanges?.[3]?.values ?? [];
  const vocabulary: VocabEntry[] = vocRows
    .filter((r) => r[0] && r[3] && r[4])
    .map((r) => ({
      id: String(r[0]),
      dateAdded: String(r[1] || new Date().toISOString().slice(0, 10)),
      mode: (r[2] as WritingMode) || 'technical',
      used: String(r[3]),
      betterAlternative: String(r[4]),
      explanation: String(r[5] || ''),
      contextSnippet: String(r[6] || ''),
      mastered: String(r[7]).toLowerCase() === 'mastered',
    }));

  return {
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    profile,
    sessions,
    calendarSlots,
    vocabulary,
  };
}

function buildArchiveDocBody(vault: VaultPayload): string {
  const profile = vault.settings.studentProfile;
  const lines: string[] = [
    'QUILLIT · WRITING JOURNAL & EVALUATION ARCHIVE',
    `Last Synced: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
  ];

  if (profile?.onboardingCompleted) {
    lines.push(
      `Student Profile: ${profile.collegeDegree} · ${profile.semester} · ${profile.collegeName} (Age ${profile.age})`
    );
  }
  lines.push('', '============================================================', '');

  if (vault.sessions.length === 0) {
    lines.push('No evaluated writing sessions logged yet.');
  } else {
    const ordered = [...vault.sessions].sort((a, b) =>
      b.date.localeCompare(a.date)
    );
    for (const s of ordered) {
      const intl = deriveInternationalMetrics(s);
      lines.push(
        `${s.date} — ${s.topicDescription}`,
        `Mode: ${MODE_LABELS[s.mode] || s.mode} | Tone: ${TONE_LABELS[s.tone] || s.tone} | Words: ${s.wordCount}`,
        `Score: ${s.totalScore}/60 (${s.percentage}%) | CEFR ${s.cefrLevel} | IELTS ${intl.ieltsBand.toFixed(1)} | TOEFL ${intl.toeflEquivalent}/30`,
        '',
        s.content,
        '',
        `What Improved: ${s.whatImproved || '—'}`,
        `Strict Feedback: ${s.strictImprovements || '—'}`,
        '',
        '------------------------------------------------------------',
        ''
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Syncs the full writing archive into a Google Doc.
 * MUST ONLY be called after explicit user confirmation via WorkspaceSyncConfirmModal.
 */
export async function syncVaultToGoogleDocs(
  accessToken: string,
  vault: VaultPayload
): Promise<WorkspaceSyncResult> {
  let docId = vault.settings.googleDocId || null;

  if (!docId) {
    docId =
      (await findExistingFileByTitle(
        accessToken,
        ARCHIVE_DOC_TITLE,
        'application/vnd.google-apps.document'
      )) ||
      (await findExistingFileByTitle(
        accessToken,
        LEGACY_ARCHIVE_DOC_TITLE,
        'application/vnd.google-apps.document'
      ));
  }

  if (!docId) {
    const createRes = await googleFetch(
      'https://docs.googleapis.com/v1/documents',
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ title: ARCHIVE_DOC_TITLE }),
      }
    );
    const created = (await createRes.json()) as { documentId: string };
    docId = created.documentId;
  }

  // Inspect current document endIndex so we replace cleanly without empty-range errors
  const getRes = await googleFetch(
    `https://docs.googleapis.com/v1/documents/${docId}?fields=body.content.endIndex`,
    accessToken
  );
  const docData = (await getRes.json()) as {
    body?: { content?: Array<{ endIndex?: number }> };
  };
  const contentBlocks = docData.body?.content ?? [];
  const endIndex =
    contentBlocks.length > 0
      ? Number(contentBlocks[contentBlocks.length - 1].endIndex || 1)
      : 1;

  const requests: Array<Record<string, unknown>> = [];
  if (endIndex > 2) {
    requests.push({
      deleteContentRange: {
        range: { startIndex: 1, endIndex: endIndex - 1 },
      },
    });
  }
  requests.push({
    insertText: {
      location: { index: 1 },
      text: buildArchiveDocBody(vault),
    },
  });

  await googleFetch(
    `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ requests }),
    }
  );

  const syncedAt = new Date().toISOString();
  return {
    docId,
    docUrl: `https://docs.google.com/document/d/${docId}/edit`,
    syncedAt,
    summary: `Updated Google Doc archive with ${vault.sessions.length} writing session${vault.sessions.length === 1 ? '' : 's'}.`,
  };
}
