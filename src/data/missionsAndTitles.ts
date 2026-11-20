import { StudentProfile } from '../types/game';

export type DailyMissionId = 'correct_10' | 'drifts_3' | 'goals_5' | 'caete_buoys_8';

export interface DailyMissionDef {
  id: DailyMissionId;
  title: string;
  description: string;
  target: number;
  rewardCoins: number;
  icon: string;
}

export interface DailyMissionProgress {
  progress: number;
  claimed: boolean;
}

export interface DailyMissionsRecord {
  date: string; // YYYY-MM-DD
  missions: Record<DailyMissionId, DailyMissionProgress>;
}

export interface AchievementTitleDef {
  id: string;
  label: string;
  requirement: string;
}

export const DAILY_MISSION_DEFS: DailyMissionDef[] = [
  {
    id: 'correct_10',
    title: 'Mente Afiada',
    description: 'Acertar 10 questões em qualquer modo',
    target: 10,
    rewardCoins: 40,
    icon: '🧠',
  },
  {
    id: 'caete_buoys_8',
    title: 'Navegador do Rio Caeté',
    description: 'Passar por 8 boias certas na Regata do Rio Caeté',
    target: 8,
    rewardCoins: 35,
    icon: '🚤',
  },
  {
    id: 'drifts_3',
    title: 'Derrapagem na PA-458',
    description: 'Fazer 3 drifts com Mini-Turbo na Estrada de Ajuruteua',
    target: 3,
    rewardCoins: 30,
    icon: '🏎️',
  },
  {
    id: 'goals_5',
    title: 'Artilheiro do Estádio',
    description: 'Marcar 5 gols nos Pênaltis da Matemática',
    target: 5,
    rewardCoins: 35,
    icon: '⚽',
  },
];

export const ACHIEVEMENT_TITLES: AchievementTitleDef[] = [
  {
    id: '🌟 Iniciante',
    label: '🌟 Iniciante',
    requirement: 'Disponível para todos os alunos da Praça da Bandeira',
  },
  {
    id: '⚡ Mestre da Tabuada',
    label: '⚡ Mestre da Tabuada',
    requirement: 'Acumule 15 ou mais acertos em matemática',
  },
  {
    id: '🏎️ Rei do Drift',
    label: '🏎️ Rei do Drift',
    requirement: 'Realize 3 drifts com Mini-Turbo na Estrada de Ajuruteua',
  },
  {
    id: '⚽ Artilheiro do Caeté',
    label: '⚽ Artilheiro do Caeté',
    requirement: 'Marque 5 ou mais gols nos Pênaltis da Matemática',
  },
  {
    id: '⚓ Comandante do Caeté',
    label: '⚓ Comandante do Caeté',
    requirement: 'Complete uma Regata no Rio Caeté ou acerte 8 boias fluviais',
  },
];

const DAILY_STORAGE_PREFIX = 'mathblox_daily_missions_v3_';
const LIFETIME_STATS_PREFIX = 'mathblox_lifetime_stats_v3_';

export interface LifetimeActivityStats {
  drifts: number;
  penaltyGoals: number;
  caeteBuoys: number;
  caeteVictories: number;
}

type MissionListener = () => void;
const listeners = new Set<MissionListener>();

export function subscribeDailyMissions(fn: MissionListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emitMissionUpdate(): void {
  listeners.forEach((fn) => fn());
}

export function getTodayDateKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function createEmptyDailyRecord(date: string): DailyMissionsRecord {
  return {
    date,
    missions: {
      correct_10: { progress: 0, claimed: false },
      caete_buoys_8: { progress: 0, claimed: false },
      drifts_3: { progress: 0, claimed: false },
      goals_5: { progress: 0, claimed: false },
    },
  };
}

export function getDailyMissionsState(studentId: string): DailyMissionsRecord {
  const today = getTodayDateKey();
  if (typeof window === 'undefined') return createEmptyDailyRecord(today);
  try {
    const raw = localStorage.getItem(`${DAILY_STORAGE_PREFIX}${studentId}`);
    if (!raw) return createEmptyDailyRecord(today);
    const parsed = JSON.parse(raw) as DailyMissionsRecord;
    if (!parsed || parsed.date !== today || !parsed.missions) {
      const fresh = createEmptyDailyRecord(today);
      localStorage.setItem(`${DAILY_STORAGE_PREFIX}${studentId}`, JSON.stringify(fresh));
      return fresh;
    }
    return {
      date: today,
      missions: {
        correct_10: parsed.missions.correct_10 || { progress: 0, claimed: false },
        caete_buoys_8: parsed.missions.caete_buoys_8 || { progress: 0, claimed: false },
        drifts_3: parsed.missions.drifts_3 || { progress: 0, claimed: false },
        goals_5: parsed.missions.goals_5 || { progress: 0, claimed: false },
      },
    };
  } catch {
    return createEmptyDailyRecord(today);
  }
}

function saveDailyMissionsState(studentId: string, record: DailyMissionsRecord): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${DAILY_STORAGE_PREFIX}${studentId}`, JSON.stringify(record));
  } catch {
    // Ignore quota errors
  }
  emitMissionUpdate();
}

export function getLifetimeActivityStats(studentId: string): LifetimeActivityStats {
  const fallback: LifetimeActivityStats = {
    drifts: 0,
    penaltyGoals: 0,
    caeteBuoys: 0,
    caeteVictories: 0,
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(`${LIFETIME_STATS_PREFIX}${studentId}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<LifetimeActivityStats>;
    return {
      drifts: Number(parsed.drifts) || 0,
      penaltyGoals: Number(parsed.penaltyGoals) || 0,
      caeteBuoys: Number(parsed.caeteBuoys) || 0,
      caeteVictories: Number(parsed.caeteVictories) || 0,
    };
  } catch {
    return fallback;
  }
}

