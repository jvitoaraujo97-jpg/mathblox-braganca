import { useMemo, useState } from 'react';
import {
  Car,
  Coins,
  Flame,
  Layers,
  Play,
  Sparkles,
  Swords,
  Target,
  Timer,
  Trophy,
  Waves,
  Zap,
} from 'lucide-react';
import { getWorldById, TOWER_DIFFICULTIES, WORLDS } from '../data/worlds';
import { GameModeType, StudentProfile, TowerDifficulty } from '../types/game';

interface GameModeSelectorProps {
  student: StudentProfile;
  initialMode?: GameModeType;
  onStartMode: (mode: GameModeType, worldId: number, difficulty: TowerDifficulty) => void;
  onOpenMultiplayer?: () => void;
}

const MODE_CARDS: {
  id: GameModeType;
  title: string;
  tag: string;
  subtitle: string;
  mechanics: string[];
  accentColor: string;
  borderClass: string;
  buttonClass: string;
}[] = [
  {
    id: 'obby',
    title: 'Torre Obby 3D',
    tag: 'Portal Verde · Geometria, Frações & Equações',
    subtitle:
      'Suba a torre suspensa sobre lava, salte pelos blocos móveis e atravesse as pontes da resposta certa.',
    mechanics: [
      'Banco temático de Geometria, Frações, Decimais e Equações',
      'Checkpoints por andar + Trampolins de impulso',
      'Motor anti-repetição: perguntas inéditas a cada partida',
    ],
    accentColor: 'text-emerald-400',
    borderClass: 'border-emerald-500/50',
    buttonClass: 'bg-emerald-500 hover:bg-emerald-400 text-slate-950',
  },
  {
    id: 'survival',
    title: 'Arena Sobrevivência',
    tag: 'Portal Laranja · Porcentagem, Proporção & Médias',
    subtitle:
      'Tabuleiro 3x3 com 9 plataformas coloridas (A, B, C) sobre a lava. Corra para o piso certo antes do cronômetro zerar!',
    mechanics: [
      'Problemas contextualizados, Regra de 3, Médias e Potências',
      'No 0s, pisos errados tremem e despencam na lava',
      'Sobreviva às 8 ondas para ganhar o Bônus Máximo',
    ],
    accentColor: 'text-amber-400',
    borderClass: 'border-amber-500/50',
    buttonClass: 'bg-amber-400 hover:bg-amber-300 text-slate-950',
  },
  {
    id: 'turbo_race',
    title: 'Corrida de Tabuada',
    tag: 'Portal Azul · Tabuada & Raciocínio Rápido (950m)',
    subtitle:
      'Pista longa de 950m com 8 portões espaçados a cada 110m e setas luminosas no chão para cálculo mental ágil!',
    mechanics: [
      '1º ao 6º Ano: Contagem, soma, subtração, tabuada direta e divisão',
      '7º ao 9º Ano: Inteiros negativos, raízes, potências e cálculo mental',
      '6 a 8s entre portões + Mega Turbo 2.2x nos acertos',
    ],
    accentColor: 'text-sky-400',
    borderClass: 'border-sky-500/50',
    buttonClass: 'bg-sky-500 hover:bg-sky-400 text-slate-950',
  },
  {
    id: 'vehicle_rally',
    title: 'Rali de Kart 2.0',
    tag: 'Portal Dourado · Curvas, Drift & Praia de Ajuruteua',
    subtitle:
      'Circuito sinuoso na Estrada de Ajuruteua (PA-458) com Drift com Mini-Turbo, zebras PBR, rampas de salto e chegada na praia!',
    mechanics: [
      'Segure DRIFT nas curvas para soltar faíscas e carregar Mini-Turbo (+45%)',
      'Assistência de Curva opcional (ativada por padrão para 1º ao 3º Ano)',
      'Desvie de lama e cones, salte rampas e atravesse os 8 portais',
    ],
    accentColor: 'text-yellow-300',
    borderClass: 'border-yellow-400/60',
    buttonClass: 'bg-yellow-400 hover:bg-yellow-300 text-slate-950',
  },
  {
    id: 'penalty',
    title: 'Pênaltis da Matemática',
    tag: 'Portal Estádio · Estádio do Caeté (Futebol 3D)',
    subtitle:
      'Vista sua camisa de time, mire nos 3 alvos luminosos do gol (A, B, C) e faça golaços acertando questões BNCC!',
    mechanics: [
      '8 cobranças de pênalti com goleiro articulado e torcida vibrante',
      'Toque direto nos alvos do gol 3D ou use os botões elevados A, B e C',
      'Desbloqueie o título ⚽ Artilheiro do Caeté marcando gols!',
    ],
    accentColor: 'text-emerald-300',
    borderClass: 'border-emerald-400/60',
    buttonClass: 'bg-emerald-400 hover:bg-emerald-300 text-slate-950',
  },
  {
    id: 'caete_boat',
    title: 'Regata no Rio Caeté',
    tag: 'Portal Turquesa · Cálculo Mental Fluvial (Rio Caeté)',
    subtitle:
      'Pilote uma voadeira de alumínio entre açaizeiros, miritizeiros e trapiches até a Orla de Bragança e o Mirante de São Benedito!',
    mechanics: [
      '8 estágios de boias luminosas (A, B, C) com barra regressiva de 10s',
      'Desvie de balseiros, bancos de areia e ilhotas de mururé com Turbo de Popa',
      'Complete a travessia ou acerte 8 boias para desbloquear ⚓ Comandante do Caeté!',
    ],
    accentColor: 'text-teal-300',
    borderClass: 'border-teal-400/60',
    buttonClass: 'bg-teal-400 hover:bg-teal-300 text-slate-950',
  },
];

