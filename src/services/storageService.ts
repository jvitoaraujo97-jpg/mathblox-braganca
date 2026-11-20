import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { INITIAL_STUDENTS } from '../data/students';
import { getWorldIdForGrade } from '../data/worlds';
import { normalizeCosmeticId } from '../three/cosmeticBuilder';
import { GradeLevel, MovementStyle, StudentProfile } from '../types/game';

const OFFLINE_LOCAL_STORAGE_KEY = 'mathblox_obby_students_v1';
const LAST_STUDENT_ID_KEY = 'mathblox_last_student_id';
const PENDING_SAVES_KEY = 'mathblox_pending_saves_v1';

function cleanEnvVar(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/^["']|["']$/g, '').trim();
}

const rawSupabaseUrl = cleanEnvVar(import.meta.env.VITE_SUPABASE_URL);
const rawSupabaseAnonKey = cleanEnvVar(import.meta.env.VITE_SUPABASE_ANON_KEY);
const supabaseKeyPreview = rawSupabaseAnonKey
  ? `${rawSupabaseAnonKey.slice(0, 12)}${rawSupabaseAnonKey.length > 12 ? '...' : ''}`
  : '';

function isValidSupabaseConfig(url?: string, key?: string): boolean {
  if (!url || !key) return false;
  if (
    url.includes('YOUR_') ||
    url.includes('seu-projeto') ||
    url.includes('example.com') ||
    key.includes('YOUR_') ||
    key.includes('sua-chave')
  ) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.hostname.includes('.')
    );
  } catch {
    return false;
  }
}

