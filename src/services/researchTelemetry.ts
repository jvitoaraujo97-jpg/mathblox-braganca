import { ORDERED_GRADES } from '../data/worlds';
import { StudentProfile } from '../types/game';
import { getSupabaseClient } from './storageService';

// =============================================================================
// 1. NORMALIZAÇÃO INTELIGENTE DE NOMES DE ESCOLAS (BATALHA DE COLÉGIOS)
// =============================================================================

const LOWERCASE_WORDS = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'em', 'no', 'na', 'para']);

function stripAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function toPortugueseTitleCase(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'Escola Não Informada';
  return cleaned
    .split(' ')
    .map((word, idx) => {
      const lower = word.toLowerCase();
      if (idx > 0 && LOWERCASE_WORDS.has(lower)) {
        return lower;
      }
      // Preserve short all-uppercase acronyms (e.g., EMEF, EE, E.M.E.F.)
      if (word.length <= 5 && word === word.toUpperCase() && /[A-Z]/.test(word)) {
        return word;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/**
 * Standardizes school spelling variations (case-insensitive & accent-insensitive)
 * into official institutional names for Inter-School Leaderboard & Academic Exports.
 */
export function normalizeSchoolName(raw: string | null | undefined): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return 'Escola Não Informada';

  const key = stripAccents(trimmed).toLowerCase();

  if (key.includes('sesi')) return 'Escola SESI Bragança';
  if (key.includes('santa teresinha') || /\bist\b/.test(key) || key.startsWith('ist ')) {
    return 'IST (Instituto Santa Teresinha)';
  }
  if (key.includes('cejp')) return 'CEJPII';
  if (key.includes('evolucao')) return 'Escola Evolução';
  if (key.includes('lupama')) return 'Escola Lupama';
  if (key.includes('ifpa')) return 'IFPA Campus Bragança';

  return toPortugueseTitleCase(trimmed);
}

// =============================================================================
// 2. TELEMETRIA GRANULAR DE QUESTÕES (ARTIGOS ACADÊMICOS / SUPABASE attempt_logs)
// =============================================================================

export type CanonicalBnccAxis =
  | 'Operações'
  | 'Frações/Decimais'
  | 'Geometria'
  | 'Medidas'
  | 'Álgebra/Equações';

export const CANONICAL_BNCC_AXES: CanonicalBnccAxis[] = [
  'Operações',
  'Frações/Decimais',
  'Geometria',
  'Medidas',
  'Álgebra/Equações',
];

export interface QuestionAttemptLog {
  id: string;
  student_id: string;
  school: string;
  grade: string;
  world_id: number;
  game_mode: string;
  bncc_topic: string;
  is_correct: boolean;
  response_time_ms: number;
  created_at: string;
}

export interface LogQuestionAttemptInput {
  studentId: string;
  school: string;
  grade: string;
  worldId: number;
  gameMode: string;
  bnccTopic: string;
  isCorrect: boolean;
  responseTimeMs: number;
}

const ATTEMPTS_CACHE_KEY = 'mathblox_attempt_logs_cache_v1';
const ATTEMPTS_QUEUE_KEY = 'mathblox_attempt_logs_pending_v1';
const MAX_LOCAL_CACHE = 4000;

let attemptTableUnavailable = false;

export function classifyBnccAxis(rawTopic: string): CanonicalBnccAxis {
  const t = stripAccents(String(rawTopic || '')).toLowerCase();

  if (
    t.includes('equac') ||
    t.includes('algebr') ||
    t.includes('express') ||
    t.includes('funcao') ||
    t.includes('bhaskara') ||
    t.includes('sistema') ||
    t.includes('incognita') ||
    t.includes('polinom') ||
    t.includes('monom') ||
    t.includes('inequac')
  ) {
    return 'Álgebra/Equações';
  }
  if (
    t.includes('geometr') ||
    t.includes('angul') ||
    t.includes('triangul') ||
    t.includes('poligon') ||
    t.includes('pitagor') ||
    t.includes('perimetr') ||
    t.includes('area') ||
    t.includes('circul') ||
    t.includes('retangul') ||
    t.includes('quadrad') ||
    t.includes('plano cartesiano') ||
    t.includes('forma') ||
    t.includes('solido')
  ) {
    return 'Geometria';
  }
  if (
    t.includes('frac') ||
    t.includes('decim') ||
    t.includes('porcent') ||
    t.includes('razao') ||
    t.includes('proporc') ||
    t.includes('regra de') ||
    t.includes('raciona')
  ) {
    return 'Frações/Decimais';
  }
  if (
    t.includes('medid') ||
    t.includes('tempo') ||
    t.includes('hora') ||
    t.includes('metro') ||
    t.includes('litro') ||
    t.includes('massa') ||
    t.includes('quilo') ||
    t.includes('volume') ||
    t.includes('dinheiro') ||
    t.includes('monetar') ||
    t.includes('estatist') ||
    t.includes('media') ||
    t.includes('probabil')
  ) {
    return 'Medidas';
  }
  return 'Operações';
}

function readLocalLogs(key: string): QuestionAttemptLog[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QuestionAttemptLog[]) : [];
  } catch {
    return [];
  }
}

function writeLocalLogs(key: string, logs: QuestionAttemptLog[]): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = logs.length > MAX_LOCAL_CACHE ? logs.slice(logs.length - MAX_LOCAL_CACHE) : logs;
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch {
    // Ignore storage quota errors
  }
}

