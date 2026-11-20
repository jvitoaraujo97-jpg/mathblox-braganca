import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Anchor,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Coins,
  Compass,
  Gauge,
  Maximize2,
  Minimize2,
  RotateCcw,
  Sparkles,
  Timer,
  Trophy,
  Volume2,
  VolumeX,
  Waves,
} from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { recordActivityForMissions } from '../data/missionsAndTitles';
import { getQuestionsForMode } from '../data/questionEngine';
import { getWorldById, TOWER_DIFFICULTIES } from '../data/worlds';
import { animateAvatarRig, createAvatarRig } from '../game/avatarBuilder';
import { logQuestionAttempt } from '../services/researchTelemetry';
import { MathQuestion, StudentProfile, TowerDifficulty } from '../types/game';
import {
  createPbrRenderer,
  disposeSceneResources,
  getGraphicsQuality,
  GraphicsQuality,
  ParticlePool,
  setupTropicalEnvironment,
  subscribeGraphicsQuality,
} from './graphicsEngine';
import { createTiledPbrTextures } from './textureFactory';

interface CaeteBoatGameProps {
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

const LANE_X = [-5.4, 0, 5.4] as const;
const LANE_LETTERS = ['A', 'B', 'C'] as const;
const LANE_HEX = ['#10b981', '#0ea5e9', '#f59e0b'] as const;
const LANE_NUM = [0x10b981, 0x0ea5e9, 0xf59e0b] as const;

const TOTAL_BUOYS = 8;
const BUOY_SPACING = 108;
const FIRST_BUOY_Z = -108;
const FINISH_Z = FIRST_BUOY_Z - (TOTAL_BUOYS - 1) * BUOY_SPACING - 88; // -952
const QUESTION_COUNTDOWN_SEC = 10;

interface BuoyStageData {
  index: number;
  z: number;
  question: MathQuestion;
  triggered: boolean;
  meshes: THREE.Group[];
}

interface FluvialObstacle {
  kind: 'balseiro' | 'areia' | 'murure';
  lane: 0 | 1 | 2;
  x: number;
  z: number;
  halfW: number;
  halfL: number;
  hit: boolean;
  mesh: THREE.Object3D;
}

function createBuoySignTexture(letter: string, answerText: string, accentHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(2, 6, 23, 0.94)';
  ctx.beginPath();
  ctx.roundRect(10, 10, 492, 236, 28);
  ctx.fill();

  ctx.lineWidth = 10;
  ctx.strokeStyle = accentHex;
  ctx.stroke();

  // Letter badge on left
  ctx.fillStyle = accentHex;
  ctx.beginPath();
  ctx.roundRect(26, 36, 98, 184, 18);
  ctx.fill();

  ctx.fillStyle = '#020617';
  ctx.font = '900 72px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 75, 130);

  // Answer text
  ctx.fillStyle = '#ffffff';
  const cleaned = String(answerText || '').trim();
  const fontSize = cleaned.length > 16 ? 34 : cleaned.length > 10 ? 44 : 56;
  ctx.font = `900 ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Wrap text across up to 2 lines if long
  if (cleaned.length > 16 && cleaned.includes(' ')) {
    const words = cleaned.split(' ');
    const mid = Math.ceil(words.length / 2);
    const l1 = words.slice(0, mid).join(' ');
    const l2 = words.slice(mid).join(' ');
    ctx.fillText(l1.slice(0, 18), 305, 100);
    ctx.fillText(l2.slice(0, 18), 305, 158);
  } else {
    ctx.fillText(cleaned.slice(0, 20), 305, 128);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createArchBannerTexture(title: string, subtitle: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 1024, 0);
  grad.addColorStop(0, '#0f766e');
  grad.addColorStop(0.5, '#0d9488');
  grad.addColorStop(1, '#0284c7');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(12, 12, 1000, 232, 32);
  ctx.fill();

  ctx.lineWidth = 10;
  ctx.strokeStyle = '#fde047';
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 66px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, 512, 118);

  ctx.fillStyle = '#fef08a';
  ctx.font = '800 38px sans-serif';
  ctx.fillText(subtitle, 512, 188);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function CaeteBoatGame({
  student,
  worldId,
  difficulty,
  muted,
  onToggleMute,
  onProgressEvent,
  onExit,
}: CaeteBoatGameProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [graphicsQuality, setGraphicsQuality] = useState<GraphicsQuality>(() =>
    getGraphicsQuality()
  );
  const [runSeed, setRunSeed] = useState(1);

  const world = useMemo(() => getWorldById(worldId), [worldId]);
  const diffConfig = useMemo(
    () => TOWER_DIFFICULTIES.find((d) => d.id === difficulty) || TOWER_DIFFICULTIES[2],
    [difficulty]
  );

  const questions = useMemo(
    () => getQuestionsForMode(worldId, 'caete_boat', TOTAL_BUOYS, student.id),
    [worldId, student.id, runSeed]
  );

  // React HUD states
  const [activeStageIdx, setActiveStageIdx] = useState(0);
  const [currentLane, setCurrentLane] = useState<0 | 1 | 2>(1);
  const [countdownSec, setCountdownSec] = useState<number>(QUESTION_COUNTDOWN_SEC);
  const [speedKnots, setSpeedKnots] = useState<number>(22);
  const [progressPct, setProgressPct] = useState<number>(0);
  const [isTurbo, setIsTurbo] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [sessionXp, setSessionXp] = useState(0);
  const [sessionCoins, setSessionCoins] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [finished, setFinished] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<{
    ok: boolean;
    title: string;
    detail: string;
  } | null>(null);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // Safe fallback on iOS/Safari where Fullscreen API may be restricted
    }
  };

  const targetLaneRef = useRef<0 | 1 | 2>(1);
  const callbacksRef = useRef({ onProgressEvent });
  callbacksRef.current = { onProgressEvent };

  const studentRef = useRef(student);
  studentRef.current = student;

  useEffect(() => subscribeGraphicsQuality(setGraphicsQuality), []);

  useEffect(() => {
    soundEngine.startBgm('race');
    return () => {
      soundEngine.startBgm('plaza');
    };
  }, []);

  const selectLane = (lane: 0 | 1 | 2) => {
    if (targetLaneRef.current !== lane) {
      targetLaneRef.current = lane;
      setCurrentLane(lane);
      soundEngine.playStepPulse(false);
    }
  };

  const shiftLane = (delta: -1 | 1) => {
    const next = Math.max(0, Math.min(2, targetLaneRef.current + delta)) as 0 | 1 | 2;
    selectLane(next);
  };

  // Keyboard controls (A/D, ArrowLeft/ArrowRight, 1/2/3)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        shiftLane(-1);
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        shiftLane(1);
      } else if (e.code === 'Digit1' || e.code === 'Numpad1') {
        selectLane(0);
      } else if (e.code === 'Digit2' || e.code === 'Numpad2') {
        selectLane(1);
      } else if (e.code === 'Digit3' || e.code === 'Numpad3') {
        selectLane(2);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleRestart = () => {
    targetLaneRef.current = 1;
    setCurrentLane(1);
    setActiveStageIdx(0);
    setCountdownSec(QUESTION_COUNTDOWN_SEC);
    setSpeedKnots(22);
    setProgressPct(0);
    setIsTurbo(false);
    setCorrectCount(0);
    setAnsweredCount(0);
    setStreak(0);
    setSessionXp(0);
    setSessionCoins(0);
    setElapsedSec(0);
    setFinished(false);
    setFeedbackToast(null);
    setRunSeed((n) => n + 1);
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.2, 320);

    const { renderer, maxAnisotropy } = createPbrRenderer(container, graphicsQuality);
    const envRig = setupTropicalEnvironment(scene, renderer, {
      fogColor: 0xcbe8f6,
      fogDensity: 0.0038,
      skyRadius: 270,
      shadowFrustum: 36,
      sunOffset: [32, 50, 26],
      hemiIntensity: 0.88,
      sunIntensity: 1.45,
      quality: graphicsQuality,
    });

    // =========================================================================
    // 1. RIO CAETÉ — ÁGUA ESTUARINA BARRENTA-ESVERDEADA COM CORRENTEZA PBR
    // =========================================================================
    const waterPbr = createTiledPbrTextures('mangroveWater', 12, 96, maxAnisotropy);
    const riverLength = Math.abs(FINISH_Z) + 260;
    const riverMat = new THREE.MeshStandardMaterial({
      map: waterPbr.map,
      bumpMap: waterPbr.bumpMap,
      bumpScale: waterPbr.bumpScale * 1.15,
      color: 0x3b6e64, // Tom estuarino amazônico barrento-esverdeado do Rio Caeté
      roughness: 0.24,
      metalness: 0.16,
    });
    const riverMesh = new THREE.Mesh(new THREE.PlaneGeometry(54, riverLength), riverMat);
    riverMesh.rotation.x = -Math.PI / 2;
    riverMesh.position.set(0, 0, FINISH_Z / 2 - 40);
    riverMesh.receiveShadow = true;
    scene.add(riverMesh);

    // Subtle river lane guide wake lines (turquoise & golden ripples)
    const laneLineMat = new THREE.MeshBasicMaterial({
      color: 0x5eead4,
      transparent: true,
      opacity: 0.22,
    });
    for (const sepX of [-2.7, 2.7]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.14, riverLength - 140), laneLineMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(sepX, 0.03, FINISH_Z / 2);
      scene.add(strip);
    }

    // Muddy mangrove riverbanks (left & right)
    const mudPbr = createTiledPbrTextures('mangroveMud', 10, 80, maxAnisotropy);
    const bankMat = new THREE.MeshStandardMaterial({
      map: mudPbr.map,
      bumpMap: mudPbr.bumpMap,
      bumpScale: mudPbr.bumpScale,
      color: 0x5c4c3b,
      roughness: 0.92,
    });
    for (const side of [-1, 1]) {
      const bank = new THREE.Mesh(new THREE.BoxGeometry(88, 2.4, riverLength), bankMat);
      bank.position.set(side * 60, 0.35, FINISH_Z / 2 - 40);
      bank.receiveShadow = true;
      scene.add(bank);
    }

    // =========================================================================
    // 2. FLORESTA RIBEIRINHA INSTANCED (AÇAIZEIROS, MIRITIZEIROS & MANGUEZAIS)
    // =========================================================================
    let randState = 45891 + runSeed * 131;
    const rand = () => {
      randState = (randState * 1664525 + 1013904223) >>> 0;
      return randState / 4294967296;
    };

    const dummy = new THREE.Object3D();

    // 2A. Açaizeiros (slender tall palms + lush green top + dark purple berries)
    const acaiCount = graphicsQuality === 'low' ? 120 : 210;
    const acaiTrunkGeo = new THREE.CylinderGeometry(0.14, 0.24, 9.5, 6);
    const acaiTrunkMat = new THREE.MeshStandardMaterial({ color: 0x6b5c4d, roughness: 0.88 });
    const acaiTrunks = new THREE.InstancedMesh(acaiTrunkGeo, acaiTrunkMat, acaiCount);

    const acaiCrownGeo = new THREE.DodecahedronGeometry(2.3, 0);
    const acaiCrownMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.72 });
    const acaiCrowns = new THREE.InstancedMesh(acaiCrownGeo, acaiCrownMat, acaiCount);

    const acaiBerryGeo = new THREE.SphereGeometry(0.42, 6, 5);
    const acaiBerryMat = new THREE.MeshStandardMaterial({ color: 0x3b0764, roughness: 0.45 });
    const acaiBerries = new THREE.InstancedMesh(acaiBerryGeo, acaiBerryMat, acaiCount);

    for (let i = 0; i < acaiCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (19 + rand() * 34);
      const z = 20 - rand() * (Math.abs(FINISH_Z) - 45);
      const scaleH = 0.8 + rand() * 0.55;
      const tiltX = (rand() - 0.5) * 0.14;
      const tiltZ = -side * (0.06 + rand() * 0.14);

      dummy.position.set(x, 1.3 + 4.5 * scaleH, z);
      dummy.rotation.set(tiltX, rand() * Math.PI * 2, tiltZ);
      dummy.scale.set(1, scaleH, 1);
      dummy.updateMatrix();
      acaiTrunks.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x - side * 0.7, 1.5 + 9.2 * scaleH, z);
      dummy.rotation.set(0, rand() * Math.PI, 0);
      dummy.scale.set(1.25, 0.65, 1.25);
      dummy.updateMatrix();
      acaiCrowns.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x - side * 0.6, 1.0 + 8.3 * scaleH, z);
      dummy.scale.set(0.9, 1.2, 0.9);
      dummy.updateMatrix();
      acaiBerries.setMatrixAt(i, dummy.matrix);
    }
    acaiTrunks.instanceMatrix.needsUpdate = true;
    acaiCrowns.instanceMatrix.needsUpdate = true;
    acaiBerries.instanceMatrix.needsUpdate = true;
    scene.add(acaiTrunks, acaiCrowns, acaiBerries);

    // 2B. Manguezais & Miritizeiros (dense shoreline foliage)
    const mangroveCount = graphicsQuality === 'low' ? 140 : 240;
    const mangTrunkGeo = new THREE.CylinderGeometry(0.28, 0.65, 3.8, 6);
    const mangTrunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.9 });
    const mangTrunks = new THREE.InstancedMesh(mangTrunkGeo, mangTrunkMat, mangroveCount);

    const mangCanopyGeo = new THREE.IcosahedronGeometry(3.2, 0);
    const mangCanopyMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.78 });
    const mangCanopies = new THREE.InstancedMesh(mangCanopyGeo, mangCanopyMat, mangroveCount);

    for (let i = 0; i < mangroveCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (16.5 + rand() * 28);
      const z = 30 - rand() * (Math.abs(FINISH_Z) - 55);
      const sc = 0.8 + rand() * 0.85;

      dummy.position.set(x, 1.6, z);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      mangTrunks.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, 4.1 + sc * 0.9, z);
      dummy.scale.set(sc * 1.15, sc * 0.78, sc * 1.15);
      dummy.updateMatrix();
      mangCanopies.setMatrixAt(i, dummy.matrix);
    }
    mangTrunks.instanceMatrix.needsUpdate = true;
    mangCanopies.instanceMatrix.needsUpdate = true;
    scene.add(mangTrunks, mangCanopies);

    // 2C. Trapiches e Palafitas de Madeira Ribeirinhas (Amazonian stilt docks & houses)
    const woodDarkMat = new THREE.MeshStandardMaterial({ color: 0x6d4c3d, roughness: 0.88 });
    const woodPlankMat = new THREE.MeshStandardMaterial({ color: 0x926847, roughness: 0.82 });
    const roofRustMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.7 });
    const houseWallMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.75 });

    for (let i = 0; i < 10; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = -75 - i * 84;
      const stiltGroup = new THREE.Group();
      stiltGroup.position.set(side * 16.8, 0, z);

      // Wooden pier extending into river
      const deck = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.25, 3.2), woodPlankMat);
      deck.position.set(-side * 1.5, 1.55, 0);
      stiltGroup.add(deck);

      for (const px of [-3.6, -1.2, 1.2]) {
        for (const pz of [-1.2, 1.2]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 2.5, 6), woodDarkMat);
          post.position.set(px * side, 0.55, pz);
          stiltGroup.add(post);
        }
      }

      // Palafita stilt house
      const house = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.8, 4.0), houseWallMat);
      house.position.set(side * 2.2, 3.0, 0);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.5, 1.5, 4), roofRustMat);
      roof.rotation.y = Math.PI / 4;
      roof.position.set(side * 2.2, 5.1, 0);
      stiltGroup.add(house, roof);

      scene.add(stiltGroup);
    }

    // =========================================================================
    // 3. LINHA DE CHEGADA — ORLA DE BRAGANÇA & SILHUETA DO MIRANTE DE SÃO BENEDITO
    // =========================================================================
    const finishGroup = new THREE.Group();
    finishGroup.position.set(0, 0, FINISH_Z);

    // Floating Regatta Finish Arch
    const archPillarMat = new THREE.MeshStandardMaterial({
      color: 0x14b8a6,
      roughness: 0.3,
      metalness: 0.5,
    });
    for (const px of [-10.5, 10.5]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 10.5, 10), archPillarMat);
      pillar.position.set(px, 5.2, 0);
      finishGroup.add(pillar);
    }
    const bannerTex = createArchBannerTexture(
      'CHEGADA · ORLA DE BRAGANÇA',
      'Regata do Rio Caeté · Mirante de São Benedito'
    );
    const bannerMesh = new THREE.Mesh(
      new THREE.BoxGeometry(22.5, 3.4, 0.6),
      new THREE.MeshBasicMaterial({ map: bannerTex })
    );
    bannerMesh.position.set(0, 9.6, 0);
    finishGroup.add(bannerMesh);

    // Checkered floating finish strip
    const finishStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(21, 2.2),
      new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.85 })
    );
    finishStrip.rotation.x = -Math.PI / 2;
    finishStrip.position.set(0, 0.08, 0);
    finishGroup.add(finishStrip);

    // Orla de Bragança concrete waterfront promenade & colonial facades behind finish
    const orlaWall = new THREE.Mesh(
      new THREE.BoxGeometry(92, 4.5, 18),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.72 })
    );
    orlaWall.position.set(0, 1.8, -32);
    finishGroup.add(orlaWall);

    const orlaParapet = new THREE.Mesh(
      new THREE.BoxGeometry(92, 0.9, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.5 })
    );
    orlaParapet.position.set(0, 4.4, -23.3);
    finishGroup.add(orlaParapet);

    const colonialColors = [0xfef3c7, 0xfde68a, 0xbae6fd, 0xfecdd3, 0xd1fae5];
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const bld = new THREE.Mesh(
        new THREE.BoxGeometry(9.5, 7 + Math.abs(i % 2) * 2.5, 7),
        new THREE.MeshStandardMaterial({
          color: colonialColors[Math.abs(i + 3) % colonialColors.length],
          roughness: 0.75,
        })
      );
      bld.position.set(i * 11.5, 7.2, -33);
      finishGroup.add(bld);
    }

    // Mirante de São Benedito landmark tower silhouette (iconic central tower at Bragança Orla)
    const miranteBase = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 5.2, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 })
    );
    miranteBase.position.set(0, 11.5, -34);
    const miranteDeck = new THREE.Mesh(
      new THREE.CylinderGeometry(6.2, 5.6, 2.2, 16),
      new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.45, metalness: 0.25 })
    );
    miranteDeck.position.set(0, 20.2, -34);
    const miranteDome = new THREE.Mesh(
      new THREE.SphereGeometry(3.4, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35, metalness: 0.45 })
    );
    miranteDome.position.set(0, 21.3, -34);
    const miranteCrossV = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 3.2, 0.45),
      new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfacc15, emissiveIntensity: 0.4 })
    );
    miranteCrossV.position.set(0, 25.8, -34);
    const miranteCrossH = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.4, 0.45),
      new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfacc15, emissiveIntensity: 0.4 })
    );
    miranteCrossH.position.set(0, 26.4, -34);
    finishGroup.add(miranteBase, miranteDeck, miranteDome, miranteCrossV, miranteCrossH);

    scene.add(finishGroup);

    // =========================================================================
    // 4. VOADEIRA DE ALUMÍNIO + MOTOR DE POPA + AVATAR REAL DO ALUNO
    // =========================================================================
    const boatGroup = new THREE.Group();
    const aluMat = new THREE.MeshStandardMaterial({
      color: 0xdbeafe,
      roughness: 0.28,
      metalness: 0.78,
    });
    const hullStripeMat = new THREE.MeshStandardMaterial({
      color: 0x14b8a6,
      roughness: 0.35,
      metalness: 0.35,
    });
    const darkTrimMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.5,
      metalness: 0.6,
    });

    // Main aluminum hull body
    const hullBody = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.65, 3.6), aluMat);
    hullBody.position.set(0, 0.36, 0.2);
    hullBody.castShadow = true;
    boatGroup.add(hullBody);

    // Tapered bow (proa da voadeira apontando para -Z)
    const bowGeo = new THREE.ConeGeometry(1.38, 1.9, 4);
    bowGeo.rotateY(Math.PI / 4);
    bowGeo.rotateX(-Math.PI / 2);
    const bowMesh = new THREE.Mesh(bowGeo, aluMat);
    bowMesh.scale.set(1.0, 0.48, 1.0);
    bowMesh.position.set(0, 0.42, -2.52);
    bowMesh.castShadow = true;
    boatGroup.add(bowMesh);

    // Turquoise side racing stripes
    for (const sx of [-1.0, 1.0]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 3.55), hullStripeMat);
      stripe.position.set(sx, 0.54, 0.2);
      boatGroup.add(stripe);
    }

    // Wooden interior benches
    const benchMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.75 });
    for (const bz of [-0.6, 0.8]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.12, 0.42), benchMat);
      bench.position.set(0, 0.68, bz);
      boatGroup.add(bench);
    }

    // Outboard motor (Motor de Popa) at stern (+Z)
    const motorHousing = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.68, 0.68), darkTrimMat);
    motorHousing.position.set(0, 0.92, 2.2);
    const motorCap = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.16, 0.7), hullStripeMat);
    motorCap.position.set(0, 1.24, 2.2);
    const motorShaft = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.24), darkTrimMat);
    motorShaft.position.set(0, 0.35, 2.22);
    const propeller = new THREE.Group();
    propeller.position.set(0, 0.04, 2.38);
    const blade1 = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.1, 0.05), aluMat);
    const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.56, 0.05), aluMat);
    propeller.add(blade1, blade2);
    boatGroup.add(motorHousing, motorCap, motorShaft, propeller);

    // Student Avatar seated in the voadeira
    const avatarRig = createAvatarRig(
      studentRef.current.avatarColor,
      studentRef.current.equippedHat,
      studentRef.current.equippedJersey
    );
    avatarRig.root.position.set(0, 0.58, 0.35);
    avatarRig.root.rotation.y = Math.PI; // Facing -Z (forward down the river)
    avatarRig.root.scale.setScalar(0.86);
    boatGroup.add(avatarRig.root);

    scene.add(boatGroup);

    // Particle Pool for foam wake, bow splash & turbo glow
    const particlePool = new ParticlePool(180, graphicsQuality);
    scene.add(particlePool.mesh);

    // =========================================================================
    // 5. 8 ESTÁGIOS DE BOIAS LUMINOSAS (A, B, C) COM PLACAS 3D DE RESPOSTA
    // =========================================================================
    const buoyStages: BuoyStageData[] = questions.map((q, idx) => {
      const z = FIRST_BUOY_Z - idx * BUOY_SPACING;
      const meshes: THREE.Group[] = [];

      for (let lane = 0; lane < 3; lane++) {
        const buoyGroup = new THREE.Group();
        buoyGroup.position.set(LANE_X[lane], 0, z);

        // Floating ring base
        const floatRing = new THREE.Mesh(
          new THREE.TorusGeometry(1.15, 0.28, 10, 18),
          new THREE.MeshStandardMaterial({
            color: LANE_NUM[lane],
            emissive: LANE_NUM[lane],
            emissiveIntensity: 0.35,
            roughness: 0.35,
          })
        );
        floatRing.rotation.x = Math.PI / 2;
        floatRing.position.y = 0.22;
        buoyGroup.add(floatRing);

        // Twin light posts
        const postMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
        for (const px of [-1.25, 1.25]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.2, 8), postMat);
          post.position.set(px, 1.65, 0);
          buoyGroup.add(post);
        }

        // High-contrast 3D answer plate
        const signTex = createBuoySignTexture(
          LANE_LETTERS[lane],
          q.options[lane] ?? '',
          LANE_HEX[lane]
        );
        const signMesh = new THREE.Mesh(
          new THREE.BoxGeometry(3.8, 1.9, 0.22),
          new THREE.MeshBasicMaterial({ map: signTex })
        );
        signMesh.position.set(0, 2.75, 0);
        buoyGroup.add(signMesh);

        scene.add(buoyGroup);
        meshes.push(buoyGroup);
      }

      return {
        index: idx,
        z,
        question: q,
        triggered: false,
        meshes,
      };
    });

    // =========================================================================
    // 6. OBSTÁCULOS FLUVIAIS (BALSEIROS, BANCOS DE AREIA & ILHOTAS DE MURURÉ)
    // =========================================================================
    const obstacles: FluvialObstacle[] = [];
    const logMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.92 });
    const sandMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.95 });
    const murureMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.78 });
    const flowerMat = new THREE.MeshStandardMaterial({ color: 0xc084fc, roughness: 0.5 });

    for (let s = 0; s < TOTAL_BUOYS; s++) {
      const segmentStart = s === 0 ? -28 : FIRST_BUOY_Z - (s - 1) * BUOY_SPACING - 24;
      const segmentEnd = FIRST_BUOY_Z - s * BUOY_SPACING + 26;
      const midZ = (segmentStart + segmentEnd) * 0.5;

      // Spawn 1 or 2 obstacles per segment, always leaving at least 1 clear lane
      const obsCount = s === 0 ? 1 : 2;
      const usedLanes = new Set<number>();
      for (let k = 0; k < obsCount; k++) {
        let lane = Math.floor(rand() * 3) as 0 | 1 | 2;
        if (usedLanes.has(lane)) lane = ((lane + 1) % 3) as 0 | 1 | 2;
        usedLanes.add(lane);

        const z = midZ + (k === 0 ? 12 : -14);
        const x = LANE_X[lane];
        const kindRoll = (s + k) % 3;
        const kind: FluvialObstacle['kind'] =
          kindRoll === 0 ? 'balseiro' : kindRoll === 1 ? 'areia' : 'murure';

        const objGroup = new THREE.Group();
        objGroup.position.set(x, 0, z);

        if (kind === 'balseiro') {
          // Floating driftwood trunk
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.44, 3.1, 8), logMat);
          trunk.rotation.z = Math.PI / 2;
          trunk.rotation.y = (rand() - 0.5) * 0.35;
          trunk.position.y = 0.22;
          objGroup.add(trunk);
        } else if (kind === 'areia') {
          // Shallow sandbar with light foam ring
          const mound = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.2, 0.35, 12), sandMat);
          mound.position.y = 0.08;
          const ripple = new THREE.Mesh(
            new THREE.TorusGeometry(2.1, 0.09, 6, 16),
            new THREE.MeshBasicMaterial({ color: 0xfef9c3, transparent: true, opacity: 0.65 })
          );
          ripple.rotation.x = Math.PI / 2;
          ripple.position.y = 0.06;
          objGroup.add(mound, ripple);
        } else {
          // Ilhota de mururé (floating water hyacinth cluster)
          for (let m = 0; m < 5; m++) {
            const ang = (m / 5) * Math.PI * 2;
            const pad = new THREE.Mesh(new THREE.SphereGeometry(0.75, 7, 5), murureMat);
            pad.scale.set(1.2, 0.38, 1.2);
            pad.position.set(Math.cos(ang) * 0.85, 0.16, Math.sin(ang) * 0.85);
            objGroup.add(pad);
          }
          const flower = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 6), flowerMat);
          flower.position.set(0, 0.48, 0);
          objGroup.add(flower);
        }

        scene.add(objGroup);
        obstacles.push({
          kind,
          lane,
          x,
          z,
          halfW: 1.75,
          halfL: 1.6,
          hit: false,
          mesh: objGroup,
        });
      }
    }

    // =========================================================================
    // 7. LOOP DE SIMULAÇÃO 60 FPS
    // =========================================================================
    let boatX = 0;
    let boatZ = 0;
    let prevBoatZ = 0;
    let boatRoll = 0;
    let turboTimer = 0;
    let slowTimer = 0;
    let raceFinished = false;
    let totalElapsed = 0;
    let hudAccumulator = 0;
    let wakeAccumulator = 0;

    let currentStage = 0;
    let stageCountdown = QUESTION_COUNTDOWN_SEC;
    let stageShownAtMs = performance.now();

    let localCorrect = 0;
    let localAnswered = 0;
    let localStreak = 0;
    let localXp = 0;
    let localCoins = 0;

    let rafId = 0;
    let lastTime = performance.now();
    let toastTimeoutId: number | null = null;

    const showToast = (ok: boolean, title: string, detail: string) => {
      setFeedbackToast({ ok, title, detail });
      if (toastTimeoutId !== null) window.clearTimeout(toastTimeoutId);
      toastTimeoutId = window.setTimeout(() => setFeedbackToast(null), 2600);
    };

    const applyViewportCamera = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      const portrait = h > w;
      camera.fov = portrait ? 72 : 60;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    applyViewportCamera();
    window.addEventListener('resize', applyViewportCamera);
    window.addEventListener('orientationchange', applyViewportCamera);

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      // Scroll river current texture smoothly
      waterPbr.map.offset.y -= dt * 0.42;
      waterPbr.bumpMap.offset.y -= dt * 0.42;

      if (!raceFinished) {
        totalElapsed += dt;
        prevBoatZ = boatZ;

        if (turboTimer > 0) turboTimer = Math.max(0, turboTimer - dt);
        if (slowTimer > 0) slowTimer = Math.max(0, slowTimer - dt);

        // Countdown ticks for active upcoming buoy
        const activeBuoy = buoyStages[currentStage];
        if (activeBuoy && !activeBuoy.triggered) {
          stageCountdown = Math.max(0, stageCountdown - dt);
        }

        // Dynamic boat speed (cruising speed calibrated so player gets ~7-10s per buoy;
        // surges forward if countdown reaches 0 or during Motor de Popa Turbo!)
        const baseCruise = 13.8;
        const speedMult =
          turboTimer > 0
            ? 1.58
            : slowTimer > 0
              ? 0.55
              : activeBuoy && !activeBuoy.triggered && stageCountdown <= 0.05
                ? 1.45
                : 1.0;
        const currentSpeed = baseCruise * speedMult;
        boatZ -= currentSpeed * dt;

        // Smooth lane lateral steering + hull banking roll
        const targetX = LANE_X[targetLaneRef.current];
        const dx = targetX - boatX;
        boatX += dx * Math.min(1, dt * 8.5);
        const desiredRoll = THREE.MathUtils.clamp(-dx * 0.065, -0.34, 0.34);
        boatRoll += (desiredRoll - boatRoll) * Math.min(1, dt * 10);

        // Fluvial obstacle collisions (slowdown + splash, NEVER reset)
        for (const obs of obstacles) {
          if (obs.hit) continue;
          if (Math.abs(boatZ - obs.z) < obs.halfL + 1.2 && Math.abs(boatX - obs.x) < obs.halfW + 0.7) {
            obs.hit = true;
            slowTimer = 0.85;
            turboTimer = 0;
            soundEngine.playSlowdownHit();
            particlePool.emitBurst(boatX, 0.45, boatZ - 1.2, 16, 0xdbeafe, 6.2, 0.3, 0.55);
            const label =
              obs.kind === 'balseiro'
                ? '🪵 Balseiro flutuante!'
                : obs.kind === 'areia'
                  ? '🏝️ Banco de areia raso!'
                  : '🌿 Ilhota de mururé!';
            showToast(false, label, 'Desvie para manter a velocidade da voadeira!');
          }
        }

        // Buoy stage crossing detection (Single-trigger lock, NEVER resets boat)
        for (const stage of buoyStages) {
          if (stage.triggered) continue;
          if (prevBoatZ > stage.z && boatZ <= stage.z) {
            stage.triggered = true;

            // Determine nearest lane to actual boatX
            let chosenLane = 1;
            let bestDist = Infinity;
            for (let l = 0; l < 3; l++) {
              const d = Math.abs(boatX - LANE_X[l]);
              if (d < bestDist) {
                bestDist = d;
                chosenLane = l;
              }
            }

            const isCorrect = chosenLane === stage.question.correctIndex;
            const responseTimeMs = Math.max(200, Math.round(performance.now() - stageShownAtMs));

            // Record academic research telemetry silently under Raciocínio Lógico — Tabuada
            logQuestionAttempt({
              studentId: studentRef.current.id,
              school: studentRef.current.school,
              grade: studentRef.current.grade,
              worldId,
              gameMode: 'caete_boat',
              bnccTopic: 'Raciocínio Lógico — Tabuada',
              isCorrect,
              responseTimeMs,
            });

            localAnswered += 1;
            if (isCorrect) {
              localCorrect += 1;
              localStreak += 1;
              turboTimer = 2.5;
              slowTimer = 0;

              const xpGain = 25 + localStreak * 4;
              const coinsGain = diffConfig.coinsPerQuestion;
              localXp += xpGain;
              localCoins += coinsGain;

              soundEngine.playCorrect();
              soundEngine.playTurboBoost();
              recordActivityForMissions(studentRef.current.id, 'caete_buoy', 1);
              particlePool.emitBurst(boatX, 1.0, boatZ, 24, 0x2dd4bf, 7.5, 0.34, 0.65);

              callbacksRef.current.onProgressEvent({
                xpGain,
                coinsGain,
                answeredDelta: 1,
                correctDelta: 1,
                streak: localStreak,
              });

              showToast(
                true,
                `🚤 TURBO DO MOTOR DE POPA! +${xpGain} XP`,
                `Boia ${LANE_LETTERS[chosenLane]} certa! Sequência ${localStreak}x`
              );
            } else {
              localStreak = 0;
              slowTimer = 1.05;
              turboTimer = 0;
              soundEngine.playSlowdownHit();
              particlePool.emitBurst(boatX, 0.7, boatZ, 18, 0xfbbf24, 5.5, 0.28, 0.5);

              callbacksRef.current.onProgressEvent({
                xpGain: 4,
                coinsGain: 0,
                answeredDelta: 1,
                correctDelta: 0,
                streak: 0,
              });
              localXp += 4;

              const rightLetter = LANE_LETTERS[stage.question.correctIndex];
              const rightAns = stage.question.options[stage.question.correctIndex];
              showToast(
                false,
                `🌊 Onda contrária! Era ${rightLetter}: ${rightAns}`,
                stage.question.explanation || 'Siga em frente para a próxima boia!'
              );
            }

            // Advance to next buoy question immediately
            const nextIdx = stage.index + 1;
            currentStage = nextIdx;
            stageCountdown = QUESTION_COUNTDOWN_SEC;
            stageShownAtMs = performance.now();

            setActiveStageIdx(Math.min(TOTAL_BUOYS - 1, nextIdx));
            setCorrectCount(localCorrect);
            setAnsweredCount(localAnswered);
            setStreak(localStreak);
            setSessionXp(localXp);
            setSessionCoins(localCoins);
          }
        }

        // Finish line at Orla de Bragança
        if (boatZ <= FINISH_Z) {
          raceFinished = true;
          soundEngine.playFinishFanfare();
          recordActivityForMissions(studentRef.current.id, 'caete_victory', 1);

          const bonusXp = 60 + localCorrect * 10;
          const bonusCoins = diffConfig.completionBonusCoins;
          localXp += bonusXp;
          localCoins += bonusCoins;

          callbacksRef.current.onProgressEvent({
            xpGain: bonusXp,
            coinsGain: bonusCoins,
            answeredDelta: 0,
            correctDelta: 0,
            streak: localStreak,
          });

          setSessionXp(localXp);
          setSessionCoins(localCoins);
          setProgressPct(100);
          setFinished(true);
        }

        // Boat motion + propeller spin + foam wake
        const waveBob = Math.sin(totalElapsed * 5.2) * 0.08;
        const pitchTilt = turboTimer > 0 ? 0.12 : slowTimer > 0 ? -0.05 : 0.03;
        boatGroup.position.set(boatX, waveBob, boatZ);
        boatGroup.rotation.set(pitchTilt, 0, boatRoll);
        propeller.rotation.z += dt * (turboTimer > 0 ? 48 : 26);

        animateAvatarRig(
          avatarRig,
          0,
          true,
          totalElapsed,
          dt,
          turboTimer > 0 ? 'goal' : null,
          studentRef.current.movementStyle || 'classic'
        );

        // White foam wake particles behind outboard motor
        wakeAccumulator += dt;
        const wakeRate = turboTimer > 0 ? 0.025 : 0.05;
        if (wakeAccumulator >= wakeRate) {
          wakeAccumulator = 0;
          const wakeColor = turboTimer > 0 ? 0x5eead4 : 0xe0f2fe;
          particlePool.emit(
            boatX + (Math.random() - 0.5) * 0.7,
            0.14,
            boatZ + 2.4,
            (Math.random() - 0.5) * 1.4,
            0.9 + Math.random() * 1.2,
            2.5 + Math.random() * 2.0,
            wakeColor,
            turboTimer > 0 ? 0.34 : 0.24,
            0.55,
            5.0
          );
        }

        // Periodic React HUD sync (~10 Hz to stay zero-jank at 60 FPS)
        hudAccumulator += dt;
        if (hudAccumulator >= 0.1) {
          hudAccumulator = 0;
          setCountdownSec(stageCountdown);
          setSpeedKnots(Math.round(currentSpeed * 1.9));
          setIsTurbo(turboTimer > 0);
          setElapsedSec(Math.floor(totalElapsed));
          setProgressPct(Math.min(100, Math.max(0, Math.round((Math.abs(boatZ) / Math.abs(FINISH_Z)) * 100))));
        }
      } else {
        // Gentle celebratory bob at Orla de Bragança
        totalElapsed += dt;
        boatGroup.position.y = Math.sin(totalElapsed * 3.0) * 0.09;
        animateAvatarRig(
          avatarRig,
          0,
          true,
          totalElapsed,
          dt,
          'trophy',
          studentRef.current.movementStyle || 'classic'
        );
      }

      // Gently bob floating buoys
      for (const stage of buoyStages) {
        for (let l = 0; l < stage.meshes.length; l++) {
          stage.meshes[l].position.y = Math.sin(totalElapsed * 2.6 + stage.index + l) * 0.14;
        }
      }

      particlePool.update(dt);

      // Smooth Chase Camera behind Voadeira
      const targetCamX = boatX * 0.55;
      const targetCamY = turboTimer > 0 ? 5.6 : 6.1;
      const targetCamZ = boatZ + (turboTimer > 0 ? 11.4 : 10.6);
      camera.position.x += (targetCamX - camera.position.x) * Math.min(1, dt * 6);
      camera.position.y += (targetCamY - camera.position.y) * Math.min(1, dt * 5);
      camera.position.z = targetCamZ;
      camera.lookAt(boatX * 0.45, 1.8, boatZ - 26);

      envRig.updateShadowTarget(boatX, 0, boatZ - 14);
      renderer.render(scene, camera);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', applyViewportCamera);
      window.removeEventListener('orientationchange', applyViewportCamera);
      if (toastTimeoutId !== null) window.clearTimeout(toastTimeoutId);
      disposeSceneResources(scene, renderer, envRig.envTexture);
    };
  }, [questions, graphicsQuality, runSeed, worldId, diffConfig]);

  const activeQuestion = questions[activeStageIdx] || questions[0];
  const countdownRatio = Math.max(0, Math.min(1, countdownSec / QUESTION_COUNTDOWN_SEC));
  const accuracyPct = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

  return (
    <div className="fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-slate-950 select-none">
      {/* 3D Canvas Container */}
      <div ref={mountRef} className="h-full w-full" />

      {/* ULTRA-THIN TRANSLUCENT TOP HUD BAR (Mobile & Desktop Safe) */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 px-2 pt-2 sm:px-4 sm:pt-3">
        <div className="pointer-events-auto mx-auto flex h-10 sm:h-12 max-w-6xl items-center justify-between gap-2 rounded-2xl border border-teal-400/35 bg-slate-950/65 px-2.5 sm:px-4 backdrop-blur-md shadow-lg">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onExit}
              className="flex h-7 sm:h-8 items-center gap-1 rounded-xl border border-white/15 bg-slate-900/90 px-2 sm:px-3 text-[11px] sm:text-xs font-bold text-white hover:bg-slate-800 shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5 text-teal-300" />
              <span className="hidden sm:inline">Praça</span>
            </button>
            <div className="flex items-center gap-1.5 truncate">
              <Waves className="h-4 w-4 text-teal-400 shrink-0" />
              <span className="font-display text-xs sm:text-sm font-black text-white truncate">
                Rio Caeté
              </span>
              <span className="hidden md:inline text-[11px] font-semibold text-teal-300">
                · Tabuada Lógica ({world.grade})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 font-mono text-[11px] sm:text-xs font-bold tabular-nums">
            <span className="flex items-center gap-1 text-teal-300">
              <Compass className="h-3.5 w-3.5" />
              <span>
                {Math.min(answeredCount + 1, TOTAL_BUOYS)}/{TOTAL_BUOYS}
              </span>
            </span>
            <span className={`hidden sm:flex items-center gap-1 ${isTurbo ? 'text-yellow-300' : 'text-sky-300'}`}>
              <Gauge className="h-3.5 w-3.5" />
              <span>{speedKnots} nós</span>
            </span>
            <span className="text-emerald-300">{progressPct}%</span>
            <span className="hidden sm:inline text-amber-300">+{sessionCoins}c</span>
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl border border-white/15 bg-slate-900/80 text-slate-200 hover:bg-slate-800"
              aria-label="Alternar tela cheia"
              title="Tela Cheia"
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5 text-teal-300" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5 text-teal-300" />
              )}
            </button>
            <button
              type="button"
              onClick={onToggleMute}
              className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-xl border border-white/15 bg-slate-900/80 text-slate-200 hover:bg-slate-800"
              aria-label={muted ? 'Ativar som' : 'Silenciar som'}
            >
              {muted ? <VolumeX className="h-3.5 w-3.5 text-rose-400" /> : <Volume2 className="h-3.5 w-3.5 text-teal-300" />}
            </button>
          </div>
        </div>
      </div>

      {/* COMPACT QUESTION BANNER WITH 10s COUNTDOWN BAR */}
      {!finished && activeQuestion && (
        <div className="pointer-events-none fixed inset-x-0 top-14 sm:top-16 z-30 px-2.5 sm:px-4">
          <div className="mx-auto max-w-2xl rounded-2xl border border-teal-400/50 bg-slate-950/82 p-2.5 sm:p-3.5 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between gap-2 text-[10px] sm:text-[11px] font-bold">
              <span className="text-teal-300 uppercase tracking-wide truncate">
                Boia {Math.min(activeStageIdx + 1, TOTAL_BUOYS)} de {TOTAL_BUOYS} · {activeQuestion.topic}
              </span>
              <span
                className={`flex items-center gap-1 font-mono tabular-nums ${
                  countdownSec <= 3 ? 'text-rose-400' : 'text-amber-300'
                }`}
              >
                <Timer className="h-3.5 w-3.5" />
                {countdownSec.toFixed(1)}s
              </span>
            </div>

            <p className="mt-1 text-center font-display text-sm sm:text-lg font-black text-white leading-snug">
              {activeQuestion.prompt}
            </p>

            {/* 10s Countdown Bar */}
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full transition-all duration-100 ${
                  countdownSec <= 3
                    ? 'bg-rose-500'
                    : isTurbo
                      ? 'bg-yellow-400'
                      : 'bg-gradient-to-r from-teal-400 to-sky-400'
                }`}
                style={{ width: `${Math.round(countdownRatio * 100)}%` }}
              />
            </div>

