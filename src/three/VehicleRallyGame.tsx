import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Coins,
  Compass,
  Flame,
  Gauge,
  RotateCcw,
  Trophy,
} from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { AudioSettingsButton } from '../components/AudioSettingsModal';
import { getQuestionsForMode } from '../data/questionEngine';
import { getDifficultyConfig, getWorldById } from '../data/worlds';
import { createAnswerPadTexture, createStudTexture } from '../game/textures';
import { MathQuestion, StudentProfile, TowerDifficulty } from '../types/game';
import { animateKartRig, createKartRig, KartRig } from './vehicleBuilder';

interface VehicleRallyGameProps {
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

const isSoftwareGl = (() => {
  if (typeof document === 'undefined') return false;
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
})();

const TOTAL_PORTALS = 8;
const PORTAL_DISTANCE = 130; // 130 unidades 3D entre portais de checkpoint
const TOTAL_RALLY_LENGTH = (TOTAL_PORTALS + 1) * PORTAL_DISTANCE;

interface JumpRampDef {
  zStart: number;
  zEnd: number;
  peakHeight: number;
}

function createHighwaySignTexture(topText: string, bottomText: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#15803d';
  ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 496, 144);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(topText, 256, 66);
  ctx.fillStyle = '#fde047';
  ctx.font = '800 22px sans-serif';
  ctx.fillText(bottomText, 256, 114);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createFinishGantryTexture(
  primaryText: string,
  secondaryText: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Gradient Coastal Header Background
  const grad = ctx.createLinearGradient(0, 0, 1024, 256);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(0.5, '#0369a1');
  grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 256);