function appendLocalCache(entry: QuestionAttemptLog): void {
  const existing = readLocalLogs(ATTEMPTS_CACHE_KEY);
  existing.push(entry);
  writeLocalLogs(ATTEMPTS_CACHE_KEY, existing);
}

function enqueuePendingLog(entry: QuestionAttemptLog): void {
  const queue = readLocalLogs(ATTEMPTS_QUEUE_KEY);
  queue.push(entry);
  writeLocalLogs(ATTEMPTS_QUEUE_KEY, queue);
}

export async function flushPendingAttemptLogs(): Promise<void> {
  if (attemptTableUnavailable) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const queue = readLocalLogs(ATTEMPTS_QUEUE_KEY);
  if (queue.length === 0) return;

  const rows = queue.map((q) => ({
    student_id: q.student_id,
    school: q.school,
    grade: q.grade,
    world_id: q.world_id,
    game_mode: q.game_mode,
    bncc_topic: q.bncc_topic,
    is_correct: q.is_correct,
    response_time_ms: q.response_time_ms,
  }));

  try {
    const { error } = await supabase.from('attempt_logs').insert(rows);
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') {
        attemptTableUnavailable = true;
      }
      return;
    }
    writeLocalLogs(ATTEMPTS_QUEUE_KEY, []);
  } catch {
    // Keep queue for next retry without interrupting gameplay
  }
}

/**
 * Records a single math question interaction silently in local cache + Supabase `attempt_logs`.
 * Never throws or blocks gameplay.
 */
export function logQuestionAttempt(input: LogQuestionAttemptInput): void {
  const safeLatency = Math.max(150, Math.min(120000, Math.round(input.responseTimeMs || 3000)));
  const normalizedSchool = normalizeSchoolName(input.school);
  const nowIso = new Date().toISOString();

  const entry: QuestionAttemptLog = {
    id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    student_id: input.studentId,
    school: normalizedSchool,
    grade: input.grade,
    world_id: input.worldId,
    game_mode: input.gameMode,
    bncc_topic: input.bnccTopic || 'Operações',
    is_correct: Boolean(input.isCorrect),
    response_time_ms: safeLatency,
    created_at: nowIso,
  };

  appendLocalCache(entry);

  const supabase = getSupabaseClient();
  if (!supabase || attemptTableUnavailable) {
    enqueuePendingLog(entry);
    return;
  }

  void (async () => {
    try {
      const { error } = await supabase.from('attempt_logs').insert({
        student_id: entry.student_id,
        school: entry.school,
        grade: entry.grade,
        world_id: entry.world_id,
        game_mode: entry.game_mode,
        bncc_topic: entry.bncc_topic,
        is_correct: entry.is_correct,
        response_time_ms: entry.response_time_ms,
      });
      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') {
          attemptTableUnavailable = true;
        }
        enqueuePendingLog(entry);
      } else {
        // Flush any previously queued offline items opportunistically
        void flushPendingAttemptLogs();
      }
    } catch {
      enqueuePendingLog(entry);
    }
  })();
}

