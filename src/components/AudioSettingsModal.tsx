import { useEffect, useState } from 'react';
import { Monitor, Music, Settings, Sliders, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { AudioSettingsState, soundEngine } from '../audio/soundEngine';
import {
  getGraphicsQuality,
  GRAPHICS_PRESETS,
  GraphicsQuality,
  setGraphicsQuality,
  subscribeGraphicsQuality,
} from '../three/graphicsEngine';

const QUALITY_ORDER: GraphicsQuality[] = ['low', 'medium', 'high'];

interface AudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AudioSettingsModal({ isOpen, onClose }: AudioSettingsModalProps) {
  const [settings, setSettings] = useState<AudioSettingsState>(() => soundEngine.getSettings());
  const [graphicsQuality, setLocalGraphicsQuality] = useState<GraphicsQuality>(() =>
    getGraphicsQuality()
  );

  useEffect(() => {
    const unsubAudio = soundEngine.subscribe((next) => {
      setSettings(next);
    });
    const unsubGraphics = subscribeGraphicsQuality((next) => {
      setLocalGraphicsQuality(next);
    });
    return () => {
      unsubAudio();
      unsubGraphics();
    };
  }, []);

  if (!isOpen) return null;

  const isAllMuted =
    settings.muted || (!settings.bgmEnabled && !settings.sfxEnabled);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl border border-sky-500/40 bg-slate-900 p-5 sm:p-6 text-slate-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/20 text-sky-400">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-lg font-extrabold text-white">
                Som &amp; Gráficos 3D
              </h3>
              <p className="text-[11px] text-slate-400">
                Áudio, texturas PBR e otimização 60 FPS do seu aparelho
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
            aria-label="Fechar configurações"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {/* 0. Qualidade Gráfica (60 FPS Mobile / PBR) */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-sky-400" />
                <div>
                  <p className="text-xs font-extrabold text-white">
                    Qualidade Gráfica (PBR &amp; 60 FPS)
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {GRAPHICS_PRESETS[graphicsQuality].subtitle}
                  </p>
                </div>
              </div>
              <span className="rounded-lg bg-sky-500/20 px-2.5 py-1 text-[11px] font-extrabold text-sky-300">
                {GRAPHICS_PRESETS[graphicsQuality].label.toUpperCase()}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {QUALITY_ORDER.map((qId) => {
                const preset = GRAPHICS_PRESETS[qId];
                const active = graphicsQuality === qId;
                return (
                  <button
                    key={qId}
                    type="button"
                    onClick={() => {
                      soundEngine.playCoin();
                      setGraphicsQuality(qId);
                    }}
                    className={`flex flex-col items-center rounded-xl border px-2 py-2 text-center transition-all ${
                      active
                        ? 'border-sky-400 bg-sky-500/20 text-white ring-2 ring-sky-400/25'
                        : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="font-display text-xs font-extrabold">{preset.label}</span>
                    <span className="mt-0.5 text-[10px] text-slate-400">
                      {qId === 'low' ? 'Celular Básico' : qId === 'medium' ? 'Equilibrado' : 'Ultra HD'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 1. Música de Fundo (Trilha Sonora) */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Music className="h-4 w-4 text-emerald-400" />
                <div>
                  <p className="text-xs font-extrabold text-white">
                    Música de Fundo (Trilha Sonora)
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Ritmo Bragantino, Adrenalina 132 BPM e Desafio da Torre
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  soundEngine.updateSettings({
                    bgmEnabled: !settings.bgmEnabled,
                    muted: false,
                  })
                }
                className={`min-h-[34px] rounded-xl px-3 py-1 text-xs font-extrabold transition-colors ${
                  settings.bgmEnabled && !settings.muted
                    ? 'bg-emerald-500 text-slate-950'
                    : 'border border-slate-700 bg-slate-800 text-slate-400'
                }`}
              >
                {settings.bgmEnabled && !settings.muted ? 'LIGADA' : 'DESLIGADA'}
              </button>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={settings.muted || !settings.bgmEnabled ? 0 : settings.bgmVolume}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  soundEngine.updateSettings({
                    bgmVolume: val,
                    bgmEnabled: val > 0,
                    muted: false,
                  });
                }}
                className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-slate-800 accent-emerald-400"
              />
              <span className="w-11 text-right font-mono text-xs font-bold text-emerald-400 tabular-nums">
                {settings.muted || !settings.bgmEnabled ? 0 : settings.bgmVolume}%
              </span>
            </div>
          </div>

          {/* 2. Efeitos Sonoros (Corrida, Pulos e Auras) */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400" />
                <div>
                  <p className="text-xs font-extrabold text-white">
                    Efeitos Sonoros (Corrida, Pulos e Auras)
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Passos, motor do Kart, alerta de portão, Turbo e moedas
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const next = !settings.sfxEnabled;
                  soundEngine.updateSettings({
                    sfxEnabled: next,
                    muted: false,
                  });
                  if (next) soundEngine.playCoin();
                }}
                className={`min-h-[34px] rounded-xl px-3 py-1 text-xs font-extrabold transition-colors ${
                  settings.sfxEnabled && !settings.muted
                    ? 'bg-amber-400 text-slate-950'
                    : 'border border-slate-700 bg-slate-800 text-slate-400'
                }`}
              >
                {settings.sfxEnabled && !settings.muted ? 'LIGADOS' : 'DESLIGADOS'}
              </button>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={settings.muted || !settings.sfxEnabled ? 0 : settings.sfxVolume}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  soundEngine.updateSettings({
                    sfxVolume: val,
                    sfxEnabled: val > 0,
                    muted: false,
                  });
                }}
                onPointerUp={() => soundEngine.playGateProximity()}
                className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-slate-800 accent-amber-400"
              />
              <span className="w-11 text-right font-mono text-xs font-bold text-amber-400 tabular-nums">
                {settings.muted || !settings.sfxEnabled ? 0 : settings.sfxVolume}%
              </span>
            </div>
          </div>

          {/* 3. Botão Rápido "Silenciar Tudo (Mudo)" */}
          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => soundEngine.toggleMuteAll()}
              className={`flex flex-1 min-h-[46px] items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 font-display text-xs font-extrabold transition-all ${
                isAllMuted
                  ? 'border-rose-500/60 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                  : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              {isAllMuted ? (
                <>
                  <VolumeX className="h-4 w-4 text-rose-400" />
                  <span>Som Silenciado (Toque para Restaurar)</span>
                </>
              ) : (
                <>
                  <Volume2 className="h-4 w-4 text-sky-400" />
                  <span>Silenciar Tudo (Mudo)</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="min-h-[46px] rounded-2xl bg-sky-500 px-5 py-2.5 font-display text-xs font-extrabold text-slate-950 hover:bg-sky-400"
            >
              Concluir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AudioSettingsButtonProps {
  className?: string;
  compact?: boolean;
}

export function AudioSettingsButton({ className = '', compact = false }: AudioSettingsButtonProps) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<AudioSettingsState>(() => soundEngine.getSettings());

  useEffect(() => {
    return soundEngine.subscribe((next) => setSettings(next));
  }, []);

  const isMuted = settings.muted || (!settings.bgmEnabled && !settings.sfxEnabled);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          'pointer-events-auto flex min-h-[40px] items-center gap-1.5 rounded-xl border border-white/15 bg-slate-900/90 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 transition-colors'
        }
        title="Configurações de Áudio (Música e Efeitos)"
        aria-label="Configurações de Áudio"
      >
        {isMuted ? (
          <VolumeX className="h-4 w-4 text-rose-400" />
        ) : (
          <Volume2 className="h-4 w-4 text-emerald-400" />
        )}
        <Settings className="h-3.5 w-3.5 text-sky-400" />
        {!compact && <span className="hidden sm:inline">Som</span>}
      </button>

      <AudioSettingsModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
