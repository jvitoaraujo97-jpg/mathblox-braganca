import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { soundEngine } from './audio/soundEngine';
import { AdminDashboard } from './components/AdminDashboard';
import { AuthPortal } from './components/AuthPortal';
import { GameHUD } from './components/GameHUD';
import { MobileControls, MobileInputState } from './components/MobileControls';
import { ObbyCanvas } from './components/ObbyCanvas';
import { StudentHub } from './components/StudentHub';
import {
  computeUnlockedTitles,
  recordActivityForMissions,
} from './data/missionsAndTitles';
import { generateWorldLevel } from './game/levelGenerator';
import {
  CloudDiagnostics,
  createNewStudent,
  deleteStudent,
  fetchStudentByIdFromCloud,
  fetchStudentsFromCloud,
  getCloudDiagnostics,
  getLastStudentId,
  getStorageMode,
  loadStudents,
  saveStudentProgress,
  setLastStudentId,
  subscribeCloudDiagnostics,
  subscribeStudentsRealtime,
} from './services/storageService';
import { CaeteBoatGame } from './three/CaeteBoatGame';
import { MathDuel1v1Game } from './three/MathDuel1v1Game';
import { MathPenaltyGame } from './three/MathPenaltyGame';
import { SurvivalArenaGame } from './three/SurvivalArenaGame';
import { TurboRaceGame } from './three/TurboRaceGame';
import { VehicleRallyGame } from './three/VehicleRallyGame';
import {
  GameHUDState,
  GameModeType,
  GradeLevel,
  MultiplayerSessionConfig,
  StudentProfile,
  TowerDifficulty,
  TrapFeedback,
} from './types/game';

function upsertAndSortStudents(
  list: StudentProfile[],
  incoming: StudentProfile
): StudentProfile[] {
  const idx = list.findIndex((s) => s.id === incoming.id);
  const next = idx >= 0 ? list.map((s) => (s.id === incoming.id ? incoming : s)) : [...list, incoming];
  return next.sort((a, b) => {
    if (b.xp !== a.xp) return b.xp - a.xp;
    if (b.questionsCorrect !== a.questionsCorrect) return b.questionsCorrect - a.questionsCorrect;
    return a.name.localeCompare(b.name, 'pt-BR');
  });
}