/**
 * Fetches all attempt logs from Supabase `attempt_logs` merged with local fallback cache.
 */
export async function fetchAllAttemptLogs(): Promise<{
  logs: QuestionAttemptLog[];
  source: 'supabase' | 'local';
  cloudCount: number;
}> {
  await flushPendingAttemptLogs();
  const localCache = readLocalLogs(ATTEMPTS_CACHE_KEY);
  const pending = readLocalLogs(ATTEMPTS_QUEUE_KEY);

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { logs: localCache, source: 'local', cloudCount: 0 };
  }

  try {
    const { data, error } = await supabase
      .from('attempt_logs')
      .select(
        'id, student_id, school, grade, world_id, game_mode, bncc_topic, is_correct, response_time_ms, created_at'
      )
      .order('created_at', { ascending: true })
      .limit(5000);

    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') {
        attemptTableUnavailable = true;
      }
      return { logs: localCache, source: 'local', cloudCount: 0 };
    }

    const cloudLogs: QuestionAttemptLog[] = (data || []).map((row) => ({
      id: String(row.id ?? ''),
      student_id: String(row.student_id ?? ''),
      school: normalizeSchoolName(String(row.school ?? '')),
      grade: String(row.grade ?? ''),
      world_id: Number(row.world_id ?? 1),
      game_mode: String(row.game_mode ?? 'obby'),
      bncc_topic: String(row.bncc_topic ?? 'Operações'),
      is_correct: Boolean(row.is_correct),
      response_time_ms: Number(row.response_time_ms ?? 3000),
      created_at: String(row.created_at ?? new Date().toISOString()),
    }));

    // Merge any unsent pending logs so the teacher never loses offline attempts
    const merged = [...cloudLogs, ...pending].sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );
    return {
      logs: merged.length > 0 ? merged : localCache,
      source: 'supabase',
      cloudCount: cloudLogs.length,
    };
  } catch {
    return { logs: localCache, source: 'local', cloudCount: 0 };
  }
}

// =============================================================================
// 3. ESTATÍSTICA DESCRITIVA, LEARNING GAIN, MATRIZ BNCC & EXPORTAÇÃO CSV
// =============================================================================

export interface DescriptiveStats {
  count: number;
  mean: number;
  median: number;
  stdDev: number;
}