function saveLifetimeActivityStats(studentId: string, stats: LifetimeActivityStats): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${LIFETIME_STATS_PREFIX}${studentId}`, JSON.stringify(stats));
  } catch {
    // Ignore quota errors
  }
}

export type ActivityEventType =
  | 'correct_answer'
  | 'drift_mini_turbo'
  | 'penalty_goal'
  | 'caete_buoy'
  | 'caete_victory';

export function recordActivityForMissions(
  studentId: string,
  event: ActivityEventType,
  amount = 1
): void {
  if (!studentId || amount <= 0) return;

  const daily = getDailyMissionsState(studentId);
  const stats = getLifetimeActivityStats(studentId);

  if (event === 'correct_answer') {
    daily.missions.correct_10.progress = Math.min(
      99,
      daily.missions.correct_10.progress + amount
    );
  } else if (event === 'drift_mini_turbo') {
    daily.missions.drifts_3.progress = Math.min(99, daily.missions.drifts_3.progress + amount);
    stats.drifts += amount;
  } else if (event === 'penalty_goal') {
    daily.missions.goals_5.progress = Math.min(99, daily.missions.goals_5.progress + amount);
    stats.penaltyGoals += amount;
  } else if (event === 'caete_buoy') {
    daily.missions.caete_buoys_8.progress = Math.min(
      99,
      daily.missions.caete_buoys_8.progress + amount
    );
    stats.caeteBuoys += amount;
  } else if (event === 'caete_victory') {
    stats.caeteVictories += amount;
  }

  saveLifetimeActivityStats(studentId, stats);
  saveDailyMissionsState(studentId, daily);
}

export function markDailyMissionClaimed(
  studentId: string,
  missionId: DailyMissionId
): DailyMissionDef | null {
  const def = DAILY_MISSION_DEFS.find((m) => m.id === missionId);
  if (!def) return null;
  const daily = getDailyMissionsState(studentId);
  const entry = daily.missions[missionId];
  if (!entry || entry.claimed || entry.progress < def.target) return null;
  entry.claimed = true;
  saveDailyMissionsState(studentId, daily);
  return def;
}

export function countClaimableDailyMissions(studentId: string): number {
  const daily = getDailyMissionsState(studentId);
  return DAILY_MISSION_DEFS.filter((def) => {
    const entry = daily.missions[def.id];
    return entry && !entry.claimed && entry.progress >= def.target;
  }).length;
}

/**
 * Computes the complete set of Achievement Titles the student has earned,
 * merging with any titles already persisted in Supabase (`student.unlockedTitles`).
 */
export function computeUnlockedTitles(student: StudentProfile): {
  unlockedTitles: string[];
  newlyUnlocked: string[];
} {
  // Replace any legacy meteor title gracefully while preserving all others
  const existing = new Set<string>(
    (student.unlockedTitles || []).map((t) =>
      t === '☄️ Guardião da Praça' ? '⚓ Comandante do Caeté' : t
    )
  );
  const beforeSize = existing.size;
  const stats = getLifetimeActivityStats(student.id);
  const daily = getDailyMissionsState(student.id);

  // 1. Always unlock Iniciante
  existing.add('🌟 Iniciante');

  // 2. Mestre da Tabuada: >= 15 correct answers
  if (student.questionsCorrect >= 15) {
    existing.add('⚡ Mestre da Tabuada');
  }

  // 3. Rei do Drift: >= 3 mini-turbo drifts
  if (stats.drifts >= 3 || daily.missions.drifts_3.progress >= 3) {
    existing.add('🏎️ Rei do Drift');
  }

  // 4. Artilheiro do Caeté: >= 5 penalty goals
  if (stats.penaltyGoals >= 5 || daily.missions.goals_5.progress >= 5) {
    existing.add('⚽ Artilheiro do Caeté');
  }

  // 5. Comandante do Caeté: Regata do Rio Caeté victory or >= 8 buoys passed
  if (
    stats.caeteVictories >= 1 ||
    stats.caeteBuoys >= 8 ||
    daily.missions.caete_buoys_8.progress >= 8
  ) {
    existing.add('⚓ Comandante do Caeté');
  }

  const unlockedTitles = Array.from(existing);
  const prevSet = new Set<string>(student.unlockedTitles || []);
  const newlyUnlocked =
    unlockedTitles.length > beforeSize
      ? unlockedTitles.filter((t) => !prevSet.has(t))
      : [];

  return { unlockedTitles, newlyUnlocked };
}
