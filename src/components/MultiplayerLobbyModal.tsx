import { useEffect, useRef, useState } from 'react';
import {
  Car,
  Check,
  Copy,
  Globe,
  KeyRound,
  Play,
  Swords,
  Users,
  X,
} from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import {
  generatePrivateRoomCode,
  MultiplayerLobbyClient,
} from '../services/multiplayerService';
import { getJerseyConfig } from '../three/jerseyBuilder';
import {
  MultiplayerGameType,
  MultiplayerPlayerInfo,
  MultiplayerSessionConfig,
  StudentProfile,
} from '../types/game';

interface MultiplayerLobbyModalProps {
  isOpen: boolean;
  student: StudentProfile;
  onStartMultiplayer: (config: MultiplayerSessionConfig) => void;
  onClose: () => void;
}

export function MultiplayerLobbyModal({
  isOpen,
  student,
  onStartMultiplayer,
  onClose,
}: MultiplayerLobbyModalProps) {
  const [selectedMode, setSelectedMode] = useState<MultiplayerGameType>('kart');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [activeRoom, setActiveRoom] = useState<{
    mode: MultiplayerGameType;
    code: string;
    isPublic: boolean;
  } | null>(null);

  const [players, setPlayers] = useState<MultiplayerPlayerInfo[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const lobbyRef = useRef<MultiplayerLobbyClient | null>(null);
  const onStartRef = useRef(onStartMultiplayer);
  onStartRef.current = onStartMultiplayer;

  // Cleanup when modal closes
  useEffect(() => {
    if (!isOpen) {
      lobbyRef.current?.disconnect();
      lobbyRef.current = null;
      setActiveRoom(null);
      setPlayers([]);
      setCountdown(null);
    }
  }, [isOpen]);

  // Connect to Realtime room whenever activeRoom changes
  useEffect(() => {
    if (!isOpen || !activeRoom) return;

    const client = new MultiplayerLobbyClient({
      mode: activeRoom.mode,
      roomCode: activeRoom.code,
      isPublic: activeRoom.isPublic,
      student,
      onPlayersChange: (list) => {
        setPlayers(list);
      },
      onStartSignal: (config) => {
        soundEngine.playTurboBoost();
        onStartRef.current(config);
      },
    });
    lobbyRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
      if (lobbyRef.current === client) {
        lobbyRef.current = null;
      }
    };
  }, [isOpen, activeRoom, student]);

  // Automatic 10s countdown when 2+ players are ready in the room
  useEffect(() => {
    if (!activeRoom) {
      setCountdown(null);
      return;
    }

    const minPlayers = 2;
    if (players.length < minPlayers) {
      setCountdown(null);
      return;
    }

    const initialSec = activeRoom.mode === 'duel' ? 5 : 10;
    setCountdown((prev) => (prev === null ? initialSec : prev));

    const timer = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          lobbyRef.current?.triggerStartMatch();
          return 0;
        }
        soundEngine.playGateProximity();
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeRoom, players.length >= 2]);

  if (!isOpen) return null;

  const handleJoinPublic = () => {
    soundEngine.playCheckpoint();
    setActiveRoom({ mode: selectedMode, code: 'PUBLIC', isPublic: true });
  };

  const handleCreatePrivate = () => {
    soundEngine.playCheckpoint();
    const code = generatePrivateRoomCode();
    setActiveRoom({ mode: selectedMode, code, isPublic: false });
  };

  const handleJoinPrivate = () => {
    const clean = roomCodeInput.replace(/\D/g, '').slice(0, 4);
    if (clean.length !== 4) return;
    soundEngine.playCheckpoint();
    setActiveRoom({ mode: selectedMode, code: clean, isPublic: false });
  };

  const handleLeaveRoom = () => {
    lobbyRef.current?.disconnect();
    lobbyRef.current = null;
    setActiveRoom(null);
    setPlayers([]);
    setCountdown(null);
  };

  const handleCopyCode = () => {
    if (!activeRoom) return;
    try {
      void navigator.clipboard.writeText(activeRoom.code);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // Ignore clipboard restriction
    }
  };

  const maxSlots = activeRoom?.mode === 'duel' ? 2 : 6;
  const canManualStart = players.length >= 2;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/85 p-3 sm:p-5">
      <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-cyan-500/40 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-500/15 text-cyan-300">
              <Swords className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg sm:text-xl font-extrabold text-white truncate">
                Arena Multiplayer Online
              </h2>
              <p className="text-xs text-slate-400 truncate">
                Competição justa multi-séries · Cada aluno responde questões da sua própria série BNCC
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
            aria-label="Fechar arena multiplayer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!activeRoom ? (
            <div className="space-y-5">
              {/* Step 1: Choose Multiplayer Mode */}
              <div>
                <p className="text-xs font-bold text-slate-400">1. Escolha a modalidade online</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setSelectedMode('kart')}
                    className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-all ${
                      selectedMode === 'kart'
                        ? 'border-cyan-400 bg-cyan-500/15 ring-2 ring-cyan-400/25'
                        : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <Car className="h-6 w-6 text-yellow-300" />
                      <span className="font-mono text-[11px] font-bold text-cyan-300">
                        2 a 6 Jogadores
                      </span>
                    </div>
                    <h3 className="mt-2 font-display text-base font-extrabold text-white">
                      Corrida de Kart PA-458
                    </h3>
                    <p className="mt-1 text-xs text-slate-300">
                      Dispute lado a lado no manguezal até a Praia de Ajuruteua com drift, posição ao
                      vivo e bônus no pódio (+80/+50/+30 Coins).
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedMode('duel')}
                    className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-all ${
                      selectedMode === 'duel'
                        ? 'border-cyan-400 bg-cyan-500/15 ring-2 ring-cyan-400/25'
                        : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <Swords className="h-6 w-6 text-cyan-300" />
                      <span className="font-mono text-[11px] font-bold text-amber-300">
                        Duelo 1v1 · 5 Rodadas
                      </span>
                    </div>
                    <h3 className="mt-2 font-display text-base font-extrabold text-white">
                      Duelo Matemático 1v1
                    </h3>
                    <p className="mt-1 text-xs text-slate-300">
                      Frente a frente na arena 3D! Quem acertar primeiro dispara um raio energético
                      contra o escudo do adversário.
                    </p>
                  </button>
                </div>
              </div>

              {/* Step 2: Public Queue vs Private 4-Digit Room */}
              <div className="grid gap-3 sm:grid-cols-2 border-t border-slate-800 pt-5">
                {/* Fila Pública */}
                <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                  <div>
                    <div className="flex items-center gap-2 text-emerald-300">
                      <Globe className="h-4 w-4" />
                      <span className="font-display text-sm font-extrabold">
                        Fila Pública Rápida
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-400">
                      Entre automaticamente com colegas de qualquer série que estejam conectados agora.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleJoinPublic}
                    className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 font-display text-xs font-black text-slate-950 hover:bg-emerald-400 active:scale-[0.98]"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    <span>Entrar na Fila Pública</span>
                  </button>
                </div>

                {/* Sala Privada por Código */}
                <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                  <div>
                    <div className="flex items-center gap-2 text-sky-300">
                      <KeyRound className="h-4 w-4" />
                      <span className="font-display text-sm font-extrabold">
                        Sala Privada (4 Dígitos)
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-400">
                      Crie um código para passar aos amigos ou digite o código de uma sala aberta.
                    </p>

                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={roomCodeInput}
                        onChange={(e) =>
                          setRoomCodeInput(e.target.value.replace(/\D/g, '').slice(0, 4))
                        }
                        placeholder="Ex: 4829"
                        className="min-h-[40px] w-full rounded-xl border border-slate-700 bg-slate-900 px-3 font-mono text-sm font-bold tracking-widest text-white outline-none focus:border-sky-400"
                      />
                      <button
                        type="button"
                        disabled={roomCodeInput.length !== 4}
                        onClick={handleJoinPrivate}
                        className="min-h-[40px] shrink-0 rounded-xl bg-sky-500 px-3.5 text-xs font-extrabold text-slate-950 hover:bg-sky-400 disabled:opacity-45"
                      >
                        Entrar
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleCreatePrivate}
                    className="mt-3 flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-cyan-400/50 bg-cyan-500/15 px-4 py-2 text-xs font-extrabold text-cyan-200 hover:bg-cyan-400 hover:text-slate-950 transition-colors"
                  >
                    <span>Criar Nova Sala Privada</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Active Waiting Lobby Room */
            <div className="space-y-5">
              <div className="flex flex-col gap-3 rounded-2xl border border-cyan-500/40 bg-slate-950/90 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-bold text-cyan-300">
                    {activeRoom.mode === 'kart'
                      ? 'Lobby · Corrida de Kart PA-458'
                      : 'Lobby · Duelo Matemático 1v1'}
                  </p>
                  <div className="mt-1 flex items-center gap-2.5">
                    <span className="font-display text-lg font-extrabold text-white">
                      {activeRoom.isPublic ? 'Fila Pública Aberta' : `Sala #${activeRoom.code}`}
                    </span>
                    {!activeRoom.isPublic && (
                      <button
                        type="button"
                        onClick={handleCopyCode}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-sky-300 hover:bg-slate-700"
                      >
                        {copiedCode ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-400" />
                            <span>Copiado</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>Copiar Código</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-center">
                    <p className="text-[10px] font-semibold text-slate-400">Conectados</p>
                    <p className="font-mono text-base font-black text-emerald-400 tabular-nums">
                      {players.length}/{maxSlots}
                    </p>
                  </div>
                  {countdown !== null && (
                    <div className="rounded-xl border border-amber-400/50 bg-amber-500/15 px-3 py-2 text-center">
                      <p className="text-[10px] font-semibold text-amber-200">Início em</p>
                      <p className="font-mono text-base font-black text-amber-300 tabular-nums">
                        {countdown}s
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Connected Players Grid */}
              <div>
                <p className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                  <Users className="h-3.5 w-3.5 text-sky-400" />
                  <span>Jogadores na Sala (Fair Play Multi-Séries Ativo)</span>
                </p>

                <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
                  {players.map((p) => {
                    const club = getJerseyConfig(p.equippedJersey);
                    const isMe = p.id === student.id;
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center gap-3 rounded-2xl border p-3 ${
                          isMe
                            ? 'border-cyan-400/60 bg-cyan-950/30'
                            : 'border-slate-800 bg-slate-950/80'
                        }`}
                      >
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 font-display text-sm font-black text-white"
                          style={{ backgroundColor: club ? club.primary : p.avatarColor }}
                        >
                          {club ? club.shortTag : p.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-extrabold text-white">
                            {p.name} {isMe ? '(Você)' : ''}
                          </p>
                          <p className="truncate text-[11px] text-slate-400">
                            {p.grade} · {p.school}
                            {club ? ` · ${club.clubName}` : ''}
                          </p>
                        </div>
                        <span className="text-xs font-bold text-emerald-400 shrink-0">Pronto</span>
                      </div>
                    );
                  })}

                  {players.length < 2 && (
                    <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-center text-xs text-slate-400">
                      Aguardando outro colega entrar na sala
                      {!activeRoom.isPublic ? ` com o código ${activeRoom.code}` : ''}...
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col-reverse gap-2.5 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={handleLeaveRoom}
                  className="min-h-[42px] rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700"
                >
                  Trocar Sala / Modo
                </button>

                <button
                  type="button"
                  disabled={!canManualStart}
                  onClick={() => lobbyRef.current?.triggerStartMatch()}
                  className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-6 py-2.5 font-display text-sm font-black text-slate-950 shadow-lg hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>
                    {activeRoom.mode === 'kart'
                      ? canManualStart
                        ? 'Iniciar Corrida Agora'
                        : 'Aguardando 2+ Jogadores'
                      : canManualStart
                      ? 'Iniciar Duelo 1v1 Agora'
                      : 'Aguardando Adversário'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
