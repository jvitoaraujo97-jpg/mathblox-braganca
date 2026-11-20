import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ArrowLeft,
  Coins,
  Flame,
  Gauge,
  Medal,
  Menu,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Timer,
  X,
  Zap,
} from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { AudioSettingsModal } from '../components/AudioSettingsModal';
import { recordActivityForMissions } from '../data/missionsAndTitles';
import { getQuestionsForMode, recordAnsweredQuestion } from '../data/questionEngine';
import { getDifficultyConfig, getWorldById } from '../data/worlds';
import { createAnswerPadTexture } from '../game/textures';
import { KartPeerState, MultiplayerMatchChannel } from '../services/multiplayerService';
import { logQuestionAttempt } from '../services/researchTelemetry';
import {
  MathQuestion,
  MultiplayerSessionConfig,
  StudentProfile,
  TowerDifficulty,
} from '../types/game';
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
import { createMangroveWildlife, MangroveTreeAnchor } from './mangroveWildlife';
import { animateKartRig, createKartRig, KartRig } from './vehicleBuilder';

interface VehicleRallyGameProps {
  student: StudentProfile;
  worldId: number;
  difficulty: TowerDifficulty;
  multiplayerSession?: MultiplayerSessionConfig;
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

function createKartLabelSprite(name: string, grade: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 320, 96);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
  ctx.beginPath();
  ctx.roundRect(12, 10, 296, 76, 18);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#38bdf8';
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 28px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.slice(0, 16), 160, 38);

  ctx.fillStyle = '#7dd3fc';
  ctx.font = '700 18px system-ui, -apple-system, sans-serif';
  ctx.fillText(grade, 160, 66);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3.2, 0.96, 1);
  sprite.position.set(0, 3.05, 0);
  return sprite;
}

const TOTAL_GATES = 8;
const TRACK_WIDTH = 16.4;
const LANE_WIDTH = TRACK_WIDTH / 3; // ~5.467
const HALF_LANE = LANE_WIDTH / 2; // ~2.733 (A < -HALF_LANE, |lat| <= HALF_LANE -> B, > +HALF_LANE -> C)
const LANE_OFFSETS: [number, number, number] = [-5.0, 0, 5.0];
const MAX_LATERAL = 6.4;

// Pre-allocated vectors/matrices outside requestAnimationFrame (zero GC)
const _up = new THREE.Vector3(0, 1, 0);
const _pt = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _right = new THREE.Vector3();
const _ptAhead = new THREE.Vector3();
const _tanAhead = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _camLook = new THREE.Vector3();
const _worldKartPos = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

interface SplineSample {
  s: number;
  u: number;
  pos: THREE.Vector3;
  tan: THREE.Vector3;
  right: THREE.Vector3;
  yaw: number;
  curvature: number;
}

interface BridgeSpan {
  startS: number;
  endS: number;
  midS: number;
}

function createBeachArchTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 768, 0);
  grad.addColorStop(0, '#0284c7');
  grad.addColorStop(0.5, '#0ea5e9');
  grad.addColorStop(1, '#14b8a6');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 768, 192);
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 752, 176);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 52px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PRAIA DE AJURUTEUA', 384, 86);
  ctx.fillStyle = '#fef08a';
  ctx.font = '800 28px sans-serif';
  ctx.fillText('ESTRADA PA-458 • BRAGANÇA-PA', 384, 146);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCurveSignTexture(dir: 'left' | 'right'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#facc15';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 10;
  ctx.strokeRect(6, 6, 116, 116);

  ctx.fillStyle = '#0f172a';
  ctx.font = '900 76px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(dir === 'right' ? '❯' : '❮', 64, 68);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Builds the extended (~2140u) PA-458 Estrada de Ajuruteua sinuous highway spline:
 * - Long 9–12s corridors between all 8 math portals
 * - Two high-arching bridges (+6.35u above estuarine water) with smooth 45u climb/descent ramps
 * - Scenic mangrove sweeping bends & S-curves
 * - Grand coastal transition opening onto Praia de Ajuruteua (~180u before finish)
 */
function buildAjuruteuaSpline(): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [
    new THREE.Vector3(0, 0, 25),          // Start line
    new THREE.Vector3(0, 0, -90),
    new THREE.Vector3(0, 0, -210),        // Straight for Portal 1
    new THREE.Vector3(24, 0, -310),       // Sweeping Mangrove Bend Right
    new THREE.Vector3(64, 0, -395),
    new THREE.Vector3(72, 0, -470),       // Straight for Portal 2
    new THREE.Vector3(72, 0, -495),       // Bridge 1 ramp start
    new THREE.Vector3(72, 2.75, -518),    // 45u smooth climb
    new THREE.Vector3(72, 5.45, -542),    // BRIDGE 1 HIGH DECK (+6.35u above water)
    new THREE.Vector3(72, 5.45, -584),    // Bridge 1 central span end
    new THREE.Vector3(72, 2.75, -608),    // 45u smooth descent
    new THREE.Vector3(72, 0, -632),       // Bridge 1 ramp end
    new THREE.Vector3(72, 0, -675),       // Straight for Portal 3
    new THREE.Vector3(44, 0, -765),       // Sweeping Mangrove Bend Left
    new THREE.Vector3(-4, 0, -845),
    new THREE.Vector3(-12, 0, -935),      // Straight for Portal 4
    new THREE.Vector3(-56, 0, -1025),     // Mangrove S-Bend Left
    new THREE.Vector3(-48, 0, -1110),
    new THREE.Vector3(10, 0, -1190),      // S-Bend Right -> Portal 5
    new THREE.Vector3(30, 0, -1230),      // Bridge 2 ramp start
    new THREE.Vector3(30, 2.75, -1253),   // 45u smooth climb
    new THREE.Vector3(30, 5.45, -1277),   // BRIDGE 2 HIGH DECK (+6.35u above water)
    new THREE.Vector3(30, 5.45, -1319),   // Bridge 2 central span end
    new THREE.Vector3(30, 2.75, -1343),   // 45u smooth descent
    new THREE.Vector3(30, 0, -1367),      // Bridge 2 ramp end
    new THREE.Vector3(30, 0, -1410),      // Straight for Portal 6
    new THREE.Vector3(12, 0, -1505),      // Gentle Mangrove Curve
    new THREE.Vector3(-14, 0, -1600),     // Portal 7
    new THREE.Vector3(-14, 0, -1725),     // Mangrove opens to Sand Dunes (~180u before beach)
    new THREE.Vector3(0, 0, -1845),       // Final Beach Straight -> Portal 8
    new THREE.Vector3(0, 0, -1970),
    new THREE.Vector3(0, 0, -2100),       // Praia de Ajuruteua Finish & Orla
  ];
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.45);
}

/**
 * Generates a smooth ribbon BufferGeometry along a CatmullRomCurve3 with
 * clamped ground floor (y >= 0) and true slope-aligned surface normals.
 */
