import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ArrowLeft,
  Coins,
  Gauge,
  Medal,
  Menu,
  RotateCcw,
  Sliders,
  Timer,
  X,
  Zap,
} from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { AudioSettingsModal } from '../components/AudioSettingsModal';
import { MobileControls, MobileInputState } from '../components/MobileControls';
import { getQuestionsForMode, recordAnsweredQuestion } from '../data/questionEngine';
import { getDifficultyConfig, getWorldById } from '../data/worlds';
import { animateAvatarRig, AvatarRig, createAvatarRig } from '../game/avatarBuilder';
import { createAnswerPadTexture } from '../game/textures';
import { logQuestionAttempt } from '../services/researchTelemetry';
import { MathQuestion, StudentProfile, TowerDifficulty } from '../types/game';
import {
  createPbrRenderer,
  disposeSceneResources,
  getGraphicsQuality,
  GraphicsQuality,
  isSoftwareGl,
  ParticlePool,
  setupTropicalEnvironment,
  subscribeGraphicsQuality,
} from './graphicsEngine';
import { createTiledPbrTextures } from './textureFactory';

interface TurboRaceGameProps {
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

const TOTAL_GATES = 8;
const GATE_DISTANCE = 110; // 110 unidades 3D entre portões (pista total de 950 unidades)
const TOTAL_TRACK_LENGTH = 950;

function createAcaiSignTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#4a044e';
  ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, 248, 88);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('AÇAÍ DO CAETÉ', 128, 44);
  ctx.fillStyle = '#fde047';
  ctx.font = '700 18px sans-serif';
  ctx.fillText('BRAGANÇA • PARÁ', 128, 74);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function TurboRaceGame({
  student,
  worldId,
  difficulty,
  onProgressEvent,
  onExit,
}: TurboRaceGameProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [runKey, setRunKey] = useState(1);
  const [rotateCameraSignal, setRotateCameraSignal] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const [graphicsQuality, setGraphicsQualityState] = useState<GraphicsQuality>(() =>
    getGraphicsQuality()
  );

  useEffect(() => subscribeGraphicsQuality(setGraphicsQualityState), []);

  const world = useMemo(() => getWorldById(worldId), [worldId]);
  const diffConfig = useMemo(() => getDifficultyConfig(difficulty), [difficulty]);
  const questions = useMemo(
    () => getQuestionsForMode(worldId, 'turbo_race', TOTAL_GATES, student.id),
    [worldId, runKey, student.id]
  );

  const [hudState, setHudState] = useState<{
    gateIndex: number;
    elapsedRace: number;
    distanceToNextGate: number;
    speedState: 'normal' | 'turbo' | 'slow';
    countdownLabel: string | null;
    question: MathQuestion;
    sessionXp: number;
    sessionCoins: number;
    correctCount: number;
    feedbackToast: { text: string; isCorrect: boolean } | null;
    finished: boolean;
    medal: 'ouro' | 'prata' | 'bronze';
  }>({
    gateIndex: 0,
    elapsedRace: 0,
    distanceToNextGate: GATE_DISTANCE,
    speedState: 'normal',
    countdownLabel: '3',
    question: questions[0],
    sessionXp: 0,
    sessionCoins: 0,
    correctCount: 0,
    feedbackToast: null,
    finished: false,
    medal: 'ouro',
  });

  const mobileInputRef = useRef<MobileInputState>({
    moveX: 0,
    moveY: 0,
    jumpPressed: false,
    cameraYawDelta: 0,
  });

  const cameraYawTargetRef = useRef(0);
  useEffect(() => {
    if (rotateCameraSignal > 0) {
      cameraYawTargetRef.current += Math.PI / 2;
    }
  }, [rotateCameraSignal]);

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

    // 1.1. Sky Dome Tropical + FogExp2 + PBR Renderer
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(64, width / height, 0.2, 280);
    const { renderer, maxAnisotropy: maxAniso } = createPbrRenderer(container, graphicsQuality);
    const envRig = setupTropicalEnvironment(scene, renderer, {
      fogColor: 0xd8f1fe,
      fogDensity: 0.0038,
      skyRadius: 270,
      shadowFrustum: 34,
      sunOffset: [22, 42, 24],
      hemiIntensity: 0.9,
      sunIntensity: 1.55,
      quality: graphicsQuality,
    });

    // Sol Brilhante sobre a Orla do Rio Caeté
    const sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(6.5, 18, 18),
      new THREE.MeshBasicMaterial({ color: 0xfef08a, fog: false })
    );
    sunDisc.position.set(-48, 56, -150);
    scene.add(sunDisc);

    // Nuvens 3D Deslizando no Céu de Bragança
    const clouds: { group: THREE.Group; speed: number }[] = [];
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    for (let c = 0; c < 20; c++) {
      const cg = new THREE.Group();
      for (let p = 0; p < 3; p++) {
        const puff = new THREE.Mesh(
          new THREE.BoxGeometry(6.5 + p * 2.2, 2.2 + (p % 2), 4.8 + p),
          cloudMat
        );
        puff.position.set(p * 3.0 - 2.8, (p % 2) * 0.6, 0);
        cg.add(puff);
      }
      const side = c % 2 === 0 ? -1 : 1;
      cg.position.set(side * (24 + (c % 4) * 14), 26 + (c % 3) * 5, -c * 48 + 15);
      scene.add(cg);
      clouds.push({ group: cg, speed: 1.2 + (c % 3) * 0.5 });
    }

    // =========================================================================
    // PISTA E CALÇADÃO DA ORLA DO RIO CAETÉ (BRAGANÇA-PA)
    // =========================================================================
    const trackWidth = 14.8;
    const trackAsphaltPbr = createTiledPbrTextures('asphalt', 4, 150, maxAniso);
    const trackMesh = new THREE.Mesh(
      new THREE.BoxGeometry(trackWidth, 1.0, TOTAL_TRACK_LENGTH),
      new THREE.MeshStandardMaterial({
        map: trackAsphaltPbr.map,
        bumpMap: trackAsphaltPbr.bumpMap,
        bumpScale: trackAsphaltPbr.bumpScale,
        roughness: trackAsphaltPbr.roughness,
        metalness: 0.08,
      })
    );
    trackMesh.position.set(0, -0.5, -TOTAL_TRACK_LENGTH / 2 + 20);
    trackMesh.receiveShadow = true;
    scene.add(trackMesh);

    // Calçadão da Orla (Lado Esquerdo junto ao Rio + Lado Direito junto aos Casarões)
    const boardwalkMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.6 });
    const leftBoardwalk = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 1.08, TOTAL_TRACK_LENGTH),
      boardwalkMat
    );
    leftBoardwalk.position.set(-trackWidth / 2 - 2.1, -0.45, -TOTAL_TRACK_LENGTH / 2 + 20);
    const rightBoardwalk = new THREE.Mesh(
      new THREE.BoxGeometry(5.5, 1.08, TOTAL_TRACK_LENGTH),
      boardwalkMat
    );
    rightBoardwalk.position.set(trackWidth / 2 + 2.75, -0.45, -TOTAL_TRACK_LENGTH / 2 + 20);
    scene.add(leftBoardwalk, rightBoardwalk);

    // Meio-Fio Colorido Regional (Azul, Branco e Amarelo da Orla) + Guarda-Corpo da Orla
    const curbColors = [0x0284c7, 0xf8fafc, 0xfacc15];
    const curbSegLen = 10;
    const curbGeo = new THREE.BoxGeometry(0.55, 0.35, curbSegLen);
    for (let z = 20; z > -TOTAL_TRACK_LENGTH + 20; z -= curbSegLen) {
      const idx = Math.abs(Math.round(z / curbSegLen)) % curbColors.length;
      const cMat = new THREE.MeshStandardMaterial({ color: curbColors[idx], roughness: 0.4 });
      const cL = new THREE.Mesh(curbGeo, cMat);
      cL.position.set(-trackWidth / 2 - 0.25, 0.18, z);
      const cR = new THREE.Mesh(curbGeo, cMat);
      cR.position.set(trackWidth / 2 + 0.25, 0.18, z);
      scene.add(cL, cR);
    }

    // =========================================================================
    // LADO ESQUERDO DA PISTA: RIO CAETÉ + BARCOS REGIONAIS + ILHAS RIBEIRINHAS
    // =========================================================================
    const riverWaterPbr = createTiledPbrTextures('water', 16, 48, maxAniso);
    const riverMat = new THREE.MeshStandardMaterial({
      map: riverWaterPbr.map,
      bumpMap: riverWaterPbr.bumpMap,
      bumpScale: riverWaterPbr.bumpScale,
      emissive: 0x0d9488,
      emissiveIntensity: 0.22,
      roughness: riverWaterPbr.roughness,
      metalness: 0.28,
    });
    const riverPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(240, TOTAL_TRACK_LENGTH + 300),
      riverMat
    );
    riverPlane.rotation.x = -Math.PI / 2;
    riverPlane.position.set(-130, -0.65, -TOTAL_TRACK_LENGTH / 2);
    scene.add(riverPlane);

    // Faixas de Ondulação Verde-Amazônico (#0D9488) sobre o Rio Caeté
    const waveStripes: { mesh: THREE.Mesh; baseX: number; phase: number }[] = [];
    const waveStripeMat = new THREE.MeshStandardMaterial({
      color: 0x0d9488,
      emissive: 0x14b8a6,
      emissiveIntensity: 0.22,
      roughness: 0.2,
    });
    for (let w = 0; w < 26; w++) {
      const wm = new THREE.Mesh(new THREE.PlaneGeometry(18, 3.2), waveStripeMat);
      wm.rotation.x = -Math.PI / 2;
      const wx = -24 - (w % 4) * 14;
      const wz = -w * 36 + 10;
      wm.position.set(wx, -0.58, wz);
      scene.add(wm);
      waveStripes.push({ mesh: wm, baseX: wx, phase: w * 0.9 });
    }

    // Barcos Regionais Bragantinos ("Pô-Pô-Pô" / Barcos Pesqueiros Coloridos e Canoas de Madeira)
    const regionalBoats: {
      group: THREE.Group;
      baseZ: number;
      speed: number;
      phase: number;
    }[] = [];
    const hullColors = [0x2563eb, 0xdc2626, 0x16a34a, 0xd97706, 0x9333ea];
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
    const woodCanoeMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.65 });

    for (let b = 0; b < 14; b++) {
      const boatGroup = new THREE.Group();
      const isRegionalCabinBoat = b % 2 === 0;
      const hullMat = new THREE.MeshStandardMaterial({
        color: hullColors[b % hullColors.length],
        roughness: 0.45,
      });

      if (isRegionalCabinBoat) {
        // Barco Pesqueiro de Bragança (Casco + Cabine Branca + Teto Colorido + Mastro)
        const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 6.4), hullMat);
        hull.position.y = 0.25;
        const bow = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.2, 4), hullMat);
        bow.rotation.x = -Math.PI / 2;
        bow.rotation.z = Math.PI / 4;
        bow.position.set(0, 0.3, -4.1);
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.25, 3.2), cabinMat);
        cabin.position.set(0, 1.2, 0.2);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.22, 3.6), hullMat);
        roof.position.set(0, 1.9, 0.2);
        const mast = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, 1.8, 8),
          cabinMat
        );
        mast.position.set(0, 2.7, -1.0);
        boatGroup.add(hull, bow, cabin, roof, mast);
      } else {
        // Canoa Ribeirinha de Madeira com Pescador
        const canoe = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 4.4), woodCanoeMat);
        canoe.position.y = 0.15;
        const rower = new THREE.Mesh(
          new THREE.BoxGeometry(0.55, 0.85, 0.45),
          new THREE.MeshStandardMaterial({ color: 0xfacc15 })
        );
        rower.position.set(0, 0.75, 0.3);
        boatGroup.add(canoe, rower);
      }

      const bx = -19 - (b % 3) * 11;
      const bz = -b * 68 - 15;
      boatGroup.position.set(bx, -0.55, bz);
      scene.add(boatGroup);
      regionalBoats.push({
        group: boatGroup,
        baseZ: bz,
        speed: (b % 2 === 0 ? -1 : 1) * (2.5 + (b % 3) * 1.1),
        phase: b * 1.4,
      });
    }

    // Ilhas de Vegetação Ribeirinha e Açaizeiros na Margem Oposta do Rio Caeté
    const islandGrassMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.75 });
    const palmTrunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 });
    const palmLeafMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.55 });

    for (let isl = 0; isl < 12; isl++) {
      const ig = new THREE.Group();
      const ix = -54 - (isl % 2) * 18;
      const iz = -isl * 82 - 30;
      ig.position.set(ix, -0.5, iz);

      const mound = new THREE.Mesh(new THREE.CylinderGeometry(10, 13, 2.6, 9), islandGrassMat);
      mound.position.y = 1.0;
      ig.add(mound);

      for (let t = -1; t <= 1; t++) {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 4.8, 7), palmTrunkMat);
        trunk.position.set(t * 3.2, 4.2, (t % 2) * 2);
        const crown = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.6, 7), palmLeafMat);
        crown.position.set(t * 3.2, 6.8, (t % 2) * 2);
        ig.add(trunk, crown);
      }
      scene.add(ig);
    }

    // =========================================================================
    // LADO DIREITO DA PISTA: CASARÕES HISTÓRICOS DE BRAGANÇA + BARRACAS DE AÇAÍ
    // =========================================================================
    const rightGround = new THREE.Mesh(
      new THREE.PlaneGeometry(180, TOTAL_TRACK_LENGTH + 300),
      new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.85 })
    );
    rightGround.rotation.x = -Math.PI / 2;
    rightGround.position.set(95, -0.55, -TOTAL_TRACK_LENGTH / 2);
    scene.add(rightGround);

    const casaraoColors = [0xf59e0b, 0xec4899, 0x06b6d4, 0x10b981, 0xf97316, 0x6366f1];
    const roofTileMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.6 });
    const trimWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
    const windowMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3 });
    const acaiSignTex = createAcaiSignTexture();
    const acaiRoofMat = new THREE.MeshStandardMaterial({ color: 0x701a75, roughness: 0.5 });

    const cheeringFans: { group: THREE.Group; baseY: number; phase: number; z: number }[] = [];
    const lampPostMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 });
    const lampBulbMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfacc15,
      emissiveIntensity: 0.9,
    });

    for (let z = 10; z > -TOTAL_TRACK_LENGTH + 20; z -= 24) {
      // Postes de Iluminação Decorativos e Coqueiros/Açaizeiros na Orla (Ambos os Lados)
      for (const side of [-1, 1]) {
        const edgeX = side * (trackWidth / 2 + 1.8);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 4.4, 8), lampPostMat);
        pole.position.set(edgeX, 2.2, z);
        const globe = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), lampBulbMat);
        globe.position.set(edgeX, 4.5, z);
        scene.add(pole, globe);

        // Coqueiro / Açaizeiro no Calçadão
        const treeX = side * (trackWidth / 2 + 3.4);
        const palmGroup = new THREE.Group();
        palmGroup.position.set(treeX, 0, z - 11);
        const pTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.36, 4.4, 8), palmTrunkMat);
        pTrunk.position.y = 2.2;
        palmGroup.add(pTrunk);
        for (let f = 0; f < 5; f++) {
          const frond = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 2.1), palmLeafMat);
          const ang = (f / 5) * Math.PI * 2;
          frond.position.set(Math.cos(ang) * 0.85, 4.3, Math.sin(ang) * 0.85);
          frond.rotation.y = -ang;
          frond.rotation.x = 0.32;
          palmGroup.add(frond);
        }
        scene.add(palmGroup);
      }

      // Lado Direito: Casarões Históricos Coloniais de Bragança & Barracas de Açaí
      const houseIdx = Math.abs(Math.round(z / 24));
      const houseGroup = new THREE.Group();
      const hx = trackWidth / 2 + 10.5;
      houseGroup.position.set(hx, 0, z);

      const wallCol = casaraoColors[houseIdx % casaraoColors.length];
      const wallMat = new THREE.MeshStandardMaterial({ color: wallCol, roughness: 0.55 });
      const hHeight = 5.5 + (houseIdx % 2) * 2.2;
      const body = new THREE.Mesh(new THREE.BoxGeometry(6.8, hHeight, 12.5), wallMat);
      body.position.y = hHeight / 2;

      // Platibanda / Moldura Colonial Branca no Topo
      const cornice = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.65, 12.9), trimWhiteMat);
      cornice.position.y = hHeight + 0.25;

      // Telhado Colonial de Barro
      const roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 2.2, 4), roofTileMat);
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(1, 1, 1.65);
      roof.position.y = hHeight + 1.4;

      // Janelas Coloniais Arqueadas na Fachada Voltada para a Pista (-X)
      for (const wz of [-3.5, 0, 3.5]) {
        const winFrame = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.8, 1.3), trimWhiteMat);
        winFrame.position.set(-3.4, 3.2, wz);
        const winGlass = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.5, 1.0), windowMat);
        winGlass.position.set(-3.42, 3.2, wz);
        houseGroup.add(winFrame, winGlass);
      }

      houseGroup.add(body, cornice, roof);
      scene.add(houseGroup);

      // Barraca de Açaí Regional a cada 48m na Calçada Direita + Torcedores Vibrando
      if (houseIdx % 2 === 0) {
        const stall = new THREE.Group();
        stall.position.set(trackWidth / 2 + 4.4, 0, z - 6);
        const counter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 3.4), acaiRoofMat);
        counter.position.y = 0.55;
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.35, 3.8), acaiRoofMat);
        canopy.position.y = 2.5;
        const sign = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.95, 2.8),
          new THREE.MeshStandardMaterial({ map: acaiSignTex, roughness: 0.3 })
        );
        sign.position.set(-1.25, 2.9, 0);
        stall.add(counter, canopy, sign);
        scene.add(stall);
      }

      // Espectadores Torcendo na Calçada da Orla
      const fanGroup = new THREE.Group();
      const fanMat = new THREE.MeshStandardMaterial({
        color: casaraoColors[(houseIdx + 2) % casaraoColors.length],
        roughness: 0.4,
      });
      const fTorso = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.85, 0.4), fanMat);
      fTorso.position.y = 0.45;
      const fHead = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.48, 0.48),
        new THREE.MeshStandardMaterial({ color: 0xfcd34d })
      );
      fHead.position.y = 1.12;
      fanGroup.add(fTorso, fHead);
      fanGroup.position.set(trackWidth / 2 + 2.2, 0.1, z + 4);
      scene.add(fanGroup);
      cheeringFans.push({
        group: fanGroup,
        baseY: 0.1,
        phase: houseIdx * 1.3,
        z: z + 4,
      });
    }

    // =========================================================================
    // 8 PORTÕES DE ENERGIA SEQUENCIAIS ESPAÇADOS A CADA 110 UNIDADES
    // =========================================================================
    const gateZPositions: number[] = [];
    const gateTriggered = new Array(TOTAL_GATES).fill(false);
    const gateProximityTriggered = new Array(TOTAL_GATES).fill(false);
    const laneX = [-4.5, 0, 4.5];
    const letters: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];
    const laneColors = ['#2563eb', '#d97706', '#9333ea'];

    const arrowMatCyan = new THREE.MeshStandardMaterial({
      color: 0x00f5d4,
      emissive: 0x00f5d4,
      emissiveIntensity: 1.3,
      roughness: 0.2,
    });
    const arrowMatAmber = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xeab308,
      emissiveIntensity: 1.2,
      roughness: 0.2,
    });

    for (let g = 0; g < TOTAL_GATES; g++) {
      const gz = -(g + 1) * GATE_DISTANCE;
      gateZPositions.push(gz);
      const q = questions[g];

      // 3 glowing floor chevron arrows leading into each gate
      for (let aIdx = 1; aIdx <= 3; aIdx++) {
        const arrowZ = gz + aIdx * 16;
        for (const lx of laneX) {
          const chevron = new THREE.Group();
          chevron.position.set(lx, 0.06, arrowZ);
          const mat = aIdx === 1 ? arrowMatAmber : arrowMatCyan;

          const barL = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.26), mat);
          barL.position.set(-0.38, 0, 0);
          barL.rotation.y = 0.52;

          const barR = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.26), mat);
          barR.position.set(0.38, 0, 0);
          barR.rotation.y = -0.52;

          chevron.add(barL, barR);
          scene.add(chevron);
        }
      }

      const gateGroup = new THREE.Group();
      gateGroup.position.set(0, 0, gz);

      const gantry = new THREE.Mesh(
        new THREE.BoxGeometry(trackWidth + 1.2, 0.9, 0.9),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.2 })
      );
      gantry.position.y = 4.8;
      gateGroup.add(gantry);

      for (const px of [-7.1, -2.25, 2.25, 7.1]) {
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.24, 0.28, 4.8, 12),
          new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6, roughness: 0.3 })
        );
        pillar.position.set(px, 2.4, 0);
        gateGroup.add(pillar);
      }

      for (let lane = 0; lane < 3; lane++) {
        const padTex = createAnswerPadTexture(
          letters[lane],
          q.options[lane] || '',
          laneColors[lane],
          maxAniso
        );

        const signMesh = new THREE.Mesh(
          new THREE.BoxGeometry(4.1, 2.2, 0.28),
          new THREE.MeshStandardMaterial({
            map: padTex,
            roughness: 0.25,
            metalness: 0.1,
          })
        );
        signMesh.position.set(laneX[lane], 3.4, 0);
        gateGroup.add(signMesh);

        const curtain = new THREE.Mesh(
          new THREE.PlaneGeometry(4.2, 2.4),
          new THREE.MeshStandardMaterial({
            color: new THREE.Color(laneColors[lane]),
            emissive: new THREE.Color(laneColors[lane]),
            emissiveIntensity: 0.65,
            transparent: true,
            opacity: 0.28,
            side: THREE.DoubleSide,
          })
        );
        curtain.position.set(laneX[lane], 1.2, 0);
        gateGroup.add(curtain);
      }

      scene.add(gateGroup);
    }

    // Finish Line Arch at z = -905
    const finishZ = -TOTAL_GATES * GATE_DISTANCE - 25;
    const finishBanner = new THREE.Mesh(
      new THREE.BoxGeometry(trackWidth, 1.5, 0.7),
      new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xca8a04,
        emissiveIntensity: 0.8,
      })
    );
    finishBanner.position.set(0, 4.8, finishZ);
    scene.add(finishBanner);

    const finishFloor = new THREE.Mesh(
      new THREE.BoxGeometry(trackWidth, 0.08, 4.5),
      new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x059669,
        emissiveIntensity: 0.65,
      })
    );
    finishFloor.position.set(0, 0.05, finishZ);
    scene.add(finishFloor);

    // Build Player R6 Avatar with equipped Brasileirão Jersey, Hat & Animated Aura
    const avatarRig: AvatarRig = createAvatarRig(
      student.avatarColor,
      student.equippedHat,
      student.equippedJersey
    );
    scene.add(avatarRig.root);

    // Zero-GC InstancedMesh Particle Pool for Mega Turbo trail & gate bursts
    const trailPool = new ParticlePool(120, graphicsQuality);
    scene.add(trailPool.mesh);

    // Race Physics State + Pre-Race 3..2..1..JÁ! Countdown
    const pos = { x: 0, y: 0, z: 4 };
    const vel = { x: 0, y: 0, z: 0 };
    let isGrounded = true;
    const BASE_FORWARD_SPEED = 15.5;
    const STRAFE_SPEED = 10.5;
    const GRAVITY = -28;
    const JUMP_VEL = 11.2;

    let countdownTimer = 2.4; // 0.8s per beat: 3 -> 2 -> 1 -> JÁ!
    let lastCountdownStep = -1;
    let goBannerTimer = 0;

    let turboTimer = 0;
    let slowTimer = 0;
    let toastTimer = 0;
    let feedbackToast: { text: string; isCorrect: boolean } | null = null;

    let currentGateIndex = 0;
    let gateShownAtMs = performance.now();
    let elapsedRace = 0;
    let sessionXp = 0;
    let sessionCoins = 0;
    let correctCount = 0;
    let streak = 0;
    let finished = false;
    let medal: 'ouro' | 'prata' | 'bronze' = 'ouro';
    let lastHudSync = 0;
    let trailSpawnAccum = 0;

    const keys = new Set<string>();
    let prevJumpTouch = false;
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
      const speedState = turboTimer > 0 ? 'turbo' : slowTimer > 0 ? 'slow' : 'normal';
      const targetGateZ = gateZPositions[Math.min(currentGateIndex, TOTAL_GATES - 1)] || finishZ;
      const dist = Math.max(0, Math.round(pos.z - targetGateZ));
      setHudState({
        gateIndex: Math.min(currentGateIndex, TOTAL_GATES - 1),
        elapsedRace,
        distanceToNextGate: dist,
        speedState,
        countdownLabel: cdLabel,
        question: questions[Math.min(currentGateIndex, TOTAL_GATES - 1)],
        sessionXp,
        sessionCoins,
        correctCount,
        feedbackToast,
        finished,
        medal,
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

      // Animate Floor Arrows, Clouds, Rio Caeté Waves, Regional Boats & Spectators
      arrowMatCyan.emissiveIntensity = 1.0 + Math.sin(elapsed * 6) * 0.4;

      for (const cl of clouds) {
        cl.group.position.x += cl.speed * delta;
        if (cl.group.position.x > 95) cl.group.position.x = -95;
      }

      riverWaterPbr.map.offset.y = (elapsed * 0.04) % 1;
      riverWaterPbr.map.offset.x = (elapsed * 0.015) % 1;
      riverWaterPbr.bumpMap.offset.copy(riverWaterPbr.map.offset);

      for (const ws of waveStripes) {
        ws.mesh.position.x = ws.baseX + Math.sin(elapsed * 2.2 + ws.phase) * 1.8;
      }

      for (const rb of regionalBoats) {
        rb.group.position.z += rb.speed * delta;
        rb.group.position.y = -0.55 + Math.sin(elapsed * 2.6 + rb.phase) * 0.12;
        rb.group.rotation.z = Math.sin(elapsed * 2.0 + rb.phase) * 0.05;
      }

      for (const fan of cheeringFans) {
        if (Math.abs(fan.z - pos.z) < 140) {
          fan.group.position.y = fan.baseY + Math.abs(Math.sin(elapsed * 8.5 + fan.phase)) * 0.35;
        }
      }

      // Handle 3... 2... 1... JÁ! Musical Countdown
      let cdLabel: string | null = null;
      if (countdownTimer > 0) {
        countdownTimer = Math.max(0, countdownTimer - delta);
        const step = Math.ceil(countdownTimer / 0.8); // 3, 2, 1
        cdLabel = step > 0 ? String(step) : 'JÁ!';
        if (step !== lastCountdownStep && step >= 1) {
          lastCountdownStep = step;
          soundEngine.playCountdown(false);
          syncHud(true, elapsed, cdLabel);
        }
        if (countdownTimer === 0) {
          goBannerTimer = 0.75;
          soundEngine.playCountdown(true);
          syncHud(true, elapsed, 'JÁ!');
        }
      } else if (goBannerTimer > 0) {
        goBannerTimer = Math.max(0, goBannerTimer - delta);
        cdLabel = goBannerTimer > 0 ? 'JÁ!' : null;
      }

      if (!finished && countdownTimer <= 0) {
        elapsedRace += delta;
        if (turboTimer > 0) turboTimer = Math.max(0, turboTimer - delta);
        if (slowTimer > 0) slowTimer = Math.max(0, slowTimer - delta);
        if (toastTimer > 0) {
          toastTimer = Math.max(0, toastTimer - delta);
          if (toastTimer === 0) feedbackToast = null;
        }

        // Accelerate BGM tempo (1.12x) automatically during Turbo Boost!
        soundEngine.setBgmSpeedMultiplier(turboTimer > 0 ? 1.12 : 1.0);

        // Speed Multiplier: Mega Turbo (2.2x) vs Slow Field (0.5x)
        const speedMult = turboTimer > 0 ? 2.2 : slowTimer > 0 ? 0.5 : 1.0;

        let inputX = mobileInputRef.current.moveX;
        let inputY = mobileInputRef.current.moveY;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) inputX -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) inputX += 1;
        if (keys.has('KeyW') || keys.has('ArrowUp')) inputY += 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) inputY -= 1;

        const forwardThrottle = Math.max(0.75, 0.92 + inputY * 0.18);
        const targetVz = -BASE_FORWARD_SPEED * forwardThrottle * speedMult;
        const targetVx = THREE.MathUtils.clamp(inputX, -1, 1) * STRAFE_SPEED;

        vel.x = THREE.MathUtils.damp(vel.x, targetVx, 16, delta);
        vel.z = THREE.MathUtils.damp(vel.z, targetVz, 12, delta);

        const jumpTouch = mobileInputRef.current.jumpPressed;
        if ((keys.has('Space') || (jumpTouch && !prevJumpTouch)) && isGrounded) {
          vel.y = JUMP_VEL;
          isGrounded = false;
          soundEngine.playJump();
        }
        prevJumpTouch = jumpTouch;

        vel.y += GRAVITY * delta;
        pos.x = THREE.MathUtils.clamp(pos.x + vel.x * delta, -6.3, 6.3);
        pos.z += vel.z * delta;
        pos.y += vel.y * delta;

        if (pos.y <= 0) {
          pos.y = 0;
          vel.y = 0;
          isGrounded = true;
        }

        // Subtle rhythmic footstep pulse synced with running on the Orla boardwalk
        if (isGrounded) {
          soundEngine.playStepPulse(turboTimer > 0);
        }

        // Check Gate Proximity Chime (30 units before gate) & Gate Crossing
        for (let g = 0; g < TOTAL_GATES; g++) {
          const distToGate = pos.z - gateZPositions[g];
          if (!gateProximityTriggered[g] && distToGate <= 30 && distToGate > 0) {
            gateProximityTriggered[g] = true;
            soundEngine.playGateProximity();
          }

          if (!gateTriggered[g] && pos.z <= gateZPositions[g]) {
            gateTriggered[g] = true;
            currentGateIndex = Math.min(TOTAL_GATES - 1, g + 1);
            const q = questions[g];
            if (q) recordAnsweredQuestion(student.id, q.prompt);

            const chosenLane = pos.x < -2.25 ? 0 : pos.x > 2.25 ? 2 : 1;
            const chosenLetter = letters[chosenLane];
            const isCorrect = Boolean(q) && chosenLane === q.correctIndex;
            if (q) {
              logQuestionAttempt({
                studentId: student.id,
                school: student.school,
                grade: student.grade,
                worldId,
                gameMode: 'turbo_race',
                bnccTopic: q.topic,
                isCorrect,
                responseTimeMs: Math.max(200, Math.round(performance.now() - gateShownAtMs)),
              });
            }
            gateShownAtMs = performance.now();

            if (isCorrect) {
              turboTimer = 4.0;
              slowTimer = 0;
              correctCount += 1;
              streak += 1;
              const xpGain = Math.round(55 * diffConfig.rewardMultiplier);
              const coinsGain = diffConfig.coinsPerQuestion;
              sessionXp += xpGain;
              sessionCoins += coinsGain;
              feedbackToast = {
                text: `MEGA TURBO 2.2x! [${chosenLetter}] Correto (+${coinsGain} BloxCoins)`,
                isCorrect: true,
              };
              toastTimer = 2.6;
              soundEngine.playTurboBoost();
              onProgressRef.current({
                xpGain,
                coinsGain,
                answeredDelta: 1,
                correctDelta: 1,
                streak,
              });
            } else {
              slowTimer = 2.5;
              turboTimer = 0;
              streak = 0;
              const rightLetter = letters[q.correctIndex];
              feedbackToast = {
                text: `Campo Lento 0.5x! Correto era [${rightLetter}] ${q.options[q.correctIndex]}`,
                isCorrect: false,
              };
              toastTimer = 3.2;
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

        // Check Finish Line
        if (pos.z <= finishZ) {
          finished = true;
          soundEngine.setBgmSpeedMultiplier(1.0);
          medal = elapsedRace < 58 ? 'ouro' : elapsedRace < 78 ? 'prata' : 'bronze';
          const medalMult = medal === 'ouro' ? 2.0 : medal === 'prata' ? 1.5 : 1.0;
          const bonusXp = Math.round(150 * medalMult * diffConfig.rewardMultiplier);
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

        if (turboTimer > 0) {
          trailSpawnAccum += delta;
          if (trailSpawnAccum > 0.035) {
            trailSpawnAccum = 0;
            trailPool.emit(
              pos.x + (Math.random() - 0.5) * 0.5,
              pos.y + 0.35,
              pos.z + 0.6,
              (Math.random() - 0.5) * 1.2,
              0.8 + Math.random() * 0.8,
              4.0,
              0x22d3ee,
              0.28,
              0.42,
              2.0
            );
          }
        }

        avatarRig.root.position.set(pos.x, pos.y, pos.z);
        avatarRig.root.rotation.y = Math.PI - vel.x * 0.025;
        animateAvatarRig(
          avatarRig,
          Math.hypot(vel.x, vel.z),
          isGrounded,
          elapsed,
          delta,
          null,
          student.movementStyle || 'classic'
        );
      } else if (!finished) {
        // Pre-race idle on starting line
        avatarRig.root.position.set(pos.x, pos.y, pos.z);
        avatarRig.root.rotation.y = Math.PI;
        animateAvatarRig(
          avatarRig,
          0,
          true,
          elapsed,
          delta,
          null,
          student.movementStyle || 'classic'
        );
      } else {
        animateAvatarRig(
          avatarRig,
          0,
          true,
          elapsed,
          delta,
          'trophy',
          student.movementStyle || 'classic'
        );
      }

      trailPool.update(delta);

      const targetFov = turboTimer > 0 ? 76 : 62;
      if (Math.abs(camera.fov - targetFov) > 0.2) {
        camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 8, delta);
        camera.updateProjectionMatrix();
      }

      camera.position.set(pos.x * 0.65, pos.y + 3.9, pos.z + 8.8);
      camera.lookAt(pos.x * 0.5, pos.y + 1.8, pos.z - 14);
      envRig.updateShadowTarget(pos.x, pos.y, pos.z - 8);

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
      disposeSceneResources(scene, renderer, envRig.envTexture);
    };
  }, [
    runKey,
    worldId,
    difficulty,
    student.id,
    student.avatarColor,
    student.equippedHat,
    student.equippedJersey,
    graphicsQuality,
  ]);

  const q = hudState.question;

  return (
    <div className="fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-slate-950 select-none">
      <div ref={mountRef} className="touch-none-select h-full w-full" />

      {/* Ultra-Thin Translucent Top HUD (<= 15% mobile height) */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-20 flex flex-col gap-1.5 px-2.5 pt-2 sm:px-4 sm:pt-3">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-900/60 px-2.5 py-1.5 backdrop-blur-sm shadow-lg">
          {/* Left: Gate Progress */}
          <div className="flex items-center gap-2 text-xs sm:text-sm font-extrabold text-white whitespace-nowrap tabular-nums">
            <span className="font-display">
              Portão {hudState.gateIndex + 1}/{TOTAL_GATES}
            </span>
            <span className="hidden md:inline text-slate-400 font-normal">·</span>
            <span className="hidden md:inline text-xs font-semibold text-sky-300">
              {world.grade}
            </span>
          </div>

          {/* Center: Timer & Turbo State */}
          <div className="flex items-center gap-2 text-xs font-mono font-bold tabular-nums">
            <span className="flex items-center gap-1 text-amber-300">
              <Timer className="h-3.5 w-3.5 text-sky-400" />
              {hudState.elapsedRace.toFixed(1)}s
            </span>
            <span className="hidden sm:inline text-cyan-300">{hudState.distanceToNextGate}m</span>
            {hudState.speedState === 'turbo' && (
              <span className="flex items-center gap-0.5 text-cyan-300 font-black">
                <Zap className="h-3.5 w-3.5" /> 2.2x
              </span>
            )}
            {hudState.speedState === 'slow' && (
              <span className="flex items-center gap-0.5 text-rose-300 font-black">
                <Gauge className="h-3.5 w-3.5" /> 0.5x
              </span>
            )}
            <span className="hidden md:flex items-center gap-1 text-amber-300">
              <Coins className="h-3.5 w-3.5" />+{hudState.sessionCoins}
            </span>
          </div>

          {/* Right: Single Hamburger Menu Button */}
          <div className="pointer-events-auto relative shrink-0">
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
                    onExit();
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
        {q && !hudState.finished && (
          <div className="mx-auto w-full max-w-xl rounded-xl border border-sky-400/35 bg-slate-950/70 px-3 py-1.5 backdrop-blur-sm shadow-lg text-center">
            <p className="font-display text-sm sm:text-base font-extrabold text-white leading-tight truncate">
              {q.prompt}
            </p>
            <div className="mt-1 grid grid-cols-3 gap-1.5 text-[11px] sm:text-xs font-mono font-extrabold">
              <div className="rounded-lg bg-blue-600/85 px-1.5 py-0.5 text-white truncate">
                A: {q.options[0]}
              </div>
              <div className="rounded-lg bg-amber-500/90 px-1.5 py-0.5 text-slate-950 truncate">
                B: {q.options[1]}
              </div>
              <div className="rounded-lg bg-purple-600/85 px-1.5 py-0.5 text-white truncate">
                C: {q.options[2]}
              </div>
            </div>
          </div>
        )}

        {/* Pre-Race Countdown Banner (3... 2... 1... JÁ!) */}
        {hudState.countdownLabel && !hudState.finished && (
          <div className="mx-auto mt-2 rounded-2xl border-2 border-amber-400 bg-slate-950/85 px-7 py-2.5 text-center shadow-2xl">
            <p className="font-display text-4xl sm:text-5xl font-black text-amber-300">
              {hudState.countdownLabel}
            </p>
          </div>
        )}

        {/* Feedback Toast */}
        {hudState.feedbackToast && (
          <div
            className={`mx-auto rounded-lg border px-3 py-1 text-xs font-extrabold shadow-lg ${
              hudState.feedbackToast.isCorrect
                ? 'border-emerald-400 bg-emerald-950/90 text-emerald-200'
                : 'border-rose-400 bg-rose-950/90 text-rose-200'
            }`}
          >
            {hudState.feedbackToast.text}
          </div>
        )}
      </div>

      <AudioSettingsModal isOpen={audioOpen} onClose={() => setAudioOpen(false)} />

      {/* Finish Line Medal Modal */}
      {hudState.finished && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4">
          <div className="w-full max-w-md rounded-3xl border border-sky-400/50 bg-slate-900 p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-400/20 text-amber-300">
              <Medal className="h-9 w-9" />
            </div>
            <p className="mt-3 text-xs font-bold uppercase tracking-wider text-sky-400">
              Medalha de {hudState.medal.toUpperCase()} · Tempo: {hudState.elapsedRace.toFixed(1)}s
            </p>
            <h2 className="mt-1 font-display text-2xl font-extrabold text-white">
              Orla do Rio Caeté Concluída!
            </h2>
            <p className="mt-1 text-xs text-slate-300">
              Acertos nos Portões: {hudState.correctCount}/{TOTAL_GATES} · Bragança-PA (950m)
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
                className="flex-1 flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl bg-sky-500 font-display text-xs font-extrabold text-slate-950 hover:bg-sky-400"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Correr Novamente</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {!hudState.finished && (
        <MobileControls
          inputRef={mobileInputRef}
          onRotateCameraStep={() => setRotateCameraSignal((n) => n + 1)}
          hideCameraButton
        />
      )}
    </div>
  );
}