let supabase: SupabaseClient | null = null;
if (isValidSupabaseConfig(rawSupabaseUrl, rawSupabaseAnonKey)) {
  try {
    supabase = createClient(rawSupabaseUrl!, rawSupabaseAnonKey!, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  } catch {
    supabase = null;
  }
}

export function getSupabaseClient(): SupabaseClient | null {
  return supabase;
}

export function getStorageMode(): 'supabase' | 'local' {
  return supabase ? 'supabase' : 'local';
}

// =============================================================================
// STRICT WHITELISTED ROW MAPPING (ZERO PGRST204 EXTRA KEYS)
// =============================================================================
export interface StudentDbRow {
  id: string;
  name: string;
  grade: string;
  world_id: number;
  school: string;
  pin: string;
  xp: number;
  weekly_xp: number;
  coins: number;
  questions_answered: number;
  questions_correct: number;
  best_streak: number;
  unlocked_items: string[];
  equipped_jersey: string | null;
  equipped_hat: string | null;
  equipped_back: string | null;
  equipped_aura: string | null;
  movement_style: string;
  aura_power: number;
  equipped_title: string | null;
  unlocked_titles: string[];
  avatar_color: string;
  updated_at: string;
}

// Tracks any optional column absent from an older remote Postgres schema so PGRST204 never blocks saves
const unsupportedDbColumns = new Set<string>();

export function sanitizeStudent(s: StudentProfile): StudentProfile {
  const grade = (s.grade || '5º Ano') as GradeLevel;
  return {
    id: String(s.id),
    name: String(s.name || 'Aluno').trim(),
    grade,
    worldId: typeof s.worldId === 'number' && s.worldId > 0 ? s.worldId : getWorldIdForGrade(grade),
    school: String(s.school || 'Escola').trim(),
    pin: String(s.pin || '1234').replace(/\D/g, '').slice(0, 4) || '1234',
    xp: Math.max(0, Math.round(Number(s.xp) || 0)),
    weeklyXp: Math.max(0, Math.round(Number(s.weeklyXp) || 0)),
    coins: Math.max(0, Math.round(Number(s.coins) || 0)),
    questionsAnswered: Math.max(0, Math.round(Number(s.questionsAnswered) || 0)),
    questionsCorrect: Math.max(0, Math.round(Number(s.questionsCorrect) || 0)),
    bestStreak: Math.max(0, Math.round(Number(s.bestStreak) || 0)),
    unlockedItems: Array.isArray(s.unlockedItems)
      ? Array.from(new Set(s.unlockedItems.map((id) => normalizeCosmeticId(id) || id)))
      : [],
    equippedHat: normalizeCosmeticId(s.equippedHat ?? null),
    equippedJersey: s.equippedJersey || null,
    equippedBack: s.equippedBack ?? null,
    equippedAura: s.equippedAura ?? null,
    avatarColor: s.avatarColor || '#3B82F6',
    movementStyle: (s.movementStyle || 'classic') as MovementStyle,
    auraPower: Math.max(0, Math.round(Number(s.auraPower) || 0)),
    equippedTitle: s.equippedTitle ?? null,
    unlockedTitles: Array.isArray(s.unlockedTitles) ? [...s.unlockedTitles] : [],
    updatedAt: s.updatedAt || new Date().toISOString(),
  };
}

/**
 * Strict column whitelist for the Supabase `students` table.
 * NEVER spreads `...student` to prevent PGRST204 unknown column errors.
 */
export function mapStudentToRow(student: StudentProfile): Record<string, unknown> {
  const clean = sanitizeStudent(student);
  const fullRow: StudentDbRow = {
    id: clean.id,
    name: clean.name,
    grade: clean.grade,
    world_id: clean.worldId,
    school: clean.school,
    pin: clean.pin,
    xp: clean.xp,
    weekly_xp: clean.weeklyXp ?? 0,
    coins: clean.coins,
    questions_answered: clean.questionsAnswered,
    questions_correct: clean.questionsCorrect,
    best_streak: clean.bestStreak,
    unlocked_items: clean.unlockedItems,
    equipped_jersey: clean.equippedJersey ?? null,
    equipped_hat: clean.equippedHat ?? null,
    equipped_back: clean.equippedBack ?? null,
    equipped_aura: clean.equippedAura ?? null,
    movement_style: clean.movementStyle ?? 'classic',
    aura_power: clean.auraPower ?? 0,
    equipped_title: clean.equippedTitle ?? null,
    unlocked_titles: clean.unlockedTitles ?? [],
    avatar_color: clean.avatarColor,
    updated_at: new Date().toISOString(),
  };

  if (unsupportedDbColumns.size === 0) {
    return fullRow as unknown as Record<string, unknown>;
  }
  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fullRow)) {
    if (!unsupportedDbColumns.has(k)) {
      filtered[k] = v;
    }
  }
  return filtered;
}

/**
 * Maps a raw row returned by Supabase `students` (snake_case) back into `StudentProfile`.
 */
export function mapRowToStudent(row: Record<string, unknown>): StudentProfile {
  const grade = ((row.grade as GradeLevel) || '5º Ano') as GradeLevel;
  const rawWorldId = row.world_id ?? row.worldId;
  const worldId =
    typeof rawWorldId === 'number' && rawWorldId > 0
      ? rawWorldId
      : getWorldIdForGrade(grade);

  const rawUnlocked = row.unlocked_items ?? row.unlockedItems;
  const unlockedItems = Array.isArray(rawUnlocked)
    ? rawUnlocked.map((id) => normalizeCosmeticId(String(id)) || String(id))
    : [];

  const rawUnlockedTitles = row.unlocked_titles ?? row.unlockedTitles;
  const unlockedTitles = Array.isArray(rawUnlockedTitles)
    ? rawUnlockedTitles.map((t) => String(t))
    : [];

  return sanitizeStudent({
    id: String(row.id || ''),
    name: String(row.name || 'Aluno'),
    grade,
    worldId,
    school: String(row.school || 'Escola'),
    pin: String(row.pin || '1234'),
    xp: Number(row.xp ?? 0),
    weeklyXp: Number(row.weekly_xp ?? row.weeklyXp ?? 0),
    coins: Number(row.coins ?? 0),
    questionsAnswered: Number(row.questions_answered ?? row.questionsAnswered ?? 0),
    questionsCorrect: Number(row.questions_correct ?? row.questionsCorrect ?? 0),
    bestStreak: Number(row.best_streak ?? row.bestStreak ?? 0),
    unlockedItems,
    equippedHat: (row.equipped_hat ?? row.equippedHat ?? null) as string | null,
    equippedJersey: (row.equipped_jersey ?? row.equippedJersey ?? null) as string | null,
    equippedBack: (row.equipped_back ?? row.equippedBack ?? null) as string | null,
    equippedAura: (row.equipped_aura ?? row.equippedAura ?? null) as string | null,
    avatarColor: String(row.avatar_color ?? row.avatarColor ?? '#3B82F6'),
    movementStyle: String(
      row.movement_style ?? row.movementStyle ?? 'classic'
    ) as MovementStyle,
    auraPower: Number(row.aura_power ?? row.auraPower ?? 0),
    equippedTitle: (row.equipped_title ?? row.equippedTitle ?? null) as string | null,
    unlockedTitles,
    updatedAt: String(row.updated_at ?? row.updatedAt ?? new Date().toISOString()),
  });
}

