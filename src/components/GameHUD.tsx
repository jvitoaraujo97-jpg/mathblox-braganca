import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Coins,
  Flame,
  Menu,
  RotateCcw,
  Sliders,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { GameHUDState, StudentProfile, TrapFeedback, WorldConfig } from '../types/game';
import { AudioSettingsModal } from './AudioSettingsModal';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);

  const stageDisplay = Math.min(hud.currentStage + 1, hud.totalStages);
  const accuracy =
    hud.sessionAnswered > 0
      ? Math.round((hud.sessionCorrect / hud.sessionAnswered) * 100)
      : 100;

  return (
    <>
      {/* Ultra-Thin Translucent Top HUD Bar (<= 15% mobile height) */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-20 flex flex-col gap-1.5 px-2.5 pt-2 sm:px-4 sm:pt-3">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-900/60 px-2.5 py-1.5 backdrop-blur-sm shadow-lg">
          {/* Left: Stage / Grade */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-display text-xs sm:text-sm font-extrabold text-white whitespace-nowrap tabular-nums">
              Fase {stageDisplay}/{hud.totalStages}
            </span>
            <span className="hidden md:inline text-xs text-slate-400">·</span>
            <span className="hidden md:inline truncate text-xs font-semibold text-sky-300">
              {world.grade} · {student.name}
            </span>
          </div>

          {/* Center: Boost / Streak / Coins */}
          <div className="flex items-center gap-2.5 text-xs font-mono font-bold tabular-nums">
            {hud.speedBoostLeft > 0 && (
              <span className="flex items-center gap-0.5 text-sky-300">
                <Zap className="h-3.5 w-3.5" />
                {hud.speedBoostLeft.toFixed(1)}s
              </span>
            )}
            {hud.streak > 1 && (
              <span className="hidden sm:flex items-center gap-0.5 text-orange-400">
                <Flame className="h-3.5 w-3.5" />
                {hud.streak}x
              </span>
            )}
            <span className="flex items-center gap-1 text-amber-300">
              <Coins className="h-3.5 w-3.5" />
              {student.coins}
            </span>
            <span className="hidden md:inline text-emerald-400">+{hud.sessionXp} XP</span>
          </div>

          {/* Right: Single Hamburger Menu Button */}
          <div className="pointer-events-auto relative flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg border border-white/15 bg-slate-950/65 text-white hover:bg-slate-800 active:scale-95 transition-transform"
              aria-label="Abrir menu"
            >
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-10 z-50 flex w-48 flex-col gap-1 rounded-2xl border border-white/15 bg-slate-950/95 p-2 shadow-2xl backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setAudioOpen(true);
                  }}
                  className="flex min-h-[40px] items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-slate-100 hover:bg-slate-800"
                >
                  <Sliders className="h-4 w-4 text-sky-400" />
                  <span>Som &amp; Gráficos</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onExitGame();
                  }}
                  className="flex min-h-[40px] items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-rose-300 hover:bg-rose-500/15"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Sair para a Praça</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Compact Semi-Transparent Question Card */}
        {hud.activeQuestion && !hud.victory && (
          <div className="mx-auto w-full max-w-xl">
            <div className="pointer-events-auto rounded-xl border border-white/15 bg-slate-950/70 px-3 py-1.5 backdrop-blur-sm shadow-lg">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-display text-xs sm:text-sm font-extrabold text-white">
                  {hud.activeQuestion.prompt}
                </p>
                <button
                  type="button"
                  onClick={() => setQuestionCollapsed((c) => !c)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-300 hover:text-white"
                  aria-label={questionCollapsed ? 'Mostrar alternativas' : 'Ocultar alternativas'}
                >
                  {questionCollapsed ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronUp className="h-4 w-4" />
                  )}
                </button>
              </div>

              {!questionCollapsed && (
                <div className="mt-1 grid grid-cols-3 gap-1.5 text-center text-[11px] sm:text-xs font-mono font-bold">
                  <div className="rounded-lg bg-blue-600/85 px-1.5 py-0.5 text-white truncate">
                    A: {hud.activeQuestion.options[0]}
                  </div>
                  <div className="rounded-lg bg-amber-500/90 px-1.5 py-0.5 text-slate-950 truncate">
                    B: {hud.activeQuestion.options[1]}
                  </div>
                  <div className="rounded-lg bg-purple-600/85 px-1.5 py-0.5 text-white truncate">
                    C: {hud.activeQuestion.options[2]}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Audio & Graphics Settings Modal */}
      <AudioSettingsModal isOpen={audioOpen} onClose={() => setAudioOpen(false)} />

      {/* Trap Feedback Modal (after falling into lava) */}
      {trapFeedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4">
          <div className="w-full max-w-md rounded-3xl border border-rose-500/40 bg-slate-900 p-6 shadow-2xl">
            <p className="text-xs font-semibold text-rose-400">
              Armadilha na Ponte · Alternativa {trapFeedback.chosenLetter} (
              {trapFeedback.chosenAnswer})
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4">
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
                  +{hud.sessionXp} XP
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
                Ir para Loja &amp; Ranking
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
