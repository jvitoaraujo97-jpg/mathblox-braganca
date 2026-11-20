import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Coins,
  Gamepad2,
  LogOut,
  Pencil,
  ShoppingBag,
  Swords,
  Target,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import {
  countClaimableDailyMissions,
  subscribeDailyMissions,
} from '../data/missionsAndTitles';
import { getJerseyConfig } from '../three/jerseyBuilder';
import { SocialPlaza3D } from '../three/SocialPlaza3D';
import {
  GameModeType,
  MultiplayerSessionConfig,
  StudentProfile,
  TowerDifficulty,
} from '../types/game';
import { AvatarShop3D } from './AvatarShop3D';
import { AudioSettingsButton } from './AudioSettingsModal';
import { DailyMissionsModal } from './DailyMissionsModal';
import { GameModeSelector } from './GameModeSelector';
import { LeaderboardPanel } from './LeaderboardModal';
import { MultiplayerLobbyModal } from './MultiplayerLobbyModal';

interface StudentHubProps {
  student: StudentProfile;
  allStudents: StudentProfile[];
  lastSyncedAt: Date | null;
  onRefreshStudents: () => Promise<void>;
  onStartMode: (mode: GameModeType, worldId: number, difficulty: TowerDifficulty) => void;
  onStartMultiplayer: (session: MultiplayerSessionConfig) => void;
  onUpdateStudent: (updated: StudentProfile) => Promise<void> | void;
  onLogout: () => void;
}

type StudentTab = 'praca' | 'modalidades' | 'loja' | 'ranking';

