import { ArrowLeft, ChevronDown, ChevronUp, Coins, Flame, RotateCcw, Trophy, Zap } from 'lucide-react';
import { useState } from 'react';
import { GameHUDState, StudentProfile, TrapFeedback, WorldConfig } from '../types/game';
import { AudioSettingsButton } from './AudioSettingsModal';

interface GameHUDProps {
  student: StudentProfile;
  world: WorldConfig;
  hud: GameHUDState;
  trapFeedback: TrapFeedback | null;
  muted: boolean;
  onToggleMute: () => void;
  onExitGame: () => void;
  onDismissTrap: () => void;
  onReplayWorld: () => void;
}

export function GameHUD({
  student,
  world,
  hud,
  trapFeedback,
  onExitGame,
  onDismissTrap,
  onReplayWorld,
}: GameHUDProps) {
  const [questionCollapsed, setQuestionCollapsed] = useState(false);

  const stageDisplay = Math.min(hud.currentStage + 1, hud.totalStages);
  const accuracy =
    hud.sessionAnswered > 0
      ? Math.round((hud.sessionCorrect / hud.sessionAnswered) * 100)
      : 100;

  return (
    <>
      {/* Top Compact HUD Bar (no backdrop-blur over WebGL!) */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-20 p-2.5 sm:p-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 rounded-2xl border border-white/15 bg-slate-950/90 px-3 py-2 shadow-xl">
          {/* Left: Exit + World Stage */}
          <div className="pointer-events-auto flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onExitGame}
              className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-2.5 text-xs font-semibold text-white hover:bg-slate-800 active:scale-95 transition-transform whitespace-nowrap shrink-0"
              aria-label="Voltar ao Lobby"
            >
              <ArrowLeft className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Lobby</span>
            </button>

            <div className="min-w-0">
              <p className="truncate font-display text-xs sm:text-sm font-bold text-white">
                {world.grade} · Estágio {stageDisplay}/{hud.totalStages}
              </p>
              <p className="truncate text-[11px] text-slate-400">{student.name}</p>
            </div>
          </div>

          {/* Right: Coins, XP, Streak, Audio Settings */}
          <div className="pointer-events-auto flex items-center gap-2 sm:gap-3 shrink-0">
            {hud.speedBoostLeft > 0 && (
              <div className="flex items-center gap-1 rounded-lg bg-sky-500/20 px-2 py-1 text-xs font-bold text-sky-300 tabular-nums whitespace-nowrap">
                <Zap className="h-3.5 w-3.5 text-sky-400" />
                <span>{hud.speedBoostLeft.toFixed(1)}s</span>
              </div>
            )}

            {hud.streak > 0 && (
              <div className="hidden xs:flex sm:flex items-center gap-1 text-xs font-bold text-orange-400 tabular-nums whitespace-nowrap">
                <Flame className="h-4 w-4" />
                <span>{hud.streak}x</span>
              </div>
            )}

            <div className="flex items-center gap-1 text-xs sm:text-sm font-bold text-amber-400 font-mono tabular-nums whitespace-nowrap">
              <Coins className="h-4 w-4" />
              <span>{student.coins}</span>
            </div>

            <div className="hidden sm:block font-mono text-xs font-bold text-emerald-400 tabular-nums whitespace-nowrap">
              +{hud.sessionXp} XP
            </div>

            <AudioSettingsButton compact />
          </div>
        </div>

        {/* Mirrored Active Question Card for Comfortable Mobile Reading */}
        {hud.activeQuestion && !hud.victory && (
          <div className="mx-auto mt-2 max-w-2xl">
            <div className="pointer-events-auto rounded-2xl border border-white/15 bg-slate-950/90 px-3.5 py-2.5 shadow-lg">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-sky-400 truncate">
                  Desafio {hud.activeQuestion.stageIndex + 1} · {hud.activeQuestion.topic}
                </span>
                <button
                  type="button"
                  onClick={() => setQuestionCollapsed((c) => !c)}
                  className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-white whitespace-nowrap shrink-0"
                >
                  <span>{questionCollapsed ? 'Ver questão' : 'Ocultar'}</span>
                  {questionCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                </button>
              </div>

              {!questionCollapsed && (
                <>
                  <p className="mt-1 text-sm sm:text-base font-bold leading-snug text-white">
                    {hud.activeQuestion.prompt}
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-xs font-mono font-bold">
                    <div className="rounded-lg bg-blue-600/90 px-1.5 py-1 text-white truncate">
                      A: {hud.activeQuestion.options[0]}
                    </div>
                    <div className="rounded-lg bg-amber-500/95 px-1.5 py-1 text-slate-950 truncate">
                      B: {hud.activeQuestion.options[1]}
                    </div>
                    <div className="rounded-lg bg-purple-600/90 px-1.5 py-1 text-white truncate">
                      C: {hud.activeQuestion.options[2]}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Trap Feedback Modal (after falling into lava) */}
      {trapFeedback && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/85 p-4">
          <div className="w-full max-w-md rounded-3xl border border-rose-500/40 bg-slate-900 p-6 shadow-2xl">
            <p className="text-xs font-semibold text-rose-400">
              Armadilha na Ponte · Alternativa {trapFeedback.chosenLetter} ({trapFeedback.chosenAnswer})
            </p>
            <h3 className="mt-1.5 font-display text-xl font-extrabold text-white">
              Quase lá! Veja como resolver:
            </h3>
            <p className="mt-2 text-sm font-medium text-slate-300">
              {trapFeedback.question.prompt}
            </p>

            <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-950/50 p-4">
              <p className="text-xs font-semibold text-emerald-300">
                Resposta correta: {['A', 'B', 'C'][trapFeedback.question.correctIndex]} (
                {trapFeedback.question.options[trapFeedback.question.correctIndex]})
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-100">
                {trapFeedback.question.explanation}
              </p>
            </div>

            <button
              type="button"
              onClick={onDismissTrap}
              className="mt-5 flex w-full min-h-[48px] items-center justify-center rounded-xl bg-sky-500 px-4 py-3 font-display text-sm font-extrabold text-slate-950 hover:bg-sky-400 active:scale-[0.98] transition-all"
            >
              Continuar do Checkpoint
            </button>
          </div>
        </div>
      )}

      {/* Victory Modal */}
      {hud.victory && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/85 p-4">
          <div className="w-full max-w-md rounded-3xl border border-amber-400/50 bg-slate-900 p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-400">
              <Trophy className="h-9 w-9" />
            </div>

            <p className="mt-4 text-xs font-semibold text-amber-400">
              Torre Concluída · {world.grade}
            </p>
            <h2 className="mt-1 font-display text-2xl font-extrabold text-white">
              Parabéns, {student.name}!
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              Você chegou ao topo de {world.title}.
            </p>

            <div className="mt-5 grid grid-cols-3 gap-2.5 text-center">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <p className="text-[11px] text-slate-400">XP Ganho</p>
                <p className="mt-0.5 font-mono text-lg font-bold text-emerald-400 tabular-nums">
                  +{hud.sessionXp}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <p className="text-[11px] text-slate-400">BloxCoins</p>
                <p className="mt-0.5 font-mono text-lg font-bold text-amber-400 tabular-nums">
                  +{hud.sessionCoins}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <p className="text-[11px] text-slate-400">Precisão</p>
                <p className="mt-0.5 font-mono text-lg font-bold text-sky-400 tabular-nums">
                  {accuracy}%
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={onReplayWorld}
                className="flex flex-1 min-h-[46px] items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-700"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Jogar Novamente</span>
              </button>
              <button
                type="button"
                onClick={onExitGame}
                className="flex flex-1 min-h-[46px] items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 font-display text-sm font-extrabold text-slate-950 hover:bg-emerald-400"
              >
                Ir para Loja & Ranking
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