function buildSplineRibbonGeometry(
  curve: THREE.CatmullRomCurve3,
  width: number,
  segments: number,
  yOffset = 0,
  uvRepeatY = 1,
  sinkUnderBridges = false
): THREE.BufferGeometry {
  const positions = new Float32Array((segments + 1) * 2 * 3);
  const normals = new Float32Array((segments + 1) * 2 * 3);
  const uvs = new Float32Array((segments + 1) * 2 * 2);
  const indices: number[] = [];

  const halfW = width * 0.5;
  const p = new THREE.Vector3();
  const t = new THREE.Vector3();
  const r = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    curve.getPointAt(u, p);
    const clampedY = Math.max(0, p.y);
    curve.getTangentAt(u, t).normalize();
    if (clampedY <= 0.001) {
      t.y = 0;
      t.normalize();
    }
    r.crossVectors(t, _up).normalize();
    n.crossVectors(r, t).normalize();

    // Optional embankment sink under elevated bridges so bridges span cleanly over open water
    const finalY =
      sinkUnderBridges && clampedY > 0.35
        ? -2.1
        : clampedY + yOffset;

    const vi = i * 6;
    positions[vi] = p.x - r.x * halfW;
    positions[vi + 1] = finalY;
    positions[vi + 2] = p.z - r.z * halfW;
    positions[vi + 3] = p.x + r.x * halfW;
    positions[vi + 4] = finalY;
    positions[vi + 5] = p.z + r.z * halfW;

    normals[vi] = n.x;
    normals[vi + 1] = n.y;
    normals[vi + 2] = n.z;
    normals[vi + 3] = n.x;
    normals[vi + 4] = n.y;
    normals[vi + 5] = n.z;

    const ui = i * 4;
    uvs[ui] = 0;
    uvs[ui + 1] = u * uvRepeatY;
    uvs[ui + 2] = 1;
    uvs[ui + 3] = u * uvRepeatY;

    if (i < segments) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

export function VehicleRallyGame({
  student,
  worldId,
  difficulty,
  multiplayerSession,
  onProgressEvent,
  onExit,
}: VehicleRallyGameProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [runKey, setRunKey] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const [graphicsQuality, setGraphicsQualityState] = useState(() => getGraphicsQuality());
  const [curveAssist, setCurveAssist] = useState<boolean>(
    () => worldId === 7 || worldId === 8 || worldId === 9
  );
  const curveAssistRef = useRef(curveAssist);
  curveAssistRef.current = curveAssist;

  useEffect(() => subscribeGraphicsQuality((q) => setGraphicsQualityState(q)), []);

  const world = useMemo(() => getWorldById(worldId), [worldId]);
  const diffConfig = useMemo(() => getDifficultyConfig(difficulty), [difficulty]);
  const questions = useMemo(
    () => getQuestionsForMode(worldId, 'vehicle_rally', TOTAL_GATES, student.id),
    [worldId, runKey, student.id]
  );

  // Refs to ensure parent re-renders NEVER tear down the active race scene
  const questionsRef = useRef(questions);
  questionsRef.current = questions;
  const diffConfigRef = useRef(diffConfig);
  diffConfigRef.current = diffConfig;
  const onProgressRef = useRef(onProgressEvent);
  onProgressRef.current = onProgressEvent;

  // Mobile steering, throttle, brake & drift controls
  const touchControlRef = useRef({
    steer: 0, // -1 left, +1 right
    drift: false,
    throttle: false,
    brake: false,
  });

  const [hud, setHud] = useState<{
    gateIndex: number;
    elapsed: number;
    speedKmh: number;
    distanceLeft: number;
    activeLane: 0 | 1 | 2;
    stateBadge: 'normal' | 'nitro' | 'mini_turbo' | 'super_turbo' | 'slow' | 'mud';
    driftTier: 0 | 1 | 2;
    wrongFlash: boolean;
    countdown: string | null;
    question: MathQuestion;
    sessionXp: number;
    sessionCoins: number;
    correctCount: number;
    toast: { text: string; ok: boolean } | null;
    finished: boolean;
    medal: 'ouro' | 'prata' | 'bronze';
    mpRank: number;
    mpTotal: number;
    mpBonusCoins: number;
    mpStandings: Array<{
      id: string;
      name: string;
      grade: string;
      s: number;
      finished: boolean;
      finishTime: number | null;
      isMe: boolean;
    }>;
  }>({
    gateIndex: 0,
    elapsed: 0,
    speedKmh: 0,
    distanceLeft: 1980,
    activeLane: 1,
    stateBadge: 'normal',
    driftTier: 0,
    wrongFlash: false,
    countdown: '3',
    question: questions[0],
    sessionXp: 0,
    sessionCoins: 0,
    correctCount: 0,
    toast: null,
    finished: false,
    medal: 'ouro',
    mpRank: 1,
    mpTotal: multiplayerSession ? Math.max(1, multiplayerSession.players.length) : 1,
    mpBonusCoins: 0,
    mpStandings: [],
  });

  useEffect(() => {
    soundEngine.startBgm('race');
    return () => {
      soundEngine.setBgmSpeedMultiplier(1.0);
    };
  }, []);

  // CRITICAL: Depend ONLY on primitive appearance/session keys — NEVER on `student` object!
  // This completely eliminates the race reset bug when XP/coins update after crossing a portal.
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const activeQuestions = questionsRef.current;
    const activeDiff = diffConfigRef.current;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(62, width / height, 0.2, 340);

    const { renderer, maxAnisotropy } = createPbrRenderer(container, graphicsQuality);
    const envRig = setupTropicalEnvironment(scene, renderer, {
      fogColor: 0xdbf4ff,
      fogDensity: 0.0029,
      skyRadius: 310,
      shadowFrustum: 36,
      sunOffset: [28, 56, 22],
      hemiIntensity: 0.88,
      sunIntensity: 1.5,
      quality: graphicsQuality,
    });

    // =========================================================================
    // 0. BRILLIANT GOLDEN TROPICAL SUN WITH LAYERED HALO
    // =========================================================================
    const sunGroup = new THREE.Group();
    const sunCore = new THREE.Mesh(
      new THREE.SphereGeometry(12, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xfef08a, fog: false })
    );
    const sunHaloInner = new THREE.Mesh(
      new THREE.SphereGeometry(17.5, 18, 18),
      new THREE.MeshBasicMaterial({
        color: 0xfde047,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        fog: false,
      })
    );
    const sunHaloOuter = new THREE.Mesh(
      new THREE.SphereGeometry(25, 18, 18),
      new THREE.MeshBasicMaterial({
        color: 0xfef9c3,
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
        fog: false,
      })
    );
    sunGroup.add(sunCore, sunHaloInner, sunHaloOuter);
    scene.add(sunGroup);

    // Zero-GC Particle Pool (drift sparks, nitro flames, mud splashes, jump bursts)
    const particles = new ParticlePool(160, graphicsQuality);
    scene.add(particles.mesh);

    // =========================================================================
    // 0B. MULTIPLAYER KART PEERS (2-6 PLAYERS REALTIME SYNC AT 15 HZ + 60 FPS LERP)
    // =========================================================================
    interface PeerKartEntry {
      rig: KartRig;
      state: KartPeerState;
      curS: number;
      curLat: number;
      curY: number;
      curYaw: number;
      lastSeen: number;
    }
    const mpPeers = new Map<string, PeerKartEntry>();
    const peerPt = new THREE.Vector3();
    const peerTan = new THREE.Vector3();
    const peerRight = new THREE.Vector3();
    let mpChannel: MultiplayerMatchChannel<KartPeerState> | null = null;
    let mpBroadcastTick = 0;
    let mpBonusAwarded = 0;
    let myFinishTime: number | undefined;

    const ensurePeerKart = (peerState: KartPeerState) => {
      const existing = mpPeers.get(peerState.id);
      if (existing) {
        existing.state = peerState;
        existing.lastSeen = performance.now();
        return existing;
      }
      const pRig = createKartRig(
        peerState.avatarColor || '#38bdf8',
        peerState.equippedHat ?? null,
        peerState.equippedJersey ?? null,
        'sport_kart'
      );
      const label = createKartLabelSprite(peerState.name, peerState.grade);
      pRig.root.add(label);
      scene.add(pRig.root);
      const entry: PeerKartEntry = {
        rig: pRig,
        state: peerState,
        curS: peerState.s,
        curLat: peerState.lateral,
        curY: peerState.y,
        curYaw: peerState.rotY,
        lastSeen: performance.now(),
      };
      mpPeers.set(peerState.id, entry);
      return entry;
    };

    if (multiplayerSession) {
      // Pre-spawn connected room players along starting grid
      let slotIdx = 0;
      multiplayerSession.players.forEach((p) => {
        if (p.id === student.id) return;
        const gridLat = ((slotIdx % 3) - 1) * 3.8;
        const gridS = Math.max(2, 10 - Math.floor(slotIdx / 3) * 4.5);
        slotIdx++;
        ensurePeerKart({
          id: p.id,
          name: p.name,
          grade: p.grade,
          avatarColor: p.avatarColor,
          equippedHat: p.equippedHat,
          equippedJersey: p.equippedJersey,
          s: gridS,
          lateral: gridLat,
          y: 0,
          speed: 0,
          rotY: 0,
          finished: false,
          finishTime: null,
          updatedAt: Date.now(),
        });
      });

      mpChannel = new MultiplayerMatchChannel<KartPeerState>(
        multiplayerSession.channelName,
        'kart_state',
        (incoming) => {
          if (!incoming || incoming.id === student.id) return;
          ensurePeerKart(incoming);
        }
      );
      mpChannel.connect();
    }

    // =========================================================================
    // 1. SPLINE PA-458 ESTRADA DE AJURUTEUA (~2140u) & FAST LOOKUP TABLE
    // =========================================================================
    const spline = buildAjuruteuaSpline();
    const totalLength = spline.getLength();
    const SAMPLE_COUNT = 720;
    const samples: SplineSample[] = [];

    for (let i = 0; i <= SAMPLE_COUNT; i++) {
      const u = i / SAMPLE_COUNT;
      const pos = spline.getPointAt(u);
      pos.y = Math.max(0, pos.y);
      const tan = spline.getTangentAt(u).normalize();
      if (pos.y <= 0.001) {
        tan.y = 0;
        tan.normalize();
      }
      const right = new THREE.Vector3().crossVectors(tan, _up).normalize();
      const yaw = Math.atan2(-tan.x, -tan.z);
      samples.push({
        s: u * totalLength,
        u,
        pos,
        tan,
        right,
        yaw,
        curvature: 0,
      });
    }

    for (let i = 1; i < SAMPLE_COUNT; i++) {
      const prevYaw = samples[i - 1].yaw;
      const nextYaw = samples[i + 1].yaw;
      let dYaw = nextYaw - prevYaw;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;
      const ds = samples[i + 1].s - samples[i - 1].s;
      samples[i].curvature = dYaw / Math.max(0.01, ds);
    }

    const sampleSplineAtS = (
      s: number,
      outPos: THREE.Vector3,
      outTan: THREE.Vector3,
      outRight: THREE.Vector3
    ): { yaw: number; curvature: number } => {
      const clampedS = THREE.MathUtils.clamp(s, 0, totalLength);
      const fIdx = (clampedS / totalLength) * SAMPLE_COUNT;
      const i0 = Math.min(SAMPLE_COUNT - 1, Math.floor(fIdx));
      const i1 = Math.min(SAMPLE_COUNT, i0 + 1);
      const alpha = fIdx - i0;
      const s0 = samples[i0];
      const s1 = samples[i1];

      outPos.lerpVectors(s0.pos, s1.pos, alpha);
      outTan.lerpVectors(s0.tan, s1.tan, alpha).normalize();
      outRight.crossVectors(outTan, _up).normalize();

      let dYaw = s1.yaw - s0.yaw;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;

      return {
        yaw: s0.yaw + dYaw * alpha,
        curvature: THREE.MathUtils.lerp(s0.curvature, s1.curvature, alpha),
      };
    };

    // Dynamically detect the 2 elevated PA-458 bridge spans from spline height (pos.y > 0.35)
    const bridges: BridgeSpan[] = [];
    let inBridge = false;
    let bStart = 0;
    for (let i = 0; i <= SAMPLE_COUNT; i++) {
      const elevated = samples[i].pos.y > 0.35;
      if (elevated && !inBridge) {
        inBridge = true;
        bStart = samples[i].s;
      } else if (!elevated && inBridge) {
        inBridge = false;
        const bEnd = samples[i - 1].s;
        bridges.push({ startS: bStart, endS: bEnd, midS: (bStart + bEnd) * 0.5 });
      }
    }
    const isOnBridge = (s: number, pad = 10): boolean =>
      bridges.some((b) => s >= b.startS - pad && s <= b.endS + pad);
    const finishS = totalLength - 75;
    const beachStartS = finishS - 180; // Continuous mangrove runs until last ~180m before Praia de Ajuruteua

    const MUD_Y = -1.05;
    const WATER_Y = -0.9; // Bridge crests at y = +5.45 -> +6.35u above estuarine water!

    // =========================================================================
    // 2. PBR HIGHWAY, WET MANGROVE MUDFLATS, ESTUARINE WATER & 2 HIGH PA-458 BRIDGES
    // =========================================================================
    const asphaltPbr = createTiledPbrTextures('asphalt', 2, 175, maxAnisotropy);
    const mudPbr = createTiledPbrTextures('mangroveMud', 72, 110, maxAnisotropy);
    const mangroveWaterPbr = createTiledPbrTextures('mangroveWater', 34, 62, maxAnisotropy);
    const oceanWaterPbr = createTiledPbrTextures('water', 28, 16, maxAnisotropy);

    // Asphalt highway ribbon along PA-458 spline (high segment resolution for smooth bridge curves)
    const roadGeo = buildSplineRibbonGeometry(spline, TRACK_WIDTH, 420, 0.04, 1, false);
    const roadMat = new THREE.MeshStandardMaterial({
      map: asphaltPbr.map,
      bumpMap: asphaltPbr.bumpMap,
      bumpScale: asphaltPbr.bumpScale,
      roughness: asphaltPbr.roughness,
      metalness: 0.06,
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    scene.add(roadMesh);

    // Raised earth causeway shoulders (drops beneath elevated bridges so water flows cleanly under!)
    const shoulderGeo = buildSplineRibbonGeometry(spline, TRACK_WIDTH + 5.2, 340, -0.34, 1, true);
    const shoulderMat = new THREE.MeshStandardMaterial({
      color: 0x4f3f31,
      roughness: 0.9,
    });
    const shoulderMesh = new THREE.Mesh(shoulderGeo, shoulderMat);
    shoulderMesh.receiveShadow = true;
    scene.add(shoulderMesh);

    // Vast dark wet Mangrove Mudflat ground plane extending to the horizon beneath the entire forest
    const mangroveMudFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(1120, 2240),
      new THREE.MeshStandardMaterial({
        map: mudPbr.map,
        bumpMap: mudPbr.bumpMap,
        bumpScale: mudPbr.bumpScale,
        roughness: mudPbr.roughness,
        metalness: 0.14,
      })
    );
    mangroveMudFloor.rotation.x = -Math.PI / 2;
    mangroveMudFloor.position.set(10, MUD_Y, -820);
    mangroveMudFloor.receiveShadow = true;
    scene.add(mangroveMudFloor);

    // Authentic Estuarine Mangrove Water Material (olive-moss & muddy-brown, NO artificial pool blue!)
    const estuarineWaterMat = new THREE.MeshStandardMaterial({
      map: mangroveWaterPbr.map,
      bumpMap: mangroveWaterPbr.bumpMap,
      bumpScale: mangroveWaterPbr.bumpScale,
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.15,
    });

    // Subtle flooded estuarine tidal sheet just below mudflats
    const estuaryBaseSheet = new THREE.Mesh(
      new THREE.PlaneGeometry(1120, 2150),
      estuarineWaterMat
    );
    estuaryBaseSheet.rotation.x = -Math.PI / 2;
    estuaryBaseSheet.position.set(10, -1.32, -820);
    scene.add(estuaryBaseSheet);

    // Bridge Concrete, Tidal Watermark & Open Metallic Guardrail Materials
    const bridgeDeckMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.78 });
    const concreteCurbMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.72 });
    const bridgePierMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.84 });
    const tidalMarkMat = new THREE.MeshStandardMaterial({ color: 0x2c2922, roughness: 0.92 });
    const guardMetalMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.68,
      roughness: 0.34,
    });

    for (const br of bridges) {
      // Wide murky estuarine igarapé river channel cutting across the entire mangrove under each bridge
      sampleSplineAtS(br.midS, _pt, _tan, _right);
      const riverChannel = new THREE.Mesh(
        new THREE.PlaneGeometry(540, 86),
        estuarineWaterMat
      );
      riverChannel.rotation.x = -Math.PI / 2;
      riverChannel.position.set(_pt.x, WATER_Y, _pt.z);
      riverChannel.rotation.z = Math.atan2(_tan.x, _tan.z);
      scene.add(riverChannel);

      // Sloped concrete deck girder, low curbs, open-view galvanized guardrails & tall piers w/ tidal marks
      const spanLen = br.endS - br.startS;
      const segs = 22;
      const stepS = spanLen / segs;

      for (let k = 0; k < segs; k++) {
        const sPos = br.startS + (k + 0.5) * stepS;
        const { yaw } = sampleSplineAtS(sPos, _pt, _tan, _right);
        const pitch = Math.asin(THREE.MathUtils.clamp(_tan.y, -0.45, 0.45));

        // Sloped Concrete Under-Deck Slab following exact bridge incline
        const girder = new THREE.Mesh(
          new THREE.BoxGeometry(TRACK_WIDTH + 1.5, 0.65, stepS + 0.45),
          bridgeDeckMat
        );
        girder.position.set(_pt.x, _pt.y - 0.3, _pt.z);
        girder.rotation.order = 'YXZ';
        girder.rotation.set(pitch, yaw, 0);
        scene.add(girder);

        // Low concrete wheel curb + open-view dual-bar metallic guardrail on both sides
        // (Lets the player clearly see the muddy igarapé & jacarés far below!)
        for (const side of [-1, 1]) {
          const edgeX = _pt.x + _right.x * side * (TRACK_WIDTH * 0.5 + 0.46);
          const edgeZ = _pt.z + _right.z * side * (TRACK_WIDTH * 0.5 + 0.46);

          const lowCurb = new THREE.Mesh(
            new THREE.BoxGeometry(0.42, 0.42, stepS + 0.25),
            concreteCurbMat
          );
          lowCurb.position.set(edgeX, _pt.y + 0.21, edgeZ);
          lowCurb.rotation.order = 'YXZ';
          lowCurb.rotation.set(pitch, yaw, 0);
          scene.add(lowCurb);

          // Slim galvanized horizontal metal bars with open space between them
          for (const railY of [0.78, 1.18]) {
            const bar = new THREE.Mesh(
              new THREE.BoxGeometry(0.11, 0.1, stepS + 0.28),
              guardMetalMat
            );
            bar.position.set(edgeX, _pt.y + railY, edgeZ);
            bar.rotation.order = 'YXZ';
            bar.rotation.set(pitch, yaw, 0);
            scene.add(bar);
          }

          // Vertical steel guardrail stanchion post
          const post = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.92, 0.12),
            guardMetalMat
          );
          post.position.set(edgeX, _pt.y + 0.78, edgeZ);
          post.rotation.y = yaw;
          scene.add(post);
        }

        // Thick, tall concrete piers plunging from deck into murky water with dark tidal mark band
        if (k >= 2 && k <= segs - 3 && k % 3 === 0) {
          const pierTopY = _pt.y - 0.45;
          const pierBotY = WATER_Y - 1.9;
          const pierH = Math.max(2.0, pierTopY - pierBotY);

          // Crosshead concrete cap beam connecting left & right columns under deck
          const capBeam = new THREE.Mesh(
            new THREE.BoxGeometry(TRACK_WIDTH + 0.6, 0.72, 1.45),
            bridgePierMat
          );
          capBeam.position.set(_pt.x, pierTopY - 0.25, _pt.z);
          capBeam.rotation.y = yaw;
          scene.add(capBeam);

          for (const side of [-1, 1]) {
            const px = _pt.x + _right.x * side * (TRACK_WIDTH * 0.36);
            const pz = _pt.z + _right.z * side * (TRACK_WIDTH * 0.36);

            const column = new THREE.Mesh(
              new THREE.CylinderGeometry(0.75, 0.92, pierH, 8),
              bridgePierMat
            );
            column.position.set(px, pierBotY + pierH * 0.5, pz);
            scene.add(column);

            // Dark damp tidal-variation watermark band right around water level
            const tidalRing = new THREE.Mesh(
              new THREE.CylinderGeometry(0.94, 0.98, 1.05, 8),
              tidalMarkMat
            );
            tidalRing.position.set(px, WATER_Y + 0.28, pz);
            scene.add(tidalRing);
          }
        }
      }
    }

    // Winding flooded mangrove tidal channels & shallow muddy water pools along PA-458
    for (let c = 0; c < 22; c++) {
      const sVal = 65 + c * 76;
      if (sVal > beachStartS - 40 || isOnBridge(sVal, 20)) continue;
      sampleSplineAtS(sVal, _pt, _tan, _right);
      const side = c % 2 === 0 ? -1 : 1;
      const dist = TRACK_WIDTH * 0.5 + 17 + (c % 4) * 11;
      const pool = new THREE.Mesh(
        new THREE.CircleGeometry(14 + (c % 4) * 6, 12),
        estuarineWaterMat
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(_pt.x + _right.x * side * dist, WATER_Y - 0.04, _pt.z + _right.z * side * dist);
      scene.add(pool);
    }

    // =========================================================================
    // 3. INSTANCED CURBS, LANE DASHES, CURVE ARROWS & GUARD POSTS
    // =========================================================================
    const curbStep = 5.0;
    const curbPairs = Math.floor(totalLength / curbStep);
    const curbGeo = new THREE.BoxGeometry(0.65, 0.24, curbStep * 0.96);
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.48 });
    const curbInst = new THREE.InstancedMesh(curbGeo, curbMat, curbPairs * 2);
    curbInst.receiveShadow = true;

    let ci = 0;
    for (let i = 0; i < curbPairs; i++) {
      const s = i * curbStep + curbStep * 0.5;
      const { yaw } = sampleSplineAtS(s, _pt, _tan, _right);
      const pitch = Math.asin(THREE.MathUtils.clamp(_tan.y, -0.45, 0.45));
      const isRed = i % 2 === 0;
      _color.setHex(isRed ? 0xef4444 : 0xf8fafc);

      for (const side of [-1, 1]) {
        _dummy.position.set(
          _pt.x + _right.x * side * (TRACK_WIDTH * 0.5 + 0.22),
          _pt.y + 0.11,
          _pt.z + _right.z * side * (TRACK_WIDTH * 0.5 + 0.22)
        );
        _dummy.rotation.order = 'YXZ';
        _dummy.rotation.set(pitch, yaw, 0);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        curbInst.setMatrixAt(ci, _dummy.matrix);
        curbInst.setColorAt(ci, _color);
        ci++;
      }
    }
    curbInst.instanceMatrix.needsUpdate = true;
    if (curbInst.instanceColor) curbInst.instanceColor.needsUpdate = true;
    curbInst.computeBoundingSphere();
    scene.add(curbInst);

    // Road Lane Divider Dashes separating A | B | C clearly
    const dashStep = 10;
    const dashCount = Math.floor(totalLength / dashStep);
    const dashGeo = new THREE.BoxGeometry(0.24, 0.03, 4.2);
    const dashMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xca8a04,
      emissiveIntensity: 0.3,
      roughness: 0.45,
    });
    const dashInst = new THREE.InstancedMesh(dashGeo, dashMat, dashCount * 2);
    let di = 0;
    for (let i = 0; i < dashCount; i++) {
      const s = i * dashStep + 5;
      const { yaw } = sampleSplineAtS(s, _pt, _tan, _right);
      const pitch = Math.asin(THREE.MathUtils.clamp(_tan.y, -0.45, 0.45));
      for (const divX of [-HALF_LANE, HALF_LANE]) {
        _dummy.position.set(
          _pt.x + _right.x * divX,
          _pt.y + 0.06,
          _pt.z + _right.z * divX
        );
        _dummy.rotation.order = 'YXZ';
        _dummy.rotation.set(pitch, yaw, 0);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        dashInst.setMatrixAt(di++, _dummy.matrix);
      }
    }
    dashInst.instanceMatrix.needsUpdate = true;
    dashInst.computeBoundingSphere();
    scene.add(dashInst);

    // Luminous Curve Chevron Signs on bends
    const leftSignMat = new THREE.MeshStandardMaterial({
      map: createCurveSignTexture('left'),
      emissive: 0xfacc15,
      emissiveIntensity: 0.28,
      roughness: 0.35,
    });
    const rightSignMat = new THREE.MeshStandardMaterial({
      map: createCurveSignTexture('right'),
      emissive: 0xfacc15,
      emissiveIntensity: 0.28,
      roughness: 0.35,
    });
    const signPostMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.4 });
    const signBoardGeo = new THREE.BoxGeometry(1.75, 1.75, 0.16);
    const signPostGeo = new THREE.CylinderGeometry(0.1, 0.1, 3.0, 6);

    for (let s = 120; s < beachStartS - 30; s += 26) {
      if (isOnBridge(s)) continue;
      const { yaw, curvature } = sampleSplineAtS(s, _pt, _tan, _right);
      if (Math.abs(curvature) > 0.0022) {
        const turnRight = curvature < 0;
        const outsideSide = turnRight ? -1 : 1;
        const offset = TRACK_WIDTH * 0.5 + 1.5;

        const sg = new THREE.Group();
        sg.position.set(
          _pt.x + _right.x * outsideSide * offset,
          _pt.y,
          _pt.z + _right.z * outsideSide * offset
        );
        sg.rotation.y = yaw;
        const post = new THREE.Mesh(signPostGeo, signPostMat);
        post.position.y = 1.5;
        const board = new THREE.Mesh(signBoardGeo, turnRight ? rightSignMat : leftSignMat);
        board.position.y = 2.65;
        sg.add(post, board);
        scene.add(sg);
      }
    }

    // =========================================================================
    // 4. CONTINUOUS HORIZON-SPANNING MANGROVE SEA (540 TREES IN 4 INSTANCED DRAW CALLS)
    //    Depth 9u to 135u from road edge, 5 canopy greens, 0.75x–1.65x scale,
    //    dense roadside/creekside stilt roots & pneumatophores, 60% distant cull on Low
    // =========================================================================
    const rawMangroveTrees: (MangroveTreeAnchor & { seed: number })[] = [];
    // Deterministic PRNG for organic non-repetitive mangrove forest placement
    let fSeed = 918273;
    const nextRand = () => {
      fSeed = (fSeed * 1664525 + 1013904223) >>> 0;
      return fSeed / 4294967296;
    };

    // 5 staggered depth bands from 9u out to 135u from road edge on both sides (~545 trees total)
    const depthBands: { minD: number; maxD: number; stepS: number }[] = [
      { minD: 9, maxD: 18, stepS: 20.5 },     // Innermost roadside fringe (dense roots!)
      { minD: 19, maxD: 35, stepS: 25.5 },    // Second dense root/mud layer
      { minD: 36, maxD: 65, stepS: 31.5 },    // Mid-forest canopy sea
      { minD: 66, maxD: 100, stepS: 40 },     // Deep forest layer
      { minD: 101, maxD: 135, stepS: 50 },    // Horizon mangrove treeline
    ];

    const isInRiverCut = (sVal: number): boolean =>
      bridges.some((b) => Math.abs(sVal - b.midS) < 42);

    for (let bandIdx = 0; bandIdx < depthBands.length; bandIdx++) {
      const band = depthBands[bandIdx];
      for (let s = 14 + bandIdx * 4; s < beachStartS; s += band.stepS) {
        const sJitter = s + (nextRand() - 0.5) * band.stepS * 0.55;
        if (sJitter < 10 || sJitter >= beachStartS || isInRiverCut(sJitter)) continue;

        sampleSplineAtS(sJitter, _pt, _tan, _right);
        for (const side of [-1, 1]) {
          const distFromEdge = band.minD + nextRand() * (band.maxD - band.minD);
          // On Low graphics quality, keep 100% of near trees and render 60% of distant trees
          if (graphicsQuality === 'low' && distFromEdge > 38 && nextRand() > 0.6) {
            continue;
          }
          const distFromCenter = TRACK_WIDTH * 0.5 + distFromEdge;
          const sc = 0.75 + nextRand() * 0.9; // 0.75x to 1.65x scale variation
          rawMangroveTrees.push({
            x: _pt.x + _right.x * side * distFromCenter,
            y: MUD_Y,
            z: _pt.z + _right.z * side * distFromCenter,
            scale: sc,
            distFromEdge,
            side,
            s: sJitter,
            seed: nextRand() * 100,
          });
        }
      }
    }

    const treeCount = rawMangroveTrees.length;
    const nearRootTrees = rawMangroveTrees.filter(
      (t) =>
        t.distFromEdge <= 35 ||
        bridges.some((b) => Math.abs(Math.abs(t.s - b.midS) - 44) < 12)
    );
    const roadsideTrees = rawMangroveTrees.filter((t) => t.distFromEdge <= 18);

    // Draw call 1: Mangrove Trunks
    const trunkGeo = new THREE.CylinderGeometry(0.24, 0.38, 4.5, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3d28, roughness: 0.9 });
    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);

    // Draw call 2: Arched Aerial Stilt Roots (Rizóforos) concentrated on roadside (9u–35u) & creek banks
    const ROOTS_PER_TREE = 5;
    const rootGeo = new THREE.CylinderGeometry(0.06, 0.11, 3.3, 5);
    const rootMat = new THREE.MeshStandardMaterial({ color: 0x6b3e26, roughness: 0.88 });
    const rootInst = new THREE.InstancedMesh(
      rootGeo,
      rootMat,
      Math.max(1, nearRootTrees.length * ROOTS_PER_TREE)
    );

    // Draw call 3: Dense Multi-Layered Mangrove Canopies (2 clusters/tree in 5 rich mangrove greens)
    const canopyGeo = new THREE.DodecahedronGeometry(3.1, 0);
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.76 });
    const canopyInst = new THREE.InstancedMesh(canopyGeo, canopyMat, treeCount * 2);

    const mangroveGreens = [0x14532d, 0x166534, 0x1e4620, 0x255229, 0x365314];
    let cni = 0;

    for (let i = 0; i < treeCount; i++) {
      const tp = rawMangroveTrees[i];
      const sc = tp.scale;

      _dummy.position.set(tp.x, tp.y + 3.1 * sc, tp.z);
      _dummy.rotation.set(
        ((tp.seed % 7) - 3.5) * 0.024,
        tp.seed * 0.42,
        ((tp.seed % 5) - 2.5) * 0.024
      );
      _dummy.scale.set(sc, sc, sc);
      _dummy.updateMatrix();
      trunkInst.setMatrixAt(i, _dummy.matrix);

      // Two overlapping organic canopy clusters to create a lush unbroken forest sea
      for (let c = 0; c < 2; c++) {
        const ox = c === 0 ? 0 : Math.cos(tp.seed * 1.3) * 1.85 * sc;
        const oz = c === 0 ? 0 : Math.sin(tp.seed * 1.3) * 1.85 * sc;
        const oy = c === 0 ? 5.65 * sc : 4.85 * sc;
        _dummy.position.set(tp.x + ox, tp.y + oy, tp.z + oz);
        _dummy.rotation.set(tp.seed * 0.2, tp.seed * 0.7 + c * 1.4, tp.seed * 0.15);
        const cs = c === 0 ? sc * 1.2 : sc * 0.92;
        _dummy.scale.set(cs * 1.25, cs * 0.78, cs * 1.25);
        _dummy.updateMatrix();
        canopyInst.setMatrixAt(cni, _dummy.matrix);
        _color.setHex(
          mangroveGreens[Math.floor(tp.seed * 3.7 + c * 2) % mangroveGreens.length]
        );
        canopyInst.setColorAt(cni, _color);
        cni++;
      }
    }

    let ri = 0;
    for (let i = 0; i < nearRootTrees.length; i++) {
      const tp = nearRootTrees[i];
      const sc = tp.scale;
      for (let r = 0; r < ROOTS_PER_TREE; r++) {
        const ang = (r / ROOTS_PER_TREE) * Math.PI * 2 + tp.seed * 0.19;
        const spread = 1.12 * sc;
        _dummy.position.set(
          tp.x + Math.cos(ang) * spread * 0.74,
          tp.y + 1.25 * sc,
          tp.z + Math.sin(ang) * spread * 0.74
        );
        _dummy.rotation.set(Math.sin(ang) * 0.58, 0, -Math.cos(ang) * 0.58);
        _dummy.scale.set(sc, sc * 1.08, sc);
        _dummy.updateMatrix();
        rootInst.setMatrixAt(ri++, _dummy.matrix);
      }
    }

    trunkInst.instanceMatrix.needsUpdate = true;
    rootInst.instanceMatrix.needsUpdate = true;
    canopyInst.instanceMatrix.needsUpdate = true;
    if (canopyInst.instanceColor) canopyInst.instanceColor.needsUpdate = true;
    trunkInst.computeBoundingSphere();
    rootInst.computeBoundingSphere();
    canopyInst.computeBoundingSphere();
    scene.add(trunkInst, rootInst, canopyInst);

    // Draw call 4: Dense Pneumatophores (vertical breathing roots along mudflat edges & igarapé banks)
    const pneumCount = graphicsQuality === 'low' ? 280 : 440;
    const pneumGeo = new THREE.CylinderGeometry(0.035, 0.062, 0.72, 5);
    const pneumMat = new THREE.MeshStandardMaterial({ color: 0x4d3828, roughness: 0.9 });
    const pneumInst = new THREE.InstancedMesh(pneumGeo, pneumMat, pneumCount);
    for (let i = 0; i < pneumCount; i++) {
      const sVal = 20 + (i / pneumCount) * (beachStartS - 35);
      const side = i % 2 === 0 ? -1 : 1;
      sampleSplineAtS(sVal, _pt, _tan, _right);
      const dist = TRACK_WIDTH * 0.5 + 3.2 + ((i * 7.3) % 24.0);
      const hScale = 0.55 + ((i * 1.9) % 0.9);
      const hidden = isInRiverCut(sVal);
      _dummy.position.set(
        _pt.x + _right.x * side * dist,
        hidden ? -99 : MUD_Y + 0.25 + hScale * 0.18,
        _pt.z + _right.z * side * dist
      );
      _dummy.rotation.set(((i % 5) - 2) * 0.07, 0, ((i % 7) - 3) * 0.06);
      _dummy.scale.set(1, hScale, 1);
      _dummy.updateMatrix();
      pneumInst.setMatrixAt(i, _dummy.matrix);
    }
    pneumInst.instanceMatrix.needsUpdate = true;
    pneumInst.computeBoundingSphere();
    scene.add(pneumInst);

    // =========================================================================
    // 4B. DEDICATED MANGROVE WILDLIFE MODULE (Guarás, Garças, Caranguejos-Uçá,
    //     Macacos-Prego, Mãos-Peladas & Jacarés)
    // =========================================================================
    const wildlife = createMangroveWildlife({
      sampleSplineAtS,
      bridges,
      nearTrees: roadsideTrees,
      beachStartS,
      trackWidth: TRACK_WIDTH,
      mudY: MUD_Y,
      waterY: WATER_Y,
      quality: graphicsQuality,
    });
    scene.add(wildlife.group);

    // Tropical Floating Clouds (InstancedMesh)
    const cloudGeo = new THREE.BoxGeometry(10, 3.2, 7.2);
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
    const cloudInst = new THREE.InstancedMesh(cloudGeo, cloudMat, 48);
    for (let i = 0; i < 48; i++) {
      const s = (i / 48) * totalLength;
      sampleSplineAtS(s, _pt, _tan, _right);
      const side = i % 2 === 0 ? -1 : 1;
      _dummy.position.set(
        _pt.x + side * (36 + (i % 5) * 18),
        34 + (i % 4) * 6,
        _pt.z - 20
      );
      _dummy.rotation.set(0, (i % 6) * 0.25, 0);
      _dummy.scale.set(1.1 + (i % 3) * 0.35, 1, 1 + (i % 2) * 0.35);
      _dummy.updateMatrix();
      cloudInst.setMatrixAt(i, _dummy.matrix);
    }
    cloudInst.instanceMatrix.needsUpdate = true;
    cloudInst.computeBoundingSphere();
    scene.add(cloudInst);

    // =========================================================================
    // 5. 8 QUESTION PORTALS (9–12s SPACING) + VISUAL LANE ALIGNMENT HIGHLIGHT
    // =========================================================================
    interface GateEntity {
      index: number;
      s: number;
      question: MathQuestion;
      triggered: boolean;
      curtains: THREE.Mesh[];
      beacons: THREE.Mesh[];
      guideStrips: THREE.Mesh[];
    }

    const gates: GateEntity[] = [];
    // Evenly spaced on flat corridors clear of both elevated bridges (~230u apart = 10–11s thinking time!)
    const gateFractions = [0.1, 0.2, 0.34, 0.445, 0.555, 0.695, 0.79, 0.89];
    const laneColorsHex = [0x2563eb, 0xf59e0b, 0x9333ea];
    const laneLetters: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];

    for (let g = 0; g < TOTAL_GATES; g++) {
      const q = activeQuestions[g] || activeQuestions[0];
      let gateS = gateFractions[g] * totalLength;
      // Guarantee zero overlap with elevated bridge ramps
      for (const br of bridges) {
        if (gateS >= br.startS - 18 && gateS <= br.endS + 18) {
          gateS = gateS < br.midS ? br.startS - 24 : br.endS + 24;
        }
      }
      const { yaw } = sampleSplineAtS(gateS, _pt, _tan, _right);

      const gateGroup = new THREE.Group();
      gateGroup.position.copy(_pt);
      gateGroup.rotation.y = yaw;

      // Overhead gantry crossbar
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(TRACK_WIDTH + 1.8, 0.75, 0.85),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.5 })
      );
      beam.position.set(0, 6.2, 0);
      gateGroup.add(beam);

      const curtains: THREE.Mesh[] = [];
      const beacons: THREE.Mesh[] = [];
      const guideStrips: THREE.Mesh[] = [];

      for (let lane = 0; lane < 3; lane++) {
        const lx = LANE_OFFSETS[lane];
        const colHex = laneColorsHex[lane];

        // Side arch pillars
        const pMat = new THREE.MeshStandardMaterial({
          color: colHex,
          emissive: colHex,
          emissiveIntensity: 0.28,
          roughness: 0.35,
        });
        const pL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 6.0, 0.42), pMat);
        pL.position.set(lx - 2.3, 3.0, 0);
        const pR = new THREE.Mesh(new THREE.BoxGeometry(0.42, 6.0, 0.42), pMat);
        pR.position.set(lx + 2.3, 3.0, 0);
        gateGroup.add(pL, pR);

        // Luminous top lane alignment beacon bar (brightens when Kart aligns with this lane!)
        const beaconMat = new THREE.MeshStandardMaterial({
          color: colHex,
          emissive: colHex,
          emissiveIntensity: 0.45,
          roughness: 0.25,
        });
        const beacon = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.45, 0.95), beaconMat);
        beacon.position.set(lx, 5.7, 0);
        gateGroup.add(beacon);
        beacons.push(beacon);

        // Luminous asphalt guide strip leading 18u into this arch so player sees exact lane alignment
        const stripMat = new THREE.MeshBasicMaterial({
          color: colHex,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
        });
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 22), stripMat);
        strip.rotation.x = -Math.PI / 2;
        strip.position.set(lx, 0.08, 11.5); // +Z in gate local space is approaching side (since tan = -Z)
        gateGroup.add(strip);
        guideStrips.push(strip);

        // Floating Answer Sign Board (A / B / C)
        const signTex = createAnswerPadTexture(
          laneLetters[lane],
          q.options[lane],
          `#${colHex.toString(16).padStart(6, '0')}`,
          maxAnisotropy
        );
        const signBoard = new THREE.Mesh(
          new THREE.BoxGeometry(4.5, 2.25, 0.28),
          new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.3 })
        );
        signBoard.position.set(lx, 4.35, 0);
        gateGroup.add(signBoard);

        // Translucent energy curtain
        const curtain = new THREE.Mesh(
          new THREE.PlaneGeometry(4.4, 3.4),
          new THREE.MeshBasicMaterial({
            color: colHex,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        curtain.position.set(lx, 1.75, 0);
        gateGroup.add(curtain);
        curtains.push(curtain);
      }

      scene.add(gateGroup);
      gates.push({
        index: g,
        s: gateS,
        question: q,
        triggered: false,
        curtains,
        beacons,
        guideStrips,
      });
    }

    // =========================================================================
    // 6. JUMP RAMPS, BOOST PADS & AVOIDABLE MUD/CONE HAZARDS (AWAY FROM PORTALS)
    // =========================================================================
    interface TrackPad {
      s: number;
      lat: number;
      width: number;
      kind: 'ramp' | 'boost';
      cooldown: number;
    }
    interface HazardItem {
      s: number;
      lat: number;
      radius: number;
      cooldown: number;
    }

    const pads: TrackPad[] = [];
    const hazards: HazardItem[] = [];
    const rampMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xd97706,
      emissiveIntensity: 0.32,
      roughness: 0.32,
    });
    const boostMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.78,
      roughness: 0.2,
    });

    const nearAnyGate = (sVal: number): boolean =>
      gates.some((g) => Math.abs(g.s - sVal) < 42) || isOnBridge(sVal);

    // 7 Jump Ramps
    for (let r = 0; r < 7; r++) {
      const sVal = 145 + r * 240;
      if (nearAnyGate(sVal)) continue;
      const lat = r % 2 === 0 ? -3.4 : 3.4;
      const { yaw } = sampleSplineAtS(sVal, _pt, _tan, _right);
      const rampMesh = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.55, 5.2), rampMat);
      rampMesh.position.set(_pt.x + _right.x * lat, _pt.y + 0.22, _pt.z + _right.z * lat);
      rampMesh.rotation.y = yaw;
      rampMesh.rotation.x = 0.14;
      scene.add(rampMesh);
      pads.push({ s: sVal, lat, width: 2.3, kind: 'ramp', cooldown: 0 });
    }

    // 9 Neon Boost Pads
    for (let b = 0; b < 9; b++) {
      const sVal = 100 + b * 195;
      if (nearAnyGate(sVal)) continue;
      const lat = (b % 3 - 1) * 4.2;
      const { yaw } = sampleSplineAtS(sVal, _pt, _tan, _right);
      const padMesh = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 6.2), boostMat);
      padMesh.position.set(_pt.x + _right.x * lat, _pt.y + 0.08, _pt.z + _right.z * lat);
      padMesh.rotation.y = yaw;
      scene.add(padMesh);
      pads.push({ s: sVal, lat, width: 2.0, kind: 'boost', cooldown: 0 });
    }

    // 10 Mud Puddles & Traffic Cones placed cleanly between portals
    const mudPuddleMat = new THREE.MeshStandardMaterial({ color: 0x3b2616, roughness: 0.5 });
    const coneGeo = new THREE.ConeGeometry(0.42, 1.05, 8);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.35 });
    const conePositions: { x: number; y: number; z: number }[] = [];

    for (let h = 0; h < 10; h++) {
      const sVal = 290 + h * 155;
      if (nearAnyGate(sVal) || sVal > beachStartS - 30) continue;
      const lat = h % 2 === 0 ? 4.4 : -4.4;
      sampleSplineAtS(sVal, _pt, _tan, _right);
      const wx = _pt.x + _right.x * lat;
      const wz = _pt.z + _right.z * lat;

      if (h % 2 === 0) {
        const puddle = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.9, 0.06, 12), mudPuddleMat);
        puddle.position.set(wx, _pt.y + 0.06, wz);
        scene.add(puddle);
        hazards.push({ s: sVal, lat, radius: 1.8, cooldown: 0 });
      } else {
        conePositions.push({ x: wx, y: _pt.y + 0.52, z: wz });
        hazards.push({ s: sVal, lat, radius: 1.25, cooldown: 0 });
      }
    }

    if (conePositions.length > 0) {
      const coneInst = new THREE.InstancedMesh(coneGeo, coneMat, conePositions.length);
      conePositions.forEach((cp, idx) => {
        _dummy.position.set(cp.x, cp.y, cp.z);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        coneInst.setMatrixAt(idx, _dummy.matrix);
      });
      coneInst.instanceMatrix.needsUpdate = true;
      coneInst.computeBoundingSphere();
      scene.add(coneInst);
    }

    // =========================================================================
    // 7. GRAND FINALE: PRAIA DE AJURUTEUA (DUNES, PALMS, KIOSKS, OCEAN & GANTRY)
    // =========================================================================
    const { yaw: finishYaw } = sampleSplineAtS(finishS, _pt, _tan, _right);
    const endPt = _pt.clone();

    const finishGroup = new THREE.Group();
    finishGroup.position.copy(endPt);
    finishGroup.rotation.y = finishYaw;

    // Bright Golden-White Beach Sand Dunes transitioning from mangrove
    const beachSand = new THREE.Mesh(
      new THREE.PlaneGeometry(520, 420),
      new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.88 })
    );
    beachSand.rotation.x = -Math.PI / 2;
    beachSand.position.set(0, -0.35, -35);
    beachSand.receiveShadow = true;
    finishGroup.add(beachSand);

    // Gentle low-poly sand dunes on both sides of the beach straight
    const duneMat = new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.9 });
    for (let d = 0; d < 12; d++) {
      const side = d % 2 === 0 ? -1 : 1;
      const dune = new THREE.Mesh(new THREE.SphereGeometry(14 + (d % 3) * 5, 10, 7), duneMat);
      dune.scale.set(1.5, 0.28, 1.3);
      dune.position.set(side * (32 + (d % 4) * 14), -0.6, 110 - d * 24);
      finishGroup.add(dune);
    }

    // Leaning Coastal Coconut Palms along the Praia de Ajuruteua entrance
    const palmTrunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
    const palmLeafMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.65 });
    for (let p = 0; p < 18; p++) {
      const side = p % 2 === 0 ? -1 : 1;
      const pg = new THREE.Group();
      pg.position.set(side * (16 + (p % 3) * 7), -0.3, 130 - p * 14);
      pg.rotation.z = -side * (0.14 + (p % 3) * 0.05);

      const ptMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.4, 7.6, 7), palmTrunkMat);
      ptMesh.position.y = 3.8;
      pg.add(ptMesh);

      for (let f = 0; f < 6; f++) {
        const ang = (f / 6) * Math.PI * 2;
        const frond = new THREE.Mesh(new THREE.ConeGeometry(0.95, 3.6, 5), palmLeafMat);
        frond.position.set(Math.cos(ang) * 1.45, 7.45, Math.sin(ang) * 1.45);
        frond.rotation.z = -Math.cos(ang) * 1.05;
        frond.rotation.x = Math.sin(ang) * 1.05;
        pg.add(frond);
      }
      finishGroup.add(pg);
    }

    // Animated Turquoise Atlantic Ocean Waves + White Foam Crest
    const oceanMat = new THREE.MeshStandardMaterial({
      map: oceanWaterPbr.map,
      bumpMap: oceanWaterPbr.bumpMap,
      bumpScale: oceanWaterPbr.bumpScale,
      color: 0x0284c7,
      roughness: 0.14,
      metalness: 0.25,
    });
    const oceanPlane = new THREE.Mesh(new THREE.PlaneGeometry(520, 260), oceanMat);
    oceanPlane.rotation.x = -Math.PI / 2;
    oceanPlane.position.set(0, -0.22, -230);
    finishGroup.add(oceanPlane);

    const foamLine = new THREE.Mesh(
      new THREE.PlaneGeometry(520, 9.5),
      new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.78 })
    );
    foamLine.rotation.x = -Math.PI / 2;
    foamLine.position.set(0, -0.16, -104);
    finishGroup.add(foamLine);

    // Finish Gantry "PRAIA DE AJURUTEUA"
    const gantryPostMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35, metalness: 0.3 });
    const gL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 9.2, 0.9), gantryPostMat);
    gL.position.set(-TRACK_WIDTH * 0.5 - 1.0, 4.6, 0);
    const gR = new THREE.Mesh(new THREE.BoxGeometry(0.9, 9.2, 0.9), gantryPostMat);
    gR.position.set(TRACK_WIDTH * 0.5 + 1.0, 4.6, 0);
    const beachBanner = new THREE.Mesh(
      new THREE.BoxGeometry(TRACK_WIDTH + 3.2, 3.0, 0.5),
      new THREE.MeshStandardMaterial({ map: createBeachArchTexture(), roughness: 0.3 })
    );
    beachBanner.position.set(0, 8.2, 0);
    finishGroup.add(gL, gR, beachBanner);

    // Beachfront Kiosks (Barracas de Praia) & Umbrellas
    const kioskColors = [0xef4444, 0x0ea5e9, 0xf59e0b, 0x10b981];
    for (let k = 0; k < 6; k++) {
      const side = k % 2 === 0 ? -1 : 1;
      const kx = side * (16 + Math.floor(k / 2) * 11);
      const kz = -28 - (k % 3) * 14;
      const kg = new THREE.Group();
      kg.position.set(kx, 0, kz);
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(3.2, 1.8, 6),
        new THREE.MeshStandardMaterial({ color: kioskColors[k % kioskColors.length], roughness: 0.55 })
      );
      roof.position.y = 3.2;
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 2.8, 6),
        new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 })
      );
      base.position.y = 1.4;
      kg.add(roof, base);
      finishGroup.add(kg);
    }

    // Cheering Beach Crowd (InstancedMesh)
    const specGeo = new THREE.BoxGeometry(0.8, 1.9, 0.6);
    const specMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    const specInst = new THREE.InstancedMesh(specGeo, specMat, 28);
    const specColors = [0xef4444, 0x3b82f6, 0xfacc15, 0x10b981, 0xa855f7];
    for (let i = 0; i < 28; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      _dummy.position.set(side * (10.5 + (i % 4) * 1.9), 0.75, 16 - i * 1.8);
      _dummy.rotation.set(0, side * -Math.PI * 0.5, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      specInst.setMatrixAt(i, _dummy.matrix);
      _color.setHex(specColors[i % specColors.length]);
      specInst.setColorAt(i, _color);
    }
    specInst.instanceMatrix.needsUpdate = true;
    if (specInst.instanceColor) specInst.instanceColor.needsUpdate = true;
    specInst.computeBoundingSphere();
    finishGroup.add(specInst);

    scene.add(finishGroup);

    // =========================================================================
    // 8. PLAYER 3D KART RIG WITH AVATAR SEATED AT THE WHEEL
    // =========================================================================
    const kartRig = createKartRig(
      student.avatarColor,
      student.equippedHat,
      student.equippedJersey
    );
    kartRig.root.rotation.order = 'YXZ'; // Clean yaw + uphill/downhill bridge pitch!
    scene.add(kartRig.root);

    // =========================================================================
    // 9. INPUT & CONTINUOUS FORWARD GAME LOOP (ZERO RESET GUARANTEE)
    // =========================================================================
    const keys: Record<string, boolean> = {};
    const handleKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp);

    let kartS = 8; // ONLY advances forward — never reset!
    let lateral = 0; // -MAX_LATERAL (Left / A) .. +MAX_LATERAL (Right / C)
    let lateralVel = 0;
    let kartY = 0;
    let kartVy = 0;
    let kartPitch = 0;
    let speed = 0;
    let elapsed = 0;

    let countdownTimer = 2.6;
    let raceStarted = false;
    let lastBeep = 4;

    // Drift & Boost States
    let driftActive = false;
    let driftDir = 0;
    let driftCharge = 0;
    let miniTurboTimer = 0;
    let superTurboTimer = 0;
    let nitroTimer = 0;
    let slowPenaltyTimer = 0; // Smooth 0.45x slowdown on wrong portal (NO reset, NO lockup!)
    let mudTimer = 0;
    let cameraShakeTimer = 0;
    let wrongFlashTimer = 0;

    let currentGateIdx = 0;
    let gateShownAtMs = performance.now();
    let correctCount = 0;
    let streak = 0;
    let sessionXp = 0;
    let sessionCoins = 0;
    let finished = false;
    let activeToast: { text: string; ok: boolean } | null = null;
    let toastTimer = 0;
    let hudTick = 0;
    let sparkTick = 0;

    let disposed = false;
    let rafId = 0;
    let timeoutId = 0;
    let prevTime = performance.now();

    const afterDraw = (fn: FrameRequestCallback) => {
      if (disposed) return;
      if (isSoftwareGl) {
        timeoutId = window.setTimeout(() => {
          if (!disposed) rafId = requestAnimationFrame(fn);
        }, 18);
      } else {
        rafId = requestAnimationFrame(fn);
      }
    };

    const handleResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    const tick = (now: number) => {
      if (disposed) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - prevTime) / 1000));
      prevTime = now;
      const tSec = now * 0.001;

      // Animate scrolling estuarine tidal current UVs & coastal Ajuruteua ocean waves
      mangroveWaterPbr.map.offset.x = (mangroveWaterPbr.map.offset.x + dt * 0.028) % 1;
      mangroveWaterPbr.map.offset.y = (mangroveWaterPbr.map.offset.y + dt * 0.045) % 1;
      mangroveWaterPbr.bumpMap.offset.copy(mangroveWaterPbr.map.offset);

      oceanWaterPbr.map.offset.y = (oceanWaterPbr.map.offset.y + dt * 0.14) % 1;
      oceanWaterPbr.bumpMap.offset.y = oceanWaterPbr.map.offset.y;
      foamLine.position.z = -104 + Math.sin(tSec * 2.3) * 3.0;

      // Animate all Bragança mangrove wildlife (Guarás, Garças, Caranguejos-Uçá, Macacos, Mãos-Peladas, Jacarés)
      wildlife.update(dt, tSec, _worldKartPos);

      // Countdown 3..2..1..VAI!
      if (!raceStarted && !finished) {
        countdownTimer -= dt;
        const ceilNum = Math.ceil(countdownTimer);
        if (ceilNum < lastBeep && ceilNum >= 1) {
          lastBeep = ceilNum;
          soundEngine.playGateProximity();
        }
        if (countdownTimer <= 0) {
          raceStarted = true;
          soundEngine.playTurboBoost();
        }
      }

      // Steer, Throttle, Brake & Drift inputs
      let steerInput = touchControlRef.current.steer;
      if (keys['ArrowLeft'] || keys['KeyA']) steerInput = -1;
      if (keys['ArrowRight'] || keys['KeyD']) steerInput = 1;

      const wantThrottle = Boolean(keys['ArrowUp'] || keys['KeyW'] || touchControlRef.current.throttle);
      const wantBrake = Boolean(keys['ArrowDown'] || keys['KeyS'] || touchControlRef.current.brake);
      const wantDrift = Boolean(
        keys['ShiftLeft'] || keys['ShiftRight'] || keys['Space'] || touchControlRef.current.drift
      );

      const frame = sampleSplineAtS(kartS, _pt, _tan, _right);
      let forceHudSync = false;

      if (raceStarted && !finished) {
        elapsed += dt;

        if (nitroTimer > 0) nitroTimer = Math.max(0, nitroTimer - dt);
        if (miniTurboTimer > 0) miniTurboTimer = Math.max(0, miniTurboTimer - dt);
        if (superTurboTimer > 0) superTurboTimer = Math.max(0, superTurboTimer - dt);
        if (slowPenaltyTimer > 0) slowPenaltyTimer = Math.max(0, slowPenaltyTimer - dt);
        if (mudTimer > 0) mudTimer = Math.max(0, mudTimer - dt);
        if (cameraShakeTimer > 0) cameraShakeTimer = Math.max(0, cameraShakeTimer - dt);
        if (wrongFlashTimer > 0) wrongFlashTimer = Math.max(0, wrongFlashTimer - dt);

        // Base cruise speed (~21.5 u/s = ~10.5s between 225u portals!)
        let targetSpeed = 21.5;
        if (wantThrottle) targetSpeed *= 1.12;
        if (wantBrake) targetSpeed *= 0.65;

        if (nitroTimer > 0) {
          targetSpeed = 21.5 * 1.45; // +45% Nitro Boost for 3.5s
        } else if (superTurboTimer > 0) {
          targetSpeed *= 1.45;
        } else if (miniTurboTimer > 0) {
          targetSpeed *= 1.25;
        }

        if (slowPenaltyTimer > 0) {
          targetSpeed = 21.5 * 0.45; // Smooth 0.45x slowdown for 2.5s (NO reset!)
        } else if (mudTimer > 0) {
          targetSpeed *= 0.58;
        }

        speed = THREE.MathUtils.damp(speed, targetSpeed, 5.0, dt);

        // DRIFT & MINI-TURBO SYSTEM
        if (wantDrift && speed > 13 && kartY <= 0.08 && slowPenaltyTimer <= 0) {
          if (!driftActive) {
            driftActive = true;
            driftDir = steerInput !== 0 ? steerInput : frame.curvature < 0 ? 1 : -1;
            driftCharge = 0;
          } else {
            driftCharge += dt;
            if (steerInput !== 0 && Math.sign(steerInput) === driftDir) {
              driftCharge += dt * 0.32;
            }
          }
        } else if (driftActive) {
          if (driftCharge >= 1.5) {
            superTurboTimer = 1.65;
            soundEngine.playTurboBoost();
            recordActivityForMissions(student.id, 'drift_mini_turbo', 1);
            activeToast = { text: 'SUPER MINI-TURBO! +45%', ok: true };
            toastTimer = 1.3;
          } else if (driftCharge >= 0.7) {
            miniTurboTimer = 1.2;
            soundEngine.playTurboBoost();
            recordActivityForMissions(student.id, 'drift_mini_turbo', 1);
            activeToast = { text: 'MINI-TURBO AZUL! +25%', ok: true };
            toastTimer = 1.1;
          }
          driftActive = false;
          driftDir = 0;
          driftCharge = 0;
        }

        // Lateral steering + centrifugal curve force + Curve Assist
        const curvePush = frame.curvature * speed * speed * 0.16;
        const assistFactor = curveAssistRef.current ? 0.16 : 1.0;
        const steerForce = driftActive ? 17.5 : 14.5;
        let targetLatVel = steerInput * steerForce - curvePush * assistFactor;

        if (driftActive) {
          targetLatVel += driftDir * 3.0;
        }
        if (curveAssistRef.current && steerInput === 0) {
          targetLatVel += -lateral * 1.45;
        }

        lateralVel = THREE.MathUtils.damp(lateralVel, targetLatVel, 8.5, dt);
        lateral = THREE.MathUtils.clamp(lateral + lateralVel * dt, -MAX_LATERAL, MAX_LATERAL);

        // Advance CONTINUOUSLY forward along the spline (store prevKartS for exact plane crossing)
        const prevKartS = kartS;
        kartS = Math.min(totalLength - 4, kartS + speed * dt);

        // Vertical jump physics
        if (kartY > 0 || kartVy > 0) {
          kartVy -= 26 * dt;
          kartY += kartVy * dt;
          if (kartY <= 0) {
            kartY = 0;
            kartVy = 0;
          }
        }

        // Check Jump Ramps & Boost Pads
        for (const pad of pads) {
          if (pad.cooldown > 0) pad.cooldown -= dt;
          if (
            pad.cooldown <= 0 &&
            Math.abs(kartS - pad.s) < 2.8 &&
            Math.abs(lateral - pad.lat) < pad.width
          ) {
            pad.cooldown = 2.5;
            if (pad.kind === 'ramp') {
              kartVy = 11.2;
              soundEngine.playJumpPad();
              particles.emitBurst(
                _worldKartPos.x,
                _worldKartPos.y + 0.4,
                _worldKartPos.z,
                12,
                0xfacc15,
                6.0,
                0.26,
                0.5
              );
            } else {
              miniTurboTimer = Math.max(miniTurboTimer, 1.5);
              soundEngine.playTurboBoost();
              particles.emitBurst(
                _worldKartPos.x,
                _worldKartPos.y + 0.4,
                _worldKartPos.z,
                10,
                0x22d3ee,
                5.5,
                0.24,
                0.45
              );
            }
          }
        }

        // Check Mud Puddles & Cones
        for (const hz of hazards) {
          if (hz.cooldown > 0) hz.cooldown -= dt;
          if (
            hz.cooldown <= 0 &&
            Math.abs(kartS - hz.s) < 2.2 &&
            Math.abs(lateral - hz.lat) < hz.radius &&
            kartY < 0.65
          ) {
            hz.cooldown = 3.0;
            mudTimer = 0.85;
            soundEngine.playSlowdownHit();
            activeToast = { text: 'Lama na pista! Desvie dos obstáculos!', ok: false };
            toastTimer = 1.2;
            particles.emitBurst(
              _worldKartPos.x,
              _worldKartPos.y + 0.4,
              _worldKartPos.z,
              8,
              0x5c3d28,
              4.2,
              0.24,
              0.4
            );
          }
        }

        // Exact Single-Fire Portal Crossing Plane Detection (prevKartS < gate.s && kartS >= gate.s)
        for (let gi = 0; gi < gates.length; gi++) {
          const g = gates[gi];
          if (!g.triggered && prevKartS < g.s && kartS >= g.s) {
            g.triggered = true;

            // Strict lateral lane mapping matching visual A (Left), B (Center), C (Right)
            const chosenLane: 0 | 1 | 2 =
              lateral < -HALF_LANE ? 0 : lateral > HALF_LANE ? 2 : 1;

            const isCorrect = chosenLane === g.question.correctIndex;
            recordAnsweredQuestion(student.id, g.question.prompt);
            logQuestionAttempt({
              studentId: student.id,
              school: student.school,
              grade: student.grade,
              worldId,
              gameMode: multiplayerSession ? 'kart_multiplayer' : 'vehicle_rally',
              bnccTopic: g.question.topic,
              isCorrect,
              responseTimeMs: Math.max(200, Math.round(performance.now() - gateShownAtMs)),
            });
            gateShownAtMs = performance.now();

            if (isCorrect) {
              correctCount++;
              streak++;
              nitroTimer = 3.5; // +45% Nitro Boost for 3.5s
              slowPenaltyTimer = 0;
              const xpGain = Math.round(30 * activeDiff.rewardMultiplier);
              const coinsGain = activeDiff.coinsPerQuestion;
              sessionXp += xpGain;
              sessionCoins += coinsGain;
              soundEngine.playCorrect();
              soundEngine.playTurboBoost();
              activeToast = {
                text: `NITRO +45%! +${coinsGain} Coins`,
                ok: true,
              };
              toastTimer = 1.8;
              particles.emitBurst(
                _worldKartPos.x,
                _worldKartPos.y + 1.1,
                _worldKartPos.z,
                18,
                0x22c55e,
                6.5,
                0.26,
                0.55
              );
              onProgressRef.current({
                xpGain,
                coinsGain,
                answeredDelta: 1,
                correctDelta: 1,
                streak,
              });
            } else {
              // NO RESET & NO LOCKUP: Smooth 0.45x slowdown (2.5s) + mild shake + red flash + 1.8s toast
              streak = 0;
              nitroTimer = 0;
              slowPenaltyTimer = 2.5;
              cameraShakeTimer = 0.45;
              wrongFlashTimer = 0.65;
              soundEngine.playSlowdownHit();
              const letter = laneLetters[g.question.correctIndex];
              activeToast = {
                text: `Resposta certa: ${letter} (${g.question.options[g.question.correctIndex]})`,
                ok: false,
              };
              toastTimer = 1.8;
              onProgressRef.current({
                xpGain: 0,
                coinsGain: 0,
                answeredDelta: 1,
                correctDelta: 0,
                streak: 0,
              });
            }

            // Fade passed gate curtains & guide strips
            g.curtains.forEach((m) => {
              const mat = m.material as THREE.MeshBasicMaterial;
              mat.opacity = 0.03;
            });
            g.guideStrips.forEach((m) => {
              const mat = m.material as THREE.MeshBasicMaterial;
              mat.opacity = 0.02;
            });

            // IMMEDIATELY advance to next question so student has 9–12s to think!
            currentGateIdx = Math.min(gates.length, gi + 1);
            forceHudSync = true;
          }
        }

        // Check Finish Line at Praia de Ajuruteua
        if (kartS >= finishS) {
          finished = true;
          myFinishTime = elapsed;
          driftActive = false;
          let podiumBonus = 0;
          if (multiplayerSession) {
            const racersAhead = Array.from(mpPeers.values()).filter(
              (p) => p.state.finished && (p.state.finishTime ?? 9999) < elapsed
            ).length;
            const place = racersAhead + 1;
            podiumBonus = place === 1 ? 80 : place === 2 ? 50 : place === 3 ? 30 : 20;
            mpBonusAwarded = podiumBonus;
            mpChannel?.send({
              id: student.id,
              name: student.name,
              grade: student.grade,
              avatarColor: student.avatarColor,
              equippedHat: student.equippedHat,
              equippedJersey: student.equippedJersey ?? null,
              s: finishS,
              lateral,
              y: kartY,
              speed: 0,
              rotY: kartRig.root.rotation.y,
              finished: true,
              finishTime: myFinishTime ?? null,
              updatedAt: Date.now(),
            });
          }
          const bonusXp = Math.round(80 * activeDiff.rewardMultiplier);
          const bonusCoins = activeDiff.completionBonusCoins + podiumBonus;
          sessionXp += bonusXp;
          sessionCoins += bonusCoins;
          soundEngine.playVictory();
          onProgressRef.current({
            xpGain: bonusXp,
            coinsGain: bonusCoins,
            answeredDelta: 0,
            correctDelta: 0,
            streak,
          });
          forceHudSync = true;
        }
      } else if (finished) {
        speed = THREE.MathUtils.damp(speed, 0, 3.0, dt);
        kartS = Math.min(totalLength - 4, kartS + speed * dt);
      }

      // Compute current lane alignment (0=A Left, 1=B Center, 2=C Right) & highlight upcoming gate!
      const alignedLane: 0 | 1 | 2 =
        lateral < -HALF_LANE ? 0 : lateral > HALF_LANE ? 2 : 1;

      if (currentGateIdx < gates.length && !finished) {
        const nextG = gates[currentGateIdx];
        const pulse = 0.55 + Math.sin(tSec * 9) * 0.25;
        for (let lane = 0; lane < 3; lane++) {
          const isAligned = lane === alignedLane;
          const bMat = nextG.beacons[lane].material as THREE.MeshStandardMaterial;
          const sMat = nextG.guideStrips[lane].material as THREE.MeshBasicMaterial;
          const cMat = nextG.curtains[lane].material as THREE.MeshBasicMaterial;

          if (isAligned) {
            bMat.emissive.setHex(0xffffff);
            bMat.emissiveIntensity = 0.85 + pulse * 0.4;
            nextG.beacons[lane].scale.set(1.06, 1.35, 1.15);
            sMat.color.setHex(0xfef08a);
            sMat.opacity = 0.48 + pulse * 0.22;
            cMat.opacity = 0.34;
          } else {
            bMat.emissive.setHex(laneColorsHex[lane]);
            bMat.emissiveIntensity = 0.25;
            nextG.beacons[lane].scale.set(1, 1, 1);
            sMat.color.setHex(laneColorsHex[lane]);
            sMat.opacity = 0.12;
            cMat.opacity = 0.14;
          }
        }
      }

      // Compute Kart World Position & Accurate Bridge Pitch Orientation on Spline
      const finalFrame = sampleSplineAtS(kartS, _pt, _tan, _right);
      _worldKartPos.set(
        _pt.x + _right.x * lateral,
        _pt.y + kartY + 0.05,
        _pt.z + _right.z * lateral
      );
      kartRig.root.position.copy(_worldKartPos);

      const driftYawOffset = driftActive ? -driftDir * 0.3 : 0;
      const steerYawOffset = -steerInput * 0.1;
      const targetPitch = kartY > 0.1 ? THREE.MathUtils.clamp(kartVy * 0.03, -0.22, 0.24) : Math.asin(THREE.MathUtils.clamp(_tan.y, -0.45, 0.45));
      kartPitch = THREE.MathUtils.damp(kartPitch, targetPitch, 11.0, dt);
      kartRig.root.rotation.set(kartPitch, finalFrame.yaw + driftYawOffset + steerYawOffset, 0);

      // Keep golden sun positioned majestically ahead on the upper sky horizon
      sunGroup.position.set(_worldKartPos.x + 85, 118, _worldKartPos.z - 220);

      // Pooled Drift Sparks & Nitro Exhaust Flames (Zero GC)
      sparkTick += dt;
      if (raceStarted && !finished && sparkTick >= 0.032) {
        sparkTick = 0;
        if (driftActive) {
          const sparkCol =
            driftCharge >= 1.5 ? 0xf97316 : driftCharge >= 0.7 ? 0x38bdf8 : 0xfef08a;
          for (const side of [-0.7, 0.7]) {
            particles.emit(
              _worldKartPos.x + _right.x * side - _tan.x * 1.1,
              _worldKartPos.y + 0.22,
              _worldKartPos.z + _right.z * side - _tan.z * 1.1,
              (Math.random() - 0.5) * 3.0 - _tan.x * 4,
              1.6 + Math.random() * 2.2,
              (Math.random() - 0.5) * 3.0 - _tan.z * 4,
              sparkCol,
              driftCharge >= 1.5 ? 0.24 : 0.18,
              0.32,
              9.0
            );
          }
        }
        if (nitroTimer > 0 || superTurboTimer > 0 || miniTurboTimer > 0) {
          const flameCol =
            nitroTimer > 0
              ? Math.random() > 0.45
                ? 0x38bdf8
                : 0xf97316
              : superTurboTimer > 0
                ? 0xa855f7
                : 0x38bdf8;
          particles.emit(
            _worldKartPos.x - _tan.x * 1.45,
            _worldKartPos.y + 0.42,
            _worldKartPos.z - _tan.z * 1.45,
            -_tan.x * 8 + (Math.random() - 0.5) * 1.6,
            0.5 + Math.random() * 0.7,
            -_tan.z * 8 + (Math.random() - 0.5) * 1.6,
            flameCol,
            0.28,
            0.25,
            2.0
          );
        }
      }

      // Animate Kart wheels, steering & exhaust flames
      animateKartRig(
        kartRig,
        speed,
        steerInput,
        nitroTimer > 0 || superTurboTimer > 0 || miniTurboTimer > 0,
        0,
        tSec,
        dt
      );

      // Multiplayer 15 Hz Broadcast + 60 FPS Peer Kart Interpolation
      if (mpChannel) {
        mpBroadcastTick += dt;
        if (mpBroadcastTick >= 0.066) {
          mpBroadcastTick = 0;
          mpChannel.send({
            id: student.id,
            name: student.name,
            grade: student.grade,
            avatarColor: student.avatarColor,
            equippedHat: student.equippedHat,
            equippedJersey: student.equippedJersey ?? null,
            s: kartS,
            lateral,
            y: kartY,
            speed,
            rotY: kartRig.root.rotation.y,
            finished,
            finishTime: myFinishTime ?? null,
            updatedAt: Date.now(),
          });
        }

        const nowMs = performance.now();
        const lerpAlpha = Math.min(1, dt * 12);
        for (const [peerId, entry] of mpPeers.entries()) {
          if (nowMs - entry.lastSeen > 12000 && !entry.state.finished) {
            scene.remove(entry.rig.root);
            mpPeers.delete(peerId);
            continue;
          }
          entry.curS = THREE.MathUtils.lerp(entry.curS, entry.state.s, lerpAlpha);
          entry.curLat = THREE.MathUtils.lerp(entry.curLat, entry.state.lateral, lerpAlpha);
          entry.curY = THREE.MathUtils.lerp(entry.curY, entry.state.y, lerpAlpha);
          const pFrame = sampleSplineAtS(
            THREE.MathUtils.clamp(entry.curS, 0, totalLength - 2),
            peerPt,
            peerTan,
            peerRight
          );
          entry.rig.root.position.set(
            peerPt.x + peerRight.x * entry.curLat,
            peerPt.y + entry.curY + 0.05,
            peerPt.z + peerRight.z * entry.curLat
          );
          const targetYaw = entry.state.rotY || pFrame.yaw;
          let yawDiff = targetYaw - entry.curYaw;
          while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
          while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
          entry.curYaw += yawDiff * lerpAlpha;
          entry.rig.root.rotation.set(0, entry.curYaw, 0);
          animateKartRig(entry.rig, entry.state.speed, 0, entry.state.speed > 44, 0, tSec, dt);
        }
      }

      // Update pooled particles & dynamic shadow frustum
      particles.update(dt);
      envRig.updateShadowTarget(_worldKartPos.x, _worldKartPos.y, _worldKartPos.z);

      // Smooth Third-Person Chase Camera aligned to spline tangent & elevated bridge crest
      sampleSplineAtS(Math.min(totalLength - 1, kartS + 16), _ptAhead, _tanAhead, _right);
      const camDist = nitroTimer > 0 || superTurboTimer > 0 ? 9.5 : 8.4;
      const shakeX = cameraShakeTimer > 0 ? (Math.random() - 0.5) * 0.48 * (cameraShakeTimer / 0.45) : 0;
      const shakeY = cameraShakeTimer > 0 ? (Math.random() - 0.5) * 0.35 * (cameraShakeTimer / 0.45) : 0;

      _camPos.set(
        _worldKartPos.x - _tan.x * camDist + shakeX,
        _worldKartPos.y + 4.45 - _tan.y * 1.4 + shakeY,
        _worldKartPos.z - _tan.z * camDist
      );
      camera.position.lerp(_camPos, Math.min(1, dt * 9.0));
      _camLook.set(
        _ptAhead.x + _right.x * (lateral * 0.45),
        THREE.MathUtils.lerp(_worldKartPos.y, _ptAhead.y, 0.65) + 1.5,
        _ptAhead.z + _right.z * (lateral * 0.45)
      );
      camera.lookAt(_camLook);

      if (toastTimer > 0) {
        toastTimer = Math.max(0, toastTimer - dt);
        if (toastTimer === 0) activeToast = null;
      }

      // Throttled HUD sync (~12 Hz, or immediate on portal cross)
      hudTick += dt;
      if (forceHudSync || hudTick >= 0.085 || finished) {
        hudTick = 0;
        const driftTier: 0 | 1 | 2 = !driftActive
          ? 0
          : driftCharge >= 1.5
            ? 2
            : driftCharge >= 0.7
              ? 1
              : 0;
        const stateBadge =
          slowPenaltyTimer > 0
            ? 'slow'
            : mudTimer > 0
              ? 'mud'
              : nitroTimer > 0
                ? 'nitro'
                : superTurboTimer > 0
                  ? 'super_turbo'
                  : miniTurboTimer > 0
                    ? 'mini_turbo'
                    : 'normal';

        const nextQ =
          gates[Math.min(currentGateIdx, gates.length - 1)]?.question || activeQuestions[0];
        const medal: 'ouro' | 'prata' | 'bronze' =
          correctCount >= 7 ? 'ouro' : correctCount >= 5 ? 'prata' : 'bronze';

        // Compute live multiplayer standings if racing online
        const standings = [
          {
            id: student.id,
            name: student.name,
            grade: student.grade,
            s: kartS,
            finished,
            finishTime: myFinishTime ?? null,
            isMe: true,
          },
          ...Array.from(mpPeers.values()).map((p) => ({
            id: p.state.id,
            name: p.state.name,
            grade: p.state.grade,
            s: p.curS,
            finished: p.state.finished,
            finishTime: p.state.finishTime,
            isMe: false,
          })),
        ].sort((a, b) => {
          if (a.finished && b.finished) {
            return (a.finishTime ?? 9999) - (b.finishTime ?? 9999);
          }
          if (a.finished) return -1;
          if (b.finished) return 1;
          return b.s - a.s;
        });
        const myRankIdx = standings.findIndex((r) => r.isMe);

        setHud({
          gateIndex: Math.min(currentGateIdx, TOTAL_GATES),
          elapsed,
          speedKmh: Math.round(speed * 3.1),
          distanceLeft: Math.max(0, Math.round(finishS - kartS)),
          activeLane: alignedLane,
          stateBadge,
          driftTier,
          wrongFlash: wrongFlashTimer > 0,
          countdown: raceStarted
            ? null
            : countdownTimer > 0.3
              ? String(Math.ceil(countdownTimer))
              : 'VAI!',
          question: nextQ,
          sessionXp,
          sessionCoins,
          correctCount,
          toast: activeToast,
          finished,
          medal,
          mpRank: myRankIdx >= 0 ? myRankIdx + 1 : 1,
          mpTotal: standings.length,
          mpBonusCoins: mpBonusAwarded,
          mpStandings: standings,
        });
      }

      renderer.render(scene, camera);
      afterDraw(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
      mpChannel?.disconnect();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
      disposeSceneResources(scene, renderer, envRig.envTexture);
    };
  }, [
    student.id,
    student.avatarColor,
    student.equippedHat,
    student.equippedJersey,
    worldId,
    difficulty,
    multiplayerSession?.channelName,
    runKey,
    graphicsQuality,
  ]);

  const handleRestart = () => {
    setRunKey((k) => k + 1);
  };

  return (
    <div className="fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-sky-900 select-none">
      {/* 3D WebGL Canvas */}
      <div ref={mountRef} className="h-full w-full" />

      {/* Subtle Red Border Flash on Wrong Portal (No Reset) */}
      {hud.wrongFlash && (
        <div className="pointer-events-none fixed inset-0 z-30 ring-inset ring-8 ring-rose-500/85 bg-rose-500/15 transition-opacity" />
      )}

      {/* ULTRA-THIN TRANSLUCENT TOP HUD BAR (<= 15% mobile height) */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-20 flex flex-col gap-1.5 px-2.5 pt-2 sm:px-4 sm:pt-3">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-900/60 px-2.5 py-1.5 backdrop-blur-sm shadow-lg">
          {/* Left: Portal Counter + Live Multiplayer Rank */}
          <div className="flex items-center gap-2 text-xs sm:text-sm font-extrabold text-white whitespace-nowrap tabular-nums">
            {multiplayerSession && (
              <span className="rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 px-2 py-0.5 font-display text-xs font-black text-slate-950 shadow">
                {hud.mpRank}º/{hud.mpTotal}
              </span>
            )}
            <span className="font-display">
              Portal {Math.min(hud.gateIndex + 1, TOTAL_GATES)}/{TOTAL_GATES}
            </span>
            <span className="hidden md:inline text-slate-400 font-normal">·</span>
            <span className="hidden md:inline text-xs font-semibold text-yellow-300">
              {world.grade}
            </span>
          </div>

          {/* Center: Speedometer + Desktop Distance/Timer */}
          <div className="flex items-center gap-2.5 text-xs font-mono font-bold tabular-nums">
            <span
              className={`flex items-center gap-1 ${
                hud.stateBadge === 'nitro' || hud.stateBadge === 'super_turbo'
                  ? 'text-cyan-300'
                  : hud.stateBadge === 'slow'
                    ? 'text-rose-300'
                    : 'text-sky-300'
              }`}
            >
              <Gauge className="h-3.5 w-3.5" />
              {hud.speedKmh} km/h
            </span>
            <span className="hidden sm:inline text-emerald-300">{hud.distanceLeft}m</span>
            <span className="hidden md:flex items-center gap-1 text-slate-200">
              <Timer className="h-3.5 w-3.5 text-sky-400" />
              {hud.elapsed.toFixed(1)}s
            </span>
            <span className="hidden md:flex items-center gap-1 text-amber-300">
              <Coins className="h-3.5 w-3.5" />+{hud.sessionCoins}
            </span>
          </div>

          {/* Right: Single Hamburger Menu Button */}
          <div className="pointer-events-auto relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg border border-white/15 bg-slate-950/65 text-white hover:bg-slate-800 active:scale-95 transition-transform"
              aria-label="Abrir menu do rali"
            >
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-10 z-50 flex w-52 flex-col gap-1 rounded-2xl border border-white/15 bg-slate-950/95 p-2 shadow-2xl backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setCurveAssist((v) => !v)}
                  className={`flex min-h-[40px] items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold transition-colors ${
                    curveAssist
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    Assist. Curva
                  </span>
                  <span className="font-mono text-[11px]">{curveAssist ? 'ON' : 'OFF'}</span>
                </button>
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

        {/* Compact Semi-Transparent Question Card with Live Lane Alignment Highlight */}
        {!hud.finished && hud.question && (
          <div className="mx-auto w-full max-w-xl rounded-xl border border-yellow-400/45 bg-slate-950/70 px-3 py-1.5 backdrop-blur-sm text-center shadow-lg">
            <p className="font-display text-xs sm:text-base font-extrabold text-white leading-tight line-clamp-2">
              {hud.question.prompt}
            </p>
            <div className="mt-1 grid grid-cols-3 gap-1.5 text-[11px] sm:text-xs font-mono font-extrabold">
              {(['A', 'B', 'C'] as const).map((letter, idx) => {
                const isAligned = hud.activeLane === idx;
                const baseCls =
                  idx === 0
                    ? 'bg-blue-600/85 text-white'
                    : idx === 1
                      ? 'bg-amber-400/90 text-slate-950'
                      : 'bg-purple-600/85 text-white';
                return (
                  <div
                    key={letter}
                    className={`rounded-lg px-1.5 py-0.5 truncate transition-all ${baseCls} ${
                      isAligned ? 'ring-2 ring-white scale-[1.03] shadow-md' : 'opacity-80'
                    }`}
                  >
                    {isAligned ? '▸ ' : ''}
                    {letter}: {hud.question.options[idx]}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Compact Drift Charge / Portal Feedback Toast */}
        <div className="flex flex-col items-center gap-1">
          {hud.driftTier > 0 && !hud.finished && (
            <div
              className={`rounded-lg px-3 py-0.5 text-[11px] font-extrabold shadow-lg ${
                hud.driftTier === 2
                  ? 'bg-gradient-to-r from-orange-500 to-purple-600 text-white'
                  : 'bg-sky-400 text-slate-950'
              }`}
            >
              {hud.driftTier === 2
                ? 'SUPER DRIFT! SOLTE (+45%)'
                : 'DRIFT AZUL! SOLTE (+25%)'}
            </div>
          )}

          {hud.toast && !hud.finished && (
            <div
              className={`rounded-lg border px-3 py-1 text-xs font-extrabold shadow-lg ${
                hud.toast.ok
                  ? 'border-emerald-400 bg-emerald-950/90 text-emerald-200'
                  : 'border-rose-400 bg-rose-950/90 text-rose-200'
              }`}
            >
              {hud.toast.text}
            </div>
          )}
        </div>
      </div>

      {/* COUNTDOWN 3 - 2 - 1 - VAI! */}
      {hud.countdown && !hud.finished && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center">
          <div className="rounded-3xl border-4 border-yellow-400 bg-slate-950/85 px-9 py-5 text-center shadow-2xl">
            <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-300">
              PA-458 · MANGUEZAL → AJURUTEUA
            </p>
            <p className="mt-1 font-display text-6xl sm:text-7xl font-black text-yellow-300">
              {hud.countdown}
            </p>
          </div>
        </div>
      )}

      {/* KART TOUCH CONTROLS IN MANDATORY ELEVATED BOTTOM SAFE ZONE (>= 110px + safe-area) */}
      {!hud.finished && (
        <>
          {/* Left: Steering Buttons */}
          <div className="pointer-events-auto fixed left-[18px] bottom-[calc(112px+env(safe-area-inset-bottom))] z-[60] flex items-center gap-3">
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                touchControlRef.current.steer = -1;
              }}
              onPointerUp={() => {
                if (touchControlRef.current.steer === -1) touchControlRef.current.steer = 0;
              }}
              onPointerLeave={() => {
                if (touchControlRef.current.steer === -1) touchControlRef.current.steer = 0;
              }}
              onPointerCancel={() => {
                touchControlRef.current.steer = 0;
              }}
              className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-white/30 bg-slate-950/70 text-2xl font-black text-white shadow-xl backdrop-blur-sm active:scale-95 active:bg-sky-500 active:text-slate-950 touch-none"
              aria-label="Virar à esquerda"
            >
              ◀
            </button>
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                touchControlRef.current.steer = 1;
              }}
              onPointerUp={() => {
                if (touchControlRef.current.steer === 1) touchControlRef.current.steer = 0;
              }}
              onPointerLeave={() => {
                if (touchControlRef.current.steer === 1) touchControlRef.current.steer = 0;
              }}
              onPointerCancel={() => {
                touchControlRef.current.steer = 0;
              }}
              className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-white/30 bg-slate-950/70 text-2xl font-black text-white shadow-xl backdrop-blur-sm active:scale-95 active:bg-sky-500 active:text-slate-950 touch-none"
              aria-label="Virar à direita"
            >
              ▶
            </button>
          </div>

          {/* Right: Spaced ACELERAR / DRIFT / FREAR Controls in Safe Zone */}
          <div className="pointer-events-auto fixed right-[18px] bottom-[calc(112px+env(safe-area-inset-bottom))] z-[60] flex items-end gap-2.5">
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  touchControlRef.current.throttle = true;
                }}
                onPointerUp={() => {
                  touchControlRef.current.throttle = false;
                }}
                onPointerLeave={() => {
                  touchControlRef.current.throttle = false;
                }}
                onPointerCancel={() => {
                  touchControlRef.current.throttle = false;
                }}
                className="flex h-12 w-[78px] items-center justify-center rounded-xl border-2 border-emerald-300/75 bg-emerald-500/85 font-display text-[11px] font-black text-slate-950 shadow-lg active:scale-95 touch-none"
                aria-label="Acelerar"
              >
                ACELERAR
              </button>
              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  touchControlRef.current.brake = true;
                }}
                onPointerUp={() => {
                  touchControlRef.current.brake = false;
                }}
                onPointerLeave={() => {
                  touchControlRef.current.brake = false;
                }}
                onPointerCancel={() => {
                  touchControlRef.current.brake = false;
                }}
                className="flex h-10 w-[78px] items-center justify-center rounded-xl border border-rose-300/60 bg-slate-950/75 font-display text-[11px] font-extrabold text-rose-300 shadow-lg active:scale-95 touch-none"
                aria-label="Frear"
              >
                FREAR
              </button>
            </div>

            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                touchControlRef.current.drift = true;
              }}
              onPointerUp={() => {
                touchControlRef.current.drift = false;
              }}
              onPointerLeave={() => {
                touchControlRef.current.drift = false;
              }}
              onPointerCancel={() => {
                touchControlRef.current.drift = false;
              }}
              className={`flex h-[72px] w-[72px] flex-col items-center justify-center rounded-full border-4 font-display text-[11px] font-black shadow-2xl transition-transform active:scale-90 touch-none ${
                hud.driftTier === 2
                  ? 'border-orange-200 bg-gradient-to-br from-orange-500 to-purple-600 text-white'
                  : hud.driftTier === 1
                    ? 'border-sky-200 bg-sky-500 text-slate-950'
                    : 'border-amber-200/90 bg-amber-400 text-slate-950'
              }`}
              aria-label="Drift"
            >
              {hud.driftTier === 2 ? (
                <Flame className="h-5 w-5" />
              ) : hud.driftTier === 1 ? (
                <Zap className="h-5 w-5" />
              ) : (
                <Sparkles className="h-5 w-5" />
              )}
              <span className="mt-0.5 leading-none">DRIFT</span>
            </button>
          </div>
        </>
      )}

      {/* Audio & Graphics Settings Modal */}
      <AudioSettingsModal isOpen={audioOpen} onClose={() => setAudioOpen(false)} />

      {/* VICTORY MODAL AT PRAIA DE AJURUTEUA */}
      {hud.finished && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-md rounded-3xl border-2 border-yellow-400 bg-slate-900 p-6 text-center text-white shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-yellow-400/20 text-yellow-300">
              <Medal className="h-10 w-10" />
            </div>
            <p className="mt-3 text-xs font-extrabold uppercase tracking-wider text-sky-400">
              CHEGADA NA PRAIA DE AJURUTEUA · BRAGANÇA-PA
            </p>
            <h2 className="mt-1 font-display text-2xl font-black text-white">
              {multiplayerSession
                ? `${hud.mpRank}º Lugar no Rali Multiplayer!`
                : 'Rali de Kart Concluído!'}
            </h2>
            <p className="mt-1 text-xs text-slate-300">
              Medalha de <strong className="uppercase text-yellow-300">{hud.medal}</strong> ·{' '}
              {hud.correctCount}/{TOTAL_GATES} portais acertados em {hud.elapsed.toFixed(1)}s
              {multiplayerSession && hud.mpBonusCoins > 0
                ? ` · Bônus Pódio +${hud.mpBonusCoins} Coins`
                : ''}
            </p>

            {multiplayerSession && hud.mpStandings.length > 0 && (
              <div className="mt-3 space-y-1 rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-2.5 text-left">
                <p className="text-[10px] font-black uppercase tracking-wider text-cyan-300">
                  Pódio Online PA-458
                </p>
                {hud.mpStandings.slice(0, 6).map((racer, idx) => (
                  <div
                    key={racer.id}
                    className={`flex items-center justify-between rounded-xl px-2.5 py-1 text-xs font-bold ${
                      racer.isMe
                        ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/40'
                        : 'text-slate-300'
                    }`}
                  >
                    <span className="truncate">
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}º`}{' '}
                      {racer.name} ({racer.grade})
                    </span>
                    <span className="ml-2 shrink-0 font-mono text-[11px] text-amber-300">
                      {racer.finished
                        ? `${(racer.finishTime ?? hud.elapsed).toFixed(1)}s`
                        : `${Math.max(0, Math.round(1980 - racer.s))}m`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                <p className="text-[11px] text-slate-400">XP Ganho</p>
                <p className="font-mono text-xl font-extrabold text-emerald-400 tabular-nums">
                  +{hud.sessionXp} XP
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                <p className="text-[11px] text-slate-400">BloxCoins</p>
                <p className="font-mono text-xl font-extrabold text-amber-400 tabular-nums">
                  +{hud.sessionCoins} C
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={handleRestart}
                className="flex flex-1 min-h-[46px] items-center justify-center gap-2 rounded-2xl bg-yellow-400 px-4 py-2.5 font-display text-xs font-extrabold text-slate-950 hover:bg-yellow-300"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Correr Novamente</span>
              </button>
              <button
                type="button"
                onClick={onExit}
                className="flex flex-1 min-h-[46px] items-center justify-center rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2.5 font-display text-xs font-extrabold text-white hover:bg-slate-700"
              >
                Voltar à Praça
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