  // Checkered racing flags on left & right borders
  const sq = 32;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 2; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#0f172a';
      ctx.fillRect(12 + c * sq, r * sq, sq, sq);
      ctx.fillRect(1024 - 12 - (c + 1) * sq, r * sq, sq, sq);
    }
  }

  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 10;
  ctx.strokeRect(6, 6, 1012, 244);

  // Primary illuminated title: "PRAIA DE AJURUTEUA"
  ctx.fillStyle = '#fde047';
  ctx.font = '900 70px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(primaryText, 512, 102);

  // Secondary subtitle pill: "ORLA DE AJURUTEUA • BRAGANÇA-PA"
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.beginPath();
  ctx.roundRect(172, 154, 680, 68, 20);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#38bdf8';
  ctx.stroke();

  ctx.fillStyle = '#e0f2fe';
  ctx.font = '800 34px sans-serif';
  ctx.fillText(secondaryText, 512, 189);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function VehicleRallyGame({
  student,
  worldId,
  difficulty,
  onProgressEvent,
  onExit,
}: VehicleRallyGameProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [runKey, setRunKey] = useState(1);
  const [autoAccelerate, setAutoAccelerate] = useState(true);

  const world = useMemo(() => getWorldById(worldId), [worldId]);
  const diffConfig = useMemo(() => getDifficultyConfig(difficulty), [difficulty]);
  const questions = useMemo(
    () => getQuestionsForMode(worldId, 'vehicle_rally', TOTAL_PORTALS),
    [worldId, runKey]
  );

  const [hudState, setHudState] = useState<{
    portalIndex: number;
    speedKmh: number;
    distanceToPortal: number;
    nitroLeft: number;
    spinningOut: boolean;
    countdownLabel: string | null;
    zoneLabel: string;
    question: MathQuestion;
    sessionXp: number;
    sessionCoins: number;
    correctCount: number;
    hintBanner: { text: string; isCorrect: boolean } | null;
    finished: boolean;
    elapsedTime: number;
  }>({
    portalIndex: 0,
    speedKmh: 0,
    distanceToPortal: PORTAL_DISTANCE,
    nitroLeft: 0,
    spinningOut: false,
    countdownLabel: '3',
    zoneLabel: 'PA-458 • Manguezais de Bragança',
    question: questions[0],
    sessionXp: 0,
    sessionCoins: 0,
    correctCount: 0,
    hintBanner: null,
    finished: false,
    elapsedTime: 0,
  });

  // Mobile Touch Control Refs
  const touchControlRef = useRef({
    steerLeft: false,
    steerRight: false,
    accelerate: false,
    brake: false,
  });

  const autoAccelRef = useRef(autoAccelerate);
  autoAccelRef.current = autoAccelerate;

  const onProgressRef = useRef(onProgressEvent);
  onProgressRef.current = onProgressEvent;

  // Start "Adrenalina Arcade" 132 BPM BGM
  useEffect(() => {
    soundEngine.startBgm('race');
    return () => {
      soundEngine.setBgmSpeedMultiplier(1.0);
    };
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x38bdf8);
    scene.fog = new THREE.Fog(0xbae6fd, 85, 290);

    const camera = new THREE.PerspectiveCamera(64, width / height, 0.2, 320);
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = !isSoftwareGl;
    container.appendChild(renderer.domElement);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x15803d, 0.95);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffbeb, 1.65);
    sunLight.position.set(28, 52, 30);
    sunLight.castShadow = !isSoftwareGl;
    scene.add(sunLight);

    // =========================================================================
    // 1.3. ESTRADA DE AJURUTEUA (PA-458): MANGUEZAIS -> DUNAS -> MAR DE AJURUTEUA
    // =========================================================================
    const BEACH_TRANSITION_Z = -620; // From 20 to -620: Manguezais; from -620 to -1180: Dunas & Praia de Ajuruteua

    // Trecho 1 (Manguezais Verdes e Canais de Maré): z = 80 até z = -620
    const mangroveGroundLen = 720;
    const mangroveGround = new THREE.Mesh(
      new THREE.PlaneGeometry(520, mangroveGroundLen),
      new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.85 })
    );
    mangroveGround.rotation.x = -Math.PI / 2;
    mangroveGround.position.set(0, -0.1, -260);
    mangroveGround.receiveShadow = true;
    scene.add(mangroveGround);

    // Espelhos d'água dos canais de maré sob os manguezais nas laterais da PA-458
    const tidalWaterMat = new THREE.MeshStandardMaterial({
      color: 0x0f766e,
      emissive: 0x115e59,
      emissiveIntensity: 0.25,
      roughness: 0.22,
    });
    for (const side of [-1, 1]) {
      const tidalChannel = new THREE.Mesh(new THREE.PlaneGeometry(42, 680), tidalWaterMat);
      tidalChannel.rotation.x = -Math.PI / 2;
      tidalChannel.position.set(side * 32, -0.04, -270);
      scene.add(tidalChannel);
    }

    // Trecho 2 (Dunas de Areia Clara de Ajuruteua): z = -620 até z = -1260
    const sandGroundLen = 680;
    const sandGround = new THREE.Mesh(
      new THREE.PlaneGeometry(520, sandGroundLen),
      new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.8 })
    );
    sandGround.rotation.x = -Math.PI / 2;
    sandGround.position.set(0, -0.07, -960);
    sandGround.receiveShadow = true;
    scene.add(sandGround);

    // Mar Aberto Azul-Turquesa (#0284C7 / #06B6D4) de Ajuruteua logo após a Linha de Chegada e na Orla Costeira
    const seaOceanMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x0284c7,
      emissiveIntensity: 0.42,
      roughness: 0.16,
      metalness: 0.28,
    });
    const ajuruteuaSea = new THREE.Mesh(new THREE.PlaneGeometry(680, 520), seaOceanMat);
    ajuruteuaSea.rotation.x = -Math.PI / 2;
    ajuruteuaSea.position.set(0, -0.02, -TOTAL_RALLY_LENGTH - 110);
    scene.add(ajuruteuaSea);

    // Faixa de Areia Dourada/Clara da Praia na Linha de Chegada
    const beachShoreSand = new THREE.Mesh(
      new THREE.PlaneGeometry(640, 260),
      new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.75 })
    );
    beachShoreSand.rotation.x = -Math.PI / 2;
    beachShoreSand.position.set(0, -0.04, -TOTAL_RALLY_LENGTH + 75);
    scene.add(beachShoreSand);

    // Ondas Brancas Espumantes Animadas Quebrando na Areia da Praia de Ajuruteua
    const oceanWaves: { mesh: THREE.Mesh; baseZ: number; phase: number }[] = [];
    const foamMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x7dd3fc,
      emissiveIntensity: 0.65,
    });
    for (let w = 0; w < 18; w++) {
      const waveBar = new THREE.Mesh(new THREE.BoxGeometry(92, 0.14, 1.8), foamMat);
      const wz = -TOTAL_RALLY_LENGTH + 45 - w * 14;
      waveBar.position.set((w % 2 === 0 ? -1 : 1) * 32, 0.06, wz);
      scene.add(waveBar);
      oceanWaves.push({ mesh: waveBar, baseZ: wz, phase: w * 0.75 });
    }

    // 2. Estrada Asfáltica da PA-458 (18 unidades de largura) + Faixas Tracejadas
    const trackWidth = 18.0;
    const roadTex = createStudTexture('#1e293b', maxAniso, 8, 220);
    const roadMesh = new THREE.Mesh(
      new THREE.BoxGeometry(trackWidth, 1.0, TOTAL_RALLY_LENGTH),
      new THREE.MeshStandardMaterial({
        map: roadTex,
        roughness: 0.45,
        metalness: 0.15,
      })
    );
    roadMesh.position.set(0, -0.5, -TOTAL_RALLY_LENGTH / 2 + 25);
    roadMesh.receiveShadow = true;
    scene.add(roadMesh);

    const whiteDashMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
    const dashGeo = new THREE.BoxGeometry(0.28, 0.04, 4.2);
    for (let z = 18; z > -TOTAL_RALLY_LENGTH + 20; z -= 9.5) {
      const dashL = new THREE.Mesh(dashGeo, whiteDashMat);
      dashL.position.set(-2.7, 0.02, z);
      const dashR = new THREE.Mesh(dashGeo, whiteDashMat);
      dashR.position.set(2.7, 0.02, z);
      scene.add(dashL, dashR);
    }

    // Zebras Laterais + Guard-Rails Metálicos
    const curbSegments = 96;
    const segLen = TOTAL_RALLY_LENGTH / curbSegments;
    const redCurbMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4 });
    const whiteCurbMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
    const curbGeo = new THREE.BoxGeometry(0.95, 0.45, segLen);

    for (let i = 0; i < curbSegments; i++) {
      const cz = 20 - i * segLen;
      const mat = i % 2 === 0 ? redCurbMat : whiteCurbMat;
      const leftCurb = new THREE.Mesh(curbGeo, mat);
      leftCurb.position.set(-trackWidth / 2 - 0.4, 0.22, cz);
      const rightCurb = new THREE.Mesh(curbGeo, mat);
      rightCurb.position.set(trackWidth / 2 + 0.4, 0.22, cz);
      scene.add(leftCurb, rightCurb);
    }

    const guardRailMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.25,
      metalness: 0.85,
    });
    const postMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.35,
      metalness: 0.75,
    });
    const railBeamGeo = new THREE.BoxGeometry(0.25, 0.42, TOTAL_RALLY_LENGTH);
    const leftGuardRail = new THREE.Mesh(railBeamGeo, guardRailMat);
    leftGuardRail.position.set(-trackWidth / 2 - 1.1, 0.75, -TOTAL_RALLY_LENGTH / 2 + 25);
    const rightGuardRail = new THREE.Mesh(railBeamGeo, guardRailMat);
    rightGuardRail.position.set(trackWidth / 2 + 1.1, 0.75, -TOTAL_RALLY_LENGTH / 2 + 25);
    scene.add(leftGuardRail, rightGuardRail);

    const postGeo = new THREE.BoxGeometry(0.22, 1.0, 0.22);
    for (let z = 20; z > -TOTAL_RALLY_LENGTH + 20; z -= 14) {
      const pL = new THREE.Mesh(postGeo, postMat);
      pL.position.set(-trackWidth / 2 - 1.1, 0.5, z);
      const pR = new THREE.Mesh(postGeo, postMat);
      pR.position.set(trackWidth / 2 + 1.1, 0.5, z);
      scene.add(pL, pR);
    }

    // 3. Nuvens 3D no Céu
    const rallyClouds: { group: THREE.Group; speed: number }[] = [];
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    for (let c = 0; c < 22; c++) {
      const cg = new THREE.Group();
      for (let p = 0; p < 3; p++) {
        const block = new THREE.Mesh(
          new THREE.BoxGeometry(7 + p * 2.5, 2.4 + (p % 2), 5 + p),
          cloudMat
        );
        block.position.set(p * 3.2 - 3, (p % 2) * 0.7, 0);
        cg.add(block);
      }
      const side = c % 2 === 0 ? 1 : -1;
      cg.position.set(side * (24 + (c % 4) * 14), 26 + (c % 3) * 5, -c * 52 + 10);
      scene.add(cg);
      rallyClouds.push({ group: cg, speed: 1.4 + (c % 3) * 0.6 });
    }

    // 4. Vegetação Temática: Manguezais com Raízes Aéreas & Passarelas de Madeira vs. Dunas & Coqueiros Inclinados de Ajuruteua
    const rootWoodMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.75 });
    const mangroveLeafMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.6 });
    const mangroveDarkLeafMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.65 });
    const bridgePlankMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.7 });
    const duneSandMat = new THREE.MeshStandardMaterial({ color: 0xfcd34d, roughness: 0.75 });
    const palmLeafMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.5 });

    // Passarelas Rústicas de Madeira dos Pescadores/Catadores de Caranguejo nas Laterais do Manguezal
    for (let bz = -20; bz > BEACH_TRANSITION_Z + 40; bz -= 85) {
      for (const side of [-1, 1]) {
        const bridgeGroup = new THREE.Group();
        const bx = side * (trackWidth / 2 + 4.8);
        bridgeGroup.position.set(bx, 0, bz);
        const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 28), bridgePlankMat);
        deck.position.y = 0.85;
        bridgeGroup.add(deck);

        for (let pz = -12; pz <= 12; pz += 4) {
          const stiltL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5, 6), rootWoodMat);
          stiltL.position.set(-1.0, 0.65, pz);
          const stiltR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5, 6), rootWoodMat);
          stiltR.position.set(1.0, 0.65, pz);
          bridgeGroup.add(stiltL, stiltR);
        }
        scene.add(bridgeGroup);
      }
    }

    // Placas Rodoviárias Verdes da PA-458
    const signPa458 = createHighwaySignTexture('PA-458 • BRAGANÇA', 'RESERVA DOS MANGUEZAIS');
    const signAjuruteua = createHighwaySignTexture('PRAIA DE AJURUTEUA', 'BEM-VINDO AO LITORAL!');
    const highwaySigns = [
      { z: -40, tex: signPa458 },
      { z: BEACH_TRANSITION_Z + 10, tex: signAjuruteua },
    ];
    for (const hs of highwaySigns) {
      const sg = new THREE.Group();
      sg.position.set(trackWidth / 2 + 3.8, 0, hs.z);
      const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.2, 8), postMat);
      p1.position.set(-1.6, 2.1, 0);
      const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.2, 8), postMat);
      p2.position.set(1.6, 2.1, 0);
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(4.4, 1.65, 0.18),
        new THREE.MeshStandardMaterial({ map: hs.tex, roughness: 0.3 })
      );
      board.position.set(0, 3.8, 0);
      sg.add(p1, p2, board);
      scene.add(sg);
    }

    for (let z = 10; z > -TOTAL_RALLY_LENGTH + 20; z -= 24) {
      for (const side of [-1, 1]) {
        const tx = side * (trackWidth / 2 + 7.5 + (Math.abs(z) % 6));

        if (z > BEACH_TRANSITION_Z) {
          // TRECHO 1: Árvore de Manguezal Densa com Raízes Aéreas (Rizóforos)
          const mangGroup = new THREE.Group();
          mangGroup.position.set(tx, 0, z);

          const mainTrunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.38, 0.48, 2.6, 8),
            rootWoodMat
          );
          mainTrunk.position.y = 1.9;
          mangGroup.add(mainTrunk);

          // 4 Raízes Aéreas Arqueadas saindo do tronco até a água/lama
          for (let r = 0; r < 4; r++) {
            const ang = (r / 4) * Math.PI * 2 + 0.4;
            const rootLeg = new THREE.Mesh(
              new THREE.CylinderGeometry(0.1, 0.15, 1.9, 6),
              rootWoodMat
            );
            rootLeg.position.set(Math.cos(ang) * 0.75, 0.75, Math.sin(ang) * 0.75);
            rootLeg.rotation.z = -Math.cos(ang) * 0.48;
            rootLeg.rotation.x = Math.sin(ang) * 0.48;
            mangGroup.add(rootLeg);
          }

          // Copa Densa do Manguezal
          const canopy1 = new THREE.Mesh(
            new THREE.DodecahedronGeometry(2.3, 0),
            z % 48 === 0 ? mangroveLeafMat : mangroveDarkLeafMat
          );
          canopy1.position.set(0, 3.6, 0);
          const canopy2 = new THREE.Mesh(
            new THREE.DodecahedronGeometry(1.75, 0),
            mangroveLeafMat
          );
          canopy2.position.set(0.9 * side, 4.3, 0.6);
          mangGroup.add(canopy1, canopy2);
          scene.add(mangGroup);
        } else {
          // TRECHO 2: Dunas de Areia Clara + Coqueiros Inclinados de Ajuruteua
          const palmGroup = new THREE.Group();
          palmGroup.position.set(tx, 0, z);
          // Inclinação suave pela brisa marítima de Ajuruteua
          palmGroup.rotation.z = -side * 0.16;

          const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.28, 0.44, 4.8, 8),
            rootWoodMat
          );
          trunk.position.y = 2.4;
          palmGroup.add(trunk);

          for (let f = 0; f < 6; f++) {
            const frond = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.12, 2.4), palmLeafMat);
            const ang = (f / 6) * Math.PI * 2;
            frond.position.set(Math.cos(ang) * 0.95, 4.7, Math.sin(ang) * 0.95);
            frond.rotation.y = -ang;
            frond.rotation.x = 0.35;
            palmGroup.add(frond);
          }
          scene.add(palmGroup);

          // Dunas de Areia Clara ao Fundo
          if (Math.abs(z) % 48 === 0) {
            const dune = new THREE.Mesh(
              new THREE.ConeGeometry(16, 7.5, 8),
              duneSandMat
            );
            dune.scale.set(1.4, 1, 1.8);
            dune.position.set(side * 42, 3.2, z);
            scene.add(dune);
          }
        }
      }
    }

    // Arquibancadas Laterais com Torcedores 3D Pulando e Vibrando nos Checkpoints
    const cheeringSpectators: { mesh: THREE.Group; baseY: number; phase: number; z: number }[] = [];
    const specColors = [0xef4444, 0x3b82f6, 0xfacc15, 0x10b981, 0xa855f7, 0xf97316];
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfcd34d, roughness: 0.5 });

    for (let g = 0; g < TOTAL_PORTALS; g++) {
      const standZ = -(g * PORTAL_DISTANCE + 32);
      for (const side of [-1, 1]) {
        const standGroup = new THREE.Group();
        const sx = side * (trackWidth / 2 + 5.2);
        standGroup.position.set(sx, 0, standZ);
        standGroup.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;

        for (let tier = 0; tier < 3; tier++) {
          const bench = new THREE.Mesh(
            new THREE.BoxGeometry(12, 0.65 * (tier + 1), 1.4),
            new THREE.MeshStandardMaterial({
              color: tier % 2 === 0 ? 0x334155 : 0x475569,
              roughness: 0.5,
            })
          );
          bench.position.set(0, 0.325 * (tier + 1), -tier * 1.4);
          standGroup.add(bench);

          for (let sp = -4.2; sp <= 4.2; sp += 2.8) {
            const fan = new THREE.Group();
            const col = specColors[Math.abs(Math.round(sp + g + tier)) % specColors.length];
            const fanMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.4 });
            const torso = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.75, 0.4), fanMat);
            torso.position.y = 0.38;
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.48), headMat);
            head.position.y = 1.02;
            const armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6, 0.22), fanMat);
            armL.position.set(-0.46, 0.85, 0);
            armL.rotation.z = 0.35;
            const armR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6, 0.22), fanMat);
            armR.position.set(0.46, 0.85, 0);
            armR.rotation.z = -0.35;
            fan.add(torso, head, armL, armR);

            const by = 0.65 * (tier + 1);
            fan.position.set(sp, by, -tier * 1.4);
            standGroup.add(fan);
            cheeringSpectators.push({
              mesh: fan,
              baseY: by,
              phase: (g + sp + tier) * 1.3,
              z: standZ,
            });
          }
        }
        scene.add(standGroup);
      }
    }

    // Start Arch at z = 0
    const startArchGroup = new THREE.Group();
    startArchGroup.position.set(0, 0, 0);
    const startBanner = new THREE.Mesh(
      new THREE.BoxGeometry(trackWidth + 1.5, 1.3, 0.8),
      new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x059669,
        emissiveIntensity: 0.7,
      })
    );
    startBanner.position.y = 5.2;
    for (const px of [-trackWidth / 2, trackWidth / 2]) {
      const pCol = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.4, 5.2, 12),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc })
      );
      pCol.position.set(px, 2.6, 0);
      startArchGroup.add(pCol);
    }
    startArchGroup.add(startBanner);
    scene.add(startArchGroup);

    // Jump Ramps on the Circuit
    const jumpRamps: JumpRampDef[] = [];
    const rampMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.4,
      roughness: 0.3,
    });

    for (let g = 0; g < TOTAL_PORTALS; g++) {
      const rampCenterZ = -(g * PORTAL_DISTANCE + 58);
      const rampLen = 9.0;
      const rampMesh = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.85, rampLen), rampMat);
      rampMesh.position.set(0, 0.25, rampCenterZ);
      rampMesh.rotation.x = 0.14;
      scene.add(rampMesh);

      jumpRamps.push({
        zStart: rampCenterZ + rampLen / 2,
        zEnd: rampCenterZ - rampLen / 2,
        peakHeight: 0.9,
      });
    }

    // Build 8 Checkpoint Portals spaced every 130 units (3 wide arches A, B, C)
    const portalZPositions: number[] = [];
    const portalTriggered = new Array(TOTAL_PORTALS).fill(false);
    const portalProximityTriggered = new Array(TOTAL_PORTALS).fill(false);
    const laneX = [-5.4, 0, 5.4];
    const letters: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];
    const archColors = ['#2563eb', '#d97706', '#9333ea'];

    for (let p = 0; p < TOTAL_PORTALS; p++) {
      const pz = -(p + 1) * PORTAL_DISTANCE;
      portalZPositions.push(pz);
      const q = questions[p];

      const portalGroup = new THREE.Group();
      portalGroup.position.set(0, 0, pz);

      const truss = new THREE.Mesh(
        new THREE.BoxGeometry(trackWidth + 1.6, 1.0, 1.0),
        new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.6, roughness: 0.25 })
      );
      truss.position.y = 5.4;
      portalGroup.add(truss);

      for (const colX of [-8.4, -2.7, 2.7, 8.4]) {
        const col = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.36, 5.4, 12),
          new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.3 })
        );
        col.position.set(colX, 2.7, 0);
        portalGroup.add(col);
      }

      for (let lane = 0; lane < 3; lane++) {
        const padTex = createAnswerPadTexture(
          letters[lane],
          q.options[lane] || '',
          archColors[lane],
          maxAniso
        );

        const boardMesh = new THREE.Mesh(
          new THREE.BoxGeometry(4.9, 2.4, 0.32),
          new THREE.MeshStandardMaterial({
            map: padTex,
            roughness: 0.25,
            metalness: 0.1,
          })
        );
        boardMesh.position.set(laneX[lane], 3.9, 0);
        portalGroup.add(boardMesh);

        const archGlow = new THREE.Mesh(
          new THREE.PlaneGeometry(5.0, 2.6),
          new THREE.MeshStandardMaterial({
            color: new THREE.Color(archColors[lane]),
            emissive: new THREE.Color(archColors[lane]),
            emissiveIntensity: 0.65,
            transparent: true,
            opacity: 0.24,
            side: THREE.DoubleSide,
          })
        );
        archGlow.position.set(laneX[lane], 1.3, 0);
        portalGroup.add(archGlow);
      }

      scene.add(portalGroup);
    }

    // =========================================================================
    // 5. RETA FINAL (ÚLTIMOS 200m) & PÓRTICO GIGANTE DA ORLA E PRAIA DE AJURUTEUA
    // =========================================================================
    const finishZ = -TOTAL_PORTALS * PORTAL_DISTANCE - 35;
    const orlaStartZ = finishZ + 215; // Últimos ~200m abrem para a Orla de Ajuruteua

    // Calçadão da Orla de Ajuruteua nas laterais dos últimos 200m
    const boardwalkMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5 });
    const lowWallBlueMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.4 });
    const strawRoofMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.85 });
    const kioskWoodMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.7 });
    const umbrellaColors = [0xef4444, 0x0ea5e9, 0xfacc15, 0x10b981, 0xf97316, 0xa855f7];

    for (const side of [-1, 1]) {
      const walkX = side * (trackWidth / 2 + 4.4);
      const boardwalk = new THREE.Mesh(
        new THREE.BoxGeometry(5.6, 0.32, 235),
        boardwalkMat
      );
      boardwalk.position.set(walkX, 0.16, finishZ + 98);
      scene.add(boardwalk);

      const coastalCurb = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.65, 235),
        lowWallBlueMat
      );
      coastalCurb.position.set(walkX + side * 2.6, 0.35, finishZ + 98);
      scene.add(coastalCurb);
    }

    // Quiosques/Barracas de Praia típicos da Orla de Ajuruteua + Guarda-Sóis Coloridos + Público Comemorando
    for (let kz = orlaStartZ - 15; kz >= finishZ - 10; kz -= 28) {
      for (const side of [-1, 1]) {
        const kx = side * (trackWidth / 2 + 10.5);
        const kioskGroup = new THREE.Group();
        kioskGroup.position.set(kx, 0, kz);

        // Base & Balcão da Barraca de Praia de Ajuruteua
        const floorPad = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.25, 5.6), boardwalkMat);
        floorPad.position.y = 0.12;
        const counter = new THREE.Mesh(
          new THREE.BoxGeometry(3.8, 1.15, 1.2),
          new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.45 })
        );
        counter.position.set(-side * 0.9, 0.7, 0);
        kioskGroup.add(floorPad, counter);

        // 4 Pilares de Madeira + Cobertura de Palha Regional (Chapéu de Sol / Palhoça)
        for (const px of [-2.1, 2.1]) {
          for (const pz of [-2.1, 2.1]) {
            const pPost = new THREE.Mesh(
              new THREE.CylinderGeometry(0.14, 0.16, 3.2, 8),
              kioskWoodMat
            );
            pPost.position.set(px, 1.6, pz);
            kioskGroup.add(pPost);
          }
        }
        const thatchRoof = new THREE.Mesh(new THREE.ConeGeometry(4.4, 2.1, 8), strawRoofMat);
        thatchRoof.position.y = 4.15;
        kioskGroup.add(thatchRoof);
        scene.add(kioskGroup);

        // Guarda-Sol Colorido na Areia + Torcedores Comemorando na Orla
        const umbX = side * (trackWidth / 2 + 4.4);
        const umbZ = kz - 10;
        const umbGroup = new THREE.Group();
        umbGroup.position.set(umbX, 0.3, umbZ);
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.08, 2.9, 8),
          new THREE.MeshStandardMaterial({ color: 0xffffff })
        );
        pole.position.y = 1.45;
        const uCol = umbrellaColors[Math.abs(Math.round(kz + side)) % umbrellaColors.length];
        const canopy = new THREE.Mesh(
          new THREE.ConeGeometry(1.95, 0.85, 10),
          new THREE.MeshStandardMaterial({ color: uCol, roughness: 0.4 })
        );
        canopy.position.y = 2.95;
        umbGroup.add(pole, canopy);
        scene.add(umbGroup);

        // 2 Beach Spectators cheering next to each umbrella
        for (let b = 0; b < 2; b++) {
          const fan = new THREE.Group();
          const fCol = specColors[(Math.abs(Math.round(kz)) + b) % specColors.length];
          const fanMat = new THREE.MeshStandardMaterial({ color: fCol, roughness: 0.4 });
          const torso = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.78, 0.4), fanMat);
          torso.position.y = 0.39;
          const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.48), headMat);
          head.position.y = 1.04;
          const armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.22), fanMat);
          armL.position.set(-0.46, 0.88, 0);
          armL.rotation.z = 0.45;
          const armR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.22), fanMat);
          armR.position.set(0.46, 0.88, 0);
          armR.rotation.z = -0.45;
          fan.add(torso, head, armL, armR);
          fan.position.set(umbX - side * 1.1, 0.32, umbZ + (b === 0 ? -1.1 : 1.1));
          fan.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;
          scene.add(fan);
          cheeringSpectators.push({
            mesh: fan,
            baseY: 0.32,
            phase: kz * 0.4 + b,
            z: umbZ,
          });
        }
      }
    }

    // Pórtico Gigante de Chegada com Placa Iluminada "PRAIA DE AJURUTEUA" & "ORLA DE AJURUTEUA • BRAGANÇA-PA"
    const finishGantryGroup = new THREE.Group();
    finishGantryGroup.position.set(0, 0, finishZ);

    const gantryPillarMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.3,
      metalness: 0.4,
    });
    const gantryGoldMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xeab308,
      emissiveIntensity: 0.75,
    });

    for (const gx of [-trackWidth / 2 - 0.6, trackWidth / 2 + 0.6]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(1.3, 8.2, 1.3), gantryPillarMat);
      col.position.set(gx, 4.1, 0);
      const neonStrip = new THREE.Mesh(new THREE.BoxGeometry(0.35, 7.8, 1.42), gantryGoldMat);
      neonStrip.position.set(gx, 4.1, 0);
      finishGantryGroup.add(col, neonStrip);
    }

    // Faixa Quadriculada no Chão da Linha de Chegada
    const checkerCanvas = document.createElement('canvas');
    checkerCanvas.width = 512;
    checkerCanvas.height = 64;
    const cCtx = checkerCanvas.getContext('2d')!;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 16; c++) {
        cCtx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#0f172a';
        cCtx.fillRect(c * 32, r * 32, 32, 32);
      }
    }
    const checkerTex = new THREE.CanvasTexture(checkerCanvas);
    checkerTex.colorSpace = THREE.SRGBColorSpace;
    const finishFloorLine = new THREE.Mesh(
      new THREE.PlaneGeometry(trackWidth, 2.6),
      new THREE.MeshStandardMaterial({ map: checkerTex, roughness: 0.4 })
    );
    finishFloorLine.rotation.x = -Math.PI / 2;
    finishFloorLine.position.set(0, 0.04, 0);
    finishGantryGroup.add(finishFloorLine);

    // Grande Painel Superior Iluminado ("PRAIA DE AJURUTEUA" / "ORLA DE AJURUTEUA • BRAGANÇA-PA")
    const gantryTex = createFinishGantryTexture(
      'PRAIA DE AJURUTEUA',
      'ORLA DE AJURUTEUA • BRAGANÇA-PA'
    );
    const gantryBoard = new THREE.Mesh(
      new THREE.BoxGeometry(trackWidth + 2.6, 3.8, 0.9),
      new THREE.MeshStandardMaterial({
        map: gantryTex,
        roughness: 0.2,
        metalness: 0.1,
      })
    );
    gantryBoard.position.set(0, 6.7, 0);
    finishGantryGroup.add(gantryBoard);

    scene.add(finishGantryGroup);

    // Build 3D Kart with Seated Student Avatar (Jersey + Hat + Animated 3D Aura)
    const kartRig: KartRig = createKartRig(
      student.avatarColor,
      student.equippedHat,
      student.equippedJersey
    );
    scene.add(kartRig.root);

    // Arcade Driving Physics State + Pre-Race 3..2..1..JÁ! Countdown
    const BASE_MAX_SPEED = 18.0;
    const NITRO_MAX_SPEED = 30.0;
    const STEER_LATERAL_SPEED = 12.0;
    const GRAVITY = -26.0;

    const pos = { x: 0, y: 0, z: 6 };
    let forwardSpeed = 0;
    let verticalVel = 0;
    let isGrounded = true;

    let countdownTimer = 2.4;
    let lastCountdownStep = -1;
    let goBannerTimer = 0;

    let nitroTimer = 0;
    let spinOutTimer = 0;
    let spinAngle = 0;
    let hintTimer = 0;
    let hintBanner: { text: string; isCorrect: boolean } | null = null;

    let currentPortalIndex = 0;
    let elapsedTime = 0;
    let sessionXp = 0;
    let sessionCoins = 0;
    let correctCount = 0;
    let streak = 0;
    let finished = false;
    let lastHudSync = 0;

    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => keys.add(e.code);
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    const syncHud = (force = false, elapsed = 0, cdLabel: string | null = null) => {
      if (!force && elapsed - lastHudSync < 0.08) return;
      lastHudSync = elapsed;
      const nextPortalZ =
        portalZPositions[Math.min(currentPortalIndex, TOTAL_PORTALS - 1)] || finishZ;
      const dist = Math.max(0, Math.round(pos.z - nextPortalZ));
      const zoneLabel =
        pos.z > BEACH_TRANSITION_Z
          ? 'PA-458 • Manguezais de Bragança'
          : 'Chegando na Praia de Ajuruteua';
      setHudState({
        portalIndex: Math.min(currentPortalIndex, TOTAL_PORTALS - 1),
        speedKmh: Math.round(forwardSpeed * 6.5),
        distanceToPortal: dist,
        nitroLeft: nitroTimer,
        spinningOut: spinOutTimer > 0,
        countdownLabel: cdLabel,
        zoneLabel,
        question: questions[Math.min(currentPortalIndex, TOTAL_PORTALS - 1)],
        sessionXp,
        sessionCoins,
        correctCount,
        hintBanner,
        finished,
        elapsedTime,
      });
    };

    syncHud(true, 0, '3');

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.045);
      const elapsed = clock.getElapsedTime();

      // Animate 3D Clouds, Ajuruteua Ocean Waves & Bleacher Spectators
      for (const rc of rallyClouds) {
        rc.group.position.x += rc.speed * delta;
        if (rc.group.position.x > 95) rc.group.position.x = -95;
      }
      for (const ow of oceanWaves) {
        ow.mesh.position.z = ow.baseZ + Math.sin(elapsed * 2.2 + ow.phase) * 3.2;
      }
      for (const sp of cheeringSpectators) {
        if (Math.abs(sp.z - pos.z) < 160) {
          sp.mesh.position.y = sp.baseY + Math.abs(Math.sin(elapsed * 9 + sp.phase)) * 0.42;
        }
      }

      // Handle 3... 2... 1... JÁ! Musical Countdown
      let cdLabel: string | null = null;
      if (countdownTimer > 0) {
        countdownTimer = Math.max(0, countdownTimer - delta);
        const step = Math.ceil(countdownTimer / 0.8);
        cdLabel = step > 0 ? String(step) : 'JÁ!';
        if (step !== lastCountdownStep && step >= 1) {
          lastCountdownStep = step;
          soundEngine.playCountdown(false);
          syncHud(true, elapsed, cdLabel);
        }
        if (countdownTimer === 0) {
          goBannerTimer = 0.75;
          forwardSpeed = 10.0;
          soundEngine.playCountdown(true);
          syncHud(true, elapsed, 'JÁ!');
        }
      } else if (goBannerTimer > 0) {
        goBannerTimer = Math.max(0, goBannerTimer - delta);
        cdLabel = goBannerTimer > 0 ? 'JÁ!' : null;
      }

      if (!finished && countdownTimer <= 0) {
        elapsedTime += delta;
        if (nitroTimer > 0) nitroTimer = Math.max(0, nitroTimer - delta);
        if (hintTimer > 0) {
          hintTimer = Math.max(0, hintTimer - delta);
          if (hintTimer === 0) hintBanner = null;
        }

        // Accelerate BGM tempo (1.12x) automatically during Nitro Boost!
        soundEngine.setBgmSpeedMultiplier(nitroTimer > 0 ? 1.12 : 1.0);

        // Read Controls (Desktop WASD/Arrows + Mobile Touch Buttons)
        let steerInput = 0;
        if (keys.has('KeyA') || keys.has('ArrowLeft') || touchControlRef.current.steerLeft) {
          steerInput -= 1;
        }
        if (keys.has('KeyD') || keys.has('ArrowRight') || touchControlRef.current.steerRight) {
          steerInput += 1;
        }

        const wantBrake =
          keys.has('KeyS') || keys.has('ArrowDown') || touchControlRef.current.brake;
        const wantGas =
          keys.has('KeyW') ||
          keys.has('ArrowUp') ||
          touchControlRef.current.accelerate ||
          (autoAccelRef.current && !wantBrake);

        // Handle 360° Spin-Out Penalty (2 seconds)
        if (spinOutTimer > 0) {
          spinOutTimer = Math.max(0, spinOutTimer - delta);
          const progress = 1 - spinOutTimer / 2.0;
          spinAngle = progress * Math.PI * 2;
          forwardSpeed = THREE.MathUtils.damp(forwardSpeed, 7.5, 8, delta);
        } else {
          spinAngle = THREE.MathUtils.damp(spinAngle, 0, 12, delta);
          const targetTopSpeed = nitroTimer > 0 ? NITRO_MAX_SPEED : BASE_MAX_SPEED;
          if (wantBrake) {
            forwardSpeed = THREE.MathUtils.damp(forwardSpeed, -6.0, 6, delta);
          } else if (wantGas) {
            forwardSpeed = THREE.MathUtils.damp(
              forwardSpeed,
              targetTopSpeed,
              nitroTimer > 0 ? 7 : 3.5,
              delta
            );
          } else {
            forwardSpeed = THREE.MathUtils.damp(forwardSpeed, 6.0, 2.5, delta);
          }
        }

        // Procedural Kart Engine Purr
        soundEngine.playKartEngine(Math.abs(forwardSpeed) / BASE_MAX_SPEED, nitroTimer > 0);

        // Move Kart along Z and X with smooth lateral barriers
        pos.z -= forwardSpeed * delta;
        pos.x = THREE.MathUtils.clamp(
          pos.x + steerInput * STEER_LATERAL_SPEED * delta,
          -7.4,
          7.4
        );

        // Check Jump Ramps
        let onRamp = false;
        for (const r of jumpRamps) {
          if (pos.z <= r.zStart && pos.z >= r.zEnd) {
            onRamp = true;
            const rampT = (r.zStart - pos.z) / (r.zStart - r.zEnd);
            pos.y = Math.max(pos.y, rampT * r.peakHeight);
            if (rampT > 0.82 && isGrounded && forwardSpeed > 12) {
              verticalVel = 7.8;
              isGrounded = false;
              soundEngine.playJump();
            }
            break;
          }
        }

        if (!onRamp || !isGrounded) {
          verticalVel += GRAVITY * delta;
          pos.y += verticalVel * delta;
          if (pos.y <= 0) {
            pos.y = 0;
            verticalVel = 0;
            isGrounded = true;
          }
        }

        // Check Gate Proximity Chime (30 units before portal) & Portal Crossing
        for (let p = 0; p < TOTAL_PORTALS; p++) {
          const distToPortal = pos.z - portalZPositions[p];
          if (!portalProximityTriggered[p] && distToPortal <= 30 && distToPortal > 0) {
            portalProximityTriggered[p] = true;
            soundEngine.playGateProximity();
          }

          if (!portalTriggered[p] && pos.z <= portalZPositions[p]) {
            portalTriggered[p] = true;
            currentPortalIndex = Math.min(TOTAL_PORTALS - 1, p + 1);
            const q = questions[p];

            const chosenArch = pos.x < -2.7 ? 0 : pos.x > 2.7 ? 2 : 1;
            const chosenLetter = letters[chosenArch];

            if (chosenArch === q.correctIndex) {
              nitroTimer = 4.0;
              spinOutTimer = 0;
              correctCount += 1;
              streak += 1;
              const xpGain = Math.round(65 * diffConfig.rewardMultiplier);
              const coinsGain = diffConfig.coinsPerQuestion;
              sessionXp += xpGain;
              sessionCoins += coinsGain;
              hintBanner = {
                text: `NITRO BOOST ATIVADO! Arco [${chosenLetter}] Correto (+${coinsGain} BloxCoins)`,
                isCorrect: true,
              };
              hintTimer = 3.0;
              soundEngine.playTurboBoost();
              onProgressRef.current({
                xpGain,
                coinsGain,
                answeredDelta: 1,
                correctDelta: 1,
                streak,
              });
            } else {
              spinOutTimer = 2.0;
              nitroTimer = 0;
              streak = 0;
              const rightLetter = letters[q.correctIndex];
              hintBanner = {
                text: `Derrapou 360°! Correto: [${rightLetter}] ${q.options[q.correctIndex]} — ${q.explanation}`,
                isCorrect: false,
              };
              hintTimer = 4.2;
              soundEngine.playSlowdownHit();
              onProgressRef.current({
                xpGain: 0,
                coinsGain: 0,
                answeredDelta: 1,
                correctDelta: 0,
                streak: 0,
              });
            }
            syncHud(true, elapsed, cdLabel);
          }
        }

        // Check Finish Line at Praia de Ajuruteua
        if (pos.z <= finishZ) {
          finished = true;
          soundEngine.setBgmSpeedMultiplier(1.0);
          const bonusXp = Math.round(180 * diffConfig.rewardMultiplier);
          const bonusCoins = diffConfig.completionBonusCoins;
          sessionXp += bonusXp;
          sessionCoins += bonusCoins;
          soundEngine.playFinishFanfare();
          onProgressRef.current({
            xpGain: bonusXp,
            coinsGain: bonusCoins,
            answeredDelta: 0,
            correctDelta: 0,
            streak,
          });
          syncHud(true, elapsed, null);
        }

        kartRig.root.position.set(pos.x, pos.y, pos.z);
        animateKartRig(
          kartRig,
          forwardSpeed,
          steerInput,
          nitroTimer > 0,
          spinAngle,
          elapsed,
          delta
        );
      } else {
        kartRig.root.position.set(pos.x, pos.y, pos.z);
        animateKartRig(kartRig, 0, 0, false, 0, elapsed, delta);
      }

      // Dynamic Kart Chase Camera
      const targetFov = nitroTimer > 0 ? 78 : 64;
      if (Math.abs(camera.fov - targetFov) > 0.2) {
        camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 8, delta);
        camera.updateProjectionMatrix();
      }

      camera.position.set(pos.x * 0.72, pos.y + 3.8, pos.z + 8.6);
      camera.lookAt(pos.x * 0.55, pos.y + 1.4, pos.z - 15);

      syncHud(false, elapsed, cdLabel);
      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      disposed = true;
      soundEngine.setBgmSpeedMultiplier(1.0);
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [runKey, worldId, difficulty, student.avatarColor, student.equippedHat, student.equippedJersey]);

  const q = hudState.question;

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-slate-950 select-none">
      <div ref={mountRef} className="touch-none-select h-full w-full" />

      {/* Top Rally HUD */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-20 flex flex-col gap-2 p-3 sm:p-4">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2">
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onExit}
              className="flex min-h-[42px] items-center gap-1.5 rounded-xl border border-white/15 bg-slate-900/90 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Praça / Menu</span>
            </button>
            <AudioSettingsButton />
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-slate-900/95 px-4 py-2">
            <span className="hidden md:inline-flex items-center gap-1 text-xs font-extrabold text-emerald-400">
              <Compass className="h-3.5 w-3.5" /> {hudState.zoneLabel}
            </span>
            <span className="hidden md:inline text-slate-600">|</span>
            <span className="font-display text-xs sm:text-sm font-extrabold text-white">
              Checkpoint {hudState.portalIndex + 1}/{TOTAL_PORTALS}
            </span>
            <span className="text-slate-600">|</span>
            <Gauge className="h-4 w-4 text-amber-400" />
            <span className="font-mono text-sm sm:text-base font-black text-amber-300 tabular-nums">
              {hudState.speedKmh} km/h
            </span>
            {hudState.nitroLeft > 0 && (
              <span className="flex items-center gap-1 rounded-lg bg-cyan-500/20 px-2 py-0.5 text-[11px] font-black text-cyan-300 border border-cyan-400/40">
                <Flame className="h-3 w-3" /> NITRO
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-slate-900/90 px-3 py-2 font-mono text-xs font-bold tabular-nums">
            <span className="text-emerald-400">+{hudState.sessionXp} XP</span>
            <span className="text-amber-400 flex items-center gap-1">
              <Coins className="h-3.5 w-3.5" />+{hudState.sessionCoins}
            </span>
          </div>
        </div>

        {/* Question Card for Upcoming Rally Checkpoint */}
        {q && !hudState.finished && (
          <div className="mx-auto w-full max-w-3xl rounded-2xl border border-amber-500/40 bg-slate-950/95 p-3.5 sm:p-4 shadow-2xl">
            <div className="flex items-center justify-between text-[11px] font-bold text-amber-400">
              <span>
                ESTRADA DE AJURUTEUA (PA-458) · CHECKPOINT {hudState.portalIndex + 1}/{TOTAL_PORTALS} ({world.grade} · {q.topic})
              </span>
              <span className="font-mono text-sky-300">
                Arco em {hudState.distanceToPortal}m
              </span>
            </div>
            <p className="mt-1 font-display text-sm sm:text-lg font-extrabold text-white">
              {q.prompt}
            </p>
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              {(['A', 'B', 'C'] as const).map((letter, idx) => {
                const badgeBg =
                  letter === 'A'
                    ? 'bg-blue-600'
                    : letter === 'B'
                      ? 'bg-amber-600'
                      : 'bg-purple-600';
                return (
                  <div
                    key={letter}
                    className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-slate-100"
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-display text-xs font-black text-white ${badgeBg}`}
                    >
                      {letter}
                    </span>
                    <span className="truncate">{q.options[idx]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pre-Race Countdown Banner (3... 2... 1... JÁ!) */}
        {hudState.countdownLabel && !hudState.finished && (
          <div className="mx-auto mt-2 rounded-2xl border-2 border-amber-400 bg-slate-950/95 px-8 py-3 text-center shadow-2xl">
            <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">
              Largada na PA-458 Rumo a Ajuruteua
            </p>
            <p className="font-display text-4xl sm:text-5xl font-black text-amber-300">
              {hudState.countdownLabel}
            </p>
          </div>
        )}

        {/* Hint / Nitro Banner */}
        {hudState.hintBanner && (
          <div
            className={`mx-auto max-w-2xl rounded-xl border px-4 py-2 text-xs font-extrabold shadow-lg text-center ${
              hudState.hintBanner.isCorrect
                ? 'border-cyan-400 bg-cyan-950/95 text-cyan-200'
                : 'border-rose-400 bg-rose-950/95 text-rose-200'
            }`}
          >
            {hudState.hintBanner.text}
          </div>
        )}
      </div>

      {/* Dedicated Mobile / Touch Kart Controls */}
      {!hudState.finished && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex items-end justify-between p-4 sm:p-6">
          <div className="pointer-events-auto flex items-center gap-3">
            <button
              type="button"
              onPointerDown={() => {
                touchControlRef.current.steerLeft = true;
              }}
              onPointerUp={() => {
                touchControlRef.current.steerLeft = false;
              }}
              onPointerCancel={() => {
                touchControlRef.current.steerLeft = false;
              }}
              onPointerLeave={() => {
                touchControlRef.current.steerLeft = false;
              }}
              className="flex h-16 w-16 sm:h-18 sm:w-18 items-center justify-center rounded-2xl border-2 border-white/25 bg-slate-900/90 text-white active:scale-95 active:bg-sky-500 active:text-slate-950 shadow-xl"
              aria-label="Virar à Esquerda"
            >
              <ChevronLeft className="h-9 w-9" />
            </button>
            <button
              type="button"
              onPointerDown={() => {
                touchControlRef.current.steerRight = true;
              }}
              onPointerUp={() => {
                touchControlRef.current.steerRight = false;
              }}
              onPointerCancel={() => {
                touchControlRef.current.steerRight = false;
              }}
              onPointerLeave={() => {
                touchControlRef.current.steerRight = false;
              }}
              className="flex h-16 w-16 sm:h-18 sm:w-18 items-center justify-center rounded-2xl border-2 border-white/25 bg-slate-900/90 text-white active:scale-95 active:bg-sky-500 active:text-slate-950 shadow-xl"
              aria-label="Virar à Direita"
            >
              <ChevronRight className="h-9 w-9" />
            </button>
          </div>

          <div className="pointer-events-auto flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => setAutoAccelerate((v) => !v)}
              className={`rounded-xl border px-3 py-1 text-[11px] font-bold transition-colors ${
                autoAccelerate
                  ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300'
                  : 'border-slate-700 bg-slate-900/90 text-slate-400'
              }`}
            >
              Auto-Acelerar: {autoAccelerate ? 'ATIVO' : 'OFF'}
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onPointerDown={() => {
                  touchControlRef.current.brake = true;
                }}
                onPointerUp={() => {
                  touchControlRef.current.brake = false;
                }}
                onPointerCancel={() => {
                  touchControlRef.current.brake = false;
                }}
                onPointerLeave={() => {
                  touchControlRef.current.brake = false;
                }}
                className="flex h-15 px-4 items-center justify-center rounded-2xl border-2 border-rose-400/60 bg-rose-600/90 font-display text-xs font-extrabold text-white active:scale-95 shadow-xl"
              >
                FREAR / RÉ
              </button>

              <button
                type="button"
                onPointerDown={() => {
                  touchControlRef.current.accelerate = true;
                }}
                onPointerUp={() => {
                  touchControlRef.current.accelerate = false;
                }}
                onPointerCancel={() => {
                  touchControlRef.current.accelerate = false;
                }}
                onPointerLeave={() => {
                  touchControlRef.current.accelerate = false;
                }}
                className="flex h-16 px-6 items-center justify-center rounded-2xl border-2 border-emerald-300 bg-emerald-500 font-display text-sm font-black text-slate-950 active:scale-95 shadow-xl shadow-emerald-500/25"
              >
                ACELERAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rally Victory Modal */}
      {hudState.finished && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/85 p-4">
          <div className="w-full max-w-md rounded-3xl border border-amber-400/50 bg-slate-900 p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-400/20 text-amber-300">
              <Trophy className="h-9 w-9" />
            </div>
            <p className="mt-3 text-xs font-bold uppercase tracking-wider text-amber-400">
              Chegada na Praia de Ajuruteua · Tempo: {hudState.elapsedTime.toFixed(1)}s
            </p>
            <h2 className="mt-1 font-display text-2xl font-extrabold text-white">
              Rali da PA-458 Concluído!
            </h2>
            <p className="mt-1 text-xs text-slate-300">
              Checkpoints Corretos: {hudState.correctCount}/{TOTAL_PORTALS}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                <p className="text-[11px] text-slate-400">XP Ganho</p>
                <p className="mt-1 font-mono text-xl font-black text-emerald-400">
                  +{hudState.sessionXp} XP
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                <p className="text-[11px] text-slate-400">BloxCoins (+50 Bônus)</p>
                <p className="mt-1 font-mono text-xl font-black text-amber-400">
                  +{hudState.sessionCoins} Coins
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={onExit}
                className="flex-1 min-h-[48px] rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold text-slate-200"
              >
                Voltar à Praça
              </button>
              <button
                type="button"
                onClick={() => setRunKey((k) => k + 1)}
                className="flex-1 flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl bg-amber-400 font-display text-xs font-extrabold text-slate-950 hover:bg-amber-300"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Pilotar Novamente</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