export function GameModeSelector({
  student,
  initialMode = 'obby',
  onStartMode,
  onOpenMultiplayer,
}: GameModeSelectorProps) {
  const [selectedWorldId, setSelectedWorldId] = useState<number>(student.worldId);
  const [selectedDifficulty, setSelectedDifficulty] = useState<TowerDifficulty>('gold');
  const [highlightedMode, setHighlightedMode] = useState<GameModeType>(initialMode);

  const selectedWorld = useMemo(() => getWorldById(selectedWorldId), [selectedWorldId]);
  const activeDiff = useMemo(
    () => TOWER_DIFFICULTIES.find((d) => d.id === selectedDifficulty) || TOWER_DIFFICULTIES[2],
    [selectedDifficulty]
  );

  return (
    <div className="space-y-6">
      {/* Step 1: Série / Mundo + Dificuldade Selector */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold text-sky-400">
              Motor Anti-Repetição Ativo · Mundo {selectedWorld.id} ({selectedWorld.grade})
              {selectedWorld.id === student.worldId ? ' · Sua Série Atual' : ' · Modo Revisão'}
            </p>
            <h2 className="mt-1 font-display text-2xl sm:text-3xl font-extrabold text-white">
              {selectedWorld.title} — {selectedWorld.subtitle}
            </h2>
            <p className="mt-1.5 text-xs text-slate-400">
              Temas da série: {selectedWorld.topics.join(' · ')}
            </p>
          </div>

          {/* Series Switcher */}
          <div className="flex flex-col gap-1.5 shrink-0">
            <span className="text-[11px] font-medium text-slate-400">
              Série / Mundo das questões:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {WORLDS.map((w) => {
                const active = w.id === selectedWorldId;
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setSelectedWorldId(w.id)}
                    className={`min-h-[36px] rounded-xl px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-sky-500 text-slate-950'
                        : 'border border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700 hover:text-white'
                    }`}
                  >
                    {w.grade}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Difficulty / Reward Tier Selector */}
        <div className="mt-5 border-t border-slate-800 pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-bold text-slate-200">
                Nível de Recompensa por Desempenho:
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:w-auto">
              {TOWER_DIFFICULTIES.map((diff) => {
                const active = diff.id === selectedDifficulty;
                return (
                  <button
                    key={diff.id}
                    type="button"
                    onClick={() => setSelectedDifficulty(diff.id)}
                    className={`flex flex-col items-center justify-center rounded-xl border px-3.5 py-2 text-center transition-all ${
                      active
                        ? 'border-amber-400 bg-amber-400/15 text-white ring-2 ring-amber-400/20'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-white'
                    }`}
                  >
                    <span className={`font-display text-xs font-extrabold ${diff.badgeColor}`}>
                      {diff.name.replace('Torre ', '')}
                    </span>
                    <span className="mt-0.5 font-mono text-[11px] font-bold text-amber-300 tabular-nums">
                      +{diff.coinsPerQuestion} Coins/acerto
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Banner Destaque: Arena Multiplayer Online (Kart 2-6P & Duelo 1v1) */}
      {onOpenMultiplayer && (
        <div className="flex flex-col gap-4 rounded-3xl border-2 border-cyan-400/50 bg-gradient-to-r from-cyan-950/90 via-slate-900 to-blue-950/90 p-5 shadow-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-2.5 py-0.5 text-[11px] font-black text-cyan-300">
              <Swords className="h-3.5 w-3.5" />
              NOVO · MULTIPLAYER EM TEMPO REAL (FAIR PLAY BNCC)
            </div>
            <h3 className="mt-1.5 font-display text-xl sm:text-2xl font-black text-white">
              Arena Multiplayer — Kart 2 a 6 Jogadores &amp; Duelo 1v1
            </h3>
            <p className="mt-1 text-xs text-slate-300">
              Crie uma Sala Privada de 4 dígitos para amigos ou entre na Fila Pública! Alunos de
              séries diferentes competem juntos com perguntas justas do seu próprio ano.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenMultiplayer}
            className="flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-3 font-display text-xs sm:text-sm font-black text-slate-950 shadow-lg transition hover:brightness-110 active:scale-95"
          >
            <Swords className="h-4 w-4" />
            <span>ENTRAR NA ARENA MULTIPLAYER</span>
          </button>
        </div>
      )}

      {/* Step 2: 6 Modalidades de Jogo 3D */}
      <div className="grid gap-5 md:grid-cols-2">
        {MODE_CARDS.map((card) => {
          const isHighlighted = highlightedMode === card.id;
          return (
            <div
              key={card.id}
              onClick={() => setHighlightedMode(card.id)}
              className={`flex flex-col justify-between rounded-3xl border bg-slate-900 p-6 transition-all cursor-pointer ${
                isHighlighted
                  ? `${card.borderClass} ring-2 ring-white/10 shadow-xl`
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-bold ${card.accentColor}`}>{card.tag}</span>
                  <span className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-2.5 py-1 font-mono text-[11px] font-bold text-amber-400 border border-slate-800">
                    <Trophy className="h-3 w-3" />+{activeDiff.completionBonusCoins} Bônus Final
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-2.5">
                  {card.id === 'obby' && <Layers className="h-6 w-6 text-emerald-400 shrink-0" />}
                  {card.id === 'survival' && <Flame className="h-6 w-6 text-amber-400 shrink-0" />}
                  {card.id === 'turbo_race' && <Zap className="h-6 w-6 text-sky-400 shrink-0" />}
                  {card.id === 'vehicle_rally' && <Car className="h-6 w-6 text-yellow-300 shrink-0" />}
                  {card.id === 'penalty' && <Target className="h-6 w-6 text-emerald-300 shrink-0" />}
                  {card.id === 'caete_boat' && <Waves className="h-6 w-6 text-teal-300 shrink-0" />}
                  <h3 className="font-display text-2xl font-extrabold text-white">{card.title}</h3>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-slate-300">{card.subtitle}</p>

                <ul className="mt-4 space-y-2 border-t border-slate-800/90 pt-4 text-xs text-slate-300">
                  {card.mechanics.map((m, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Sparkles className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${card.accentColor}`} />
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Timer className="h-3.5 w-3.5 text-sky-400" />
                    Recompensa ({activeDiff.name.replace('Torre ', '')}):
                  </span>
                  <span className="font-mono font-bold text-amber-400 tabular-nums">
                    +{activeDiff.coinsPerQuestion} Coins / questão
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartMode(card.id, selectedWorld.id, selectedDifficulty);
                }}
                className={`mt-6 flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 font-display text-sm font-extrabold shadow-lg transition-all active:scale-[0.98] ${card.buttonClass}`}
              >
                <Play className="h-4 w-4 fill-current" />
                <span>JOGAR {card.title.toUpperCase()}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
