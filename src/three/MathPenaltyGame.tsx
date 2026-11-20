import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ArrowLeft, Coins, RotateCcw, Sliders, Trophy, Volume2, VolumeX } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { AudioSettingsModal } from '../components/AudioSettingsModal';
import { recordActivityForMissions } from '../data/missionsAndTitles';
import { getQuestionsForMode, recordAnsweredQuestion } from '../data/questionEngine';
import { getDifficultyConfig, getWorldById } from '../data/worlds';
import { animateAvatarRig, createAvatarRig } from '../game/avatarBuilder';
import { logQuestionAttempt } from '../services/researchTelemetry';
import { MathQuestion, StudentProfile, TowerDifficulty } from '../types/game';
import {
  createPbrRenderer,
  disposeSceneResources,
  getGraphicsQuality,
  isSoftwareGl,
  ParticlePool,
  setupTropicalEnvironment,
  subscribeGraphicsQuality,
} from './graphicsEngine';
import { createTiledPbrTextures } from './textureFactory';

interface MathPenaltyGameProps {
  student: StudentProfile;
  worldId: number;
  difficulty: TowerDifficulty;
  muted: boolean;
  onToggleMute: () => void;
  onProgressEvent: (delta: {
    xpGain: number;
    coinsGain: number;
    answeredDelta: number;
    correctDelta: number;
    streak: number;
  }) => void;
  onExit: () => void;
}

const TOTAL_KICKS = 8;

// 3 Target zones inside the goal (Left Corner, Center Top Angle, Right Corner)
const GOAL_TARGETS: { slot: 0 | 1 | 2; letter: 'A' | 'B' | 'C'; x: number; y: number; color: string }[] = [
  { slot: 0, letter: 'A', x: -3.25, y: 2.25, color: '#38bdf8' },
  { slot: 1, letter: 'B', x: 0, y: 2.65, color: '#facc15' },
  { slot: 2, letter: 'C', x: 3.25, y: 2.25, color: '#34d399' },
];