function sortStudentsByXp(list: StudentProfile[]): StudentProfile[] {
  return [...list].sort((a, b) => {
    if (b.xp !== a.xp) return b.xp - a.xp;
    if (b.questionsCorrect !== a.questionsCorrect) return b.questionsCorrect - a.questionsCorrect;
    return a.name.localeCompare(b.name, 'pt-BR');
  });
}

// =============================================================================
// SYNC DIAGNOSTICS & STATUS SUBSCRIPTION (FOR TOP BADGE & ADMIN PANEL)
// =============================================================================
export type SaveSyncState = 'idle' | 'saving' | 'saved' | 'offline_retry';
export type CloudConnectionStatus = 'checking' | 'connected' | 'error' | 'offline';

export interface CloudDiagnostics {
  storageMode: 'supabase' | 'local';
  connectionStatus: CloudConnectionStatus;
  connectionError: string | null;
  supabaseUrl: string;
  supabaseKeyPrefix: string;
  syncState: SaveSyncState;
  lastError: string | null;
  lastErrorAt: string | null;
  lastSavedAt: string | null;
  cloudStudentCount: number | null;
  pendingCount: number;
}

const diagnostics: CloudDiagnostics = {
  storageMode: supabase ? 'supabase' : 'local',
  connectionStatus: supabase ? 'checking' : 'offline',
  connectionError: null,
  supabaseUrl: rawSupabaseUrl,
  supabaseKeyPrefix: supabaseKeyPreview,
  syncState: 'idle',
  lastError: null,
  lastErrorAt: null,
  lastSavedAt: null,
  cloudStudentCount: null,
  pendingCount: 0,
};

function formatSupabaseError(err: unknown): string {
  if (!err) return 'Erro desconhecido';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || String(err);
  if (typeof err === 'object') {
    const e = err as { code?: string; message?: string; details?: string; hint?: string };
    const parts: string[] = [];
    if (e.code) parts.push(`[${e.code}]`);
    if (e.message) parts.push(e.message);
    if (e.details && e.details !== e.message) parts.push(`Detalhes: ${e.details}`);
    if (e.hint) parts.push(`Dica: ${e.hint}`);
    if (parts.length > 0) return parts.join(' — ');
  }
  return String(err);
}

type DiagnosticsListener = (state: CloudDiagnostics) => void;
const diagnosticsListeners = new Set<DiagnosticsListener>();
let savedResetTimer: number | null = null;

function emitDiagnostics(): void {
  const snapshot: CloudDiagnostics = { ...diagnostics };
  diagnosticsListeners.forEach((fn) => fn(snapshot));
}

