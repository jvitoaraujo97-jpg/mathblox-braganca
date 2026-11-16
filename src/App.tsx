import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { soundEngine } from './audio/soundEngine';
import { AdminDashboard } from './components/AdminDashboard';
import { AuthPortal } from './components/AuthPortal';
import { GameHUD } from './components/GameHUD';
import { MobileControls, MobileInputState } from './components/MobileControls';
import { ObbyCanvas } from './components/ObbyCanvas';
import { StudentHub } from './components/StudentHub';
import { generateWorldLevel } from './game/levelGenerator';
import {
  createNewStudent,
  deleteStudent,
  getStorageMode,
  loadStudents,
  saveStudent,
} from './services/storageService';
import { SurvivalArenaGame } from './three/SurvivalArenaGame';
import { TurboRaceGame } from './three/TurboRaceGame';
import { VehicleRallyGame } from './three/VehicleRallyGame';
import {
  GameHUDState,
  GameModeType,
  GradeLevel,
  StudentProfile,
  TowerDifficulty,
  TrapFeedback,
} from './types/game';

export default function App() {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  const [adminMode, setAdminMode] = useState(false);

  const [playingMode, setPlayingMode] = useState<GameModeType | null>(null);
  const [playingWorldId, setPlayingWorldId] = useState<number | null>(null);
  const [playingDifficulty, setPlayingDifficulty] = useState<TowerDifficulty>('gold');
  const [runSeed, setRunSeed] = useState(1);

  const [muted, setMuted] = useState(false);
  const [trapFeedback, setTrapFeedback] = useState<TrapFeedback | null>(null);
  const [rotateCameraSignal, setRotateCameraSignal] = useState(0);

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

  useEffect(() => {
    let mounted = true;
    loadStudents().then((list) => {
      if (!mounted) return;
      setStudents(list);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const activeStudent = useMemo(
    () => students.find((s) => s.id === activeStudentId) || null,
    [students, activeStudentId]
  );

  const activeLevel = useMemo(() => {
    if (playingMode !== 'obby' || playingWorldId === null) return null;
    return generateWorldLevel(playingWorldId, playingDifficulty);
  }, [playingMode, playingWorldId, playingDifficulty, runSeed]);

  const handleUpdateStudent = useCallback((updated: StudentProfile) => {
    setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    saveStudent(updated).then((synced) => {
      setStudents(synced);
    });
  }, []);

  const handleRegisterStudent = useCallback(
    async (input: {
      name: string;
      school: string;
      grade: GradeLevel;
      pin: string;
      avatarColor: string;
    }) => {
      const { student, list } = await createNewStudent(input);
      setStudents(list);
      setAdminMode(false);
      setActiveStudentId(student.id);
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
      const { list } = await createNewStudent(input);
      setStudents(list);
    },
    []
  );

  const handleDeleteStudent = useCallback((studentId: string) => {
    setStudents((prev) => prev.filter((s) => s.id !== studentId));
    deleteStudent(studentId).then((synced) => {
      setStudents(synced);
    });
  }, []);

  const handleProgressEvent = useCallback(
    (delta: {
      xpGain: number;
      coinsGain: number;
      answeredDelta: number;
      correctDelta: number;
      streak: number;
    }) => {
      setStudents((prev) => {
        if (!activeStudentId) return prev;
        let updatedStudent: StudentProfile | null = null;
        const nextList = prev.map((s) => {
          if (s.id !== activeStudentId) return s;
          updatedStudent = {
            ...s,
            xp: s.xp + delta.xpGain,
            coins: s.coins + delta.coinsGain,
            questionsAnswered: s.questionsAnswered + delta.answeredDelta,
            questionsCorrect: s.questionsCorrect + delta.correctDelta,
            bestStreak: Math.max(s.bestStreak, delta.streak),
          };
          return updatedStudent;
        });
        if (updatedStudent) {
          saveStudent(updatedStudent);
        }
        return nextList;
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
      setPlayingMode(mode);
      setPlayingDifficulty(difficulty);
      setPlayingWorldId(worldId);
      setRunSeed((r) => r + 1);
    },
    []
  );

  const handleExitGame = useCallback(() => {
    setTrapFeedback(null);
    setPlayingMode(null);
    setPlayingWorldId(null);
    mobileInputRef.current.moveX = 0;
    mobileInputRef.current.moveY = 0;
    mobileInputRef.current.jumpPressed = false;
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        <p className="font-display text-lg font-bold">Carregando MathBlox Obby...</p>
      </div>
    );
  }

  // Restricted Teacher Admin View (Only after verifying PIN 2026)
  if (adminMode) {
    return (
      <AdminDashboard
        students={students}
        onSaveStudent={handleUpdateStudent}
        onCreateStudent={handleAdminCreateStudent}
        onDeleteStudent={handleDeleteStudent}
        onExitAdmin={() => setAdminMode(false)}
      />
    );
  }

  // Screen 1: Initial Portal (Student Login / Open Registration vs Teacher Access)
  if (!activeStudent) {
    return (
      <AuthPortal
        students={students}
        storageMode={storageMode}
        onLoginStudent={(stu) => setActiveStudentId(stu.id)}
        onRegisterStudent={handleRegisterStudent}
        onEnterAdmin={() => setAdminMode(true)}
      />
    );
  }

  // Screen 3A: Modalidade 1 — Torre Obby (Parkour 3D Clássico)
  if (playingMode === 'obby' && activeLevel && playingWorldId !== null) {
    return (
      <div className="relative h-[100dvh] w-screen overflow-hidden bg-slate-950">
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
          onVictory={() => {}}
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
      <SurvivalArenaGame
        student={activeStudent}
        worldId={playingWorldId}
        difficulty={playingDifficulty}
        muted={muted}
        onToggleMute={handleToggleMute}
        onProgressEvent={handleProgressEvent}
        onExit={handleExitGame}
      />
    );
  }

  // Screen 3C: Modalidade 3 — Corrida Turbo ("Contra o Relógio")
  if (playingMode === 'turbo_race' && playingWorldId !== null) {
    return (
      <TurboRaceGame
        student={activeStudent}
        worldId={playingWorldId}
        difficulty={playingDifficulty}
        muted={muted}
        onToggleMute={handleToggleMute}
        onProgressEvent={handleProgressEvent}
        onExit={handleExitGame}
      />
    );
  }

  // Screen 3D: Modalidade 4 — Rali Matemático ("Modo Veículo / Kart 3D")
  if (playingMode === 'vehicle_rally' && playingWorldId !== null) {
    return (
      <VehicleRallyGame
        student={activeStudent}
        worldId={playingWorldId}
        difficulty={playingDifficulty}
        muted={muted}
        onToggleMute={handleToggleMute}
        onProgressEvent={handleProgressEvent}
        onExit={handleExitGame}
      />
    );
  }

  // Screen 2: Exclusive Student Hub (Praça Social 3D, 3 Modalidades, Vestiário de Times 3D, Ranking)
  return (
    <StudentHub
      student={activeStudent}
      allStudents={students}
      onStartMode={handleStartMode}
      onUpdateStudent={handleUpdateStudent}
      onLogout={() => setActiveStudentId(null)}
    />
  );
}