function createGoalTargetTexture(letter: 'A' | 'B' | 'C', answer: string, accent: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.beginPath();
  ctx.roundRect(10, 10, 364, 236, 28);
  ctx.fill();

  ctx.lineWidth = 10;
  ctx.strokeStyle = accent;
  ctx.stroke();

  // Letter badge circle
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(64, 64, 34, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.font = '900 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 66);

  ctx.fillStyle = '#ffffff';
  const fontSize = answer.length > 14 ? 32 : answer.length > 9 ? 42 : 54;
  ctx.font = `900 ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(answer.slice(0, 22), 192, 162);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createStadiumBannerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 1024, 0);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(0.5, '#1e3a8a');
  grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 160);

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 1008, 144);

  ctx.fillStyle = '#facc15';
  ctx.font = '900 54px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ESTÁDIO DO CAETÉ • BRAGANÇA-PA', 512, 78);

  ctx.fillStyle = '#e0f2fe';
  ctx.font = '700 28px sans-serif';
  ctx.fillText('PÊNALTIS DA MATEMÁTICA • TOQUE NO CANTO CERTO DO GOL!', 512, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function MathPenaltyGame({
  student,
  worldId,
  difficulty,
  muted,
  onToggleMute,
  onProgressEvent,
  onExit,
}: MathPenaltyGameProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [runKey, setRunKey] = useState(1);
  const [graphicsQuality, setGraphicsQuality] = useState(() => getGraphicsQuality());
  const [audioModalOpen, setAudioModalOpen] = useState(false);

  const world = useMemo(() => getWorldById(worldId), [worldId]);
  const diffCfg = useMemo(() => getDifficultyConfig(difficulty), [difficulty]);
  const questions = useMemo(
    () => getQuestionsForMode(worldId, 'penalty', TOTAL_KICKS, student.id),
    [worldId, student.id, runKey]
  );

  const [kickIndex, setKickIndex] = useState(0);
  const [goals, setGoals] = useState(0);
  const [streak, setStreak] = useState(0);
  const [sessionXp, setSessionXp] = useState(0);
  const [sessionCoins, setSessionCoins] = useState(0);
  const [kickLocked, setKickLocked] = useState(false);
  const [feedback, setFeedback] = useState<{
    isGoal: boolean;
    title: string;
    explanation: string;
  } | null>(null);
  const [finished, setFinished] = useState(false);

  const currentQuestion: MathQuestion | null = questions[kickIndex] || null;
  const currentQuestionRef = useRef<MathQuestion | null>(currentQuestion);
  currentQuestionRef.current = currentQuestion;

  const progressCbRef = useRef(onProgressEvent);
  progressCbRef.current = onProgressEvent;

  // Bridge from React kick choice -> 3D animation loop
  const kickRequestRef = useRef<{
    slot: 0 | 1 | 2;
    isGoal: boolean;
  } | null>(null);

  const kickLockedRef = useRef(false);
  kickLockedRef.current = kickLocked;
  const finishedRef = useRef(false);
  finishedRef.current = finished;
  const streakRef = useRef(0);
  streakRef.current = streak;
  const goalsRef = useRef(0);
  goalsRef.current = goals;
  const kickIndexRef = useRef(0);
  kickIndexRef.current = kickIndex;
  const questionShownAtRef = useRef<number>(performance.now());

  useEffect(() => {
    questionShownAtRef.current = performance.now();
  }, [kickIndex, runKey]);

  // Triggered when user clicks 3D target OR A/B/C button
  const triggerKickRef = useRef<(slot: 0 | 1 | 2) => void>(() => {});
  triggerKickRef.current = (slot: 0 | 1 | 2) => {
    const q = currentQuestionRef.current;
    if (!q || kickLockedRef.current || finishedRef.current) return;

    kickLockedRef.current = true;
    setKickLocked(true);

    const isGoal = slot === q.correctIndex;
    const responseTimeMs = Math.max(200, Math.round(performance.now() - questionShownAtRef.current));
    recordAnsweredQuestion(student.id, q.prompt);
    logQuestionAttempt({
      studentId: student.id,
      school: student.school,
      grade: student.grade,
      worldId,
      gameMode: 'penalty',
      bnccTopic: q.topic,
      isCorrect: isGoal,
      responseTimeMs,
    });
    kickRequestRef.current = { slot, isGoal };
    soundEngine.playKickBall();

    window.setTimeout(() => {
      if (isGoal) {
        const nextStreak = streakRef.current + 1;
        const nextGoals = goalsRef.current + 1;
        const xpGain = Math.round(32 * diffCfg.rewardMultiplier) + nextStreak * 4;
        const coinsGain = diffCfg.coinsPerQuestion;

        setGoals(nextGoals);
        setStreak(nextStreak);
        setSessionXp((x) => x + xpGain);
        setSessionCoins((c) => c + coinsGain);

        recordActivityForMissions(student.id, 'correct_answer', 1);
        recordActivityForMissions(student.id, 'penalty_goal', 1);
        soundEngine.playGoalCheer();

        progressCbRef.current({
          xpGain,
          coinsGain,
          answeredDelta: 1,
          correctDelta: 1,
          streak: nextStreak,
        });

        setFeedback({
          isGoal: true,
          title: '⚽ GOLAÇO NO ÂNGULO!',
          explanation: q.explanation,
        });
      } else {
        setStreak(0);
        soundEngine.playSlowdownHit();
        progressCbRef.current({
          xpGain: 5,
          coinsGain: 0,
          answeredDelta: 1,
          correctDelta: 0,
          streak: 0,
        });

        const letters: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];
        setFeedback({
          isGoal: false,
          title: '🧤 DEFESA DO GOLEIRO!',
          explanation: `Certa: ${letters[q.correctIndex]}) ${q.options[q.correctIndex]} — ${q.explanation}`,
        });
      }

      const waitNext = isGoal ? 1650 : 2550;
      window.setTimeout(() => {
        setFeedback(null);
        const nextIdx = kickIndexRef.current + 1;
        if (nextIdx >= TOTAL_KICKS) {
          const finalBonusCoins =
            goalsRef.current >= 5 ? diffCfg.completionBonusCoins : Math.round(diffCfg.completionBonusCoins * 0.45);
          const finalBonusXp = goalsRef.current * 18 + 60;
          setSessionXp((x) => x + finalBonusXp);
          setSessionCoins((c) => c + finalBonusCoins);
          progressCbRef.current({
            xpGain: finalBonusXp,
            coinsGain: finalBonusCoins,
            answeredDelta: 0,
            correctDelta: 0,
            streak: streakRef.current,
          });
          soundEngine.playFinishFanfare();
          setFinished(true);
        } else {
          setKickIndex(nextIdx);
          setKickLocked(false);
          kickLockedRef.current = false;
        }
      }, waitNext);
    }, 620);
  };

  useEffect(() => {
    soundEngine.startBgm('race');
    return () => {
      soundEngine.stopBgm();
    };
  }, []);

  useEffect(() => subscribeGraphicsQuality(setGraphicsQuality), []);

  // Build & animate Estádio do Caeté 3D scene
  const targetBoardsRef = useRef<THREE.Mesh[]>([]);

  // Update 3D target textures whenever currentQuestion changes
  useEffect(() => {
    if (!currentQuestion || targetBoardsRef.current.length !== 3) return;
    GOAL_TARGETS.forEach((gt, idx) => {
      const mesh = targetBoardsRef.current[idx];
      if (!mesh) return;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (mat.map) mat.map.dispose();
      mat.map = createGoalTargetTexture(gt.letter, currentQuestion.options[idx], gt.color);
      mat.needsUpdate = true;
    });
  }, [currentQuestion]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const { renderer, maxAnisotropy } = createPbrRenderer(container, graphicsQuality);
    const envRig = setupTropicalEnvironment(scene, renderer, {
      fogColor: 0x0b1630,
      fogDensity: 0.0085,
      skyRadius: 180,
      shadowFrustum: 28,
      sunOffset: [16, 36, 18],
      hemiIntensity: 0.72,
      sunIntensity: 1.35,
      quality: graphicsQuality,
    });
    // Night Stadium Sky Override
    scene.background = new THREE.Color(0x0b1630);
    envRig.skyDome.visible = false;

    const camera = new THREE.PerspectiveCamera(
      52,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.1,
      250
    );
    camera.position.set(0, 4.4, 17.5);
    camera.lookAt(0, 2.2, -3.0);

    // Stadium Pitch with PBR Grass Texture
    const grassPbr = createTiledPbrTextures('grass', 10, 12, maxAnisotropy);
    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(54, 68),
      new THREE.MeshStandardMaterial({
        map: grassPbr.map,
        bumpMap: grassPbr.bumpMap,
        bumpScale: grassPbr.bumpScale,
        color: 0x16a34a,
        roughness: 0.85,
      })
    );
    pitch.rotation.x = -Math.PI / 2;
    pitch.receiveShadow = true;
    scene.add(pitch);

    // Crisp White Pitch Markings (Goal line, Penalty Box, Penalty Spot)
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const goalLine = new THREE.Mesh(new THREE.PlaneGeometry(34, 0.2), lineMat);
    goalLine.rotation.x = -Math.PI / 2;
    goalLine.position.set(0, 0.02, -5.0);
    scene.add(goalLine);

    const penBoxFront = new THREE.Mesh(new THREE.PlaneGeometry(24, 0.2), lineMat);
    penBoxFront.rotation.x = -Math.PI / 2;
    penBoxFront.position.set(0, 0.02, 11.5);
    scene.add(penBoxFront);

    for (const sx of [-12, 12]) {
      const sideLine = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 16.5), lineMat);
      sideLine.rotation.x = -Math.PI / 2;
      sideLine.position.set(sx, 0.02, 3.25);
      scene.add(sideLine);
    }

    const penSpot = new THREE.Mesh(new THREE.CircleGeometry(0.26, 16), lineMat);
    penSpot.rotation.x = -Math.PI / 2;
    penSpot.position.set(0, 0.025, 7.2);
    scene.add(penSpot);

    // 3D Goal Structure (Posts, Crossbar, Swaying White Net)
    const goalGroup = new THREE.Group();
    goalGroup.position.set(0, 0, -5.0);
    const postMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.25,
      metalness: 0.4,
    });
    const postGeo = new THREE.CylinderGeometry(0.14, 0.14, 4.1, 14);
    const leftPost = new THREE.Mesh(postGeo, postMat);
    leftPost.position.set(-4.9, 2.05, 0);
    leftPost.castShadow = true;
    const rightPost = new THREE.Mesh(postGeo, postMat);
    rightPost.position.set(4.9, 2.05, 0);
    rightPost.castShadow = true;

    const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 10.0, 14), postMat);
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.set(0, 4.05, 0);
    crossbar.castShadow = true;

    // Back Net Mesh (animated vertices on goal!)
    const backNetGeo = new THREE.PlaneGeometry(9.8, 4.0, 18, 9);
    const netMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.52,
    });
    const backNet = new THREE.Mesh(backNetGeo, netMat);
    backNet.position.set(0, 2.05, -2.2);

    const topNet = new THREE.Mesh(new THREE.PlaneGeometry(9.8, 2.2, 16, 4), netMat);
    topNet.rotation.x = Math.PI / 2;
    topNet.position.set(0, 4.05, -1.1);

    for (const sx of [-4.9, 4.9]) {
      const sideNet = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.0, 5, 8), netMat);
      sideNet.rotation.y = Math.PI / 2;
      sideNet.position.set(sx, 2.05, -1.1);
      goalGroup.add(sideNet);
    }

    goalGroup.add(leftPost, rightPost, crossbar, backNet, topNet);
    scene.add(goalGroup);

    // 3 Interactive Luminous Goal Targets (A, B, C) for direct tap/click raycasting
    const targetMeshes: THREE.Mesh[] = [];
    GOAL_TARGETS.forEach((gt, idx) => {
      const initAnswer = questions[0]?.options[idx] || gt.letter;
      const mat = new THREE.MeshBasicMaterial({
        map: createGoalTargetTexture(gt.letter, initAnswer, gt.color),
        transparent: true,
        opacity: 0.94,
      });
      const board = new THREE.Mesh(new THREE.PlaneGeometry(2.65, 1.72), mat);
      board.position.set(gt.x, gt.y, -4.65);
      board.userData.targetSlot = gt.slot;
      scene.add(board);
      targetMeshes.push(board);
    });
    targetBoardsRef.current = targetMeshes;

    // Stadium Scoreboard Banner behind Goal
    const bannerBoard = new THREE.Mesh(
      new THREE.BoxGeometry(18, 2.8, 0.5),
      new THREE.MeshStandardMaterial({ map: createStadiumBannerTexture(), roughness: 0.3 })
    );
    bannerBoard.position.set(0, 7.4, -12.5);
    scene.add(bannerBoard);

    // Tiered Stadium Bleachers + Cheering Crowd via InstancedMesh (1 draw call!)
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 });
    const standTiers = [
      { z: -13.5, y: 1.0, h: 2.0 },
      { z: -15.8, y: 2.6, h: 2.0 },
      { z: -18.1, y: 4.2, h: 2.0 },
    ];
    for (const st of standTiers) {
      const tier = new THREE.Mesh(new THREE.BoxGeometry(44, st.h, 2.4), concreteMat);
      tier.position.set(0, st.y, st.z);
      scene.add(tier);
    }

    const crowdCount = 96;
    const crowdGeo = new THREE.BoxGeometry(0.65, 1.45, 0.55);
    const crowdMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65 });
    const crowdInst = new THREE.InstancedMesh(crowdGeo, crowdMat, crowdCount);
    const crowdPalette = [0xef4444, 0x3b82f6, 0x22c55e, 0xfacc15, 0xffffff, 0x0ea5e9];
    const crowdBasePos: { x: number; y: number; z: number; phase: number }[] = [];
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();

    for (let i = 0; i < crowdCount; i++) {
      const tierIdx = i % 3;
      const colIdx = Math.floor(i / 3);
      const cx = -19.5 + colIdx * 1.25 + (tierIdx % 2) * 0.4;
      const cy = 2.75 + tierIdx * 1.6;
      const cz = -13.4 - tierIdx * 2.3;
      crowdBasePos.push({ x: cx, y: cy, z: cz, phase: i * 0.7 });
      dummy.position.set(cx, cy, cz);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      crowdInst.setMatrixAt(i, dummy.matrix);
      col.setHex(crowdPalette[i % crowdPalette.length]);
      crowdInst.setColorAt(i, col);
    }
    crowdInst.instanceMatrix.needsUpdate = true;
    if (crowdInst.instanceColor) crowdInst.instanceColor.needsUpdate = true;
    crowdInst.computeBoundingSphere();
    scene.add(crowdInst);

    // 4 Towering Night Floodlights with Luminous Heads
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.65, roughness: 0.35 });
    const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xfef9c3 });
    for (const [fx, fz] of [
      [-20, -14],
      [20, -14],
      [-20, 14],
      [20, 14],
    ]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.44, 18, 10), towerMat);
      pole.position.set(fx, 9, fz);
      const head = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.4, 0.8), lampGlowMat);
      head.position.set(fx, 18.2, fz);
      head.lookAt(0, 1, 0);
      scene.add(pole, head);
    }

    // 3D Articulated Goalkeeper
    const keeperRig = createAvatarRig('#f97316', 'racer_helmet', null);
    keeperRig.root.position.set(0, 0, -4.3);
    scene.add(keeperRig.root);

    // Student's 3D Kicker Avatar (wearing their equipped team jersey!)
    const kickerRig = createAvatarRig(
      student.avatarColor,
      student.equippedHat,
      student.equippedJersey
    );
    kickerRig.root.position.set(0, 0, 11.2);
    kickerRig.root.rotation.y = Math.PI; // Facing -Z (toward the goal)
    scene.add(kickerRig.root);

    // 3D Soccer Ball on Penalty Spot
    const ballGeo = new THREE.SphereGeometry(0.36, 16, 14);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.35,
      metalness: 0.08,
    });
    const ballMesh = new THREE.Mesh(ballGeo, ballMat);
    ballMesh.position.set(0, 0.36, 7.2);
    ballMesh.castShadow = true;
    scene.add(ballMesh);

    // Confetti & Spark Object Pool
    const particles = new ParticlePool(160, graphicsQuality);
    scene.add(particles.mesh);

    // Raycaster for Direct Touch/Click on 3D Goal Targets
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const handlePointerDown = (ev: PointerEvent) => {
      if (kickLockedRef.current || finishedRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(targetMeshes, false);
      if (hits.length > 0) {
        const slot = hits[0].object.userData.targetSlot as 0 | 1 | 2;
        if (slot === 0 || slot === 1 || slot === 2) {
          triggerKickRef.current(slot);
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);

    // Kick & Animation State
    type Phase = 'idle' | 'runup' | 'flight' | 'celebrate';
    let phase: Phase = 'idle';
    let phaseTimer = 0;
    let activeSlot: 0 | 1 | 2 = 1;
    let activeIsGoal = true;
    let netRippleTimer = 0;
    let crowdExcitement = 0;

    const startBallPos = new THREE.Vector3(0, 0.36, 7.2);
    const targetBallPos = new THREE.Vector3();
    const reboundPos = new THREE.Vector3();

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    const handleResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    const tick = () => {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.045);
      const elapsed = clock.getElapsedTime();

      // Accept new kick request
      if (kickRequestRef.current && phase === 'idle') {
        activeSlot = kickRequestRef.current.slot;
        activeIsGoal = kickRequestRef.current.isGoal;
        kickRequestRef.current = null;
        phase = 'runup';
        phaseTimer = 0;

        const tgt = GOAL_TARGETS[activeSlot];
        targetBallPos.set(tgt.x, tgt.y, activeIsGoal ? -6.3 : -4.4);
        reboundPos.set(tgt.x * 1.6, 1.5, 1.5);
      }

      if (phase === 'idle') {
        kickerRig.root.position.set(0, 0, 11.2);
        ballMesh.position.copy(startBallPos);
        animateAvatarRig(kickerRig, 0, true, elapsed, dt, null, 'classic', false);

        // Goalkeeper sways side-to-side waiting for the kick
        keeperRig.root.position.set(Math.sin(elapsed * 2.8) * 1.4, 0, -4.3);
        keeperRig.root.rotation.z = 0;
        animateAvatarRig(keeperRig, 2.0, true, elapsed, dt, null, 'classic', false);
      } else if (phase === 'runup') {
        phaseTimer += dt;
        const u = Math.min(1, phaseTimer / 0.34);
        kickerRig.root.position.set(0, 0, THREE.MathUtils.lerp(11.2, 7.8, u));
        animateAvatarRig(kickerRig, 8.5, true, elapsed, dt, null, 'classic', false);
        if (u >= 1) {
          phase = 'flight';
          phaseTimer = 0;
        }
      } else if (phase === 'flight') {
        phaseTimer += dt;
        const u = Math.min(1, phaseTimer / 0.48);
        // Parabolic 3D trajectory
        ballMesh.position.lerpVectors(startBallPos, targetBallPos, u);
        ballMesh.position.y += Math.sin(u * Math.PI) * 1.65;
        ballMesh.rotation.x -= dt * 16;

        // Goalkeeper dives: toward the chosen corner on MISS, opposite corner on GOAL
        const diveTargetX = activeIsGoal
          ? activeSlot === 0
            ? 2.8
            : activeSlot === 2
            ? -2.8
            : 2.6
          : GOAL_TARGETS[activeSlot].x * 0.92;
        keeperRig.root.position.x = THREE.MathUtils.lerp(keeperRig.root.position.x, diveTargetX, Math.min(1, dt * 9));
        keeperRig.root.position.y = Math.sin(u * Math.PI) * 1.25;
        keeperRig.root.rotation.z = THREE.MathUtils.lerp(
          keeperRig.root.rotation.z,
          diveTargetX > 0 ? -1.15 : 1.15,
          Math.min(1, dt * 10)
        );
        animateAvatarRig(kickerRig, 0, true, elapsed, dt, null, 'classic', false);

        if (u >= 1) {
          phase = 'celebrate';
          phaseTimer = 0;
          if (activeIsGoal) {
            netRippleTimer = 1.4;
            crowdExcitement = 1.8;
            const confettiColors = [0xfacc15, 0x22c55e, 0x38bdf8, 0xef4444, 0xa855f7];
            confettiColors.forEach((hex) => {
              particles.emitBurst(targetBallPos.x, targetBallPos.y, -5.2, 14, hex, 7.5, 0.24, 0.95);
            });
          } else {
            particles.emitBurst(targetBallPos.x, targetBallPos.y, -4.3, 18, 0xf97316, 5.0, 0.2, 0.55);
          }
        }
      } else if (phase === 'celebrate') {
        phaseTimer += dt;
        if (activeIsGoal) {
          ballMesh.position.y = THREE.MathUtils.damp(ballMesh.position.y, 0.36, 6, dt);
          animateAvatarRig(kickerRig, 0, true, elapsed, dt, 'goal', 'champion', false);
        } else {
          ballMesh.position.lerp(reboundPos, Math.min(1, dt * 4.5));
          animateAvatarRig(kickerRig, 0, true, elapsed, dt, null, 'classic', false);
        }

        if (!kickLockedRef.current) {
          phase = 'idle';
          keeperRig.root.rotation.z = 0;
          keeperRig.root.position.set(0, 0, -4.3);
        }
      }

      // Animate goal net wave on impact
      if (netRippleTimer > 0) {
        netRippleTimer = Math.max(0, netRippleTimer - dt);
        const posAttr = backNetGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < posAttr.count; i++) {
          const vx = posAttr.getX(i);
          const vy = posAttr.getY(i);
          const wave = Math.sin(elapsed * 16 + vx * 1.4 + vy * 1.2) * 0.38 * (netRippleTimer / 1.4);
          posAttr.setZ(i, -wave);
        }
        posAttr.needsUpdate = true;
      }

      // Animate stadium crowd cheer bounce
      if (crowdExcitement > 0) crowdExcitement = Math.max(0, crowdExcitement - dt);
      const amp = crowdExcitement > 0 ? 0.45 : 0.08;
      const freq = crowdExcitement > 0 ? 11.0 : 3.2;
      for (let i = 0; i < crowdCount; i++) {
        const b = crowdBasePos[i];
        dummy.position.set(b.x, b.y + Math.abs(Math.sin(elapsed * freq + b.phase)) * amp, b.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        crowdInst.setMatrixAt(i, dummy.matrix);
      }
      crowdInst.instanceMatrix.needsUpdate = true;

      // Subtle floating hover on the 3 luminous goal targets
      targetMeshes.forEach((m, idx) => {
        m.visible = !kickLockedRef.current && !finishedRef.current;
        const base = GOAL_TARGETS[idx];
        m.position.y = base.y + Math.sin(elapsed * 3 + idx * 1.4) * 0.09;
      });

      particles.update(dt);
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        frameId = window.setTimeout(() => {
          if (!disposed) frameId = requestAnimationFrame(tick);
        }, 40);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      disposeSceneResources(scene, renderer, envRig.envTexture);
    };
  }, [student.avatarColor, student.equippedHat, student.equippedJersey, graphicsQuality, runKey]);

  const handleRestart = () => {
    setKickIndex(0);
    setGoals(0);
    setStreak(0);
    setSessionXp(0);
    setSessionCoins(0);
    setKickLocked(false);
    setFeedback(null);
    setFinished(false);
    setRunKey((k) => k + 1);
  };

  return (
    <div className="fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-slate-950 select-none">
      <div ref={mountRef} className="h-full w-full cursor-pointer" />

      {/* Ultra-Thin Top Stadium Scoreboard HUD */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex flex-col items-center gap-1.5 px-2.5 pt-2 sm:px-4 sm:pt-3">
        <div className="flex w-full max-w-4xl items-center justify-between gap-2 rounded-xl border border-white/15 bg-slate-950/80 px-3 py-1.5 shadow-xl">
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onExit}
              className="flex h-8 items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-xs font-bold text-slate-200 hover:bg-slate-800"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Praça</span>
            </button>
            <span className="font-display text-xs sm:text-sm font-extrabold text-emerald-300 truncate">
              ⚽ Estádio do Caeté · {world.grade}
            </span>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs font-bold tabular-nums">
            <span className="text-sky-300">
              Chute {Math.min(kickIndex + 1, TOTAL_KICKS)}/{TOTAL_KICKS}
            </span>
            <span className="text-emerald-400">Gols: {goals}</span>
            <span className="hidden sm:inline text-amber-300">+{sessionCoins} C</span>
          </div>

          <div className="pointer-events-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAudioModalOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-sky-300"
              aria-label="Som e Gráficos"
            >
              <Sliders className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onToggleMute}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-200"
              aria-label="Mutar som"
            >
              {muted ? <VolumeX className="h-3.5 w-3.5 text-rose-400" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Compact Stadium Question Banner */}
        {currentQuestion && !finished && (
          <div className="w-full max-w-2xl rounded-2xl border border-amber-400/50 bg-slate-950/90 px-4 py-2.5 text-center shadow-2xl">
            <p className="text-[11px] font-bold text-amber-300">{currentQuestion.topic}</p>
            <p className="mt-0.5 font-display text-sm sm:text-lg font-extrabold text-white">
              {currentQuestion.prompt}
            </p>
          </div>
        )}

        {/* Goal / Save Feedback Toast */}
        {feedback && (
          <div
            className={`w-full max-w-xl rounded-2xl border px-4 py-2.5 text-center shadow-2xl ${
              feedback.isGoal
                ? 'border-emerald-400 bg-emerald-950/95 text-emerald-100'
                : 'border-rose-400 bg-rose-950/95 text-rose-100'
            }`}
          >
            <p className="font-display text-base font-black">{feedback.title}</p>
            <p className="mt-0.5 text-xs">{feedback.explanation}</p>
          </div>
        )}
      </div>

      {/* Elevated Safe-Zone Answer Buttons (A / B / C) above >= 112px */}
      {currentQuestion && !finished && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(112px+env(safe-area-inset-bottom))] z-50 flex justify-center px-3">
          <div className="pointer-events-auto grid w-full max-w-2xl grid-cols-3 gap-2 sm:gap-3">
            {GOAL_TARGETS.map((gt, idx) => (
              <button
                key={gt.letter}
                type="button"
                disabled={kickLocked}
                onClick={() => triggerKickRef.current(gt.slot)}
                className="flex min-h-[54px] flex-col items-center justify-center rounded-2xl border-2 border-white/25 bg-slate-950/90 px-2 py-2 text-center shadow-2xl transition-transform hover:border-amber-300 active:scale-95 disabled:opacity-50"
              >
                <span
                  className="font-mono text-[11px] font-black"
                  style={{ color: gt.color }}
                >
                  {gt.letter} · {idx === 0 ? 'Esq.' : idx === 1 ? 'Meio' : 'Dir.'}
                </span>
                <span className="mt-0.5 font-display text-xs sm:text-sm font-extrabold text-white truncate max-w-full">
                  {currentQuestion.options[idx]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Final Stadium Summary Modal */}
      {finished && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 p-4">
          <div className="w-full max-w-md rounded-3xl border border-emerald-400/50 bg-slate-900 p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
              <Trophy className="h-8 w-8" />
            </div>
            <h2 className="mt-3 font-display text-2xl font-extrabold text-white">
              Fim das Cobranças!
            </h2>
            <p className="mt-1 text-xs text-slate-300">
              Estádio do Caeté · {goals} de {TOTAL_KICKS} gols marcados
            </p>

            <div className="mt-5 grid grid-cols-3 gap-2.5">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                <p className="text-[11px] text-slate-400">Gols</p>
                <p className="mt-0.5 font-mono text-xl font-black text-emerald-400 tabular-nums">
                  {goals}/{TOTAL_KICKS}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                <p className="text-[11px] text-slate-400">XP Ganho</p>
                <p className="mt-0.5 font-mono text-xl font-black text-sky-400 tabular-nums">
                  +{sessionXp}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                <p className="text-[11px] text-slate-400">BloxCoins</p>
                <p className="mt-0.5 flex items-center justify-center gap-1 font-mono text-xl font-black text-amber-400 tabular-nums">
                  <Coins className="h-4 w-4" />+{sessionCoins}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
              <button
                type="button"
                onClick={handleRestart}
                className="flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 font-display text-sm font-black text-slate-950 hover:bg-emerald-400"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Chutar Novamente</span>
              </button>
              <button
                type="button"
                onClick={onExit}
                className="flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 font-display text-sm font-bold text-white hover:bg-slate-700"
              >
                <span>Voltar à Praça</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <AudioSettingsModal isOpen={audioModalOpen} onClose={() => setAudioModalOpen(false)} />
    </div>
  );
}