            {/* Compact Option Strip */}
            <div className="mt-2 grid grid-cols-3 gap-1.5 sm:gap-2">
              {activeQuestion.options.slice(0, 3).map((opt, idx) => {
                const isSelected = currentLane === idx;
                return (
                  <div
                    key={idx}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-1 text-center text-[11px] sm:text-xs font-extrabold transition-all ${
                      isSelected
                        ? idx === 0
                          ? 'border-emerald-400 bg-emerald-500/30 text-white scale-[1.02]'
                          : idx === 1
                            ? 'border-sky-400 bg-sky-500/30 text-white scale-[1.02]'
                            : 'border-amber-400 bg-amber-500/30 text-white scale-[1.02]'
                        : 'border-slate-700/80 bg-slate-900/75 text-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-flex h-4 w-4 sm:h-5 sm:w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-black text-slate-950 ${
                        idx === 0 ? 'bg-emerald-400' : idx === 1 ? 'bg-sky-400' : 'bg-amber-400'
                      }`}
                    >
                      {LANE_LETTERS[idx]}
                    </span>
                    <span className="truncate">{opt}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* FEEDBACK TOAST (Turbo / Obstacle / Explanation) */}
      {feedbackToast && !finished && (
        <div className="pointer-events-none fixed left-1/2 top-44 sm:top-48 z-40 w-[92%] max-w-md -translate-x-1/2">
          <div
            className={`rounded-2xl border px-4 py-2.5 text-center shadow-2xl backdrop-blur-md ${
              feedbackToast.ok
                ? 'border-teal-400/70 bg-teal-950/90 text-teal-100'
                : 'border-amber-400/70 bg-slate-950/92 text-amber-100'
            }`}
          >
            <p className="font-display text-xs sm:text-sm font-black">{feedbackToast.title}</p>
            <p className="mt-0.5 text-[11px] opacity-90">{feedbackToast.detail}</p>
          </div>
        </div>
      )}

      {/* ELEVATED MOBILE-SAFE CONTROLS (bottom >= 112px + safe-area-inset-bottom, NEVER touches Netlify icon) */}
      {!finished && (
        <div
          className="pointer-events-none fixed inset-x-0 z-50 px-3 sm:px-6"
          style={{ bottom: 'calc(112px + env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto flex max-w-xl items-center justify-between gap-2">
            {/* Steer Left */}
            <button
              type="button"
              onPointerDown={() => shiftLane(-1)}
              className="pointer-events-auto flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl border-2 border-teal-400/60 bg-slate-950/80 text-teal-300 shadow-xl backdrop-blur-sm active:scale-90 active:bg-teal-500 active:text-slate-950"
              aria-label="Virar voadeira para a esquerda"
            >
              <ChevronLeft className="h-8 w-8" />
            </button>

            {/* Quick Channel Selectors A / B / C */}
            <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/15 bg-slate-950/75 p-1.5 backdrop-blur-md shadow-xl">
              {([0, 1, 2] as const).map((laneIdx) => {
                const active = currentLane === laneIdx;
                const activeClasses =
                  laneIdx === 0
                    ? 'bg-emerald-400 text-slate-950 border-emerald-300'
                    : laneIdx === 1
                      ? 'bg-sky-400 text-slate-950 border-sky-300'
                      : 'bg-amber-400 text-slate-950 border-amber-300';
                return (
                  <button
                    key={laneIdx}
                    type="button"
                    onPointerDown={() => selectLane(laneIdx)}
                    className={`flex h-11 w-12 sm:h-12 sm:w-16 items-center justify-center rounded-xl border font-display text-sm sm:text-base font-black transition-all active:scale-95 ${
                      active
                        ? `${activeClasses} shadow-lg scale-105`
                        : 'border-slate-700 bg-slate-900/90 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {LANE_LETTERS[laneIdx]}
                  </button>
                );
              })}
            </div>

            {/* Steer Right */}
            <button
              type="button"
              onPointerDown={() => shiftLane(1)}
              className="pointer-events-auto flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl border-2 border-teal-400/60 bg-slate-950/80 text-teal-300 shadow-xl backdrop-blur-sm active:scale-90 active:bg-teal-500 active:text-slate-950"
              aria-label="Virar voadeira para a direita"
            >
              <ChevronRight className="h-8 w-8" />
            </button>
          </div>
        </div>
      )}

      {/* VICTORY MODAL — CHEGADA NA ORLA DE BRAGANÇA */}
      {finished && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl border-2 border-teal-400/60 bg-slate-900 p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-500/20 border border-teal-400/50">
              <Anchor className="h-9 w-9 text-teal-300" />
            </div>
            <p className="mt-3 text-xs font-extrabold uppercase tracking-wider text-teal-300">
              Orla de Bragança · Mirante de São Benedito
            </p>
            <h2 className="mt-1 font-display text-2xl sm:text-3xl font-black text-white">
              Chegada da Regata no Rio Caeté!
            </h2>
            <p className="mt-1 text-xs text-slate-300">
              Parabéns, {student.name}! Você completou a travessia fluvial do {world.grade} em{' '}
              <strong className="text-white">{elapsedSec}s</strong>.
            </p>

            <div className="mt-5 grid grid-cols-3 gap-2.5">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                <p className="text-[11px] text-slate-400">Boias Certas</p>
                <p className="mt-1 font-mono text-xl font-black text-emerald-400 tabular-nums">
                  {correctCount}/{TOTAL_BUOYS}
                </p>
                <p className="text-[10px] text-slate-400">{accuracyPct}% acerto</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                <p className="text-[11px] text-slate-400">XP Ganho</p>
                <p className="mt-1 flex items-center justify-center gap-1 font-mono text-xl font-black text-sky-400 tabular-nums">
                  <Sparkles className="h-4 w-4" />+{sessionXp}
                </p>
                <p className="text-[10px] text-slate-400">Salvo na nuvem</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                <p className="text-[11px] text-slate-400">BloxCoins</p>
                <p className="mt-1 flex items-center justify-center gap-1 font-mono text-xl font-black text-amber-400 tabular-nums">
                  <Coins className="h-4 w-4" />+{sessionCoins}
                </p>
                <p className="text-[10px] text-slate-400">Bônus Orla</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-xs font-bold text-teal-200 flex items-center justify-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-300 shrink-0" />
              <span>Título ⚓ Comandante do Caeté desbloqueado na sua conta!</span>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleRestart}
                className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-teal-400 px-4 py-3 font-display text-sm font-black text-slate-950 hover:bg-teal-300 active:scale-95"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Nova Regata</span>
              </button>
              <button
                type="button"
                onClick={onExit}
                className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 font-display text-sm font-bold text-white hover:bg-slate-700 active:scale-95"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Voltar à Praça</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