function setSyncState(next: SaveSyncState): void {
  if (savedResetTimer !== null) {
    window.clearTimeout(savedResetTimer);
    savedResetTimer = null;
  }
  diagnostics.syncState = next;
  if (next === 'saved') {
    diagnostics.lastSavedAt = new Date().toISOString();
    savedResetTimer = window.setTimeout(() => {
      if (diagnostics.syncState === 'saved') {
        diagnostics.syncState = 'idle';
        emitDiagnostics();
      }
    }, 1600);
  }
  emitDiagnostics();
}

function recordWriteError(msg: string): void {
  diagnostics.lastError = msg;
  diagnostics.lastErrorAt = new Date().toISOString();
  emitDiagnostics();
}

export function getCloudDiagnostics(): CloudDiagnostics {
  return { ...diagnostics };
}

export function subscribeCloudDiagnostics(listener: DiagnosticsListener): () => void {
  diagnosticsListeners.add(listener);
  listener(getCloudDiagnostics());
  return () => {
    diagnosticsListeners.delete(listener);
  };
}

// =============================================================================
// LAST LOGGED-IN STUDENT ID CONVENIENCE HELPER (ONLY ID IN LOCALSTORAGE)
// =============================================================================
export function getLastStudentId(): string | null {
  try {
    return localStorage.getItem(LAST_STUDENT_ID_KEY);
  } catch {
    return null;
  }
}

export function setLastStudentId(studentId: string | null): void {
  try {
    if (studentId) {
      localStorage.setItem(LAST_STUDENT_ID_KEY, studentId);
    } else {
      localStorage.removeItem(LAST_STUDENT_ID_KEY);
    }
  } catch {
    // Ignore restricted sandbox errors
  }
}