export function computeDescriptiveStats(values: number[]): DescriptiveStats {
  const n = values.length;
  if (n === 0) return { count: 0, mean: 0, median: 0, stdDev: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / n;
  const mid = Math.floor(n / 2);
  const median = n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  return {
    count: n,
    mean,
    median,
    stdDev: Math.sqrt(variance),
  };
}

export interface LearningGainSummary {
  eligibleStudents: number;
  first5AccuracyPct: number;
  last5AccuracyPct: number;
  deltaPct: number;
}

export function computeLearningGain(logs: QuestionAttemptLog[]): LearningGainSummary {
  const byStudent = new Map<string, QuestionAttemptLog[]>();
  for (const l of logs) {
    const arr = byStudent.get(l.student_id) || [];
    arr.push(l);
    byStudent.set(l.student_id, arr);
  }

  let firstSum = 0;
  let lastSum = 0;
  let eligible = 0;

  byStudent.forEach((list) => {
    if (list.length < 2) return;
    const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const windowSize = Math.min(5, Math.floor(sorted.length / 2)) || 1;
    const firstSlice = sorted.slice(0, Math.min(5, sorted.length));
    const lastSlice = sorted.slice(Math.max(0, sorted.length - Math.min(5, sorted.length)));

    // Use disjoint halves when student has < 10 logs so pre vs post is meaningful
    const pre = sorted.length >= 10 ? firstSlice : sorted.slice(0, windowSize);
    const post = sorted.length >= 10 ? lastSlice : sorted.slice(sorted.length - windowSize);

    const preRate = pre.filter((x) => x.is_correct).length / pre.length;
    const postRate = post.filter((x) => x.is_correct).length / post.length;
    firstSum += preRate * 100;
    lastSum += postRate * 100;
    eligible++;
  });

  if (eligible === 0) {
    return { eligibleStudents: 0, first5AccuracyPct: 0, last5AccuracyPct: 0, deltaPct: 0 };
  }

  const first5AccuracyPct = firstSum / eligible;
  const last5AccuracyPct = lastSum / eligible;
  return {
    eligibleStudents: eligible,
    first5AccuracyPct,
    last5AccuracyPct,
    deltaPct: last5AccuracyPct - first5AccuracyPct,
  };
}

export interface BnccCellStat {
  attempts: number;
  correct: number;
  accuracyPct: number;
}

export interface BnccGradeRow {
  grade: string;
  totalAttempts: number;
  totalAccuracyPct: number;
  axes: Record<CanonicalBnccAxis, BnccCellStat>;
}

export function computeBnccMatrix(logs: QuestionAttemptLog[]): BnccGradeRow[] {
  const gradeMap = new Map<string, Record<CanonicalBnccAxis, { attempts: number; correct: number }>>();
  const ensureGrade = (g: string) => {
    let row = gradeMap.get(g);
    if (!row) {
      row = {
        Operações: { attempts: 0, correct: 0 },
        'Frações/Decimais': { attempts: 0, correct: 0 },
        Geometria: { attempts: 0, correct: 0 },
        Medidas: { attempts: 0, correct: 0 },
        'Álgebra/Equações': { attempts: 0, correct: 0 },
      };
      gradeMap.set(g, row);
    }
    return row;
  };

  for (const l of logs) {
    const axis = classifyBnccAxis(l.bncc_topic);
    const cell = ensureGrade(l.grade)[axis];
    cell.attempts += 1;
    if (l.is_correct) cell.correct += 1;
  }

  const orderedGrades = ORDERED_GRADES.filter((g) => g !== 'Trilha Base');
  const extras = Array.from(gradeMap.keys()).filter((g) => !orderedGrades.includes(g as never));
  const finalOrder = [...orderedGrades, ...extras];

  return finalOrder.map((grade) => {
    const raw = ensureGrade(grade);
    let totalAttempts = 0;
    let totalCorrect = 0;
    const axes = {} as Record<CanonicalBnccAxis, BnccCellStat>;
    for (const ax of CANONICAL_BNCC_AXES) {
      const a = raw[ax].attempts;
      const c = raw[ax].correct;
      totalAttempts += a;
      totalCorrect += c;
      axes[ax] = {
        attempts: a,
        correct: c,
        accuracyPct: a > 0 ? (c / a) * 100 : 0,
      };
    }
    return {
      grade,
      totalAttempts,
      totalAccuracyPct: totalAttempts > 0 ? (totalCorrect / totalAttempts) * 100 : 0,
      axes,
    };
  });
}

export interface ModeEngagementRow {
  modeKey: string;
  label: string;
  matchesEstimate: number;
  attempts: number;
  accuracyPct: number;
  avgLatencySec: number;
}

const MODE_LABELS: { key: string; label: string; qsPerMatch: number }[] = [
  { key: 'obby', label: 'Torre Obby 3D', qsPerMatch: 10 },
  { key: 'survival', label: 'Arena Sobrevivência', qsPerMatch: 8 },
  { key: 'turbo_race', label: 'Corrida Turbo', qsPerMatch: 8 },
  { key: 'vehicle_rally', label: 'Kart Manguezal (PA-458)', qsPerMatch: 8 },
  { key: 'caete_boat', label: 'Voadeira Rio Caeté', qsPerMatch: 8 },
  { key: 'penalty', label: 'Pênaltis da Matemática', qsPerMatch: 8 },
  { key: 'multiplayer', label: 'Multiplayer (Kart / Duelo 1v1)', qsPerMatch: 5 },
];

export function computeModeEngagement(logs: QuestionAttemptLog[]): ModeEngagementRow[] {
  const map = new Map<string, { attempts: number; correct: number; latencySum: number }>();
  for (const m of MODE_LABELS) {
    map.set(m.key, { attempts: 0, correct: 0, latencySum: 0 });
  }

  for (const l of logs) {
    const normalizedMode =
      l.game_mode === 'duel_1v1' || l.game_mode === 'kart_multiplayer'
        ? 'multiplayer'
        : map.has(l.game_mode)
          ? l.game_mode
          : 'obby';
    const bucket = map.get(normalizedMode)!;
    bucket.attempts += 1;
    if (l.is_correct) bucket.correct += 1;
    bucket.latencySum += l.response_time_ms;
  }

  return MODE_LABELS.map((m) => {
    const b = map.get(m.key)!;
    return {
      modeKey: m.key,
      label: m.label,
      matchesEstimate: b.attempts > 0 ? Math.max(1, Math.round(b.attempts / m.qsPerMatch)) : 0,
      attempts: b.attempts,
      accuracyPct: b.attempts > 0 ? (b.correct / b.attempts) * 100 : 0,
      avgLatencySec: b.attempts > 0 ? b.latencySum / b.attempts / 1000 : 0,
    };
  });
}

function csvEscape(val: string | number | boolean): string {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes(';')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildAnonymizedMap(
  students: StudentProfile[],
  logs: QuestionAttemptLog[]
): Map<string, string> {
  const ids = new Set<string>();
  students.forEach((s) => ids.add(s.id));
  logs.forEach((l) => ids.add(l.student_id));
  const sortedIds = Array.from(ids).sort();
  const anon = new Map<string, string>();
  sortedIds.forEach((id, idx) => {
    anon.set(id, `Participante_${String(idx + 1).padStart(3, '0')}`);
  });
  return anon;
}

export function buildRawAttemptsCsv(
  logs: QuestionAttemptLog[],
  students: StudentProfile[],
  anonymize: boolean
): string {
  const anonMap = buildAnonymizedMap(students, logs);
  const studentNameMap = new Map<string, string>();
  students.forEach((s) => studentNameMap.set(s.id, s.name));

  const header = [
    'participante',
    'escola_padronizada',
    'serie',
    'world_id',
    'modalidade',
    'topico_bncc',
    'eixo_bncc',
    'acertou',
    'tempo_resposta_ms',
    'tempo_resposta_seg',
    'data_hora_iso',
  ].join(',');

  const rows = logs.map((l) => {
    const participant = anonymize
      ? anonMap.get(l.student_id) || 'Participante_000'
      : studentNameMap.get(l.student_id) || l.student_id;
    return [
      csvEscape(participant),
      csvEscape(normalizeSchoolName(l.school)),
      csvEscape(l.grade),
      l.world_id,
      csvEscape(l.game_mode),
      csvEscape(l.bncc_topic),
      csvEscape(classifyBnccAxis(l.bncc_topic)),
      l.is_correct ? 1 : 0,
      l.response_time_ms,
      (l.response_time_ms / 1000).toFixed(2),
      csvEscape(l.created_at),
    ].join(',');
  });

  return '\uFEFF' + [header, ...rows].join('\n');
}

export function buildStatisticalSummaryCsv(
  logs: QuestionAttemptLog[],
  students: StudentProfile[],
  anonymize: boolean
): string {
  const xpStats = computeDescriptiveStats(students.map((s) => s.xp));
  const latencyStats = computeDescriptiveStats(logs.map((l) => l.response_time_ms / 1000));
  const gain = computeLearningGain(logs);
  const matrix = computeBnccMatrix(logs);
  const modes = computeModeEngagement(logs);

  const lines: string[] = [];
  lines.push('SECAO,INDICADOR,VALOR,DETALHE');
  lines.push(`Amostra,Total de Participantes (N),${students.length},Anonimizado=${anonymize ? 'SIM' : 'NAO'}`);
  lines.push(`Amostra,Total de Interacoes (n),${logs.length},Registros em attempt_logs`);
  lines.push(`XP,Media (x_bar),${xpStats.mean.toFixed(2)},Pontos XP`);
  lines.push(`XP,Mediana,${xpStats.median.toFixed(2)},Pontos XP`);
  lines.push(`XP,Desvio Padrao (sigma),${xpStats.stdDev.toFixed(2)},Pontos XP`);
  lines.push(`Latencia Cognitiva,Media (s),${latencyStats.mean.toFixed(2)},Segundos por questao`);
  lines.push(`Latencia Cognitiva,Mediana (s),${latencyStats.median.toFixed(2)},Segundos por questao`);
  lines.push(`Latencia Cognitiva,Desvio Padrao (s),${latencyStats.stdDev.toFixed(2)},Segundos por questao`);
  lines.push(`Learning Gain,5 Primeiras Questoes (%),${gain.first5AccuracyPct.toFixed(2)},N_elegiveis=${gain.eligibleStudents}`);
  lines.push(`Learning Gain,5 Ultimas Questoes (%),${gain.last5AccuracyPct.toFixed(2)},N_elegiveis=${gain.eligibleStudents}`);
  lines.push(`Learning Gain,Ganho Delta (%),${gain.deltaPct.toFixed(2)},Diferenca pos - pre`);
  lines.push('');

  lines.push('RESUMO_POR_ESCOLA,ESCOLA,ALUNOS,XP_TOTAL,XP_SEMANAL,MEDIA_XP_ALUNO,ACERTO_MEDIO_PCT');
  const schoolBuckets = new Map<
    string,
    { count: number; xp: number; weeklyXp: number; answered: number; correct: number }
  >();
  students.forEach((s) => {
    const sch = normalizeSchoolName(s.school);
    const b = schoolBuckets.get(sch) || { count: 0, xp: 0, weeklyXp: 0, answered: 0, correct: 0 };
    b.count += 1;
    b.xp += s.xp;
    b.weeklyXp += s.weeklyXp || 0;
    b.answered += s.questionsAnswered;
    b.correct += s.questionsCorrect;
    schoolBuckets.set(sch, b);
  });
  Array.from(schoolBuckets.entries())
    .sort((a, b) => b[1].xp - a[1].xp)
    .forEach(([school, b]) => {
      const avgXp = b.count > 0 ? b.xp / b.count : 0;
      const acc = b.answered > 0 ? (b.correct / b.answered) * 100 : 0;
      lines.push(
        `Escola,${csvEscape(school)},${b.count},${b.xp},${b.weeklyXp},${avgXp.toFixed(1)},${acc.toFixed(1)}`
      );
    });
  lines.push('');

  lines.push('RESUMO_BNCC_POR_SERIE,SERIE,TENTATIVAS,ACERTO_GERAL_PCT,OPERACOES_PCT,FRACOES_PCT,GEOMETRIA_PCT,MEDIDAS_PCT,ALGEBRA_PCT');
  matrix.forEach((r) => {
    lines.push(
      [
        'BNCC',
        csvEscape(r.grade),
        r.totalAttempts,
        r.totalAccuracyPct.toFixed(1),
        r.axes['Operações'].accuracyPct.toFixed(1),
        r.axes['Frações/Decimais'].accuracyPct.toFixed(1),
        r.axes['Geometria'].accuracyPct.toFixed(1),
        r.axes['Medidas'].accuracyPct.toFixed(1),
        r.axes['Álgebra/Equações'].accuracyPct.toFixed(1),
      ].join(',')
    );
  });
  lines.push('');

  lines.push('ENGAJAMENTO_MODALIDADE,MODALIDADE,PARTIDAS_ESTIMADAS,QUESTOES_RESOLVIDAS,ACERTO_PCT,LATENCIA_MEDIA_SEG');
  modes.forEach((m) => {
    lines.push(
      [
        'Modalidade',
        csvEscape(m.label),
        m.matchesEstimate,
        m.attempts,
        m.accuracyPct.toFixed(1),
        m.avgLatencySec.toFixed(2),
      ].join(',')
    );
  });

  return '\uFEFF' + lines.join('\n');
}

export function triggerCsvDownload(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