export default function App() {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const studentsRef = useRef<StudentProfile[]>([]);
  studentsRef.current = students;

  const [loading, setLoading] = useState(true);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  const [lastStudentId, setLastStudentIdState] = useState<string | null>(() => getLastStudentId());
  const [adminMode, setAdminMode] = useState(false);

  const [playingMode, setPlayingMode] = useState<GameModeType | null>(null);
  const [playingWorldId, setPlayingWorldId] = useState<number | null>(null);
  const [playingDifficulty, setPlayingDifficulty] = useState<TowerDifficulty>('gold');
  const [multiplayerSession, setMultiplayerSession] = useState<MultiplayerSessionConfig | null>(null);
  const [runSeed, setRunSeed] = useState(1);

  const [muted, setMuted] = useState(false);
  const [trapFeedback, setTrapFeedback] = useState<TrapFeedback | null>(null);
  const [rotateCameraSignal, setRotateCameraSignal] = useState(0);

  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [cloudDiagnostics, setCloudDiagnostics] = useState<CloudDiagnostics>(() =>
    getCloudDiagnostics()
  );

  const [hud, setHud] = useState<GameHUDState>({
    currentStage: 0,
    totalStages: 10,
    streak: 0,
    speedBoostLeft: 0,
    sessionXp: 0,
    sessionCoins: 0,
    sessionAnswered: 0,
    sessionCorrect: 0,
    activeQuestion: null,
    completedStages: [],
    victory: false,
  });

  const mobileInputRef = useRef<MobileInputState>({
    moveX: 0,
    moveY: 0,
    jumpPressed: false,
    cameraYawDelta: 0,
  });

  const storageMode = useMemo(() => getStorageMode(), []);

  // Subscribe to cloud save status & diagnostics for top indicator + Admin panel
  useEffect(() => {
    return subscribeCloudDiagnostics((next) => setCloudDiagnostics(next));
  }, []);

  const refreshStudentsFromCloud = useCallback(async () => {
    try {
      const fresh = await fetchStudentsFromCloud();
      setStudents(fresh);
      setLastSyncedAt(new Date());
    } catch {
      // Keep current list on transient network drop
    }
  }, []);

  // Initial load from Supabase (Single Source of Truth)
  useEffect(() => {
    let mounted = true;
    loadStudents().then((list) => {
      if (!mounted) return;
      setStudents(list);
      setLastSyncedAt(new Date());
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Real-time Postgres Changes subscription (`students-ranking-live`) -> <1s Ranking updates
  useEffect(() => {
    const unsubscribe = subscribeStudentsRealtime((ev) => {
      if (ev.type === 'DELETE' && ev.deletedId) {
        setStudents((prev) => prev.filter((s) => s.id !== ev.deletedId));
        setLastSyncedAt(new Date());
        return;
      }
      if (ev.student) {
        const incoming = ev.student;
        setStudents((prev) => upsertAndSortStudents(prev, incoming));
        setLastSyncedAt(new Date());
      }
    });
    return unsubscribe;
  }, []);

  const activeStudent = useMemo(
    () => students.find((s) => s.id === activeStudentId) || null,
    [students, activeStudentId]
  );

  const activeLevel = useMemo(() => {
    if (playingMode !== 'obby' || playingWorldId === null) return null;
    return generateWorldLevel(playingWorldId, playingDifficulty, activeStudent?.id);
  }, [playingMode, playingWorldId, playingDifficulty, runSeed, activeStudent?.id]);

  // Guaranteed Student Login with fresh cloud revalidation
  const handleLoginStudent = useCallback(async (stu: StudentProfile) => {
    const freshCloud = await fetchStudentByIdFromCloud(stu.id);
    const authoritative = freshCloud || stu;
    setStudents((prev) => upsertAndSortStudents(prev, authoritative));
    setLastStudentId(authoritative.id);
    setLastStudentIdState(authoritative.id);
    setActiveStudentId(authoritative.id);
    setLastSyncedAt(new Date());
  }, []);

  // Student progress / cosmetics / school / aura update (always saves to Supabase with merge protection)
  const handleUpdateStudent = useCallback(async (updated: StudentProfile) => {
    const existing = studentsRef.current.find((s) => s.id === updated.id);
    const mergedToSave: StudentProfile = existing
      ? {
          ...existing,
          ...updated,
          xp: Math.max(existing.xp, updated.xp),
          weeklyXp: Math.max(existing.weeklyXp || 0, updated.weeklyXp || 0),
          questionsAnswered: Math.max(existing.questionsAnswered, updated.questionsAnswered),
          questionsCorrect: Math.max(existing.questionsCorrect, updated.questionsCorrect),
          bestStreak: Math.max(existing.bestStreak, updated.bestStreak),
          auraPower: Math.max(existing.auraPower || 0, updated.auraPower || 0),
          unlockedItems: Array.from(
            new Set([...(existing.unlockedItems || []), ...(updated.unlockedItems || [])])
          ),
          unlockedTitles: Array.from(
            new Set([
              ...(existing.unlockedTitles || []),
              ...(updated.unlockedTitles || []),
            ])
          ),
          updatedAt: new Date().toISOString(),
        }
      : { ...updated, updatedAt: new Date().toISOString() };

    studentsRef.current = upsertAndSortStudents(studentsRef.current, mergedToSave);
    setStudents(studentsRef.current);

    const result = await saveStudentProgress(mergedToSave);
    if (result.synced) {
      setStudents((prev) => upsertAndSortStudents(prev, result.student));
      setLastSyncedAt(new Date());
    }
  }, []);

  // Teacher Admin explicit overwrite (allows teacher to directly adjust XP/coins/PIN/grade)
  const handleAdminSaveStudent = useCallback(async (updated: StudentProfile) => {
    studentsRef.current = upsertAndSortStudents(studentsRef.current, updated);
    setStudents(studentsRef.current);
    const result = await saveStudentProgress(updated);
    if (result.synced) {
      setStudents((prev) => upsertAndSortStudents(prev, result.student));
      setLastSyncedAt(new Date());
    }
  }, []);

  // Confirmed cloud registration (throws if Supabase write fails)
  const handleRegisterStudent = useCallback(
    async (input: {
      name: string;
      school: string;
      grade: GradeLevel;
      pin: string;
      avatarColor: string;
    }) => {
      const { student } = await createNewStudent(input);
      studentsRef.current = upsertAndSortStudents(studentsRef.current, student);
      setStudents(studentsRef.current);
      setLastStudentId(student.id);
      setLastStudentIdState(student.id);
      setAdminMode(false);
      setActiveStudentId(student.id);
      setLastSyncedAt(new Date());
    },
    []
  );

  const handleAdminCreateStudent = useCallback(
    async (input: {
      name: string;
      school: string;
      grade: GradeLevel;
      pin: string;
      avatarColor: string;
    }) => {
      const { student } = await createNewStudent(input);
      studentsRef.current = upsertAndSortStudents(studentsRef.current, student);
      setStudents(studentsRef.current);
      setLastSyncedAt(new Date());
    },
    []
  );

  const handleDeleteStudent = useCallback(async (studentId: string) => {
    studentsRef.current = studentsRef.current.filter((s) => s.id !== studentId);
    setStudents(studentsRef.current);
    await deleteStudent(studentId);
    if (getLastStudentId() === null) {
      setLastStudentIdState(null);
    }
  }, []);

  // Guaranteed save on EVERY answered question & match completion (immune to React batching)
  const handleProgressEvent = useCallback(
    (delta: {
      xpGain: number;
      coinsGain: number;
      answeredDelta: number;
      correctDelta: number;
      streak: number;
    }) => {
      if (!activeStudentId) return;
      const current = studentsRef.current.find((s) => s.id === activeStudentId);
      if (!current) return;

      if (delta.correctDelta > 0) {
        recordActivityForMissions(activeStudentId, 'correct_answer', delta.correctDelta);
      }

      const candidateStudent: StudentProfile = {
        ...current,
        xp: current.xp + delta.xpGain,
        weeklyXp: (current.weeklyXp || 0) + delta.xpGain,
        coins: current.coins + delta.coinsGain,
        questionsAnswered: current.questionsAnswered + delta.answeredDelta,
        questionsCorrect: current.questionsCorrect + delta.correctDelta,
        bestStreak: Math.max(current.bestStreak, delta.streak),
        updatedAt: new Date().toISOString(),
      };

      const updatedStudent: StudentProfile = {
        ...candidateStudent,
        unlockedTitles: computeUnlockedTitles(candidateStudent).unlockedTitles,
      };

      studentsRef.current = upsertAndSortStudents(studentsRef.current, updatedStudent);
      setStudents(studentsRef.current);

      void saveStudentProgress(updatedStudent).then((res) => {
        if (res.synced) {
          setLastSyncedAt(new Date());
        }
      });
    },
    [activeStudentId]
  );

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundEngine.muted = next;
      return next;
    });
  }, []);

  const handleStartMode = useCallback(
    (mode: GameModeType, worldId: number, difficulty: TowerDifficulty = 'gold') => {
      setTrapFeedback(null);
      setMultiplayerSession(null);
      setPlayingMode(mode);
      setPlayingDifficulty(difficulty);
      setPlayingWorldId(worldId);
      setRunSeed((r) => r + 1);
    },
    []
  );

  const handleStartMultiplayer = useCallback(
    (session: MultiplayerSessionConfig) => {
      setTrapFeedback(null);
      setMultiplayerSession(session);
      setPlayingMode(session.mode === 'kart' ? 'vehicle_rally' : null);
      setPlayingDifficulty('gold');
      setPlayingWorldId(activeStudent?.worldId ?? 1);
      setRunSeed((r) => r + 1);
    },
    [activeStudent?.worldId]
  );

  const handleExitGame = useCallback(() => {
    setTrapFeedback(null);
    setMultiplayerSession(null);
    setPlayingMode(null);
    setPlayingWorldId(null);
    mobileInputRef.current.moveX = 0;
    mobileInputRef.current.moveY = 0;
    mobileInputRef.current.jumpPressed = false;
    // Active silent sync upon exiting any game match to ensure 100% leaderboard freshness
    void refreshStudentsFromCloud();
  }, [refreshStudentsFromCloud]);

  const handleLogout = useCallback(() => {
    setActiveStudentId(null);
    void refreshStudentsFromCloud();
  }, [refreshStudentsFromCloud]);

  // Discreet Top Cloud Save Status Badge (never blocks gameplay or clicks)
  const renderSaveIndicator = () => {
    if (cloudDiagnostics.syncState === 'offline_retry' || cloudDiagnostics.pendingCount > 0) {
      return (
        <div className="pointer-events-none fixed left-1/2 top-2 z-[80] -translate-x-1/2 rounded-xl border border-amber-400/50 bg-amber-950/95 px-3 py-1 text-[11px] font-bold text-amber-200 shadow-lg whitespace-nowrap">
          ⚠️ Sem internet — tentando salvar...
        </div>
      );
    }
    if (cloudDiagnostics.syncState === 'saved') {
      return (
        <div className="pointer-events-none fixed left-1/2 top-2 z-[80] -translate-x-1/2 rounded-xl border border-emerald-400/50 bg-emerald-950/95 px-3 py-1 text-[11px] font-bold text-emerald-200 shadow-lg whitespace-nowrap">
          ☁️ Progresso salvo
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        <p className="font-display text-lg font-bold">Conectando à nuvem MathBlox...</p>
      </div>
    );
  }

  // Restricted Teacher Admin View (Only after verifying PIN 2026)
  if (adminMode) {
    return (
      <>
        {renderSaveIndicator()}
        <AdminDashboard
          students={students}
          diagnostics={cloudDiagnostics}
          onRefreshStudents={refreshStudentsFromCloud}
          onSaveStudent={handleAdminSaveStudent}
          onCreateStudent={handleAdminCreateStudent}
          onDeleteStudent={handleDeleteStudent}
          onExitAdmin={() => setAdminMode(false)}
        />
      </>
    );
  }

  // Screen 1: Initial Portal (Student Login / Open Registration vs Teacher Access)
  if (!activeStudent) {
    return (
      <>
        {renderSaveIndicator()}
        <AuthPortal
          students={students}
          storageMode={storageMode}
          lastStudentId={lastStudentId}
          onRefreshStudents={refreshStudentsFromCloud}
          onLoginStudent={handleLoginStudent}
          onRegisterStudent={handleRegisterStudent}
          onEnterAdmin={() => setAdminMode(true)}
        />
      </>
    );
  }

  // Screen 3A: Modalidade 1 — Torre Obby (Parkour 3D Clássico)
  if (playingMode === 'obby' && activeLevel && playingWorldId !== null) {
    return (
      <div className="fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-slate-950">
        {renderSaveIndicator()}
        <ObbyCanvas
          key={`obby-${playingWorldId}-${playingDifficulty}-${runSeed}`}
          level={activeLevel}
          student={activeStudent}
          mobileInputRef={mobileInputRef}
          rotateCameraSignal={rotateCameraSignal}
          paused={Boolean(trapFeedback) || hud.victory}
          onHudUpdate={setHud}
          onTrapTriggered={(trap) => setTrapFeedback(trap)}
          onProgressEvent={handleProgressEvent}
          onVictory={() => {
            void refreshStudentsFromCloud();
          }}
        />

        <GameHUD
          student={activeStudent}
          world={activeLevel.world}
          hud={hud}
          trapFeedback={trapFeedback}
          muted={muted}
          onToggleMute={handleToggleMute}
          onExitGame={handleExitGame}
          onDismissTrap={() => setTrapFeedback(null)}
          onReplayWorld={() => handleStartMode('obby', playingWorldId, playingDifficulty)}
        />

        {!trapFeedback && !hud.victory && (
          <MobileControls
            inputRef={mobileInputRef}
            onRotateCameraStep={() => setRotateCameraSignal((n) => n + 1)}
          />
        )}
      </div>
    );
  }

  // Screen 3B: Modalidade 2 — Arena Sobrevivência ("Piso que Cai")
  if (playingMode === 'survival' && playingWorldId !== null) {
    return (
      <>
        {renderSaveIndicator()}
        <SurvivalArenaGame
          student={activeStudent}
          worldId={playingWorldId}
          difficulty={playingDifficulty}
          muted={muted}
          onToggleMute={handleToggleMute}
          onProgressEvent={handleProgressEvent}
          onExit={handleExitGame}
        />
      </>
    );
  }

  // Screen 3C: Modalidade 3 — Corrida Turbo ("Contra o Relógio")
  if (playingMode === 'turbo_race' && playingWorldId !== null) {
    return (
      <>
        {renderSaveIndicator()}
        <TurboRaceGame
          student={activeStudent}
          worldId={playingWorldId}
          difficulty={playingDifficulty}
          muted={muted}
          onToggleMute={handleToggleMute}
          onProgressEvent={handleProgressEvent}
          onExit={handleExitGame}
        />
      </>
    );
  }

  // Screen 3D: Modalidade 4 — Rali Matemático (Solo ou Multiplayer 2-6 Jogadores)
  if (playingMode === 'vehicle_rally' && playingWorldId !== null) {
    return (
      <>
        {renderSaveIndicator()}
        <VehicleRallyGame
          student={activeStudent}
          worldId={playingWorldId}
          difficulty={playingDifficulty}
          multiplayerSession={multiplayerSession?.mode === 'kart' ? multiplayerSession : undefined}
          muted={muted}
          onToggleMute={handleToggleMute}
          onProgressEvent={handleProgressEvent}
          onExit={handleExitGame}
        />
      </>
    );
  }

  // Screen 3E: Modalidade 5 — Pênaltis da Matemática (Estádio do Caeté)
  if (playingMode === 'penalty' && playingWorldId !== null) {
    return (
      <>
        {renderSaveIndicator()}
        <MathPenaltyGame
          student={activeStudent}
          worldId={playingWorldId}
          difficulty={playingDifficulty}
          muted={muted}
          onToggleMute={handleToggleMute}
          onProgressEvent={handleProgressEvent}
          onExit={handleExitGame}
        />
      </>
    );
  }

  // Screen 3F: Modalidade 6 — Regata de Voadeira no Rio Caeté
  if (playingMode === 'caete_boat' && playingWorldId !== null) {
    return (
      <>
        {renderSaveIndicator()}
        <CaeteBoatGame
          student={activeStudent}
          worldId={playingWorldId}
          difficulty={playingDifficulty}
          muted={muted}
          onToggleMute={handleToggleMute}
          onProgressEvent={handleProgressEvent}
          onExit={handleExitGame}
        />
      </>
    );
  }

  // Screen 3G: Arena Multiplayer — Duelo Matemático 1v1
  if (multiplayerSession?.mode === 'duel') {
    return (
      <>
        {renderSaveIndicator()}
        <MathDuel1v1Game
          student={activeStudent}
          session={multiplayerSession}
          muted={muted}
          onToggleMute={handleToggleMute}
          onProgressEvent={(ev) =>
            handleProgressEvent({
              xpGain: ev.xpDelta,
              coinsGain: ev.coinsDelta,
              answeredDelta: ev.isCorrect !== undefined ? 1 : 0,
              correctDelta: ev.isCorrect ? 1 : 0,
              streak: ev.streakCount ?? 0,
            })
          }
          onExit={handleExitGame}
        />
      </>
    );
  }

  // Screen 2: Exclusive Student Hub (Praça Social 3D, 6 Modalidades, Multiplayer, Missões, Loja, Ranking)
  return (
    <>
      {renderSaveIndicator()}
      <StudentHub
        student={activeStudent}
        allStudents={students}
        lastSyncedAt={lastSyncedAt}
        onRefreshStudents={refreshStudentsFromCloud}
        onStartMode={handleStartMode}
        onStartMultiplayer={handleStartMultiplayer}
        onUpdateStudent={handleUpdateStudent}
        onLogout={handleLogout}
      />
    </>
  );
}