// =============================================================================
// OFFLINE RETRY QUEUE (ONLY FOR FAILED WRITES WHEN CELLULAR SIGNAL DROPS)
// =============================================================================
function readPendingQueue(): Record<string, StudentProfile> {
  try {
    const raw = localStorage.getItem(PENDING_SAVES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, StudentProfile>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePendingQueue(queue: Record<string, StudentProfile>): void {
  try {
    const keys = Object.keys(queue);
    diagnostics.pendingCount = keys.length;
    if (keys.length === 0) {
      localStorage.removeItem(PENDING_SAVES_KEY);
    } else {
      localStorage.setItem(PENDING_SAVES_KEY, JSON.stringify(queue));
    }
    emitDiagnostics();
  } catch {
    // Ignore quota errors
  }
}

function enqueuePendingSave(student: StudentProfile): void {
  const queue = readPendingQueue();
  queue[student.id] = sanitizeStudent(student);
  writePendingQueue(queue);
}

function removePendingSave(studentId: string): void {
  const queue = readPendingQueue();
  if (queue[studentId]) {
    delete queue[studentId];
    writePendingQueue(queue);
  }
}

// Initialize pending count on module load
diagnostics.pendingCount = Object.keys(readPendingQueue()).length;

// =============================================================================
// RESILIENT SUPABASE UPSERT HELPER (HANDLES PGRST204 AUTOMATICALLY)
// =============================================================================
function extractMissingColumnFromPgrst204(error: { code?: string; message?: string }): string | null {
  if (!error) return null;
  const msg = error.message || '';
  if (error.code === 'PGRST204' || msg.includes('schema cache')) {
    const match = msg.match(/'([^']+)'\s+column/i);
    if (match && match[1]) return match[1];
  }
  return null;
}

async function upsertStudentRowOnce(
  student: StudentProfile
): Promise<{ data: StudentProfile | null; errorMsg: string | null }> {
  if (!supabase) {
    return { data: null, errorMsg: 'Supabase não configurado.' };
  }

  // Allow up to 6 schema-adaptation passes if an older table lacks optional columns
  for (let pass = 0; pass < 6; pass++) {
    const payload = mapStudentToRow(student);
    const { data, error } = await supabase
      .from('students')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();

    if (!error && data) {
      return { data: mapRowToStudent(data as Record<string, unknown>), errorMsg: null };
    }

    const missingCol = error ? extractMissingColumnFromPgrst204(error) : null;
    if (missingCol && !unsupportedDbColumns.has(missingCol)) {
      unsupportedDbColumns.add(missingCol);
      continue;
    }

    const errText = error
      ? `${error.code ? `[${error.code}] ` : ''}${error.message}`
      : 'Resposta vazia do Supabase';
    return { data: null, errorMsg: errText };
  }

  return { data: null, errorMsg: 'Falha de esquema ao gravar no Supabase.' };
}

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

// =============================================================================
// OFFLINE-ONLY LOCAL FALLBACK (USED ONLY WHEN SUPABASE ENV VARS ARE ABSENT)
// =============================================================================
function readOfflineFallbackStudents(): StudentProfile[] {
  try {
    const raw = localStorage.getItem(OFFLINE_LOCAL_STORAGE_KEY);
    if (!raw) {
      const seeded = sortStudentsByXp(
        INITIAL_STUDENTS.map((s) => sanitizeStudent({ ...s, unlockedItems: [...s.unlockedItems] }))
      );
      localStorage.setItem(OFFLINE_LOCAL_STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as StudentProfile[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return sortStudentsByXp(INITIAL_STUDENTS.map(sanitizeStudent));
    }
    return sortStudentsByXp(parsed.map(sanitizeStudent));
  } catch {
    return sortStudentsByXp(INITIAL_STUDENTS.map(sanitizeStudent));
  }
}

function writeOfflineFallbackStudents(list: StudentProfile[]): void {
  try {
    localStorage.setItem(OFFLINE_LOCAL_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage quota errors
  }
}

// =============================================================================
// CORE PUBLIC CLOUD API
// =============================================================================

/**
 * Fetches the authoritative student list directly from Supabase (`ORDER BY xp DESC`).
 * Never overwrites Supabase with stale localStorage cache!
 */
export async function fetchStudentsFromCloud(): Promise<StudentProfile[]> {
  if (!supabase) {
    diagnostics.connectionStatus = 'offline';
    diagnostics.connectionError = null;
    emitDiagnostics();
    return readOfflineFallbackStudents();
  }

  // First flush any queued offline saves if we are back online (never block SELECT verification)
  try {
    await flushPendingSaves();
  } catch {
    // Handled inside flushPendingSaves
  }

  let data: unknown[] | null = null;
  try {
    const res = await supabase
      .from('students')
      .select('*')
      .order('xp', { ascending: false });

    if (res.error) {
      const fullErr = formatSupabaseError(res.error);
      diagnostics.connectionStatus = 'error';
      diagnostics.connectionError = fullErr;
      recordWriteError(`Erro ao carregar alunos: ${fullErr}`);
      throw new Error(fullErr);
    }
    data = res.data;
  } catch (err) {
    const fullErr = formatSupabaseError(err);
    diagnostics.connectionStatus = 'error';
    diagnostics.connectionError = fullErr;
    recordWriteError(`Erro ao carregar alunos: ${fullErr}`);
    throw err instanceof Error ? err : new Error(fullErr);
  }

  // Mark connected ONLY after SELECT succeeded without error
  diagnostics.connectionStatus = 'connected';
  diagnostics.connectionError = null;

  if (data && data.length > 0) {
    const mapped = sortStudentsByXp(
      (data as Record<string, unknown>[]).map(mapRowToStudent)
    );
    diagnostics.cloudStudentCount = mapped.length;
    emitDiagnostics();
    return mapped;
  }

  // Seed initial 14 students ONLY when cloud table is genuinely empty
  const seeded: StudentProfile[] = [];
  for (const init of INITIAL_STUDENTS) {
    const res = await upsertStudentRowOnce(init);
    if (res.data) seeded.push(res.data);
  }
  const sorted = sortStudentsByXp(seeded.length > 0 ? seeded : INITIAL_STUDENTS.map(sanitizeStudent));
  diagnostics.cloudStudentCount = sorted.length;
  emitDiagnostics();
  return sorted;
}

export async function loadStudents(): Promise<StudentProfile[]> {
  if (!supabase) {
    return readOfflineFallbackStudents();
  }
  try {
    return await fetchStudentsFromCloud();
  } catch {
    // Only if initial cloud fetch fails due to offline mobile start, avoid blank screen
    return [];
  }
}

/**
 * Fetches the latest single student row directly from Supabase by ID (for login & session continuity).
 */
export async function fetchStudentByIdFromCloud(
  studentId: string
): Promise<StudentProfile | null> {
  if (!supabase) {
    return readOfflineFallbackStudents().find((s) => s.id === studentId) || null;
  }

  try {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('id', studentId)
      .maybeSingle();

    if (error) {
      const fullErr = formatSupabaseError(error);
      diagnostics.connectionStatus = 'error';
      diagnostics.connectionError = fullErr;
      recordWriteError(`Erro ao revalidar aluno: ${fullErr}`);
      return null;
    }

    diagnostics.connectionStatus = 'connected';
    diagnostics.connectionError = null;
    emitDiagnostics();

    if (!data) return null;
    return mapRowToStudent(data as Record<string, unknown>);
  } catch (err) {
    const fullErr = formatSupabaseError(err);
    diagnostics.connectionStatus = 'error';
    diagnostics.connectionError = fullErr;
    recordWriteError(`Erro ao revalidar aluno: ${fullErr}`);
    return null;
  }
}

/**
 * Creates a brand-new student account with MANDATORY cloud confirmation before allowing entry.
 */
export async function createNewStudent(input: {
  name: string;
  school: string;
  grade: GradeLevel;
  pin: string;
  avatarColor: string;
}): Promise<{ student: StudentProfile }> {
  const newStudent: StudentProfile = sanitizeStudent({
    id: `stu-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: input.name.trim(),
    school: input.school.trim(),
    grade: input.grade,
    worldId: getWorldIdForGrade(input.grade),
    pin: input.pin.replace(/\D/g, '').slice(0, 4) || '1234',
    xp: 0,
    coins: 50,
    questionsAnswered: 0,
    questionsCorrect: 0,
    bestStreak: 0,
    unlockedItems: [],
    equippedHat: null,
    equippedJersey: null,
    equippedBack: null,
    equippedAura: null,
    avatarColor: input.avatarColor,
    movementStyle: 'classic',
    auraPower: 0,
    equippedTitle: null,
    unlockedTitles: [],
    updatedAt: new Date().toISOString(),
  });

  if (!supabase) {
    const current = readOfflineFallbackStudents();
    const next = sortStudentsByXp([...current, newStudent]);
    writeOfflineFallbackStudents(next);
    setLastStudentId(newStudent.id);
    setSyncState('saved');
    return { student: newStudent };
  }

  setSyncState('saving');
  const { data, errorMsg } = await upsertStudentRowOnce(newStudent);

  if (!data || errorMsg) {
    recordWriteError(`Cadastro falhou: ${errorMsg || 'Erro desconhecido'}`);
    setSyncState('offline_retry');
    throw new Error(
      'Não foi possível salvar seu cadastro. Verifique sua internet e tente novamente.'
    );
  }

  setLastStudentId(data.id);
  if (typeof diagnostics.cloudStudentCount === 'number') {
    diagnostics.cloudStudentCount += 1;
  }
  setSyncState('saved');
  return { student: data };
}

/**
 * Central guaranteed progress persistence with automatic 3x retry (1s interval) + offline replay queue.
 */
export async function saveStudentProgress(
  updatedStudent: StudentProfile
): Promise<{ student: StudentProfile; synced: boolean; error?: string }> {
  const clean = sanitizeStudent({
    ...updatedStudent,
    updatedAt: new Date().toISOString(),
  });

  if (!supabase) {
    const current = readOfflineFallbackStudents();
    const idx = current.findIndex((s) => s.id === clean.id);
    const next = [...current];
    if (idx >= 0) next[idx] = clean;
    else next.push(clean);
    writeOfflineFallbackStudents(sortStudentsByXp(next));
    setSyncState('saved');
    return { student: clean, synced: true };
  }

  setSyncState('saving');
  let lastErr = '';

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data, errorMsg } = await upsertStudentRowOnce(clean);
      if (data && !errorMsg) {
        removePendingSave(clean.id);
        setSyncState('saved');
        return { student: data, synced: true };
      }
      lastErr = errorMsg || 'Erro desconhecido';
    } catch (err) {
      lastErr = err instanceof Error ? err.message : 'Falha de conexão';
    }

    if (attempt < 3) {
      await delayMs(1000);
    }
  }

  // All 3 attempts failed: queue locally for automatic retry when connection returns
  enqueuePendingSave(clean);
  recordWriteError(`Salvamento pendente (${clean.name}): ${lastErr}`);
  setSyncState('offline_retry');
  return { student: clean, synced: false, error: lastErr };
}

/**
 * Replays any locally queued saves once network connectivity is restored.
 */
let flushingQueue = false;
export async function flushPendingSaves(): Promise<void> {
  if (!supabase || flushingQueue) return;
  const queue = readPendingQueue();
  const entries = Object.values(queue);
  if (entries.length === 0) return;

  flushingQueue = true;
  try {
    let anySucceeded = false;
    for (const st of entries) {
      try {
        const { data, errorMsg } = await upsertStudentRowOnce(st);
        if (data && !errorMsg) {
          removePendingSave(st.id);
          anySucceeded = true;
        }
      } catch {
        // Keep in queue for next retry
      }
    }
    if (anySucceeded && Object.keys(readPendingQueue()).length === 0) {
      setSyncState('saved');
    }
  } finally {
    flushingQueue = false;
  }
}

// Automatically replay offline queue when mobile device regains internet
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void flushPendingSaves();
  });
}

export async function deleteStudent(studentId: string): Promise<boolean> {
  removePendingSave(studentId);
  if (getLastStudentId() === studentId) {
    setLastStudentId(null);
  }

  if (!supabase) {
    const next = readOfflineFallbackStudents().filter((s) => s.id !== studentId);
    writeOfflineFallbackStudents(next);
    return true;
  }

  const { error } = await supabase.from('students').delete().eq('id', studentId);
  if (error) {
    recordWriteError(`Erro ao excluir aluno: ${error.message}`);
    return false;
  }
  if (typeof diagnostics.cloudStudentCount === 'number') {
    diagnostics.cloudStudentCount = Math.max(0, diagnostics.cloudStudentCount - 1);
    emitDiagnostics();
  }
  return true;
}

// =============================================================================
// REALTIME RANKING SUBSCRIPTION (`students-ranking-live`)
// =============================================================================
export interface StudentsRealtimeEvent {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  student?: StudentProfile;
  deletedId?: string;
}

export function subscribeStudentsRealtime(
  onEvent: (ev: StudentsRealtimeEvent) => void
): () => void {
  if (!supabase) {
    return () => {};
  }

  const client = supabase;
  const channel: RealtimeChannel = client
    .channel('students-ranking-live')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'students' },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          const oldRec = payload.old as Record<string, unknown> | null;
          if (oldRec && oldRec.id) {
            onEvent({ type: 'DELETE', deletedId: String(oldRec.id) });
          }
          return;
        }
        const newRec = payload.new as Record<string, unknown> | null;
        if (newRec && newRec.id) {
          onEvent({
            type: payload.eventType === 'INSERT' ? 'INSERT' : 'UPDATE',
            student: mapRowToStudent(newRec),
          });
        }
      }
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
