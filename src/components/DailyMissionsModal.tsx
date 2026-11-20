import { useEffect, useState } from 'react';
import { Award, Check, Coins, Lock, Sparkles, Target, X } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import {
  ACHIEVEMENT_TITLES,
  computeUnlockedTitles,
  DAILY_MISSION_DEFS,
  DailyMissionId,
  getDailyMissionsState,
  markDailyMissionClaimed,
  subscribeDailyMissions,
} from '../data/missionsAndTitles';
import { StudentProfile } from '../types/game';

interface DailyMissionsModalProps {
  isOpen: boolean;
  student: StudentProfile;
  onUpdateStudent: (updated: StudentProfile) => Promise<void> | void;
  onClose: () => void;
}

export function DailyMissionsModal({
  isOpen,
  student,
  onUpdateStudent,
  onClose,
}: DailyMissionsModalProps) {
  const [dailyState, setDailyState] = useState(() => getDailyMissionsState(student.id));
  const [claimingId, setClaimingId] = useState<DailyMissionId | null>(null);
  const [equippingTitle, setEquippingTitle] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDailyState(getDailyMissionsState(student.id));
    return subscribeDailyMissions(() => {
      setDailyState(getDailyMissionsState(student.id));
    });
  }, [isOpen, student.id]);

  // Automatically sync any newly earned titles into the student's Supabase profile
  useEffect(() => {
    if (!isOpen) return;
    const { unlockedTitles, newlyUnlocked } = computeUnlockedTitles(student);
    if (newlyUnlocked.length > 0) {
      void onUpdateStudent({
        ...student,
        unlockedTitles,
        equippedTitle: student.equippedTitle || unlockedTitles[0] || null,
      });
    }
  }, [isOpen, student, onUpdateStudent]);

  if (!isOpen) return null;

  const { unlockedTitles } = computeUnlockedTitles(student);
  const unlockedSet = new Set<string>(unlockedTitles);

  const handleClaim = async (missionId: DailyMissionId) => {
    if (claimingId) return;
    const claimedDef = markDailyMissionClaimed(student.id, missionId);
    if (!claimedDef) return;

    setClaimingId(missionId);
    soundEngine.playCoin();
    setDailyState(getDailyMissionsState(student.id));

    try {
      const nextTitles = computeUnlockedTitles(student).unlockedTitles;
      await onUpdateStudent({
        ...student,
        coins: student.coins + claimedDef.rewardCoins,
        unlockedTitles: nextTitles,
      });
      setFeedback(`+${claimedDef.rewardCoins} BloxCoins creditadas e salvas na nuvem!`);
      window.setTimeout(() => setFeedback(null), 2600);
    } finally {
      setClaimingId(null);
    }
  };

  const handleEquipTitle = async (titleId: string | null) => {
    if (equippingTitle) return;
    setEquippingTitle(titleId || '__none__');
    soundEngine.playCheckpoint();
    try {
      await onUpdateStudent({
        ...student,
        unlockedTitles,
        equippedTitle: titleId,
      });
      setFeedback(
        titleId
          ? `Título "${titleId}" equipado na sua etiqueta 3D!`
          : 'Título removido da etiqueta 3D.'
      );
      window.setTimeout(() => setFeedback(null), 2400);
    } finally {
      setEquippingTitle(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/85 p-3 sm:p-5">
      <div className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300 border border-amber-400/30">
              <Target className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg sm:text-xl font-extrabold text-white truncate">
                Missões Diárias &amp; Títulos
              </h2>
              <p className="text-xs text-slate-400 truncate">
                Metas de hoje ({dailyState.date}) · Saldo:{' '}
                <strong className="font-mono text-amber-300">{student.coins} BloxCoins</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
            aria-label="Fechar missões"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {feedback && (
            <div className="rounded-xl border border-emerald-400/40 bg-emerald-950/70 px-4 py-2.5 text-xs font-bold text-emerald-200">
              {feedback}
            </div>
          )}

          {/* Section 1: 3 Daily Missions */}
          <section>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-extrabold text-white">
                Metas Diárias de Hoje
              </h3>
              <span className="text-xs text-slate-400">Renovam todo dia à meia-noite</span>
            </div>

            <div className="mt-3 space-y-3">
              {DAILY_MISSION_DEFS.map((mission) => {
                const entry = dailyState.missions[mission.id] || { progress: 0, claimed: false };
                const current = Math.min(entry.progress, mission.target);
                const pct = Math.min(100, Math.round((current / mission.target) * 100));
                const canClaim = !entry.claimed && current >= mission.target;

                return (
                  <div
                    key={mission.id}
                    className={`rounded-2xl border p-4 transition-colors ${
                      canClaim
                        ? 'border-amber-400/60 bg-amber-950/20'
                        : entry.claimed
                        ? 'border-emerald-500/30 bg-slate-950/60'
                        : 'border-slate-800 bg-slate-950/80'
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{mission.icon}</span>
                          <span className="font-display text-sm font-extrabold text-white">
                            {mission.title}
                          </span>
                          <span className="font-mono text-xs font-bold text-amber-300 tabular-nums">
                            +{mission.rewardCoins} Coins
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-300">{mission.description}</p>

                        <div className="mt-2.5 flex items-center gap-2.5">
                          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                entry.claimed
                                  ? 'bg-emerald-400'
                                  : canClaim
                                  ? 'bg-amber-400'
                                  : 'bg-sky-400'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs font-bold text-slate-200 tabular-nums whitespace-nowrap">
                            {current}/{mission.target}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {entry.claimed ? (
                          <div className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-bold text-emerald-300">
                            <Check className="h-4 w-4" />
                            <span>Resgatada</span>
                          </div>
                        ) : canClaim ? (
                          <button
                            type="button"
                            disabled={claimingId === mission.id}
                            onClick={() => void handleClaim(mission.id)}
                            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 font-display text-xs font-black text-slate-950 shadow-lg hover:bg-amber-300 active:scale-95 disabled:opacity-60 whitespace-nowrap"
                          >
                            <Coins className="h-4 w-4" />
                            <span>
                              {claimingId === mission.id
                                ? 'Salvando...'
                                : 'Resgatar Recompensa'}
                            </span>
                          </button>
                        ) : (
                          <span className="inline-flex min-h-[38px] items-center rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-400 whitespace-nowrap">
                            Em progresso
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Section 2: Unlockable Achievement Titles */}
          <section className="border-t border-slate-800 pt-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 text-sky-400" />
                <h3 className="font-display text-sm font-extrabold text-white">
                  Títulos de Conquista (Etiqueta 3D na Praça)
                </h3>
              </div>
              <span className="font-mono text-xs text-sky-300 tabular-nums">
                {unlockedTitles.length}/{ACHIEVEMENT_TITLES.length} desbloqueados
              </span>
            </div>

            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {ACHIEVEMENT_TITLES.map((title) => {
                const isUnlocked = unlockedSet.has(title.id);
                const isEquipped = student.equippedTitle === title.id;

                return (
                  <div
                    key={title.id}
                    className={`flex flex-col justify-between rounded-2xl border p-3.5 ${
                      isEquipped
                        ? 'border-cyan-400 bg-cyan-950/30'
                        : isUnlocked
                        ? 'border-slate-700 bg-slate-950/80'
                        : 'border-slate-800/80 bg-slate-950/40 opacity-75'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-sm font-extrabold text-white">
                          {title.label}
                        </span>
                        {!isUnlocked && <Lock className="h-3.5 w-3.5 text-slate-500 shrink-0" />}
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                        {title.requirement}
                      </p>
                    </div>

                    <div className="mt-3">
                      {isEquipped ? (
                        <button
                          type="button"
                          disabled={Boolean(equippingTitle)}
                          onClick={() => void handleEquipTitle(null)}
                          className="flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded-xl border border-cyan-400/50 bg-cyan-400/20 px-3 py-1.5 text-xs font-extrabold text-cyan-200 hover:bg-cyan-400/30"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>Equipado (Remover)</span>
                        </button>
                      ) : isUnlocked ? (
                        <button
                          type="button"
                          disabled={Boolean(equippingTitle)}
                          onClick={() => void handleEquipTitle(title.id)}
                          className="flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded-xl bg-sky-500 px-3 py-1.5 text-xs font-extrabold text-slate-950 hover:bg-sky-400 active:scale-[0.98]"
                        >
                          <span>Equipar Título</span>
                        </button>
                      ) : (
                        <div className="flex min-h-[34px] w-full items-center justify-center rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-[11px] font-semibold text-slate-500">
                          Bloqueado
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
