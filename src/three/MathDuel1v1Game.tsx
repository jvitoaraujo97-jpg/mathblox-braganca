import {
  ArrowLeft,
  Coins,
  Shield,
  Swords,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { soundEngine } from '../audio/soundEngine';
import { recordActivityForMissions } from '../data/missionsAndTitles';
import { getQuestionsForMode } from '../data/questionEngine';
import { animateAvatarRig, createAvatarRig } from '../game/avatarBuilder';
import {
  DuelActionPayload,
  MultiplayerMatchChannel,
} from '../services/multiplayerService';
import { logQuestionAttempt } from '../services/researchTelemetry';
import {
  AvatarEmote,
  MathQuestion,
  MultiplayerPlayerInfo,
  MultiplayerSessionConfig,
  StudentProfile,
} from '../types/game';
import { buildCosmeticRig } from './cosmeticBuilder';
import {
  createPbrRenderer,
  disposeSceneResources,
  ParticlePool,
  setupTropicalEnvironment,
} from './graphicsEngine';
import { createTiledPbrTextures } from './textureFactory';

interface MathDuel1v1GameProps {
  student: StudentProfile;
  session: MultiplayerSessionConfig;
  muted: boolean;
  onToggleMute: () => void;
  onProgressEvent: (payload: {
    xpDelta: number;
    coinsDelta: number;
    isCorrect?: boolean;
    streakCount?: number;
  }) => void;
  onExit: () => void;
}

const TOTAL_ROUNDS = 5;
const OPTION_LETTERS = ['A', 'B', 'C'] as const;

export function MathDuel1v1Game({
  student,
  session,
  muted,
  onToggleMute,
  onProgressEvent,
  onExit,
}: MathDuel1v1GameProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  // Identify rival from connected multiplayer session (or fallback arena rival if solo-practice)
  const opponent: MultiplayerPlayerInfo = useMemo(() => {
    const remote = session.players.find((p) => p.id !== student.id);
    if (remote) return remote;
    return {
      id: 'arena-bot-rival',
      name: 'Rival da Arena',
      grade: student.grade,
      worldId: student.worldId,
      school: student.school,
      avatarColor: '#ef4444',
      equippedHat: 'crown',
      equippedJersey: null,
      ready: true,
      joinedAt: Date.now(),
    };
  }, [session.players, student.grade, student.id, student.school, student.worldId]);

  const isBotFallback = opponent.id === 'arena-bot-rival';

  // Cross-Grade Fair Play: questions loaded strictly from the local student's own BNCC worldId!
  const [questions] = useState<MathQuestion[]>(() =>
    getQuestionsForMode(student.worldId, 'survival', TOTAL_ROUNDS + 2, student.id)
  );
  const [round, setRound] = useState(0);
  const [myScore, setMyScore] = useState(0);
  const [oppScore, setOppScore] = useState(0);
  const [roundLocked, setRoundLocked] = useState(false);
  const [stunTimer, setStunTimer] = useState(0);
  const [earnedXp, setEarnedXp] = useState(0);
  const [earnedCoins, setEarnedCoins] = useState(0);
  const [banner, setBanner] = useState<{
    tone: 'my_hit' | 'opp_hit' | 'wrong';
    title: string;
    subtitle?: string;
  } | null>(null);
  const [finished, setFinished] = useState(false);

  const matchChannelRef = useRef<MultiplayerMatchChannel<DuelActionPayload> | null>(null);
  const progressCbRef = useRef(onProgressEvent);
  progressCbRef.current = onProgressEvent;
  const roundShownAtRef = useRef<number>(performance.now());

  useEffect(() => {
    roundShownAtRef.current = performance.now();
  }, [round]);

  const animRef = useRef({
    boltTimer: 0,
    boltFromLeftToRight: true,
    boltColor: 0x38bdf8,
    leftHitTimer: 0,
    rightHitTimer: 0,
    leftEmote: null as AvatarEmote,
    rightEmote: null as AvatarEmote,
    myScore: 0,
    oppScore: 0,
    round: 0,
    roundLocked: false,
    finished: false,
    streak: 0,
  });

  const finishDuel = useCallback(
    (finalMyScore: number, finalOppScore: number) => {
      const st = animRef.current;
      if (st.finished) return;
      st.finished = true;
      setFinished(true);

      const won = finalMyScore > finalOppScore;
      const draw = finalMyScore === finalOppScore;
      const bonusXp = won ? 120 : draw ? 85 : 60;
      const bonusCoins = won ? 70 : draw ? 50 : 35;

      if (won) {
        st.leftEmote = 'trophy';
        soundEngine.playVictory();
      } else {
        st.rightEmote = 'trophy';
      }

      setEarnedXp((prev) => prev + bonusXp);
      setEarnedCoins((prev) => prev + bonusCoins);
      progressCbRef.current({
        xpDelta: bonusXp,
        coinsDelta: bonusCoins,
      });
    },
    []
  );

  const advanceRound = useCallback(
    (nextRound: number, curMyScore: number, curOppScore: number) => {
      if (nextRound >= TOTAL_ROUNDS) {
        finishDuel(curMyScore, curOppScore);
        return;
      }
      const st = animRef.current;
      st.round = nextRound;
      st.roundLocked = false;
      st.leftEmote = null;
      st.rightEmote = null;
      setRound(nextRound);
      setRoundLocked(false);
      setStunTimer(0);
      setBanner(null);
    },
    [finishDuel]
  );

  // Subscribe to Realtime Duel Broadcast Channel
  useEffect(() => {
    const channel = new MultiplayerMatchChannel<DuelActionPayload>(
      session.channelName,
      'duel_action',
      (payload) => {
        if (payload.senderId === student.id) return;
        const st = animRef.current;
        if (st.finished) return;

        if (payload.type === 'round_hit' && payload.round === st.round && !st.roundLocked) {
          st.roundLocked = true;
          st.oppScore += 1;
          st.streak = 0;
          st.boltFromLeftToRight = false;
          st.boltColor = 0xf43f5e;
          st.boltTimer = 0.65;
          st.leftHitTimer = 0.7;
          st.rightEmote = 'goal';
          soundEngine.playDuelBolt();

          const nextOpp = st.oppScore;
          const nextMy = st.myScore;
          const nextR = st.round + 1;
          setRoundLocked(true);
          setOppScore(nextOpp);
          setBanner({
            tone: 'opp_hit',
            title: `⚡ ${payload.senderName} disparou primeiro!`,
            subtitle: 'Seu escudo sofreu impacto. Prepare-se para a próxima rodada!',
          });

          setTimeout(() => {
            advanceRound(nextR, nextMy, nextOpp);
          }, 1650);
        }
      }
    );
    channel.connect();
    matchChannelRef.current = channel;

    return () => {
      channel.disconnect();
      matchChannelRef.current = null;
    };
  }, [advanceRound, session.channelName, student.id]);

  // Bot fallback timer ONLY when playing solo without a second human in the room
  useEffect(() => {
    if (!isBotFallback || finished || roundLocked) return;
    const delayMs = 6500 + Math.random() * 4500;
    const timer = window.setTimeout(() => {
      const st = animRef.current;
      if (st.finished || st.roundLocked || st.round !== round) return;
      st.roundLocked = true;
      st.oppScore += 1;
      st.streak = 0;
      st.boltFromLeftToRight = false;
      st.boltColor = 0xf43f5e;
      st.boltTimer = 0.65;
      st.leftHitTimer = 0.7;
      soundEngine.playDuelBolt();

      const nextOpp = st.oppScore;
      const nextMy = st.myScore;
      const nextR = st.round + 1;
      setRoundLocked(true);
      setOppScore(nextOpp);
      setBanner({
        tone: 'opp_hit',
        title: `⚡ ${opponent.name} acertou primeiro!`,
        subtitle: 'Prepare-se para contra-atacar na próxima rodada!',
      });

      setTimeout(() => {
        advanceRound(nextR, nextMy, nextOpp);
      }, 1650);
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [advanceRound, finished, isBotFallback, opponent.name, round, roundLocked]);

  // Stun countdown timer after wrong answer
  useEffect(() => {
    if (stunTimer <= 0) return;
    const t = window.setInterval(() => {
      setStunTimer((prev) => (prev <= 0.1 ? 0 : Number((prev - 0.1).toFixed(1))));
    }, 100);
    return () => window.clearInterval(t);
  }, [stunTimer]);

  const handleSelectAnswer = (optionIdx: number) => {
    const st = animRef.current;
    if (st.finished || st.roundLocked || stunTimer > 0) return;
    const q = questions[st.round];
    if (!q) return;

    const isCorrect = optionIdx === q.correctIndex;
    const responseTimeMs = Math.max(200, Math.round(performance.now() - roundShownAtRef.current));
    logQuestionAttempt({
      studentId: student.id,
      school: student.school,
      grade: student.grade,
      worldId: student.worldId,
      gameMode: 'duel_1v1',
      bnccTopic: q.topic,
      isCorrect,
      responseTimeMs,
    });

    if (isCorrect) {
      st.roundLocked = true;
      st.myScore += 1;
      st.streak += 1;
      st.boltFromLeftToRight = true;
      st.boltColor = 0x38bdf8;
      st.boltTimer = 0.65;
      st.rightHitTimer = 0.7;
      st.leftEmote = 'goal';
      soundEngine.playDuelBolt();

      // Broadcast hit to rival over Realtime channel
      matchChannelRef.current?.send({
        type: 'round_hit',
        senderId: student.id,
        senderName: student.name,
        round: st.round,
        timestamp: Date.now(),
      });

      const xpGain = 25;
      const coinGain = 12;
      setRoundLocked(true);
      setMyScore(st.myScore);
      setEarnedXp((prev) => prev + xpGain);
      setEarnedCoins((prev) => prev + coinGain);
      setBanner({
        tone: 'my_hit',
        title: `⚡ RAIO DE ENERGIA! (+${xpGain} XP · +${coinGain} 🪙)`,
        subtitle: `Você atingiu o escudo de ${opponent.name}!`,
      });

      recordActivityForMissions(student.id, 'correct_answer', 1);
      progressCbRef.current({
        xpDelta: xpGain,
        coinsDelta: coinGain,
        isCorrect: true,
        streakCount: st.streak,
      });

      const nextR = st.round + 1;
      const curMy = st.myScore;
      const curOpp = st.oppScore;
      setTimeout(() => {
        advanceRound(nextR, curMy, curOpp);
      }, 1650);
    } else {
      soundEngine.playSlowdownHit();
      st.streak = 0;
      setStunTimer(1.6);
      setBanner({
        tone: 'wrong',
        title: '❌ Resposta incorreta! Recarregando escudo (1,6s)...',
        subtitle: q.explanation,
      });
      progressCbRef.current({
        xpDelta: 0,
        coinsDelta: 0,
        isCorrect: false,
        streakCount: 0,
      });
    }
  };

  // Three.js Illuminated 3D Duel Arena
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const { renderer, maxAnisotropy } = createPbrRenderer(container);
    const envRig = setupTropicalEnvironment(scene, renderer, {
      fogColor: 0x0b1126,
      fogDensity: 0.014,
      hemiIntensity: 0.6,
      sunIntensity: 1.0,
      sunOffset: [12, 26, 18],
      shadowFrustum: 22,
    });

    // Cyber-Night Sky Dome
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 512;
    skyCanvas.height = 512;
    const sCtx = skyCanvas.getContext('2d')!;
    const sGrad = sCtx.createLinearGradient(0, 0, 0, 512);
    sGrad.addColorStop(0, '#020617');
    sGrad.addColorStop(0.55, '#0f172a');
    sGrad.addColorStop(0.85, '#1e1b4b');
    sGrad.addColorStop(1, '#020617');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 512, 512);
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    (envRig.skyDome.material as THREE.MeshBasicMaterial).map = skyTex;
    (envRig.skyDome.material as THREE.MeshBasicMaterial).needsUpdate = true;

    const camera = new THREE.PerspectiveCamera(
      48,
      (container.clientWidth || window.innerWidth) /
        (container.clientHeight || window.innerHeight),
      0.1,
      240
    );
    camera.position.set(0, 5.2, 14.5);
    camera.lookAt(0, 2.0, 0);

    // Arena Stage Floor
    const paveTex = createTiledPbrTextures('pavement', 8, 5, maxAnisotropy);
    const stageFloor = new THREE.Mesh(
      new THREE.BoxGeometry(22, 1.0, 12),
      new THREE.MeshStandardMaterial({
        map: paveTex.map,
        bumpMap: paveTex.bumpMap,
        bumpScale: paveTex.bumpScale,
        roughness: 0.5,
        metalness: 0.35,
        color: 0x334155,
      })
    );
    stageFloor.position.y = -0.5;
    stageFloor.receiveShadow = true;
    scene.add(stageFloor);

    // Glowing Center Duel Divider Line
    const centerLine = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.06, 11.4),
      new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.8,
      })
    );
    centerLine.position.y = 0.03;
    scene.add(centerLine);

    // Neon Energy Pillars around Arena
    const pillarPositions = [
      [-9.8, -5.2],
      [-9.8, 5.2],
      [9.8, -5.2],
      [9.8, 5.2],
      [0, -5.5],
    ];
    pillarPositions.forEach(([px, pz], idx) => {
      const col = idx < 2 ? 0x06b6d4 : idx < 4 ? 0xf43f5e : 0xfacc15;
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.44, 6.2, 10),
        new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          metalness: 0.7,
          roughness: 0.25,
        })
      );
      pillar.position.set(px, 3.1, pz);
      scene.add(pillar);

      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.55, 0),
        new THREE.MeshStandardMaterial({
          color: col,
          emissive: col,
          emissiveIntensity: 1.9,
        })
      );
      crystal.position.set(px, 6.8, pz);
      scene.add(crystal);
    });

    // Left Avatar (Local Student) facing Right (+X)
    const leftRig = createAvatarRig(
      student.avatarColor,
      student.equippedHat,
      student.equippedJersey
    );
    if (student.equippedBack) {
      leftRig.hatContainer.add(buildCosmeticRig(student.equippedBack).group);
    }
    if (student.equippedAura) {
      leftRig.hatContainer.add(buildCosmeticRig(student.equippedAura).group);
    }
    leftRig.root.position.set(-5.4, 0, 0);
    leftRig.root.rotation.y = Math.PI / 2;
    scene.add(leftRig.root);

    // Right Avatar (Opponent) facing Left (-X)
    const rightRig = createAvatarRig(
      opponent.avatarColor || '#ef4444',
      opponent.equippedHat ?? null,
      opponent.equippedJersey ?? null
    );
    rightRig.root.position.set(5.4, 0, 0);
    rightRig.root.rotation.y = -Math.PI / 2;
    scene.add(rightRig.root);

    // Energy Shields Around Both Duelists
    const leftShieldMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.24,
      roughness: 0.1,
    });
    const leftShield = new THREE.Mesh(new THREE.SphereGeometry(2.15, 24, 18), leftShieldMat);
    leftShield.position.set(-5.4, 1.55, 0);
    scene.add(leftShield);

    const rightShieldMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0xe11d48,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.24,
      roughness: 0.1,
    });
    const rightShield = new THREE.Mesh(new THREE.SphereGeometry(2.15, 24, 18), rightShieldMat);
    rightShield.position.set(5.4, 1.55, 0);
    scene.add(rightShield);

    // 3D Energy Bolt Beam connecting the two duelists
    const boltGroup = new THREE.Group();
    const outerBoltMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
    });
    const outerBolt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 10.6, 12),
      outerBoltMat
    );
    outerBolt.rotation.z = Math.PI / 2;
    boltGroup.add(outerBolt);

    const innerBolt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 10.6, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    innerBolt.rotation.z = Math.PI / 2;
    boltGroup.add(innerBolt);
    boltGroup.position.set(0, 1.85, 0);
    boltGroup.visible = false;
    scene.add(boltGroup);

    const particles = new ParticlePool(160);
    scene.add(particles.mesh);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    let animFrame = 0;
    let lastTime = performance.now();
    let elapsed = 0;

    const tick = (now: number) => {
      animFrame = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      elapsed += dt;

      const st = animRef.current;

      animateAvatarRig(leftRig, 0, true, elapsed, dt, st.leftEmote, student.movementStyle ?? 'classic', false);
      animateAvatarRig(rightRig, 0, true, elapsed + 1.1, dt, st.rightEmote, 'classic', false);

      // Energy bolt firing & particle burst
      if (st.boltTimer > 0) {
        st.boltTimer -= dt;
        boltGroup.visible = true;
        outerBoltMat.color.setHex(st.boltColor);
        const pulse = 1 + Math.sin(elapsed * 45) * 0.25;
        boltGroup.scale.set(1, pulse, pulse);
        if (st.boltTimer > 0.45) {
          const hitX = st.boltFromLeftToRight ? 5.1 : -5.1;
          particles.emitBurst(hitX, 1.8, 0, 10, st.boltColor, 8.5, 0.36, 0.55);
        }
      } else {
        boltGroup.visible = false;
      }

      // Shield pulse & impact shake
      if (st.leftHitTimer > 0) {
        st.leftHitTimer -= dt;
        leftShieldMat.opacity = 0.58;
        leftShield.position.x = -5.4 + Math.sin(elapsed * 65) * 0.18;
      } else {
        leftShieldMat.opacity = 0.2 + Math.sin(elapsed * 3.5) * 0.05;
        leftShield.position.x = -5.4;
      }

      if (st.rightHitTimer > 0) {
        st.rightHitTimer -= dt;
        rightShieldMat.opacity = 0.58;
        rightShield.position.x = 5.4 + Math.sin(elapsed * 65) * 0.18;
      } else {
        rightShieldMat.opacity = 0.2 + Math.sin(elapsed * 3.5 + 1) * 0.05;
        rightShield.position.x = 5.4;
      }

      // Gentle cinematic camera sway
      camera.position.x = Math.sin(elapsed * 0.45) * 1.1;
      camera.position.y = 5.1 + Math.sin(elapsed * 0.7) * 0.25;
      camera.lookAt(0, 1.9, 0);

      particles.update(dt);
      renderer.render(scene, camera);
    };

    animFrame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener('resize', onResize);
      skyTex.dispose();
      disposeSceneResources(scene, renderer, envRig.envTexture);
    };
  }, [opponent.avatarColor, opponent.equippedHat, opponent.equippedJersey, student.avatarColor, student.equippedAura, student.equippedBack, student.equippedHat, student.equippedJersey, student.movementStyle]);

  const currentQ = questions[round] ?? questions[0];

  return (
    <div className="fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-slate-950 select-none">
      <div ref={mountRef} className="h-full w-full" />

      {/* Top Ultra-Thin Duel Scoreboard */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between gap-2 px-3 pt-2.5 sm:px-5 sm:pt-3">
        <button
          type="button"
          onClick={onExit}
          className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-white/15 bg-slate-950/80 px-3 py-1.5 text-xs font-extrabold text-white backdrop-blur-md hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Sair</span>
        </button>

        {/* Versus Score Pill */}
        <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-slate-950/85 px-3 py-1.5 shadow-xl backdrop-blur-md sm:gap-4 sm:px-5">
          <div className="text-right">
            <div className="max-w-[92px] truncate text-[11px] font-black text-cyan-300 sm:max-w-[140px]">
              {student.name}
            </div>
            <div className="text-[10px] font-bold text-slate-400">{student.grade}</div>
          </div>
          <div className="flex items-center gap-2 font-display text-lg font-black text-white sm:text-xl">
            <span className="text-cyan-400">{myScore}</span>
            <Swords className="h-4 w-4 text-amber-400" />
            <span className="text-rose-400">{oppScore}</span>
          </div>
          <div className="text-left">
            <div className="max-w-[92px] truncate text-[11px] font-black text-rose-300 sm:max-w-[140px]">
              {opponent.name}
            </div>
            <div className="text-[10px] font-bold text-slate-400">{opponent.grade}</div>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleMute}
          className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 bg-slate-950/80 text-slate-200 backdrop-blur-md"
          aria-label={muted ? 'Ativar som' : 'Silenciar'}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>

      {/* Round Banner & Question Card */}
      {!finished && currentQ && (
        <>
          <div className="pointer-events-none fixed inset-x-0 top-14 z-20 mx-auto max-w-xl px-3 sm:top-16">
            <div className="rounded-2xl border border-cyan-400/35 bg-slate-950/85 p-3 text-center shadow-2xl backdrop-blur-md sm:p-4">
              <div className="mb-1 flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-wider text-cyan-300">
                <Shield className="h-3.5 w-3.5" />
                Rodada {Math.min(round + 1, TOTAL_ROUNDS)} de {TOTAL_ROUNDS} · Fair Play BNCC ({student.grade})
              </div>
              <p className="font-display text-base font-black text-white sm:text-lg">
                {currentQ.prompt}
              </p>
            </div>

            {banner && (
              <div
                className={`mt-2 rounded-xl border px-3 py-2 text-center text-xs font-extrabold shadow-lg backdrop-blur-md ${
                  banner.tone === 'my_hit'
                    ? 'border-cyan-400/50 bg-cyan-950/90 text-cyan-200'
                    : banner.tone === 'opp_hit'
                      ? 'border-rose-400/50 bg-rose-950/90 text-rose-200'
                      : 'border-amber-400/50 bg-amber-950/90 text-amber-200'
                }`}
              >
                <div>{banner.title}</div>
                {banner.subtitle && (
                  <div className="mt-0.5 text-[11px] font-medium text-white/80">
                    {banner.subtitle}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mobile-Safe Elevated A/B/C Duel Attack Buttons (bottom >= 112px + safe-area) */}
          <div className="pointer-events-none fixed inset-x-0 bottom-[calc(112px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl px-3">
            <div className="pointer-events-auto grid grid-cols-3 gap-2 sm:gap-3">
              {currentQ.options.map((opt, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={roundLocked || stunTimer > 0}
                  onClick={() => handleSelectAnswer(idx)}
                  className="flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-cyan-300/40 bg-slate-900/92 px-2.5 py-3 text-white shadow-xl backdrop-blur-md transition hover:border-cyan-300 hover:bg-slate-800 active:scale-95 disabled:opacity-50"
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 font-display text-xs font-black text-slate-950">
                    {OPTION_LETTERS[idx]}
                  </span>
                  <span className="line-clamp-2 text-center text-xs font-black sm:text-sm">
                    {opt}
                  </span>
                </button>
              ))}
            </div>
            {stunTimer > 0 && (
              <div className="mt-1.5 text-center text-[11px] font-black text-amber-300">
                ⚡ Escudo recarregando: {stunTimer.toFixed(1)}s
              </div>
            )}
          </div>
        </>
      )}

      {/* Final 1v1 Duel Podium */}
      {finished && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/82 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl border border-white/15 bg-slate-900 p-6 text-center shadow-2xl">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 text-slate-950 shadow-lg">
              <Trophy className="h-9 w-9" />
            </div>

            <h2 className="font-display text-2xl font-black text-white">
              {myScore > oppScore
                ? 'Vitória no Duelo 1v1!'
                : myScore === oppScore
                  ? 'Empate Eletrizante!'
                  : 'Duelo Concluído!'}
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              Placar Final:{' '}
              <strong className="text-cyan-300">
                {student.name} {myScore}
              </strong>{' '}
              ×{' '}
              <strong className="text-rose-300">
                {oppScore} {opponent.name}
              </strong>
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
                <div className="text-[11px] font-bold text-slate-400">XP Salvo</div>
                <div className="mt-0.5 flex items-center justify-center gap-1 text-xl font-black text-sky-400">
                  <Zap className="h-5 w-5" />+{earnedXp}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
                <div className="text-[11px] font-bold text-slate-400">BloxCoins</div>
                <div className="mt-0.5 flex items-center justify-center gap-1 text-xl font-black text-amber-400">
                  <Coins className="h-5 w-5" />+{earnedCoins}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onExit}
              className="mt-5 w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 py-3 font-display text-sm font-black text-slate-950 transition hover:brightness-110"
            >
              Voltar para a Praça da Bandeira
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