export function StudentHub({
  student,
  allStudents,
  lastSyncedAt,
  onRefreshStudents,
  onStartMode,
  onStartMultiplayer,
  onUpdateStudent,
  onLogout,
}: StudentHubProps) {
  const [activeTab, setActiveTab] = useState<StudentTab>('praca');
  const [refreshingRanking, setRefreshingRanking] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [multiplayerOpen, setMultiplayerOpen] = useState(false);
  const [missionsOpen, setMissionsOpen] = useState(false);
  const [claimableMissions, setClaimableMissions] = useState(() =>
    countClaimableDailyMissions(student.id)
  );

  useEffect(
    () =>
      subscribeDailyMissions(() => {
        setClaimableMissions(countClaimableDailyMissions(student.id));
      }),
    [student.id]
  );

  // Inline School Editing State
  const [editingSchool, setEditingSchool] = useState(false);
  const [schoolInput, setSchoolInput] = useState(student.school);

  // Trigger silent cloud refresh whenever Ranking tab is opened
  useEffect(() => {
    if (activeTab !== 'ranking') return;
    let mounted = true;
    setRefreshingRanking(true);
    void onRefreshStudents().finally(() => {
      if (mounted) setRefreshingRanking(false);
    });
    const timer = window.setInterval(() => setNowTick(Date.now()), 5000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [activeTab, onRefreshStudents]);

  const handleManualRefreshRanking = () => {
    if (refreshingRanking) return;
    setRefreshingRanking(true);
    void onRefreshStudents().finally(() => {
      setRefreshingRanking(false);
      setNowTick(Date.now());
    });
  };

  const syncTimestampLabel = useMemo(() => {
    if (!lastSyncedAt) return 'Sincronizando...';
    const diffSec = Math.max(0, Math.floor((nowTick - lastSyncedAt.getTime()) / 1000));
    if (diffSec < 15) return 'Atualizado agora';
    if (diffSec < 60) return `Atualizado há ${diffSec}s`;
    const hh = String(lastSyncedAt.getHours()).padStart(2, '0');
    const mm = String(lastSyncedAt.getMinutes()).padStart(2, '0');
    return `Atualizado às ${hh}:${mm}`;
  }, [lastSyncedAt, nowTick]);

  const equippedClub = useMemo(
    () => getJerseyConfig(student.equippedJersey),
    [student.equippedJersey]
  );

  const accuracy =
    student.questionsAnswered > 0
      ? Math.round((student.questionsCorrect / student.questionsAnswered) * 100)
      : 0;

  const handleSaveSchool = () => {
    const trimmed = schoolInput.trim();
    if (!trimmed) return;
    onUpdateStudent({
      ...student,
      school: trimmed,
    });
    setEditingSchool(false);
  };

  if (activeTab === 'praca') {
    return (
      <>
        <SocialPlaza3D
          student={student}
          allStudents={allStudents}
          onUpdateStudent={onUpdateStudent}
          onEnterGameMode={(mode) => onStartMode(mode, student.worldId, 'gold')}
          onOpenModes={() => setActiveTab('modalidades')}
          onOpenShop={() => setActiveTab('loja')}
          onOpenRanking={() => setActiveTab('ranking')}
          onOpenMultiplayer={() => setMultiplayerOpen(true)}
          onOpenMissions={() => setMissionsOpen(true)}
          onLogout={onLogout}
        />

        {/* Modais Fase 2: Missões Diárias & Títulos + Arena Multiplayer */}
        <DailyMissionsModal
          isOpen={missionsOpen}
          student={student}
          onClose={() => setMissionsOpen(false)}
          onUpdateStudent={async (updated) => {
            await onUpdateStudent(updated);
          }}
        />

        <MultiplayerLobbyModal
          isOpen={multiplayerOpen}
          student={student}
          onClose={() => setMultiplayerOpen(false)}
          onStartMultiplayer={(session) => {
            setMultiplayerOpen(false);
            onStartMultiplayer(session);
          }}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-22 sm:pb-10">
      {/* Top Bar — 3-Zone Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <span className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-white whitespace-nowrap shrink-0">
            MathBlox Obby
          </span>

          {/* Desktop 4 Student Navigation Tabs */}
          <nav className="hidden sm:flex items-center gap-6 text-sm font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('praca')}
              className="py-1 transition-colors whitespace-nowrap shrink-0 text-emerald-400 hover:text-emerald-300"
            >
              Praça Social 3D
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('modalidades')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'modalidades'
                  ? 'text-sky-400 border-b-2 border-sky-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              6 Modalidades (Jogar)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('loja')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'loja'
                  ? 'text-amber-400 border-b-2 border-amber-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Vestiário & Times (19)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ranking')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'ranking'
                  ? 'text-sky-400 border-b-2 border-sky-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Ranking
            </button>
          </nav>

          {/* Right Primary Action: Som + Sair / Trocar Conta */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <AudioSettingsButton compact />
            <button
              type="button"
              onClick={onLogout}
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <LogOut className="h-3.5 w-3.5 text-rose-400" />
              <span>Sair / Trocar Conta</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:py-6">
        {/* Cabeçalho do Perfil com Colégio Editável */}
        <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {/* Avatar Thumbnail + Name + Grade + Editable School */}
            <div className="flex items-start sm:items-center gap-3.5 min-w-0">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-white/20 font-display text-2xl font-extrabold text-white shadow-inner"
                style={{
                  backgroundColor: equippedClub ? equippedClub.primary : student.avatarColor,
                }}
              >
                {equippedClub ? equippedClub.shortTag : student.name.charAt(0).toUpperCase()}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <h1 className="font-display text-xl sm:text-2xl font-extrabold text-white truncate">
                    {student.name}
                  </h1>
                  <span className="text-xs font-semibold text-sky-400">· {student.grade}</span>
                  {student.equippedTitle && (
                    <span className="rounded-lg border border-yellow-400/50 bg-yellow-400/15 px-2 py-0.5 text-[11px] font-black text-yellow-200">
                      {student.equippedTitle}
                    </span>
                  )}
                  <span className="rounded-lg border border-amber-400/40 bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                    ⚡ Aura Nv. {Math.max(1, Math.floor((student.auraPower || 0) / 10) + 1)} ({student.auraPower || 0} pts)
                  </span>
                  {equippedClub && (
                    <span className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                      ⚽ Camisa {equippedClub.clubName} #10
                    </span>
                  )}
                </div>

                {/* Editable School Row */}
                {!editingSchool ? (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                    <span>
                      Colégio: <strong className="font-semibold text-white">{student.school}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSchoolInput(student.school);
                        setEditingSchool(true);
                      }}
                      className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-sky-300 hover:bg-slate-700 hover:text-white transition-colors"
                      title="Editar nome do colégio"
                    >
                      <Pencil className="h-3 w-3" />
                      <span>Editar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMultiplayerOpen(true)}
                      className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-cyan-500/50 bg-cyan-500/15 px-2.5 py-1 text-[11px] font-extrabold text-cyan-200 hover:bg-cyan-400 hover:text-slate-950 transition-colors"
                    >
                      <Swords className="h-3 w-3" />
                      <span>Jogar com Amigos</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMissionsOpen(true)}
                      className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-amber-400/50 bg-amber-500/15 px-2.5 py-1 text-[11px] font-extrabold text-amber-200 hover:bg-amber-400 hover:text-slate-950 transition-colors"
                    >
                      <Target className="h-3 w-3" />
                      <span>Missões</span>
                      {claimableMissions > 0 && (
                        <span className="rounded-full bg-emerald-400 px-1.5 text-[10px] font-black text-slate-950">
                          {claimableMissions}
                        </span>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={schoolInput}
                      onChange={(e) => setSchoolInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveSchool();
                        if (e.key === 'Escape') setEditingSchool(false);
                      }}
                      placeholder="Nome do Colégio / Instituição"
                      className="min-h-[36px] w-56 sm:w-64 rounded-xl border border-sky-500 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleSaveSchool}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Salvar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSchool(false)}
                      className="inline-flex min-h-[36px] items-center justify-center rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
                      aria-label="Cancelar edição"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Player Metrics Strip: XP Total, BloxCoins, Precisão */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3 shrink-0">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-center">
                <p className="text-[11px] text-slate-400">XP Total</p>
                <p className="mt-0.5 font-mono text-base sm:text-lg font-bold text-emerald-400 tabular-nums">
                  {student.xp}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-center">
                <p className="text-[11px] text-slate-400">BloxCoins</p>
                <p className="mt-0.5 flex items-center justify-center gap-1 font-mono text-base sm:text-lg font-bold text-amber-400 tabular-nums">
                  <Coins className="h-4 w-4 shrink-0" />
                  <span>{student.coins}</span>
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-center">
                <p className="text-[11px] text-slate-400">Precisão</p>
                <p className="mt-0.5 font-mono text-base sm:text-lg font-bold text-sky-400 tabular-nums">
                  {accuracy}%
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ABA 2: SELETOR DAS 6 MODALIDADES 3D + ARENA MULTIPLAYER */}
        {activeTab === 'modalidades' && (
          <div className="mt-5">
            <GameModeSelector
              student={student}
              onStartMode={onStartMode}
              onOpenMultiplayer={() => setMultiplayerOpen(true)}
            />
          </div>
        )}

        {/* ABA 3: LOJA & VESTIÁRIO DE TIMES 3D */}
        {activeTab === 'loja' && (
          <div className="mt-5">
            <AvatarShop3D student={student} onUpdateStudent={onUpdateStudent} />
          </div>
        )}

        {/* ABA 4: RANKING COMPETITIVO (INDIVIDUAL + BATALHA DE COLÉGIOS) */}
        {activeTab === 'ranking' && (
          <div className="mt-5">
            <LeaderboardPanel
              student={student}
              allStudents={allStudents}
              syncTimestampLabel={syncTimestampLabel}
              refreshing={refreshingRanking}
              onManualRefresh={handleManualRefreshRanking}
            />
          </div>
        )}
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (4 Tabs) */}
      <nav className="sm:hidden fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-800 bg-slate-950/95 pb-safe">
        <button
          type="button"
          onClick={() => setActiveTab('praca')}
          className="flex min-h-[56px] flex-col items-center justify-center gap-1 text-[10px] font-bold text-emerald-400"
        >
          <Users className="h-5 w-5" />
          <span>Praça 3D</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('modalidades')}
          className={`flex min-h-[56px] flex-col items-center justify-center gap-1 text-[10px] font-bold ${
            activeTab === 'modalidades' ? 'text-sky-400' : 'text-slate-400'
          }`}
        >
          <Gamepad2 className="h-5 w-5" />
          <span>Modalidades</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('loja')}
          className={`flex min-h-[56px] flex-col items-center justify-center gap-1 text-[10px] font-bold ${
            activeTab === 'loja' ? 'text-amber-400' : 'text-slate-400'
          }`}
        >
          <ShoppingBag className="h-5 w-5" />
          <span>Times & Loja</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ranking')}
          className={`flex min-h-[56px] flex-col items-center justify-center gap-1 text-[10px] font-bold ${
            activeTab === 'ranking' ? 'text-sky-400' : 'text-slate-400'
          }`}
        >
          <Trophy className="h-5 w-5" />
          <span>Ranking</span>
        </button>
      </nav>
      {/* Modais Fase 2: Missões Diárias & Títulos + Arena Multiplayer */}
      <DailyMissionsModal
        isOpen={missionsOpen}
        student={student}
        onClose={() => setMissionsOpen(false)}
        onUpdateStudent={async (updated) => {
          await onUpdateStudent(updated);
        }}
      />

      <MultiplayerLobbyModal
        isOpen={multiplayerOpen}
        student={student}
        onClose={() => setMultiplayerOpen(false)}
        onStartMultiplayer={(session) => {
          setMultiplayerOpen(false);
          onStartMultiplayer(session);
        }}
      />
    </div>
  );
}
