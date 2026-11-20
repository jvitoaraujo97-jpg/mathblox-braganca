import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Camera,
  Car,
  Coins,
  DoorOpen,
  Flame,
  Footprints,
  Gamepad2,
  LogOut,
  Maximize2,
  Menu,
  MessageSquare,
  Minimize2,
  ShoppingBag,
  Sliders,
  Smile,
  Swords,
  Target,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { AudioSettingsModal } from '../components/AudioSettingsModal';
import { MobileControls, MobileInputState } from '../components/MobileControls';
import {
  countClaimableDailyMissions,
  subscribeDailyMissions,
} from '../data/missionsAndTitles';
import { animateAvatarRig, AvatarRig, createAvatarRig } from '../game/avatarBuilder';
import { PlazaPresenceManager } from '../services/presenceService';
import {
  AvatarEmote,
  GameModeType,
  MovementStyle,
  OnlinePlayerPresence,
  StudentProfile,
} from '../types/game';
import { buildCosmeticRig } from './cosmeticBuilder';
import {
  createPbrRenderer,
  disposeSceneResources,
  getGraphicsQuality,
  GraphicsQuality,
  isSoftwareGl,
  setupTropicalEnvironment,
  subscribeGraphicsQuality,
} from './graphicsEngine';
import { getJerseyConfig } from './jerseyBuilder';
import { createTiledPbrTextures } from './textureFactory';
import { animateKartRig, createKartRig, KartRig, VehicleModelStyle } from './vehicleBuilder';

type PlazaCameraMode = 'angular' | 'aerial' | 'action';

const CAMERA_MODE_LABELS: Record<PlazaCameraMode, string> = {
  angular: 'Angular',
  aerial: 'Aérea',
  action: 'Ação',
};

interface NearbyPortalInfo {
  id:
    | 'obby'
    | 'survival'
    | 'turbo_race'
    | 'vehicle_rally'
    | 'multiplayer'
    | 'penalty'
    | 'caete_boat'
    | 'shop';
  title: string;
  subtitle: string;
  colorHex: string;
}

interface SocialPlaza3DProps {
  student: StudentProfile;
  allStudents: StudentProfile[];
  onEnterGameMode: (mode: GameModeType) => void;
  onOpenModes: () => void;
  onOpenShop: () => void;
  onOpenRanking: () => void;
  onOpenMultiplayer: () => void;
  onOpenMissions: () => void;
  onLogout: () => void;
  onUpdateStudent: (updated: StudentProfile) => void;
}

interface PlazaCollider {
  x: number;
  y: number; // center Y
  z: number;
  w: number;
  h: number;
  d: number;
  blockPlayer: boolean;
}

interface PlacedPropRecord {
  x: number;
  z: number;
  radius: number;
}

interface PlazaVehicleDef {
  id: string;
  name: string;
  style: VehicleModelStyle;
  primaryHex: string;
  secondaryHex: string;
  spawnX: number;
  spawnZ: number;
  spawnRotY: number;
}

const PLAZA_VEHICLES: PlazaVehicleDef[] = [
  {
    id: 'veh_sport_blue',
    name: 'Kart Esportivo Azul',
    style: 'sport_kart',
    primaryHex: '#0284c7',
    secondaryHex: '#38bdf8',
    spawnX: -12.0,
    spawnZ: 34.5,
    spawnRotY: Math.PI / 2,
  },
  {
    id: 'veh_buggy_orange',
    name: 'Buggy Praiano Laranja',
    style: 'beach_buggy',
    primaryHex: '#f97316',
    secondaryHex: '#facc15',
    spawnX: 12.0,
    spawnZ: 34.5,
    spawnRotY: -Math.PI / 2,
  },
  {
    id: 'veh_jeep_green',
    name: 'Mini-Jeep Urbano Verde',
    style: 'urban_jeep',
    primaryHex: '#16a34a',
    secondaryHex: '#4ade80',
    spawnX: 34.5,
    spawnZ: 12.0,
    spawnRotY: 0,
  },
  {
    id: 'veh_turbo_red',
    name: 'Kart Turbo Vermelho',
    style: 'turbo_kart',
    primaryHex: '#dc2626',
    secondaryHex: '#facc15',
    spawnX: -34.5,
    spawnZ: 12.0,
    spawnRotY: 0,
  },
];

const DAILY_AURA_COINS_KEY = 'mathblox_daily_aura_coins_v6';
const DAILY_AURA_MAX_COINS = 100;

function getDailyFarmedCoins(studentId: string): number {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const raw = localStorage.getItem(`${DAILY_AURA_COINS_KEY}_${studentId}_${today}`);
    return raw ? Math.min(DAILY_AURA_MAX_COINS, parseInt(raw, 10) || 0) : 0;
  } catch {
    return 0;
  }
}

function addDailyFarmedCoins(studentId: string, delta: number): number {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const current = getDailyFarmedCoins(studentId);
    const next = Math.min(DAILY_AURA_MAX_COINS, current + delta);
    localStorage.setItem(`${DAILY_AURA_COINS_KEY}_${studentId}_${today}`, String(next));
    return next - current;
  } catch {
    return delta;
  }
}

const EMOTE_BUTTONS: { id: NonNullable<AvatarEmote>; label: string }[] = [
  { id: 'wave', label: '👋 Acenar' },
  { id: 'salute', label: '🫡 Continência' },
  { id: 'goal', label: '⚽ Comemorar Gol' },
  { id: 'dance', label: '🕺 Dançar' },
  { id: 'trophy', label: '🏆 Troféu' },
];

const MOVEMENT_STYLE_OPTIONS: { id: MovementStyle; label: string }[] = [
  { id: 'classic', label: '🚶 Clássico' },
  { id: 'ninja', label: '🥷 Ninja' },
  { id: 'levitate', label: '🛸 Flutuar' },
  { id: 'champion', label: '👑 Campeão' },
];

// 5.1. Lista atualizada de Frases Rápidas na Praça Online (v10.0)
const QUICK_CHAT_PHRASES = [
  'Obrigado, meu prefeito! 🫡🏛️',
  'Fá! 🎺💥',
  'Feijão com farinha! 🍽️🔥',
  'Six seven! 🤷♂️6️⃣7️⃣',
  'Aura +1000! ⚡😎',
  'Tô farmando aura! 🌀',
  'Absolute Cinema! 🙌🎬',
  'Bora pra Praia de Ajuruteua! 🏖️',
  'GG! Mandou bem demais! 👏',
];

const CLASSMATE_JERSEYS = [
  'bragantino_pa',
  'remo',
  'paysandu',
  'flamengo',
  'corinthians',
  'palmeiras',
  'sao_paulo',
  'vasco',
];

function getAuraLevel(auraPower = 0): number {
  return Math.max(1, Math.floor(auraPower / 10) + 1);
}

function createBillboardTexture(
  name: string,
  grade: string,
  school: string,
  auraPower = 0,
  isFarming = false,
  equippedTitle?: string | null
): THREE.CanvasTexture {
  const hasTitle = Boolean(equippedTitle && equippedTitle.trim());
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = hasTitle ? 186 : 156;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = isFarming ? 'rgba(8, 47, 73, 0.94)' : 'rgba(15, 23, 42, 0.90)';
  ctx.beginPath();
  ctx.roundRect(8, 8, 496, canvas.height - 16, 24);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = isFarming ? '#00f5d4' : hasTitle ? '#facc15' : '#38bdf8';
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 31px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(name.slice(0, 22), 256, 46);

  if (hasTitle) {
    ctx.fillStyle = '#fde047';
    ctx.font = '800 21px sans-serif';
    ctx.fillText(equippedTitle!.slice(0, 30), 256, 78);
  }

  const gradeY = hasTitle ? 112 : 82;
  const auraY = hasTitle ? 150 : 122;

  ctx.fillStyle = '#7dd3fc';
  ctx.font = '700 20px sans-serif';
  ctx.fillText(`${grade} • ${school}`.slice(0, 34), 256, gradeY);

  const auraLv = getAuraLevel(auraPower);
  ctx.fillStyle = isFarming ? '#fde047' : '#34d399';
  ctx.font = '900 22px sans-serif';
  ctx.fillText(
    isFarming
      ? `⚡ FARMANDO AURA • Nv. ${auraLv} (${auraPower} pts)`
      : `⚡ Aura Nv. ${auraLv} • ${auraPower} pts`,
    256,
    auraY
  );

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSpeechBubbleTexture(message: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 140;
  const ctx = canvas.getContext('2d')!;

  const isFaMeme = message.includes('Fá!');
  ctx.fillStyle = isFaMeme ? '#fef08a' : '#ffffff';
  ctx.beginPath();
  ctx.roundRect(12, 10, 488, 96, 26);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = isFaMeme ? '#dc2626' : '#0f172a';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(238, 106);
  ctx.lineTo(256, 134);
  ctx.lineTo(274, 106);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = isFaMeme ? '#991b1b' : '#0f172a';
  ctx.font = isFaMeme ? '900 32px sans-serif' : '800 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(message.slice(0, 36), 256, 66);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createPortalSignTexture(
  title: string,
  subtitle: string,
  hexColor: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  // Fundo sólido escuro #0F172A de alto contraste
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, 512, 192);

  // Brilho suave de fundo no topo com a cor do portal
  const glowGrad = ctx.createLinearGradient(0, 0, 0, 192);
  glowGrad.addColorStop(0, `${hexColor}26`);
  glowGrad.addColorStop(0.55, 'rgba(15, 23, 42, 0)');
  glowGrad.addColorStop(1, `${hexColor}1f`);
  ctx.fillStyle = glowGrad;
  ctx.fillRect(10, 10, 492, 172);

  // Borda externa luminosa na cor do portal + filete interno branco
  ctx.save();
  ctx.shadowColor = hexColor;
  ctx.shadowBlur = 14;
  ctx.lineWidth = 10;
  ctx.strokeStyle = hexColor;
  ctx.strokeRect(8, 8, 496, 176);
  ctx.restore();

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.strokeRect(18, 18, 476, 156);

  // Título grande em negrito branco de altíssimo contraste (ícone + nome do modo)
  let fontSize = 40;
  ctx.font = `900 ${fontSize}px sans-serif`;
  while (ctx.measureText(title).width > 452 && fontSize > 22) {
    fontSize -= 2;
    ctx.font = `900 ${fontSize}px sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(title, 256, 78);
  ctx.restore();

  // Subtítulo nítido na cor luminosa do portal / branco suave
  let subSize = 25;
  ctx.font = `800 ${subSize}px sans-serif`;
  while (ctx.measureText(subtitle).width > 452 && subSize > 16) {
    subSize -= 1;
    ctx.font = `800 ${subSize}px sans-serif`;
  }
  ctx.fillStyle = hexColor;
  ctx.fillText(subtitle, 256, 138);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createWideEntranceSignTexture(
  title: string,
  subtitle: string,
  borderColor: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const padding = 64;
  const maxTextWidth = canvas.width - padding * 2;

  const grad = ctx.createLinearGradient(0, 0, 1024, 256);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(0.5, '#1e3a8a');
  grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 256);

  ctx.lineWidth = 12;
  ctx.strokeStyle = borderColor;
  ctx.strokeRect(10, 10, 1004, 236);

  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(24, 24, 976, 208);

  let titleSize = 58;
  ctx.font = `900 ${titleSize}px sans-serif`;
  while (ctx.measureText(title).width > maxTextWidth && titleSize > 28) {
    titleSize -= 2;
    ctx.font = `900 ${titleSize}px sans-serif`;
  }
  ctx.fillStyle = '#fde047';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 512, 104);

  let subSize = 32;
  ctx.font = `700 ${subSize}px sans-serif`;
  while (ctx.measureText(subtitle).width > maxTextWidth && subSize > 18) {
    subSize -= 2;
    ctx.font = `700 ${subSize}px sans-serif`;
  }
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(subtitle, 512, 178);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createBrazilFlagTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#16a34a';
  ctx.fillRect(0, 0, 256, 160);

  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.moveTo(128, 18);
  ctx.lineTo(234, 80);
  ctx.lineTo(128, 142);
  ctx.lineTo(22, 80);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#1d4ed8';
  ctx.beginPath();
  ctx.arc(128, 80, 40, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(122, 92, 44, -Math.PI * 0.72, -Math.PI * 0.18);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createParaFlagTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#dc2626';
  ctx.fillRect(0, 0, 256, 160);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 46;
  ctx.beginPath();
  ctx.moveTo(-20, -10);
  ctx.lineTo(276, 170);
  ctx.stroke();

  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  const cx = 128;
  const cy = 80;
  const spikes = 5;
  const outerR = 22;
  const innerR = 9;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / spikes - Math.PI / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 4. BANDEIRA OFICIAL DO MUNICÍPIO DE BRAGANÇA-PA (CanvasTexture 512 x 320 px):
 * Fundo dividido em Azul Royal (#0047AB) e Branco (#FFFFFF) (sem vermelho),
 * com o Brasão Municipal ao centro: coroa mural dourada no topo, escudo dividido com
 * céu azul + estrela/sol, palmeiras/açaizeiros verdes, ondas azuis do Rio Caeté
 * e listel branco na base com o texto nítido "BRAGANÇA - PA".
 */
function createBragancaFlagTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext('2d')!;

  // Fundo Oficial em Azul Royal (#0047AB) e Branco (#FFFFFF)
  ctx.fillStyle = '#0047AB';
  ctx.fillRect(0, 0, 512, 320);

  // Faixa horizontal central larga em Branco (#FFFFFF) + bordas superiores/inferiores em Azul Royal (#0047AB)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 74, 512, 172);

  // Filetes internos em Azul Royal para destacar o campo branco central
  ctx.strokeStyle = '#0047AB';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 82, 492, 156);

  const cx = 256;
  const cy = 152;

  // 1. Coroa Mural Dourada no topo do escudo
  ctx.fillStyle = '#facc15';
  ctx.strokeStyle = '#854d0e';
  ctx.lineWidth = 3;
  ctx.fillRect(cx - 46, cy - 86, 92, 20);
  ctx.strokeRect(cx - 46, cy - 86, 92, 20);
  for (let t = -2; t <= 2; t++) {
    ctx.fillRect(cx + t * 20 - 7, cy - 98, 14, 14);
    ctx.strokeRect(cx + t * 20 - 7, cy - 98, 14, 14);
  }

  // 2. Escudo Clássico Municipal de Bragança-PA
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - 54, cy - 64);
  ctx.lineTo(cx + 54, cy - 64);
  ctx.lineTo(cx + 54, cy + 8);
  ctx.quadraticCurveTo(cx + 54, cy + 58, cx, cy + 72);
  ctx.quadraticCurveTo(cx - 54, cy + 58, cx - 54, cy + 8);
  ctx.closePath();
  ctx.clip();

  // Metade superior do escudo: Céu Azul Royal com Sol/Estrela Dourada
  ctx.fillStyle = '#0284c7';
  ctx.fillRect(cx - 60, cy - 66, 120, 72);

  // Sol/Estrela Dourada no escudo
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.arc(cx - 22, cy - 34, 13, 0, Math.PI * 2);
  ctx.fill();

  // Palmeiras / Açaizeiros Verdes estilizados à direita do escudo
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx + 22, cy + 12);
  ctx.lineTo(cx + 22, cy - 28);
  ctx.stroke();

  ctx.fillStyle = '#15803d';
  for (let a = 0; a < 5; a++) {
    const ang = -Math.PI + (a * Math.PI) / 4;
    ctx.beginPath();
    ctx.ellipse(
      cx + 22 + Math.cos(ang) * 14,
      cy - 30 + Math.sin(ang) * 8,
      14,
      5,
      ang * 0.4,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  // Parte intermediária verde (margens do Rio Caeté)
  ctx.fillStyle = '#16a34a';
  ctx.fillRect(cx - 60, cy + 2, 120, 22);

  // Parte inferior do escudo: Ondas Azuis e Brancas representando o Rio Caeté
  ctx.fillStyle = '#0047AB';
  ctx.fillRect(cx - 60, cy + 22, 120, 56);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  for (const wy of [cy + 34, cy + 48, cy + 62]) {
    ctx.beginPath();
    for (let wx = cx - 54; wx <= cx + 54; wx += 18) {
      ctx.quadraticCurveTo(wx + 4, wy - 5, wx + 9, wy);
      ctx.quadraticCurveTo(wx + 14, wy + 5, wx + 18, wy);
    }
    ctx.stroke();
  }
  ctx.restore();

  // Contorno Dourado e Azul Escuro do Escudo
  ctx.beginPath();
  ctx.moveTo(cx - 54, cy - 64);
  ctx.lineTo(cx + 54, cy - 64);
  ctx.lineTo(cx + 54, cy + 8);
  ctx.quadraticCurveTo(cx + 54, cy + 58, cx, cy + 72);
  ctx.quadraticCurveTo(cx - 54, cy + 58, cx - 54, cy + 8);
  ctx.closePath();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#eab308';
  ctx.stroke();

  // 3. Faixa / Listel Branco na base do escudo com o texto nítido "BRAGANÇA - PA"
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0047AB';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(cx - 98, cy + 78, 196, 32, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#0047AB';
  ctx.font = '900 19px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BRAGANÇA - PA', cx, cy + 95);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createStripedAwningTexture(colorA: string, colorB: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const stripes = 8;
  const w = canvas.width / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? colorA : colorB;
    ctx.fillRect(i * w, 0, w, canvas.height);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createHologramGridTexture(hexColor: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = hexColor;
  ctx.globalAlpha = 0.25;
  ctx.fillRect(0, 0, 256, 256);

  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  for (let y = 0; y < 256; y += 32) {
    ctx.beginPath();
    for (let x = 0; x <= 256; x += 16) {
      const wy = y + Math.sin((x / 256) * Math.PI * 2) * 6;
      if (x === 0) ctx.moveTo(x, wy);
      else ctx.lineTo(x, wy);
    }
    ctx.stroke();
  }

  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = hexColor;
  ctx.lineWidth = 2;
  for (let x = 0; x < 256; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTop3TotemTexture(top3: StudentProfile[]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 512, 512);
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#facc15';
  ctx.strokeRect(10, 10, 492, 492);

  ctx.fillStyle = '#facc15';
  ctx.font = '900 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🏆 TOP 3 DA TURMA', 256, 72);

  const medals = ['🥇 1º', '🥈 2º', '🥉 3º'];
  top3.slice(0, 3).forEach((s, idx) => {
    const y = 165 + idx * 115;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(34, y - 48, 444, 88);

    ctx.fillStyle = idx === 0 ? '#facc15' : idx === 1 ? '#e2e8f0' : '#f97316';
    ctx.font = '900 28px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${medals[idx]} ${s.name.slice(0, 14)}`, 52, y - 6);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 20px sans-serif';
    ctx.fillText(`${s.grade} • ${s.school.slice(0, 16)}`, 52, y + 24);

    ctx.fillStyle = '#34d399';
    ctx.font = '900 26px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${s.xp} XP`, 460, y + 8);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function SocialPlaza3D({
  student,
  allStudents,
  onEnterGameMode,
  onOpenModes,
  onOpenShop,
  onOpenRanking,
  onOpenMultiplayer,
  onOpenMissions,
  onLogout,
  onUpdateStudent,
}: SocialPlaza3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [graphicsQuality, setGraphicsQualityState] = useState<GraphicsQuality>(() =>
    getGraphicsQuality()
  );
  const [onlinePeers, setOnlinePeers] = useState<OnlinePlayerPresence[]>([]);
  const [rotateCameraSignal, setRotateCameraSignal] = useState(0);
  const [cameraMode, setCameraMode] = useState<PlazaCameraMode>('angular');
  const cameraModeRef = useRef<PlazaCameraMode>('angular');
  cameraModeRef.current = cameraMode;

  const [isPortrait, setIsPortrait] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false
  );
  const isPortraitRef = useRef<boolean>(isPortrait);
  isPortraitRef.current = isPortrait;

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(() => soundEngine.muted);
  const [nearbyPortal, setNearbyPortal] = useState<NearbyPortalInfo | null>(null);

  const [showChatMenu, setShowChatMenu] = useState(false);
  const [socialDrawerOpen, setSocialDrawerOpen] = useState(false);
  const [plazaMenuOpen, setPlazaMenuOpen] = useState(false);
  const [audioModalOpen, setAudioModalOpen] = useState(false);
  const [activeEmote, setActiveEmote] = useState<AvatarEmote>(null);
  const [activeChatMsg, setActiveChatMsg] = useState<string | null>(null);
  const [isFarmingAura, setIsFarmingAura] = useState(false);
  const [auraToast, setAuraToast] = useState<string | null>(null);
  const [dailyAuraCoins, setDailyAuraCoins] = useState(() => getDailyFarmedCoins(student.id));
  const [claimableMissions, setClaimableMissions] = useState(() =>
    countClaimableDailyMissions(student.id)
  );

  useEffect(() => subscribeGraphicsQuality(setGraphicsQualityState), []);
  useEffect(
    () =>
      soundEngine.subscribe((s) => {
        setMuted(s.muted);
      }),
    []
  );
  useEffect(
    () =>
      subscribeDailyMissions(() => {
        setClaimableMissions(countClaimableDailyMissions(student.id));
      }),
    [student.id]
  );

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    const onOrientOrResize = () => {
      const portrait = window.innerHeight > window.innerWidth;
      isPortraitRef.current = portrait;
      setIsPortrait(portrait);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    window.addEventListener('resize', onOrientOrResize);
    window.addEventListener('orientationchange', onOrientOrResize);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      window.removeEventListener('resize', onOrientOrResize);
      window.removeEventListener('orientationchange', onOrientOrResize);
    };
  }, []);

  const handleCycleCameraMode = () => {
    setCameraMode((prev) => {
      const next: PlazaCameraMode =
        prev === 'angular' ? 'aerial' : prev === 'aerial' ? 'action' : 'angular';
      cameraModeRef.current = next;
      return next;
    });
  };

  const handleToggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else {
        setAuraToast('⛶ Modo tela cheia imersiva ativo!');
        window.setTimeout(() => setAuraToast(null), 2200);
      }
    } catch {
      setAuraToast('⛶ Tela cheia não suportada neste navegador.');
      window.setTimeout(() => setAuraToast(null), 2200);
    }
  };

  const handleToggleMute = () => {
    const nextMuted = soundEngine.toggleMuteAll();
    setMuted(nextMuted);
  };

  const equippedClub = useMemo(
    () => getJerseyConfig(student.equippedJersey),
    [student.equippedJersey]
  );

  // Vehicle Driving State (v10.0)
  const [nearbyVehicle, setNearbyVehicle] = useState<PlazaVehicleDef | null>(null);
  const [drivingVehicleId, setDrivingVehicleId] = useState<string | null>(null);
  const drivingVehicleIdRef = useRef<string | null>(null);
  drivingVehicleIdRef.current = drivingVehicleId;

  const driveControlsRef = useRef<{ throttle: boolean; brakeReverse: boolean }>({
    throttle: false,
    brakeReverse: false,
  });

  // Meme "Fá!" 3D visual pulse trigger
  const faBurstUntilRef = useRef<number>(0);

  // Quick 1-click micro math spark while farming aura
  const [microSpark, setMicroSpark] = useState<{
    prompt: string;
    options: [number, number];
    correctIdx: 0 | 1;
  } | null>(null);

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

  const top3Students = useMemo(
    () => [...allStudents].sort((a, b) => b.xp - a.xp).slice(0, 3),
    [allStudents]
  );

  const simulatedClassmates = useMemo(
    () => allStudents.filter((s) => s.id !== student.id).slice(0, 5),
    [allStudents, student.id]
  );

  const presenceManagerRef = useRef<PlazaPresenceManager | null>(null);
  const emoteRef = useRef<{ emote: AvatarEmote; until: number }>({ emote: null, until: 0 });
  const chatRef = useRef<{ msg: string | null; until: number }>({ msg: null, until: 0 });
  const onlinePeersRef = useRef<OnlinePlayerPresence[]>([]);
  onlinePeersRef.current = onlinePeers;

  const studentRef = useRef(student);
  studentRef.current = student;

  const isFarmingRef = useRef(isFarmingAura);
  isFarmingRef.current = isFarmingAura;

  const teleportToAuraZoneRef = useRef(false);
  const enterVehicleRequestRef = useRef<string | null>(null);
  const exitVehicleRequestRef = useRef(false);

  const callbacksRef = useRef({
    onEnterGameMode,
    onOpenShop,
    onOpenMultiplayer,
    onOpenMissions,
    onUpdateStudent,
  });
  callbacksRef.current = {
    onEnterGameMode,
    onOpenShop,
    onOpenMultiplayer,
    onOpenMissions,
    onUpdateStudent,
  };

  const generateMicroSpark = () => {
    const a = Math.floor(Math.random() * 8) + 2;
    const b = Math.floor(Math.random() * 8) + 2;
    const ans = a * b;
    const wrong = ans + (Math.random() < 0.5 ? a : -b || 3);
    const correctIdx: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
    setMicroSpark({
      prompt: `⚡ Pulso de Energia: ${a} × ${b} = ?`,
      options: correctIdx === 0 ? [ans, wrong] : [wrong, ans],
      correctIdx,
    });
  };

  useEffect(() => {
    if (!isFarmingAura) {
      setMicroSpark(null);
      return;
    }
    generateMicroSpark();

    const interval = window.setInterval(() => {
      const cur = studentRef.current;
      const nextAuraPower = (cur.auraPower || 0) + 5;
      const allowedCoins = addDailyFarmedCoins(cur.id, 2);
      setDailyAuraCoins(getDailyFarmedCoins(cur.id));

      const updated: StudentProfile = {
        ...cur,
        auraPower: nextAuraPower,
        coins: cur.coins + allowedCoins,
        xp: cur.xp + 5,
      };
      callbacksRef.current.onUpdateStudent(updated);
      soundEngine.playCoin();

      if (allowedCoins > 0) {
        setAuraToast(`⚡ +5 Poder de Aura • +${allowedCoins} BloxCoins!`);
      } else {
        setAuraToast(`⚡ +5 Poder de Aura (Limite diário 100 Coins atingido)`);
      }
      setTimeout(() => setAuraToast(null), 3200);
    }, 10000);

    return () => clearInterval(interval);
  }, [isFarmingAura]);

  const handleAnswerMicroSpark = (idx: 0 | 1) => {
    if (!microSpark) return;
    const cur = studentRef.current;
    if (idx === microSpark.correctIdx) {
      const nextAuraPower = (cur.auraPower || 0) + 8;
      const allowedCoins = addDailyFarmedCoins(cur.id, 2);
      setDailyAuraCoins(getDailyFarmedCoins(cur.id));
      callbacksRef.current.onUpdateStudent({
        ...cur,
        auraPower: nextAuraPower,
        coins: cur.coins + allowedCoins,
        xp: cur.xp + 10,
      });
      soundEngine.playCorrect();
      setAuraToast(
        allowedCoins > 0
          ? `⚡ Pulso Perfeito! +8 Aura • +${allowedCoins} BloxCoins!`
          : `⚡ Pulso Perfeito! +8 Poder de Aura!`
      );
      setTimeout(() => setAuraToast(null), 2800);
    } else {
      soundEngine.playTrapFall();
    }
    generateMicroSpark();
  };

  const triggerEmote = (emote: NonNullable<AvatarEmote>) => {
    const until = Date.now() + 4000;
    emoteRef.current = { emote, until };
    setActiveEmote(emote);
    soundEngine.playJump();
  };

  const triggerQuickChat = (phrase: string) => {
    const until = Date.now() + 4200;
    chatRef.current = { msg: phrase, until };
    setActiveChatMsg(phrase);
    setShowChatMenu(false);

    // 5.2. Efeitos sonoros e visuais especiais para "Fá! 🎺💥" e "Obrigado, meu prefeito! 🫡🏛️"
    if (phrase.includes('Fá!')) {
      soundEngine.playMemeFaSound();
      faBurstUntilRef.current = Date.now() + 1250;
      emoteRef.current = { emote: 'goal', until };
      setActiveEmote('goal');
    } else if (phrase.includes('Obrigado, meu prefeito')) {
      soundEngine.playMayorChime();
      emoteRef.current = { emote: 'salute', until };
      setActiveEmote('salute');
    } else {
      soundEngine.playCoin();
    }
  };

  const handleToggleFarmAuraButton = () => {
    if (drivingVehicleIdRef.current) {
      exitVehicleRequestRef.current = true;
    }
    const next = !isFarmingAura;
    setIsFarmingAura(next);
    if (next) {
      teleportToAuraZoneRef.current = true;
      soundEngine.playJumpPad();
    }
  };

  const handleSelectMovementStyle = (style: MovementStyle) => {
    onUpdateStudent({
      ...student,
      movementStyle: style,
    });
    soundEngine.playCheckpoint();
  };

  const handleEnterNearbyVehicle = () => {
    if (!nearbyVehicle) return;
    setIsFarmingAura(false);
    isFarmingRef.current = false;
    enterVehicleRequestRef.current = nearbyVehicle.id;
    soundEngine.playTurboBoost();
  };

  const handleExitVehicle = () => {
    exitVehicleRequestRef.current = true;
    driveControlsRef.current.throttle = false;
    driveControlsRef.current.brakeReverse = false;
    soundEngine.playJump();
  };

  useEffect(() => {
    soundEngine.startBgm('plaza');
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();

    const initialPortrait = height > width;
    const camera = new THREE.PerspectiveCamera(
      initialPortrait ? 82 : 72,
      width / height,
      0.2,
      260
    );
    const { renderer, maxAnisotropy: maxAniso } = createPbrRenderer(container, graphicsQuality);
    const envRig = setupTropicalEnvironment(scene, renderer, {
      fogColor: 0xd8f1fe,
      fogDensity: 0.0042,
      skyRadius: 240,
      shadowFrustum: 38,
      sunOffset: [28, 45, 24],
      hemiIntensity: 0.88,
      sunIntensity: 1.48,
      quality: graphicsQuality,
    });

    const sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(5.5, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xfef08a, fog: false })
    );
    sunDisc.position.set(48, 52, -75);
    scene.add(sunDisc);

    // Lista de Colisores Sólidos AABB da Praça (plazaColliders[])
    const plazaColliders: PlazaCollider[] = [];
    const addCollider = (
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      blockPlayer = true
    ) => {
      plazaColliders.push({ x, y, z, w, h, d, blockPlayer });
    };

    // =========================================================================
    // 2. SISTEMA DE REGISTRO DE OCUPAÇÃO (placedProps) — ZERO SOBREPOSIÇÃO
    // =========================================================================
    const placedProps: PlacedPropRecord[] = [];
    const canPlaceProp = (x: number, z: number, radius: number): boolean => {
      for (const other of placedProps) {
        const dist = Math.hypot(x - other.x, z - other.z);
        if (dist < radius + other.radius + 0.8) {
          return false;
        }
      }
      return true;
    };
    const registerProp = (x: number, z: number, radius: number): void => {
      placedProps.push({ x, z, radius });
    };

    // Reserva o centro (Monumento dos 3 Mastros), a Zona de Aura, o Totem e a Escadaria
    registerProp(0, 0, 4.0);
    registerProp(18, -15, 4.2);
    registerProp(-18, -15, 3.4);
    registerProp(-24.5, 11.5, 4.2);

    // =========================================================================
    // 1. PISO DA PRAÇA PBR (#475569 / #334155 / #526071) + GRAMA PROCEDURAL PBR
    // =========================================================================
    const outerGrassPbr = createTiledPbrTextures('grass', 26, 26, maxAniso);
    const outerTerrain = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 260),
      new THREE.MeshStandardMaterial({
        map: outerGrassPbr.map,
        bumpMap: outerGrassPbr.bumpMap,
        bumpScale: outerGrassPbr.bumpScale,
        roughness: outerGrassPbr.roughness,
      })
    );
    outerTerrain.rotation.x = -Math.PI / 2;
    outerTerrain.position.y = -0.18;
    outerTerrain.receiveShadow = true;
    scene.add(outerTerrain);

    const pavementPbr = createTiledPbrTextures('pavement', 18, 18, maxAniso);
    const floorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(63, 1.0, 63),
      new THREE.MeshStandardMaterial({
        map: pavementPbr.map,
        bumpMap: pavementPbr.bumpMap,
        bumpScale: pavementPbr.bumpScale,
        roughness: pavementPbr.roughness,
        metalness: 0.05,
      })
    );
    floorMesh.position.set(0, -0.5, 0);
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Corredores Radiais e Diagonais em pedra cinza-ardósia (#334155) com filetes brancos de contraste
    const walkwayMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.8,
      metalness: 0.08,
    });
    const curbWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
    for (let r = 0; r < 4; r++) {
      const stripGroup = new THREE.Group();
      stripGroup.rotation.y = (r * Math.PI) / 4;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.03, 59), walkwayMat);
      strip.position.set(0, 0.015, 0);
      const borderL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 59), curbWhiteMat);
      borderL.position.set(-1.98, 0.02, 0);
      const borderR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 59), curbWhiteMat);
      borderR.position.set(1.98, 0.02, 0);
      stripGroup.add(strip, borderL, borderR);
      scene.add(stripGroup);
    }

    // Calçada de Contorno com Meio-Fio Branco Elevado (#FFFFFF) e passagens abertas nos 4 lados para a rua
    const perimeterCurbSegments = [
      // Borda Sul (z = 31.2) com abertura central [-6, 6]
      { x: -18.5, z: 31.2, w: 25, h: 0.32, d: 0.9 },
      { x: 18.5, z: 31.2, w: 25, h: 0.32, d: 0.9 },
      // Borda Norte (z = -31.2) com abertura central [-6, 6]
      { x: -18.5, z: -31.2, w: 25, h: 0.32, d: 0.9 },
      { x: 18.5, z: -31.2, w: 25, h: 0.32, d: 0.9 },
      // Borda Oeste (x = -31.2) com abertura central [-6, 6]
      { x: -31.2, z: -18.5, w: 0.9, h: 0.32, d: 25 },
      { x: -31.2, z: 18.5, w: 0.9, h: 0.32, d: 25 },
      // Borda Leste (x = 31.2) com abertura central [-6, 6]
      { x: 31.2, z: -18.5, w: 0.9, h: 0.32, d: 25 },
      { x: 31.2, z: 18.5, w: 0.9, h: 0.32, d: 25 },
    ];
    for (const seg of perimeterCurbSegments) {
      const cm = new THREE.Mesh(new THREE.BoxGeometry(seg.w, seg.h, seg.d), curbWhiteMat);
      cm.position.set(seg.x, seg.h / 2, seg.z);
      cm.receiveShadow = true;
      scene.add(cm);
      // Altura baixa (0.32 <= STEP_HEIGHT 0.50) permite subir/descer o meio-fio
      addCollider(seg.x, seg.h / 2, seg.z, seg.w, seg.h, seg.d, true);
    }

    // =========================================================================
    // 3.1. ANEL DE RUAS ASFALTADAS (4 LADOS DA PRAÇA, LARGURA 10u, #1E293B)
    // =========================================================================
    const roadAsphaltMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.88,
      metalness: 0.05,
    });
    const yellowLineMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const whiteStripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // Anel de asfalto de 84x84 cobrindo de 31.5 a 41.5 em todos os 4 lados
    const roadSegments = [
      { x: 0, z: 36.5, w: 84, d: 10 }, // Rua Sul
      { x: 0, z: -36.5, w: 84, d: 10 }, // Rua Norte
      { x: -36.5, z: 0, w: 10, d: 64 }, // Rua Oeste
      { x: 36.5, z: 0, w: 10, d: 64 }, // Rua Leste
    ];
    for (const rs of roadSegments) {
      const rm = new THREE.Mesh(new THREE.BoxGeometry(rs.w, 0.2, rs.d), roadAsphaltMat);
      rm.position.set(rs.x, -0.1, rs.z);
      rm.receiveShadow = true;
      scene.add(rm);
    }

    // Faixas centrais tracejadas amarelas nas 4 ruas
    for (let d = -34; d <= 34; d += 4.5) {
      const dashS = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.03, 0.22), yellowLineMat);
      dashS.position.set(d, 0.015, 36.5);
      const dashN = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.03, 0.22), yellowLineMat);
      dashN.position.set(d, 0.015, -36.5);
      const dashW = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 2.2), yellowLineMat);
      dashW.position.set(-36.5, 0.015, d);
      const dashE = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 2.2), yellowLineMat);
      dashE.position.set(36.5, 0.015, d);
      scene.add(dashS, dashN, dashW, dashE);
    }

    // Faixas de pedestres brancas nos 4 acessos cardeais da praça
    const crosswalkCenters = [
      { x: 0, z: 32.8, horiz: true },
      { x: 0, z: -32.8, horiz: true },
      { x: -32.8, z: 0, horiz: false },
      { x: 32.8, z: 0, horiz: false },
    ];
    for (const cw of crosswalkCenters) {
      for (let s = -3; s <= 3; s++) {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(cw.horiz ? 0.55 : 2.2, 0.035, cw.horiz ? 2.2 : 0.55),
          whiteStripeMat
        );
        stripe.position.set(
          cw.x + (cw.horiz ? s * 0.95 : 0),
          0.02,
          cw.z + (cw.horiz ? 0 : s * 0.95)
        );
        scene.add(stripe);
      }
    }

    // Guarda-corpos / Muretas baixas nas bordas externas do mapa (±42.0) para nenhum veículo cair no vazio
    const outerGuardMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.4,
      metalness: 0.2,
    });
    const outerGuardWalls = [
      { x: 0, z: 42.0, w: 85, h: 1.35, d: 1.0 },
      { x: 0, z: -42.0, w: 85, h: 1.35, d: 1.0 },
      { x: -42.0, z: 0, w: 1.0, h: 1.35, d: 85 },
      { x: 42.0, z: 0, w: 1.0, h: 1.35, d: 85 },
    ];
    for (const gw of outerGuardWalls) {
      const gm = new THREE.Mesh(new THREE.BoxGeometry(gw.w, gw.h, gw.d), outerGuardMat);
      gm.position.set(gw.x, gw.h / 2, gw.z);
      scene.add(gm);
      addCollider(gw.x, gw.h / 2, gw.z, gw.w, gw.h, gw.d, true);
    }

    // =========================================================================
    // 3.2. OBSTÁCULOS URBANOS NAS RUAS: LOMBADAS, CONES, SLALOM E 2 RAMPAS DE SALTO
    // =========================================================================
    const speedBumpTex = createStripedAwningTexture('#facc15', '#0f172a');
    const speedBumpMat = new THREE.MeshStandardMaterial({ map: speedBumpTex, roughness: 0.55 });
    const speedBumpCoords = [
      { x: -22, z: 36.5, horiz: false },
      { x: 22, z: 36.5, horiz: false },
      { x: -22, z: -36.5, horiz: false },
      { x: 22, z: -36.5, horiz: false },
    ];
    for (const sb of speedBumpCoords) {
      const bump = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.32, 8.6, 12, 1, false, 0, Math.PI),
        speedBumpMat
      );
      bump.rotation.z = Math.PI / 2;
      if (!sb.horiz) bump.rotation.y = Math.PI / 2;
      bump.position.set(sb.x, 0.02, sb.z);
      scene.add(bump);
    }

    // 2 Pequenas Rampas de Salto nas retas laterais Oeste (x = -36.5) e Leste (x = 36.5)
    const rampMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x0284c7,
      emissiveIntensity: 0.35,
      roughness: 0.35,
    });
    const jumpRampCoords = [
      { x: -36.5, z: -8.0 },
      { x: 36.5, z: -8.0 },
    ];
    for (const jr of jumpRampCoords) {
      const rampGroup = new THREE.Group();
      rampGroup.position.set(jr.x, 0, jr.z);
      const wedge = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.55, 3.8), rampMat);
      wedge.rotation.x = 0.22;
      wedge.position.y = 0.25;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.58, 3.82), yellowLineMat);
      stripe.rotation.x = 0.22;
      stripe.position.y = 0.26;
      rampGroup.add(wedge, stripe);
      scene.add(rampGroup);
    }

    // Cones laranja de trânsito e Barreiras de Slalom
    const coneOrangeMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 });
    const slalomBarrierTex = createStripedAwningTexture('#ef4444', '#ffffff');
    const slalomBarrierMat = new THREE.MeshStandardMaterial({
      map: slalomBarrierTex,
      roughness: 0.4,
    });

    const trafficConeCoords = [
      { x: -6, z: -35.0 },
      { x: 0, z: -38.0 },
      { x: 6, z: -35.0 },
      { x: -35.0, z: -20 },
      { x: -38.0, z: -15 },
      { x: 35.0, z: -20 },
      { x: 38.0, z: -15 },
    ];
    for (const tc of trafficConeCoords) {
      const cGroup = new THREE.Group();
      cGroup.position.set(tc.x, 0, tc.z);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 0.65), coneOrangeMat);
      base.position.y = 0.04;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.78, 12), coneOrangeMat);
      cone.position.y = 0.42;
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.19, 0.18, 12),
        whiteStripeMat
      );
      collar.position.y = 0.46;
      cGroup.add(base, cone, collar);
      scene.add(cGroup);
      addCollider(tc.x, 0.4, tc.z, 0.65, 0.8, 0.65, true);
    }

    const slalomCoords = [
      { x: -13, z: -34.2 },
      { x: 13, z: -38.8 },
    ];
    for (const sc of slalomCoords) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.75, 0.45), slalomBarrierMat);
      bar.position.set(sc.x, 0.45, sc.z);
      scene.add(bar);
      addCollider(sc.x, 0.45, sc.z, 2.6, 0.9, 0.5, true);
    }

    // =========================================================================
    // 2. CANTEIROS TRIANGULARES + ÁRVORES NO INTERIOR + BANCOS TANGENCIAIS EXTERNOS
    // =========================================================================
    const planterGrassMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.75 });
    const orangeBenchMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.45 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 });
    const foliageMat1 = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.55 });
    const foliageMat2 = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.55 });
    const treeCrowns: THREE.Group[] = [];
    const occludableProps: {
      x: number;
      z: number;
      radius: number;
      materials: THREE.MeshStandardMaterial[];
      currentOpacity: number;
    }[] = [];

    const triangularBedPositions = [
      { x: -11.5, z: -9.5, rotY: Math.PI * 0.25, radius: 4.8, benchAngle: Math.PI * 0.75 },
      { x: 11.5, z: -9.5, rotY: -Math.PI * 0.25, radius: 4.8, benchAngle: Math.PI * 0.25 },
      { x: -12.5, z: 9.5, rotY: Math.PI * 0.75, radius: 4.8, benchAngle: -Math.PI * 0.75 },
      { x: 12.5, z: 9.5, rotY: -Math.PI * 0.75, radius: 4.8, benchAngle: -Math.PI * 0.25 },
      { x: -20.5, z: -1.5, rotY: Math.PI * 0.5, radius: 4.4, benchAngle: 0 },
      { x: 20.5, z: -1.5, rotY: -Math.PI * 0.5, radius: 4.4, benchAngle: Math.PI },
    ];

    triangularBedPositions.forEach((tb, idx) => {
      const bedGroup = new THREE.Group();
      bedGroup.position.set(tb.x, 0, tb.z);
      bedGroup.rotation.y = tb.rotY;

      // Meio-fio branco elevado triangular (#FFFFFF) contrastando com o piso escuro (#475569)
      const curbMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(tb.radius, tb.radius + 0.22, 0.38, 3),
        curbWhiteMat
      );
      curbMesh.position.y = 0.19;
      curbMesh.receiveShadow = true;

      // Grama verde interna do canteiro triangular (#22C55E)
      const grassMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(tb.radius * 0.85, tb.radius * 0.85, 0.42, 3),
        planterGrassMat
      );
      grassMesh.position.y = 0.21;
      bedGroup.add(curbMesh, grassMesh);
      scene.add(bedGroup);

      // Colisor baixo do canteiro (0.38 <= STEP_HEIGHT 0.50)
      addCollider(tb.x, 0.19, tb.z, tb.radius * 1.05, 0.38, tb.radius * 1.05, true);

      // Lista de obstáculos altos (árvores e postes) que ficam translúcidos entre câmera e avatar
      // (inicializada no escopo da cena abaixo via array dedicado)
      registerProp(tb.x, tb.z, 2.8);
      const tGroup = new THREE.Group();
      tGroup.position.set(tb.x, 0.38, tb.z);
      const treeTrunkMat = trunkMat.clone();
      const treeFoliageMatA = (idx % 2 === 0 ? foliageMat1 : foliageMat2).clone();
      const treeFoliageMatB = (idx % 2 === 0 ? foliageMat2 : foliageMat1).clone();
      const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.78, 2.9, 0.78), treeTrunkMat);
      trunk.position.y = 1.45;
      tGroup.add(trunk);

      const crown = new THREE.Group();
      crown.position.y = 2.9;
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.1, 3.4), treeFoliageMatA);
      c1.position.y = 0.8;
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.7, 2.3), treeFoliageMatB);
      c2.position.y = 2.2;
      crown.add(c1, c2);
      tGroup.add(crown);
      treeCrowns.push(crown);
      occludableProps.push({
        x: tb.x,
        z: tb.z,
        radius: 2.6,
        materials: [treeTrunkMat, treeFoliageMatA, treeFoliageMatB],
        currentOpacity: 1,
      });
      scene.add(tGroup);
      // Colisor sólido AABB do tronco da árvore
      addCollider(tb.x, 2.0, tb.z, 1.1, 4.0, 1.1, true);

      // 2.2. Banco de Praça (radius: 1.6) posicionado TANGENCIALMENTE do lado de fora do canteiro
      const benchDist = tb.radius + 1.45;
      const bx = tb.x + Math.cos(tb.benchAngle) * benchDist;
      const bz = tb.z + Math.sin(tb.benchAngle) * benchDist;
      if (canPlaceProp(bx, bz, 1.6)) {
        registerProp(bx, bz, 1.6);
        const benchGroup = new THREE.Group();
        benchGroup.position.set(bx, 0, bz);
        benchGroup.rotation.y = -tb.benchAngle + Math.PI / 2;

        const benchBase = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.34, 0.85), curbWhiteMat);
        benchBase.position.y = 0.17;
        const benchSeat = new THREE.Mesh(new THREE.BoxGeometry(2.95, 0.16, 0.92), orangeBenchMat);
        benchSeat.position.y = 0.42;
        benchGroup.add(benchBase, benchSeat);
        scene.add(benchGroup);
        addCollider(bx, 0.25, bz, 2.6, 0.5, 0.9, true);
      }
    });

    // =========================================================================
    // MONUMENTO CENTRAL: BOLO DE DOIS NÍVEIS COM TRÊS MASTROS (x = 0, z = 0)
    // =========================================================================
    const flagpoleGroup = new THREE.Group();
    flagpoleGroup.position.set(0, 0, 0);

    const step1OrangeMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.35,
      metalness: 0.15,
    });
    const step2BlueMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      roughness: 0.35,
      metalness: 0.2,
    });
    const whitePoleMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.25,
      metalness: 0.35,
    });

    const baseStep1 = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.2, 0.41, 32),
      step1OrangeMat
    );
    baseStep1.position.y = 0.205;
    baseStep1.receiveShadow = true;

    const baseStep1Rim = new THREE.Mesh(
      new THREE.CylinderGeometry(3.26, 3.26, 0.06, 32),
      curbWhiteMat
    );
    baseStep1Rim.position.y = 0.42;
    baseStep1Rim.receiveShadow = true;

    const baseStep2 = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.1, 0.41, 32),
      step2BlueMat
    );
    baseStep2.position.y = 0.655;
    baseStep2.receiveShadow = true;

    const baseStep2Rim = new THREE.Mesh(
      new THREE.CylinderGeometry(2.16, 2.16, 0.06, 32),
      curbWhiteMat
    );
    baseStep2Rim.position.y = 0.87;
    baseStep2Rim.receiveShadow = true;

    const finialGoldMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xca8a04,
      emissiveIntensity: 0.7,
      metalness: 0.8,
      roughness: 0.2,
    });

    const centerMast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.16, 7.5, 14),
      whitePoleMat
    );
    centerMast.position.set(0, 0.9 + 3.75, 0);
    const centerFinial = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), finialGoldMat);
    centerFinial.position.set(0, 0.9 + 7.58, 0);

    const leftMast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.14, 6.5, 14),
      whitePoleMat
    );
    leftMast.position.set(-1.15, 0.9 + 3.25, 0);
    const leftFinial = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), finialGoldMat);
    leftFinial.position.set(-1.15, 0.9 + 6.58, 0);

    const rightMast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.14, 6.5, 14),
      whitePoleMat
    );
    rightMast.position.set(1.15, 0.9 + 3.25, 0);
    const rightFinial = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), finialGoldMat);
    rightFinial.position.set(1.15, 0.9 + 6.58, 0);

    // 1. Mastro Central: Bandeira do Brasil
    const brazilFlagGeo = new THREE.PlaneGeometry(2.2, 1.38, 14, 8);
    const brazilFlagMat = new THREE.MeshStandardMaterial({
      map: createBrazilFlagTexture(),
      roughness: 0.4,
      side: THREE.DoubleSide,
    });
    const brazilFlagMesh = new THREE.Mesh(brazilFlagGeo, brazilFlagMat);
    brazilFlagMesh.position.set(1.12, 0.9 + 6.72, 0);

    // 2. Mastro Esquerdo: Bandeira do Pará
    const paraFlagGeo = new THREE.PlaneGeometry(2.0, 1.25, 14, 8);
    const paraFlagMat = new THREE.MeshStandardMaterial({
      map: createParaFlagTexture(),
      roughness: 0.4,
      side: THREE.DoubleSide,
    });
    const paraFlagMesh = new THREE.Mesh(paraFlagGeo, paraFlagMat);
    paraFlagMesh.position.set(-1.15 - 1.02, 0.9 + 5.75, 0);

    // 3. Mastro Direito: Bandeira Oficial de Bragança-PA (Azul Royal e Branco com Brasão Municipal)
    const bragancaFlagGeo = new THREE.PlaneGeometry(2.0, 1.25, 14, 8);
    const bragancaFlagMat = new THREE.MeshStandardMaterial({
      map: createBragancaFlagTexture(),
      roughness: 0.4,
      side: THREE.DoubleSide,
    });
    const bragancaFlagMesh = new THREE.Mesh(bragancaFlagGeo, bragancaFlagMat);
    bragancaFlagMesh.position.set(1.15 + 1.02, 0.9 + 5.75, 0);

    flagpoleGroup.add(
      baseStep1,
      baseStep1Rim,
      baseStep2,
      baseStep2Rim,
      centerMast,
      centerFinial,
      leftMast,
      leftFinial,
      rightMast,
      rightFinial,
      brazilFlagMesh,
      paraFlagMesh,
      bragancaFlagMesh
    );
    scene.add(flagpoleGroup);

    addCollider(0, 0.225, 0, 5.6, 0.45, 5.6, true);
    addCollider(0, 0.675, 0, 3.7, 0.45, 3.7, true);
    addCollider(0, 2.5, 0, 2.5, 3.2, 0.5, true);

    // =========================================================================
    // PLACA INICIAL LARGA SEM TEXTO CORTADO (width: 14, height: 2.6, 1024x256 px)
    // =========================================================================
    const bragancaSignGroup = new THREE.Group();
    bragancaSignGroup.position.set(0, 0, 21.5);
    const regionalSignTex = createWideEntranceSignTexture(
      'PRAÇA DA BANDEIRA • BRAGANÇA-PA',
      'Monumento dos Três Mastros & Circuito de Passeio',
      '#2563eb'
    );
    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(14.0, 2.6, 0.36),
      new THREE.MeshStandardMaterial({ map: regionalSignTex, roughness: 0.22 })
    );
    signBoard.position.y = 5.2;

    const bluePoleMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      roughness: 0.35,
      metalness: 0.3,
    });
    for (const sx of [-6.2, 6.2]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.28, 5.2, 12),
        bluePoleMat
      );
      post.position.set(sx, 2.6, 0);
      bragancaSignGroup.add(post);
      addCollider(sx, 2.6, 21.5, 0.7, 5.2, 0.7, true);
      registerProp(sx, 21.5, 0.8);
    }
    bragancaSignGroup.add(signBoard);
    scene.add(bragancaSignGroup);

    // Postes Azuis (#1D4ED8) afastados do corredor central de visão (spawn x=0, z=9 -> portais z=-26.5)
    const globeGlowMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfef08a,
      emissiveIntensity: 1.1,
    });
    const lampCoords = [
      { x: -11.0, z: -15.5 },
      { x: 11.0, z: -15.5 },
      { x: -11.0, z: -3.5 },
      { x: 11.0, z: -3.5 },
      { x: -10.5, z: 14.5 },
      { x: 10.5, z: 14.5 },
      { x: -17.5, z: 18.0 },
      { x: 17.5, z: 18.0 },
    ];
    for (const lc of lampCoords) {
      if (!canPlaceProp(lc.x, lc.z, 0.7)) continue;
      registerProp(lc.x, lc.z, 0.7);
      const lamp = new THREE.Group();
      lamp.position.set(lc.x, 0, lc.z);
      const poleMat = bluePoleMat.clone();
      const lampGlobeMat = globeGlowMat.clone();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 4.6, 10), poleMat);
      pole.position.y = 2.3;
      const crossArm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.12), poleMat);
      crossArm.position.y = 4.55;
      const globeL = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), lampGlobeMat);
      globeL.position.set(-0.55, 4.75, 0);
      const globeR = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), lampGlobeMat);
      globeR.position.set(0.55, 4.75, 0);
      lamp.add(pole, crossArm, globeL, globeR);
      occludableProps.push({
        x: lc.x,
        z: lc.z,
        radius: 1.8,
        materials: [poleMat, lampGlobeMat],
        currentOpacity: 1,
      });
      scene.add(lamp);
      addCollider(lc.x, 2.3, lc.z, 0.55, 4.6, 0.55, true);
    }

    // =========================================================================
    // TRAILERS DE LANCHE (4) E CARRINHOS DE LANCHE COM MESAS (6) NA BORDA PAVIMENTADA
    // (Validação estrita via placedProps para distância >= 4.0u de qualquer árvore)
    // =========================================================================
    const wheelBlackMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 });
    const hitchSteelMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.3,
      metalness: 0.8,
    });
    const warmWindowMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.85,
      roughness: 0.2,
    });
    const counterStainlessMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.25,
      metalness: 0.5,
    });

    const trailerDefs: {
      x: number;
      z: number;
      rotY: number;
      title: string;
      subtitle: string;
      bodyTopHex: number;
      bodyBotHex: number;
      stripeA: string;
      stripeB: string;
      signColor: string;
    }[] = [
      {
        x: 28.2,
        z: -11.5,
        rotY: -Math.PI / 2,
        title: 'AÇAÍ & LANCHES',
        subtitle: 'Sabor Bragantino Na Hora',
        bodyTopHex: 0xffffff,
        bodyBotHex: 0x2563eb,
        stripeA: '#2563eb',
        stripeB: '#ffffff',
        signColor: '#38bdf8',
      },
      {
        x: 28.2,
        z: 11.5,
        rotY: -Math.PI / 2,
        title: 'PASTEL & CALDO',
        subtitle: 'Pastel Quentinho da Praça',
        bodyTopHex: 0xfef08a,
        bodyBotHex: 0xdc2626,
        stripeA: '#dc2626',
        stripeB: '#facc15',
        signColor: '#facc15',
      },
      {
        x: -18.5,
        z: 28.2,
        rotY: Math.PI,
        title: 'BURGER DA PRAÇA',
        subtitle: 'X-Bragança & Batata Crocante',
        bodyTopHex: 0xffffff,
        bodyBotHex: 0x16a34a,
        stripeA: '#16a34a',
        stripeB: '#ffffff',
        signColor: '#4ade80',
      },
      {
        x: 18.5,
        z: 28.2,
        rotY: Math.PI,
        title: 'LANCHES BRAGANÇA',
        subtitle: 'Tacacá, Sucos & Salgados',
        bodyTopHex: 0xffffff,
        bodyBotHex: 0xf97316,
        stripeA: '#f97316',
        stripeB: '#ffffff',
        signColor: '#fb923c',
      },
    ];

    for (const td of trailerDefs) {
      registerProp(td.x, td.z, 3.2);
      const trGroup = new THREE.Group();
      trGroup.position.set(td.x, 0, td.z);
      trGroup.rotation.y = td.rotY;

      const lowerBody = new THREE.Mesh(
        new THREE.BoxGeometry(5.6, 1.35, 2.9),
        new THREE.MeshStandardMaterial({ color: td.bodyBotHex, roughness: 0.4 })
      );
      lowerBody.position.y = 0.95;

      const upperBody = new THREE.Mesh(
        new THREE.BoxGeometry(5.6, 1.55, 2.9),
        new THREE.MeshStandardMaterial({ color: td.bodyTopHex, roughness: 0.35 })
      );
      upperBody.position.y = 2.4;

      const roofCap = new THREE.Mesh(
        new THREE.BoxGeometry(5.8, 0.22, 3.1),
        new THREE.MeshStandardMaterial({ color: td.bodyBotHex, roughness: 0.4 })
      );
      roofCap.position.y = 3.28;

      for (const wx of [-1.65, 1.65]) {
        for (const wz of [-1.48, 1.48]) {
          const wheel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.42, 0.42, 0.28, 14),
            wheelBlackMat
          );
          wheel.rotation.x = Math.PI / 2;
          wheel.position.set(wx, 0.42, wz);
          trGroup.add(wheel);
        }
      }
      const hitchBar = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.16, 0.5), hitchSteelMat);
      hitchBar.position.set(3.25, 0.55, 0);
      const hitchJack = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.1, 0.55, 8),
        hitchSteelMat
      );
      hitchJack.position.set(3.6, 0.28, 0);

      const serviceWindow = new THREE.Mesh(
        new THREE.BoxGeometry(3.5, 1.15, 0.12),
        warmWindowMat
      );
      serviceWindow.position.set(0, 2.35, 1.45);

      const serviceCounter = new THREE.Mesh(
        new THREE.BoxGeometry(3.8, 0.16, 0.65),
        counterStainlessMat
      );
      serviceCounter.position.set(0, 1.68, 1.72);

      const awningTex = createStripedAwningTexture(td.stripeA, td.stripeB);
      const awningMesh = new THREE.Mesh(
        new THREE.BoxGeometry(4.1, 0.12, 1.45),
        new THREE.MeshStandardMaterial({ map: awningTex, roughness: 0.45 })
      );
      awningMesh.position.set(0, 3.05, 2.02);
      awningMesh.rotation.x = 0.22;

      const trSignTex = createPortalSignTexture(td.title, td.subtitle, td.signColor);
      const trSignMesh = new THREE.Mesh(
        new THREE.BoxGeometry(4.5, 1.15, 0.24),
        new THREE.MeshStandardMaterial({ map: trSignTex, roughness: 0.25 })
      );
      trSignMesh.position.set(0, 4.02, 0.35);

      trGroup.add(
        lowerBody,
        upperBody,
        roofCap,
        hitchBar,
        hitchJack,
        serviceWindow,
        serviceCounter,
        awningMesh,
        trSignMesh
      );
      scene.add(trGroup);

      const isRotated90 = Math.abs(Math.sin(td.rotY)) > 0.7;
      addCollider(
        td.x,
        1.8,
        td.z,
        isRotated90 ? 3.5 : 6.4,
        3.6,
        isRotated90 ? 6.4 : 3.5,
        true
      );
    }

    // 6 Carrinhos de Lanche + Conjuntos de Mesa e Cadeiras (radius: 2.2) posicionados na borda externa pavimentada
    const glassCaseMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.55,
      roughness: 0.15,
      metalness: 0.2,
    });
    const cartRedYellowUmbrellaTex = createStripedAwningTexture('#dc2626', '#facc15');
    const cartBlueWhiteUmbrellaTex = createStripedAwningTexture('#2563eb', '#ffffff');
    const tablePlasticMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 });
    const stoolRedMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.45 });
    const stoolBlueMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.45 });

    // Coordenadas nas calçadas periféricas longe de qualquer árvore (> 8 unidades de distância de qualquer canteiro)
    const snackCartCoords: {
      x: number;
      z: number;
      useRedYellow: boolean;
      tableDx: number;
      tableDz: number;
    }[] = [
      { x: 26.8, z: -21.5, useRedYellow: true, tableDx: -3.2, tableDz: 0 },
      { x: 26.8, z: 21.5, useRedYellow: false, tableDx: -3.2, tableDz: 0 },
      { x: -26.8, z: -21.5, useRedYellow: true, tableDx: 3.2, tableDz: 0 },
      { x: -26.8, z: -11.5, useRedYellow: false, tableDx: 3.2, tableDz: 0 },
      { x: -10.5, z: 27.5, useRedYellow: true, tableDx: 0, tableDz: -3.1 },
      { x: 10.5, z: 27.5, useRedYellow: false, tableDx: 0, tableDz: -3.1 },
    ];

    snackCartCoords.forEach((sc) => {
      if (!canPlaceProp(sc.x, sc.z, 1.4)) return;
      registerProp(sc.x, sc.z, 1.4);

      const cartGroup = new THREE.Group();
      cartGroup.position.set(sc.x, 0, sc.z);

      const cartBase = new THREE.Mesh(
        new THREE.BoxGeometry(1.75, 0.95, 1.15),
        new THREE.MeshStandardMaterial({
          color: sc.useRedYellow ? 0xdc2626 : 0x2563eb,
          roughness: 0.4,
        })
      );
      cartBase.position.y = 0.68;

      const cartTray = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, 0.1, 1.28),
        hitchSteelMat
      );
      cartTray.position.y = 1.2;

      const displayCase = new THREE.Mesh(
        new THREE.BoxGeometry(1.65, 0.62, 1.05),
        glassCaseMat
      );
      displayCase.position.y = 1.56;

      const handleBar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8),
        hitchSteelMat
      );
      handleBar.rotation.x = Math.PI / 2;
      handleBar.position.set(-1.02, 1.1, 0);

      for (const cx of [-0.68, 0.68]) {
        for (const cz of [-0.52, 0.52]) {
          const cWheel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22, 0.22, 0.14, 12),
            wheelBlackMat
          );
          cWheel.rotation.x = Math.PI / 2;
          cWheel.position.set(cx, 0.22, cz);
          cartGroup.add(cWheel);
        }
      }

      const umbrellaPole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8),
        whitePoleMat
      );
      umbrellaPole.position.y = 2.15;

      const umbrellaCanopy = new THREE.Mesh(
        new THREE.ConeGeometry(1.65, 0.72, 8),
        new THREE.MeshStandardMaterial({
          map: sc.useRedYellow ? cartRedYellowUmbrellaTex : cartBlueWhiteUmbrellaTex,
          roughness: 0.45,
          side: THREE.DoubleSide,
        })
      );
      umbrellaCanopy.position.y = 3.45;

      cartGroup.add(cartBase, cartTray, displayCase, handleBar, umbrellaPole, umbrellaCanopy);
      addCollider(sc.x, 1.5, sc.z, 2.1, 3.0, 1.5, true);

      // Conjunto de Mesa e Cadeiras (radius: 2.2) validado contra placedProps
      const tx = sc.x + sc.tableDx;
      const tz = sc.z + sc.tableDz;
      if (canPlaceProp(tx, tz, 2.2)) {
        registerProp(tx, tz, 2.2);
        const tableTop = new THREE.Mesh(
          new THREE.CylinderGeometry(0.78, 0.78, 0.08, 14),
          tablePlasticMat
        );
        tableTop.position.set(sc.tableDx, 0.76, sc.tableDz);
        const tableLeg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.16, 0.76, 10),
          whitePoleMat
        );
        tableLeg.position.set(sc.tableDx, 0.38, sc.tableDz);

        const stoolMat = sc.useRedYellow ? stoolRedMat : stoolBlueMat;
        const stool1 = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.32, 0.44, 12),
          stoolMat
        );
        stool1.position.set(sc.tableDx - 0.88, 0.22, sc.tableDz);
        const stool2 = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.32, 0.44, 12),
          stoolMat
        );
        stool2.position.set(sc.tableDx + 0.88, 0.22, sc.tableDz);

        cartGroup.add(tableTop, tableLeg, stool1, stool2);
        addCollider(tx, 0.4, tz, 2.1, 0.8, 1.5, true);
      }

      scene.add(cartGroup);
    });

    // Escadas e Mirante Elevado (Left Side of Plaza: x = -24.5, z = 11.5)
    const terraceGroup = new THREE.Group();
    const stepMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.35,
      metalness: 0.2,
    });
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.2,
    });

    const numSteps = 5;
    const stepH = 0.4;
    const stepDepth = 1.1;
    const stepWidth = 4.6;
    const stairStartX = -24.5;
    const stairBaseZ = 15.5;

    for (let s = 0; s < numSteps; s++) {
      const topY = (s + 1) * stepH;
      const sz = stairBaseZ - s * stepDepth;
      const stepMesh = new THREE.Mesh(
        new THREE.BoxGeometry(stepWidth, topY, stepDepth),
        s % 2 === 0 ? stepMat : platformMat
      );
      stepMesh.position.set(stairStartX, topY / 2, sz);
      stepMesh.castShadow = !isSoftwareGl;
      stepMesh.receiveShadow = true;
      terraceGroup.add(stepMesh);
      addCollider(stairStartX, topY / 2, sz, stepWidth, topY, stepDepth, true);
    }

    const deckH = numSteps * stepH;
    const deckW = 5.6;
    const deckD = 6.5;
    const deckZ = stairBaseZ - numSteps * stepDepth - deckD / 2 + 0.55;
    const deckMesh = new THREE.Mesh(
      new THREE.BoxGeometry(deckW, deckH, deckD),
      platformMat
    );
    deckMesh.position.set(stairStartX, deckH / 2, deckZ);
    deckMesh.castShadow = !isSoftwareGl;
    deckMesh.receiveShadow = true;
    terraceGroup.add(deckMesh);
    addCollider(stairStartX, deckH / 2, deckZ, deckW, deckH, deckD, true);
    scene.add(terraceGroup);

    // Totem 3D de Ranking (Top 3 da Turma) at x = -18, z = -15
    const totemGroup = new THREE.Group();
    totemGroup.position.set(-18, 0, -15);
    const totemTex = createTop3TotemTexture(top3Students);
    const totemBoard = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 4.8, 0.5),
      new THREE.MeshStandardMaterial({ map: totemTex, roughness: 0.3 })
    );
    totemBoard.position.y = 3.2;
    const totemBase = new THREE.Mesh(
      new THREE.BoxGeometry(5.4, 0.9, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x1e293b })
    );
    totemBase.position.y = 0.45;
    totemGroup.add(totemBase, totemBoard);
    scene.add(totemGroup);
    addCollider(-18, 2.5, -15, 5.4, 5.0, 1.4, true);

    // Plataforma Círculo de Energia ("Zona de Farmar Aura") at x = 18, z = -15
    const AURA_ZONE_X = 18;
    const AURA_ZONE_Z = -15;
    const AURA_ZONE_RADIUS = 3.5;

    const auraZoneGroup = new THREE.Group();
    auraZoneGroup.position.set(AURA_ZONE_X, 0, AURA_ZONE_Z);

    const auraPadBase = new THREE.Mesh(
      new THREE.CylinderGeometry(AURA_ZONE_RADIUS, AURA_ZONE_RADIUS + 0.35, 0.24, 32),
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.3,
        metalness: 0.6,
      })
    );
    auraPadBase.position.y = 0.12;

    const auraOuterRing = new THREE.Mesh(
      new THREE.TorusGeometry(AURA_ZONE_RADIUS - 0.15, 0.12, 12, 40),
      new THREE.MeshStandardMaterial({
        color: 0x00f5d4,
        emissive: 0x00f5d4,
        emissiveIntensity: 1.5,
      })
    );
    auraOuterRing.rotation.x = Math.PI / 2;
    auraOuterRing.position.y = 0.26;

    const auraInnerRing = new THREE.Mesh(
      new THREE.TorusGeometry(AURA_ZONE_RADIUS * 0.62, 0.09, 12, 32),
      new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xeab308,
        emissiveIntensity: 1.4,
      })
    );
    auraInnerRing.rotation.x = Math.PI / 2;
    auraInnerRing.position.y = 0.28;

    const auraSignTex = createPortalSignTexture(
      '⚡ ZONA DE FARMAR AURA',
      'Suba aqui: +Aura e +2 Coins / 10s',
      '#00f5d4'
    );
    const auraSignBoard = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 1.6, 0.22),
      new THREE.MeshStandardMaterial({ map: auraSignTex, roughness: 0.25 })
    );
    auraSignBoard.position.set(0, 4.4, 0);

    auraZoneGroup.add(auraPadBase, auraOuterRing, auraInnerRing, auraSignBoard);
    scene.add(auraZoneGroup);

    // =========================================================================
    // 8 PORTAIS TECNOLÓGICOS ALINHADOS (SEM TRILHA/TAPETE NO CHÃO)
    // =========================================================================
    const PORTAL_Z = -26.5;
    const portalDefs: {
      id:
        | 'obby'
        | 'survival'
        | 'turbo_race'
        | 'vehicle_rally'
        | 'multiplayer'
        | 'penalty'
        | 'caete_boat'
        | 'shop';
      title: string;
      subtitle: string;
      colorHex: string;
      colorNum: number;
      x: number;
      z: number;
    }[] = [
      {
        id: 'obby',
        title: '🏔️ TORRE OBBY',
        subtitle: 'Parkour 3D & Geometria',
        colorHex: '#10b981',
        colorNum: 0x10b981,
        x: -22.4,
        z: PORTAL_Z,
      },
      {
        id: 'survival',
        title: '🔥 SOBREVIVÊNCIA',
        subtitle: 'Arena do Piso que Cai',
        colorHex: '#f59e0b',
        colorNum: 0xf59e0b,
        x: -16.0,
        z: PORTAL_Z,
      },
      {
        id: 'turbo_race',
        title: '⚡ CORRIDA TURBO',
        subtitle: 'Tabuada na Orla',
        colorHex: '#0ea5e9',
        colorNum: 0x0ea5e9,
        x: -9.6,
        z: PORTAL_Z,
      },
      {
        id: 'vehicle_rally',
        title: '🏎️ RALI DE KART',
        subtitle: 'Drift & Praia de Ajuruteua',
        colorHex: '#facc15',
        colorNum: 0xfacc15,
        x: -3.2,
        z: PORTAL_Z,
      },
      {
        id: 'multiplayer',
        title: '⚔️ MULTIPLAYER',
        subtitle: 'Kart 6P & Duelo 1v1',
        colorHex: '#06b6d4',
        colorNum: 0x06b6d4,
        x: 3.2,
        z: PORTAL_Z,
      },
      {
        id: 'penalty',
        title: '⚽ PÊNALTIS CAETÉ',
        subtitle: 'Estádio do Caeté',
        colorHex: '#22c55e',
        colorNum: 0x22c55e,
        x: 9.6,
        z: PORTAL_Z,
      },
      {
        id: 'caete_boat',
        title: '🚤 REGATA CAETÉ',
        subtitle: 'Voadeira · Tabuada Lógica',
        colorHex: '#14b8a6',
        colorNum: 0x14b8a6,
        x: 16.0,
        z: PORTAL_Z,
      },
      {
        id: 'shop',
        title: '👕 VESTIÁRIO',
        subtitle: '19 Times & Acessórios',
        colorHex: '#a855f7',
        colorNum: 0xa855f7,
        x: 22.4,
        z: PORTAL_Z,
      },
    ];

    interface TechPortalAnim {
      outerRing: THREE.Mesh;
      innerRing: THREE.Mesh;
      curtainTex: THREE.CanvasTexture;
      particles: { mesh: THREE.Mesh; baseAngle: number; speed: number; offset: number }[];
    }
    const techPortals: TechPortalAnim[] = [];
    const darkFrameMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.25,
      metalness: 0.85,
    });

    for (const p of portalDefs) {
      const pGroup = new THREE.Group();
      pGroup.position.set(p.x, 0, p.z);

      const techPad = new THREE.Mesh(
        new THREE.CylinderGeometry(2.15, 2.45, 0.24, 24),
        darkFrameMat
      );
      techPad.position.y = 0.12;

      const padNeonRing = new THREE.Mesh(
        new THREE.TorusGeometry(2.12, 0.08, 12, 28),
        new THREE.MeshStandardMaterial({
          color: p.colorNum,
          emissive: p.colorNum,
          emissiveIntensity: 1.5,
        })
      );
      padNeonRing.rotation.x = Math.PI / 2;
      padNeonRing.position.y = 0.25;

      const outerFrame = new THREE.Mesh(
        new THREE.TorusGeometry(1.78, 0.22, 14, 32),
        darkFrameMat
      );
      outerFrame.position.y = 2.02;

      const outerNeonRing = new THREE.Mesh(
        new THREE.TorusGeometry(1.66, 0.09, 12, 32),
        new THREE.MeshStandardMaterial({
          color: p.colorNum,
          emissive: p.colorNum,
          emissiveIntensity: 1.6,
        })
      );
      outerNeonRing.position.set(0, 2.02, 0.13);

      const innerNeonRing = new THREE.Mesh(
        new THREE.TorusGeometry(1.3, 0.065, 12, 28),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: p.colorNum,
          emissiveIntensity: 1.8,
        })
      );
      innerNeonRing.position.set(0, 2.02, -0.07);

      const holoTex = createHologramGridTexture(p.colorHex);
      const holoCurtain = new THREE.Mesh(
        new THREE.CircleGeometry(1.62, 28),
        new THREE.MeshBasicMaterial({
          map: holoTex,
          transparent: true,
          opacity: 0.45,
          side: THREE.DoubleSide,
        })
      );
      holoCurtain.position.y = 2.02;

      const pMat = new THREE.MeshBasicMaterial({ color: p.colorNum });
      const pGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
      const portalParticles: { mesh: THREE.Mesh; baseAngle: number; speed: number; offset: number }[] = [];
      for (let k = 0; k < 8; k++) {
        const pm = new THREE.Mesh(pGeo, pMat);
        pGroup.add(pm);
        portalParticles.push({
          mesh: pm,
          baseAngle: (k / 8) * Math.PI * 2,
          speed: 1.4 + (k % 3) * 0.4,
          offset: k * 0.45,
        });
      }

      // Placa apoiada diretamente no topo do arco (y = 3.5) inclinada 12° para frente (legível de longe e de perto)
      const signTex = createPortalSignTexture(p.title, p.subtitle, p.colorHex);
      const signMesh = new THREE.Mesh(
        new THREE.BoxGeometry(4.0, 1.5, 0.22),
        new THREE.MeshStandardMaterial({
          map: signTex,
          roughness: 0.22,
          emissive: 0x0f172a,
          emissiveIntensity: 0.22,
        })
      );
      signMesh.position.set(0, 3.5, 0.34);
      signMesh.rotation.x = THREE.MathUtils.degToRad(12);

      pGroup.add(
        techPad,
        padNeonRing,
        outerFrame,
        outerNeonRing,
        innerNeonRing,
        holoCurtain,
        signMesh
      );
      scene.add(pGroup);

      techPortals.push({
        outerRing: outerNeonRing,
        innerRing: innerNeonRing,
        curtainTex: holoTex,
        particles: portalParticles,
      });
    }

    // =========================================================================
    // 3.3. 4 VEÍCULOS ESTACIONADOS DISPONÍVEIS PARA PASSEIO NA RUA
    // =========================================================================
    interface ActiveVehicleEntity {
      def: PlazaVehicleDef;
      kartRig: KartRig;
      x: number;
      y: number;
      z: number;
      rotY: number;
      speed: number;
      velY: number;
    }
    const vehicleEntities = new Map<string, ActiveVehicleEntity>();

    for (const vDef of PLAZA_VEHICLES) {
      // Vaga demarcada no asfalto
      const bayGroup = new THREE.Group();
      bayGroup.position.set(vDef.spawnX, 0.02, vDef.spawnZ);
      bayGroup.rotation.y = vDef.spawnRotY;
      const bayBorder = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.02, 4.2),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true })
      );
      bayGroup.add(bayBorder);
      scene.add(bayGroup);

      const kartRig = createKartRig(
        student.avatarColor,
        student.equippedHat,
        student.equippedJersey,
        vDef.style,
        vDef.primaryHex,
        vDef.secondaryHex
      );
      // Enquanto estacionado sem motorista, ocultamos o avatar sentado no banco
      kartRig.driverRig.root.visible = false;
      kartRig.root.position.set(vDef.spawnX, 0, vDef.spawnZ);
      kartRig.root.rotation.y = vDef.spawnRotY;
      scene.add(kartRig.root);

      vehicleEntities.set(vDef.id, {
        def: vDef,
        kartRig,
        x: vDef.spawnX,
        y: 0,
        z: vDef.spawnZ,
        rotY: vDef.spawnRotY,
        speed: 0,
        velY: 0,
      });
    }

    // Nuvens 3D no Céu
    const clouds: { group: THREE.Group; speed: number }[] = [];
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    for (let i = 0; i < 12; i++) {
      const cg = new THREE.Group();
      for (let b = 0; b < 3; b++) {
        const puff = new THREE.Mesh(
          new THREE.BoxGeometry(5.5 + b * 2, 2.0 + (b % 2), 4.2 + b),
          cloudMat
        );
        puff.position.set(b * 2.8 - 2.5, (b % 2) * 0.6, 0);
        cg.add(puff);
      }
      const angle = (i / 12) * Math.PI * 2;
      cg.position.set(
        Math.cos(angle) * (48 + (i % 3) * 14),
        26 + (i % 4) * 5,
        Math.sin(angle) * (48 + (i % 3) * 14) - 10
      );
      scene.add(cg);
      clouds.push({ group: cg, speed: 1.2 + (i % 3) * 0.5 });
    }

    // Build Local Player Avatar Rig + Overhead Billboard + Speech Bubble + Meme "Fá!" Shockwave Ring
    const localRig: AvatarRig = createAvatarRig(
      student.avatarColor,
      student.equippedHat,
      student.equippedJersey
    );
    scene.add(localRig.root);

    // Anel de Pulso Dourado/Vermelho para o Meme "Fá! 🎺💥"
    const faShockwaveRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.16, 12, 36),
      new THREE.MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0,
      })
    );
    faShockwaveRing.rotation.x = Math.PI / 2;
    faShockwaveRing.position.y = 1.1;
    scene.add(faShockwaveRing);

    const faShockwaveInner = new THREE.Mesh(
      new THREE.TorusGeometry(0.75, 0.14, 12, 32),
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0,
      })
    );
    faShockwaveInner.rotation.x = Math.PI / 2;
    faShockwaveInner.position.y = 1.2;
    scene.add(faShockwaveInner);

    let lastRenderedAuraPower = student.auraPower || 0;
    let lastRenderedFarming = false;
    let lastRenderedTitle: string | null = student.equippedTitle || null;

    const localLabelSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createBillboardTexture(
          student.name,
          student.grade,
          student.school,
          lastRenderedAuraPower,
          lastRenderedFarming,
          lastRenderedTitle
        ),
        transparent: true,
      })
    );
    localLabelSprite.scale.set(3.8, lastRenderedTitle ? 1.32 : 1.15, 1);
    localLabelSprite.position.set(0, 3.25, 0);
    scene.add(localLabelSprite);

    const localChatSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ transparent: true, opacity: 0 })
    );
    localChatSprite.scale.set(4.2, 1.15, 1);
    localChatSprite.position.set(0, 4.4, 0);
    scene.add(localChatSprite);
    let lastRenderedChatMsg: string | null = null;

    // Build Classmate Bots + Dynamic 60 FPS Real Online Peer Pool
    interface PeerEntity {
      id: string;
      rig: AvatarRig;
      baseX: number;
      baseZ: number;
      phase: number;
      chatSprite: THREE.Sprite;
      lastChat: string | null;
      isSimFarming: boolean;
    }
    const peerEntities = new Map<string, PeerEntity>();

    simulatedClassmates.forEach((mate, idx) => {
      const jersey = mate.equippedJersey || CLASSMATE_JERSEYS[idx % CLASSMATE_JERSEYS.length];
      const rig = createAvatarRig(mate.avatarColor, mate.equippedHat, jersey);
      const isSimFarming = idx === 0;
      const angle = ((idx + 1) / simulatedClassmates.length) * Math.PI * 2;
      const bx = isSimFarming ? AURA_ZONE_X - 1.4 : Math.cos(angle) * 7.5;
      const bz = isSimFarming ? AURA_ZONE_Z + 0.8 : Math.sin(angle) * 5.5 + 5.5;
      rig.root.position.set(bx, 0, bz);

      const label = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: createBillboardTexture(
            mate.name,
            mate.grade,
            mate.school,
            (idx + 2) * 15,
            isSimFarming,
            mate.equippedTitle || null
          ),
          transparent: true,
        })
      );
      label.scale.set(3.5, mate.equippedTitle ? 1.24 : 1.05, 1);
      label.position.set(0, 3.25, 0);
      rig.root.add(label);

      const chatSp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0 }));
      chatSp.scale.set(4.0, 1.1, 1);
      chatSp.position.set(0, 4.35, 0);
      rig.root.add(chatSp);

      scene.add(rig.root);
      peerEntities.set(mate.id, {
        id: mate.id,
        rig,
        baseX: bx,
        baseZ: bz,
        phase: idx * 1.7,
        chatSprite: chatSp,
        lastChat: null,
        isSimFarming,
      });
    });

    // Dynamic Real Online Peers (spawned/interpolated at 60 FPS for EVERY connected student)
    interface LiveOnlinePeerEntity {
      id: string;
      group: THREE.Group;
      avatarRig: AvatarRig;
      kartRig: KartRig | null;
      kartStyle: VehicleModelStyle | null;
      labelSprite: THREE.Sprite;
      chatSprite: THREE.Sprite;
      lastChat: string | null;
      lastTitle: string | null;
      lastAuraPower: number;
      lastFarming: boolean;
      curPos: THREE.Vector3;
      curRotY: number;
      lastSeenMs: number;
    }
    const dynamicOnlinePeers = new Map<string, LiveOnlinePeerEntity>();
    const _peerTargetPos = new THREE.Vector3();

    // Connect Realtime Presence Manager (Presence Metadata + 15 Hz Broadcast 'player_state')
    const initialPresence: OnlinePlayerPresence = {
      id: student.id,
      name: student.name,
      grade: student.grade,
      school: student.school,
      avatarColor: student.avatarColor,
      equippedHat: student.equippedHat || null,
      equippedJersey: student.equippedJersey || null,
      equippedBack: student.equippedBack || null,
      equippedAura: student.equippedAura || null,
      equippedTitle: student.equippedTitle || null,
      movementStyle: student.movementStyle || 'classic',
      auraPower: student.auraPower || 0,
      isFarmingAura: false,
      drivingVehicleId: null,
      isDriving: false,
      vehicleType: null,
      x: 0,
      y: 0,
      z: 9,
      rotY: 0,
      isMoving: false,
      emote: null,
      emoteTimestamp: 0,
      chatMessage: null,
      chatTimestamp: 0,
      updatedAt: Date.now(),
    };
    const presence = new PlazaPresenceManager(initialPresence, (peers) => {
      setOnlinePeers(peers.filter((p) => p.id !== student.id));
    });
    presence.start();
    presenceManagerRef.current = presence;

    // Local Player Physics & Controls in Plaza
    const pos = { x: 0, y: 0, z: 9 };
    const vel = { x: 0, y: 0, z: 0 };
    let isGrounded = true;
    const MOVE_SPEED = 9.0;
    const GRAVITY = -28;
    const JUMP_VEL = 11.4;
    const HALF_W = 0.45;
    const HALF_D = 0.45;
    const STEP_HEIGHT = 0.5;
    let portalTriggered = false;
    let lastNearbyVehicleId: string | null = null;
    let lastNearbyPortalId: string | null = null;

    let cameraYaw = 0;
    let cameraPitchOffset = 0;
    let curFov = initialPortrait ? 82 : 72;
    let curCamDist = 10.5;
    let curCamHeight = 5.2;
    let curLookY = 2.4;
    let curLookFwd = 3.5;

    const keys = new Set<string>();
    let prevJumpTouch = false;
    let draggingCam = false;
    let camPointerId: number | null = null;
    let lastCamX = 0;
    let lastCamY = 0;

    const onKeyDown = (e: KeyboardEvent) => keys.add(e.code);
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    const onPointerDown = (e: PointerEvent) => {
      if (camPointerId !== null) return;
      camPointerId = e.pointerId;
      draggingCam = true;
      lastCamX = e.clientX;
      lastCamY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!draggingCam || e.pointerId !== camPointerId) return;
      const dx = e.clientX - lastCamX;
      const dy = e.clientY - lastCamY;
      lastCamX = e.clientX;
      lastCamY = e.clientY;
      cameraYawTargetRef.current -= dx * 0.0065;
      cameraPitchOffset = THREE.MathUtils.clamp(cameraPitchOffset + dy * 0.004, -0.24, 0.45);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId === camPointerId) {
        draggingCam = false;
        camPointerId = null;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      isPortraitRef.current = h > w;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    let lastBroadcast = 0;
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
      const now = Date.now();

      // 1. Animate 3 Flagpoles Wave (Bandeira do Brasil, Bandeira do Pará & Bandeira Oficial de Bragança-PA)
      const waveFlagGeometry = (
        geo: THREE.PlaneGeometry,
        phaseOffset: number,
        dir: number,
        halfWidth: number
      ) => {
        const posAttr = geo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < posAttr.count; i++) {
          const vx = posAttr.getX(i);
          const vy = posAttr.getY(i);
          const distFromMast = Math.max(0, (vx * dir + halfWidth) / (halfWidth * 2));
          const waveZ =
            Math.sin(elapsed * 5.2 - distFromMast * 4.5 + phaseOffset + vy * 0.6) *
            0.24 *
            distFromMast;
          posAttr.setZ(i, waveZ);
        }
        posAttr.needsUpdate = true;
      };
      waveFlagGeometry(brazilFlagGeo, 0, 1, 1.1);
      waveFlagGeometry(paraFlagGeo, 1.5, -1, 1.0);
      waveFlagGeometry(bragancaFlagGeo, 3.0, 1, 1.0);

      // Animate Technological Hologram Portals
      techPortals.forEach((tp, pIdx) => {
        tp.curtainTex.offset.y = (elapsed * 0.45 + pIdx * 0.2) % 1;
        tp.outerRing.rotation.z = elapsed * 1.4;
        tp.innerRing.rotation.z = -elapsed * 2.2;
        const scalePulse = 1 + Math.sin(elapsed * 3.5 + pIdx) * 0.04;
        tp.innerRing.scale.set(scalePulse, scalePulse, 1);

        tp.particles.forEach((pt) => {
          const cycle = (elapsed * pt.speed + pt.offset) % 4.2;
          const angle = pt.baseAngle + elapsed * 1.8;
          const rad = 1.85 + Math.sin(cycle * 2) * 0.25;
          pt.mesh.position.set(
            Math.cos(angle) * rad,
            0.4 + cycle,
            Math.sin(angle) * 0.35
          );
          pt.mesh.rotation.x = elapsed * 3;
          pt.mesh.rotation.y = elapsed * 2.5;
        });
      });

      auraOuterRing.rotation.z = elapsed * 1.8;
      auraInnerRing.rotation.z = -elapsed * 2.6;

      clouds.forEach((cl) => {
        cl.group.position.x += cl.speed * delta;
        if (cl.group.position.x > 85) cl.group.position.x = -85;
      });

      treeCrowns.forEach((tc, idx) => {
        tc.rotation.z = Math.sin(elapsed * 2.2 + idx) * 0.04;
      });

      // Handle Teleport to Aura Zone button click
      if (teleportToAuraZoneRef.current) {
        teleportToAuraZoneRef.current = false;
        pos.x = AURA_ZONE_X;
        pos.y = 0.25;
        pos.z = AURA_ZONE_Z;
        vel.x = 0;
        vel.y = 0;
        vel.z = 0;
      }

      // Handle Enter / Exit Vehicle Requests
      if (enterVehicleRequestRef.current) {
        const targetId = enterVehicleRequestRef.current;
        enterVehicleRequestRef.current = null;
        const veh = vehicleEntities.get(targetId);
        if (veh) {
          drivingVehicleIdRef.current = targetId;
          setDrivingVehicleId(targetId);
          setNearbyVehicle(null);
          lastNearbyVehicleId = null;
          veh.kartRig.driverRig.root.visible = true;
          localRig.root.visible = false;
          pos.x = veh.x;
          pos.y = veh.y;
          pos.z = veh.z;
          cameraYawTargetRef.current = veh.rotY;
        }
      }

      if (exitVehicleRequestRef.current && drivingVehicleIdRef.current) {
        exitVehicleRequestRef.current = false;
        const activeVeh = vehicleEntities.get(drivingVehicleIdRef.current);
        if (activeVeh) {
          activeVeh.speed = 0;
          activeVeh.kartRig.driverRig.root.visible = false;
          animateKartRig(activeVeh.kartRig, 0, 0, false, 0, elapsed, delta);
          pos.x = activeVeh.x + Math.cos(activeVeh.rotY) * 2.2;
          pos.y = 0.1;
          pos.z = activeVeh.z - Math.sin(activeVeh.rotY) * 2.2;
        }
        drivingVehicleIdRef.current = null;
        setDrivingVehicleId(null);
        localRig.root.visible = true;
      }

      // 2. Read Movement / Steering Input
      let inputX = mobileInputRef.current.moveX;
      let inputY = mobileInputRef.current.moveY;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) inputX -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) inputX += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp') || driveControlsRef.current.throttle) inputY += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown') || driveControlsRef.current.brakeReverse)
        inputY -= 1;

      const activeVehId = drivingVehicleIdRef.current;
      const activeVehicle = activeVehId ? vehicleEntities.get(activeVehId) || null : null;

      let horizSpeed = 0;

      if (activeVehicle) {
        // =====================================================================
        // MODO DIREÇÃO DE VEÍCULO AO REDOR DA PRAÇA
        // =====================================================================
        const steer = THREE.MathUtils.clamp(inputX, -1, 1);
        const throttle = THREE.MathUtils.clamp(inputY, -1, 1);
        const MAX_SPEED = 18.5;
        const REVERSE_MAX = -8.5;

        if (throttle > 0.05) {
          activeVehicle.speed = THREE.MathUtils.damp(
            activeVehicle.speed,
            MAX_SPEED * throttle,
            4.5,
            delta
          );
        } else if (throttle < -0.05) {
          activeVehicle.speed = THREE.MathUtils.damp(
            activeVehicle.speed,
            REVERSE_MAX * Math.abs(throttle),
            5.5,
            delta
          );
        } else {
          activeVehicle.speed = THREE.MathUtils.damp(activeVehicle.speed, 0, 4.0, delta);
        }

        if (Math.abs(activeVehicle.speed) > 0.4) {
          const turnDir = activeVehicle.speed >= 0 ? 1 : -1;
          activeVehicle.rotY -= steer * 2.1 * turnDir * delta;
          soundEngine.playKartEngine(Math.abs(activeVehicle.speed) / MAX_SPEED, throttle > 0.7);
        }

        // Kart faces -Z in local space
        const forwardX = -Math.sin(activeVehicle.rotY);
        const forwardZ = -Math.cos(activeVehicle.rotY);
        let nextX = activeVehicle.x + forwardX * activeVehicle.speed * delta;
        let nextZ = activeVehicle.z + forwardZ * activeVehicle.speed * delta;

        // Mantém o veículo dentro dos limites seguros do mapa (±40.2)
        nextX = THREE.MathUtils.clamp(nextX, -40.2, 40.2);
        nextZ = THREE.MathUtils.clamp(nextZ, -40.2, 40.2);

        // Colisão simples do veículo com obstáculos altos (h > 0.5)
        for (const c of plazaColliders) {
          if (c.h <= 0.5) continue;
          const overlapX = nextX + 1.1 > c.x - c.w / 2 && nextX - 1.1 < c.x + c.w / 2;
          const overlapZ = nextZ + 1.1 > c.z - c.d / 2 && nextZ - 1.1 < c.z + c.d / 2;
          if (overlapX && overlapZ) {
            activeVehicle.speed *= -0.35;
            nextX = activeVehicle.x;
            nextZ = activeVehicle.z;
            break;
          }
        }

        activeVehicle.x = nextX;
        activeVehicle.z = nextZ;

        // Verifica salto suave nas lombadas (quebra-molas) e nas 2 rampas laterais
        if (activeVehicle.y <= 0.05 && Math.abs(activeVehicle.speed) > 3.5) {
          for (const sb of speedBumpCoords) {
            if (Math.hypot(activeVehicle.x - sb.x, activeVehicle.z - sb.z) < 2.2) {
              activeVehicle.velY = 4.8;
              soundEngine.playJump();
              break;
            }
          }
          for (const jr of jumpRampCoords) {
            if (Math.hypot(activeVehicle.x - jr.x, activeVehicle.z - jr.z) < 2.5) {
              activeVehicle.velY = 9.8;
              soundEngine.playJumpPad();
              break;
            }
          }
        }

        activeVehicle.velY += GRAVITY * delta;
        activeVehicle.y += activeVehicle.velY * delta;
        if (activeVehicle.y < 0) {
          activeVehicle.y = 0;
          activeVehicle.velY = 0;
        }

        activeVehicle.kartRig.root.position.set(
          activeVehicle.x,
          activeVehicle.y,
          activeVehicle.z
        );
        activeVehicle.kartRig.root.rotation.y = activeVehicle.rotY;

        animateKartRig(
          activeVehicle.kartRig,
          activeVehicle.speed,
          steer,
           activeVehicle.speed > 12,
          0,
          elapsed,
          delta
        );

        pos.x = activeVehicle.x;
        pos.y = activeVehicle.y;
        pos.z = activeVehicle.z;
        localRig.root.rotation.y = activeVehicle.rotY;
        horizSpeed = Math.abs(activeVehicle.speed);

        // Câmera acompanha suavemente atrás do veículo
        cameraYawTargetRef.current = THREE.MathUtils.damp(
          cameraYawTargetRef.current,
          activeVehicle.rotY,
          4.5,
          delta
        );
        cameraYaw = THREE.MathUtils.damp(cameraYaw, cameraYawTargetRef.current, 8, delta);
      } else {
        // =====================================================================
        // MODO A PÉ NA PRAÇA
        // =====================================================================
        const mag = Math.hypot(inputX, inputY);
        if (mag > 1) {
          inputX /= mag;
          inputY /= mag;
        }

        cameraYaw = THREE.MathUtils.damp(cameraYaw, cameraYawTargetRef.current, 12, delta);
        const sinY = Math.sin(cameraYaw);
        const cosY = Math.cos(cameraYaw);
        const worldVx = (inputX * cosY - inputY * sinY) * MOVE_SPEED;
        const worldVz = (-inputX * sinY - inputY * cosY) * MOVE_SPEED;

        vel.x = THREE.MathUtils.damp(vel.x, worldVx, 16, delta);
        vel.z = THREE.MathUtils.damp(vel.z, worldVz, 16, delta);

        const jumpTouch = mobileInputRef.current.jumpPressed;
        if ((keys.has('Space') || (jumpTouch && !prevJumpTouch)) && isGrounded) {
          vel.y = JUMP_VEL;
          isGrounded = false;
          soundEngine.playJump();
        }
        prevJumpTouch = jumpTouch;

        // AABB Collision Resolution with Auto-Step
        pos.x += vel.x * delta;
        for (const c of plazaColliders) {
          if (!c.blockPlayer) continue;
          const cTop = c.y + c.h / 2;
          const cBot = c.y - c.h / 2;
          if (pos.y + 2.3 <= cBot || pos.y >= cTop - 0.05) continue;

          const overlapZ = pos.z + HALF_D > c.z - c.d / 2 && pos.z - HALF_D < c.z + c.d / 2;
          if (!overlapZ) continue;

          const cLeft = c.x - c.w / 2;
          const cRight = c.x + c.w / 2;
          if (pos.x + HALF_W > cLeft && pos.x - HALF_W < cRight) {
            if (cTop <= pos.y + STEP_HEIGHT) continue;
            if (vel.x > 0) pos.x = cLeft - HALF_W;
            else if (vel.x < 0) pos.x = cRight + HALF_W;
            vel.x = 0;
          }
        }

        pos.z += vel.z * delta;
        for (const c of plazaColliders) {
          if (!c.blockPlayer) continue;
          const cTop = c.y + c.h / 2;
          const cBot = c.y - c.h / 2;
          if (pos.y + 2.3 <= cBot || pos.y >= cTop - 0.05) continue;

          const overlapX = pos.x + HALF_W > c.x - c.w / 2 && pos.x - HALF_W < c.x + c.w / 2;
          if (!overlapX) continue;

          const cBack = c.z - c.d / 2;
          const cFront = c.z + c.d / 2;
          if (pos.z + HALF_D > cBack && pos.z - HALF_D < cFront) {
            if (cTop <= pos.y + STEP_HEIGHT) continue;
            if (vel.z > 0) pos.z = cBack - HALF_D;
            else if (vel.z < 0) pos.z = cFront + HALF_D;
            vel.z = 0;
          }
        }

        vel.y += GRAVITY * delta;
        pos.y += vel.y * delta;

        let supportY = 0;
        for (const c of plazaColliders) {
          if (!c.blockPlayer) continue;
          const overlapX = pos.x + HALF_W > c.x - c.w / 2 && pos.x - HALF_W < c.x + c.w / 2;
          const overlapZ = pos.z + HALF_D > c.z - c.d / 2 && pos.z - HALF_D < c.z + c.d / 2;
          if (!overlapX || !overlapZ) continue;

          const cTop = c.y + c.h / 2;
          if (pos.y + STEP_HEIGHT >= cTop && cTop > supportY) {
            supportY = cTop;
          }
        }

        if (pos.y <= supportY) {
          pos.y = supportY;
          vel.y = 0;
          isGrounded = true;
        }

        horizSpeed = Math.hypot(vel.x, vel.z);
        if (horizSpeed > 0.5) {
          const targetAngle = Math.atan2(vel.x, vel.z);
          let diff = targetAngle - localRig.root.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          localRig.root.rotation.y += diff * Math.min(1, delta * 14);
        }

        // Detecta proximidade (< 3.5u) de qualquer um dos 4 veículos estacionados
        let foundNear: PlazaVehicleDef | null = null;
        vehicleEntities.forEach((ve) => {
          const d = Math.hypot(pos.x - ve.x, pos.z - ve.z);
          if (d < 3.5 && !foundNear) {
            foundNear = ve.def;
          }
        });
        const foundId = foundNear ? (foundNear as PlazaVehicleDef).id : null;
        if (foundId !== lastNearbyVehicleId) {
          lastNearbyVehicleId = foundId;
          setNearbyVehicle(foundNear);
        }
      }

      // Check if player is inside the Energy Circle ("Zona de Farmar Aura")
      const distToAuraZone = Math.hypot(pos.x - AURA_ZONE_X, pos.z - AURA_ZONE_Z);
      const inAuraCircle = !activeVehicle && distToAuraZone <= AURA_ZONE_RADIUS;
      if (inAuraCircle && !isFarmingRef.current && horizSpeed < 1.2) {
        isFarmingRef.current = true;
        setIsFarmingAura(true);
      } else if ((!inAuraCircle || activeVehicle) && isFarmingRef.current && horizSpeed > 2.5) {
        isFarmingRef.current = false;
        setIsFarmingAura(false);
      }

      const activeFarming = !activeVehicle && isFarmingRef.current && horizSpeed < 1.5;

      // Refresh local overhead billboard if Aura Power, farming state, or equippedTitle changed
      const curAuraPower = studentRef.current.auraPower || 0;
      const curEquippedTitle = studentRef.current.equippedTitle || null;
      if (
        curAuraPower !== lastRenderedAuraPower ||
        activeFarming !== lastRenderedFarming ||
        curEquippedTitle !== lastRenderedTitle
      ) {
        lastRenderedAuraPower = curAuraPower;
        lastRenderedFarming = activeFarming;
        lastRenderedTitle = curEquippedTitle;
        const lMat = localLabelSprite.material as THREE.SpriteMaterial;
        lMat.map = createBillboardTexture(
          studentRef.current.name,
          studentRef.current.grade,
          studentRef.current.school,
          curAuraPower,
          activeFarming,
          curEquippedTitle
        );
        localLabelSprite.scale.set(3.8, curEquippedTitle ? 1.32 : 1.15, 1);
        lMat.needsUpdate = true;
      }

      // Check Active Emote & Quick Chat Expiration
      const currentEmote = now < emoteRef.current.until ? emoteRef.current.emote : null;
      const currentChat = now < chatRef.current.until ? chatRef.current.msg : null;

      if (currentChat !== lastRenderedChatMsg) {
        lastRenderedChatMsg = currentChat;
        const mat = localChatSprite.material as THREE.SpriteMaterial;
        if (currentChat) {
          mat.map = createSpeechBubbleTexture(currentChat);
          mat.opacity = 1;
        } else {
          mat.opacity = 0;
        }
        mat.needsUpdate = true;
      }

      // Posiciona o Billboard e o Balão de Chat acima do jogador (ou do veículo)
      localLabelSprite.position.set(pos.x, pos.y + 3.25, pos.z);
      localChatSprite.position.set(pos.x, pos.y + 4.4, pos.z);

      // Anima o pulso dourado/vermelho do Meme "Fá! 🎺💥"
      if (now < faBurstUntilRef.current) {
        const progress = 1 - (faBurstUntilRef.current - now) / 1250;
        const ringScale = 1 + progress * 4.5;
        faShockwaveRing.position.set(pos.x, pos.y + 1.0, pos.z);
        faShockwaveRing.scale.set(ringScale, ringScale, 1);
        (faShockwaveRing.material as THREE.MeshBasicMaterial).opacity = Math.max(
          0,
          0.95 * (1 - progress)
        );

        const innerScale = 1 + progress * 3.2;
        faShockwaveInner.position.set(pos.x, pos.y + 1.15, pos.z);
        faShockwaveInner.scale.set(innerScale, innerScale, 1);
        (faShockwaveInner.material as THREE.MeshBasicMaterial).opacity = Math.max(
          0,
          0.95 * (1 - progress)
        );
      } else {
        (faShockwaveRing.material as THREE.MeshBasicMaterial).opacity = 0;
        (faShockwaveInner.material as THREE.MeshBasicMaterial).opacity = 0;
      }

      localRig.root.position.set(pos.x, pos.y, pos.z);
      if (!activeVehicle) {
        animateAvatarRig(
          localRig,
          horizSpeed,
          isGrounded,
          elapsed,
          delta,
          currentEmote,
          studentRef.current.movementStyle || 'classic',
          activeFarming
        );
      }

      // Check Physical Portal Proximity (< 4.5u HUD card) & Entry (< 2.25u) along z = -26.5
      let closestPortal: NearbyPortalInfo | null = null;
      let closestPortalDist = 4.5;
      for (const p of portalDefs) {
        const dist = Math.hypot(pos.x - p.x, pos.z - p.z);
        if (dist < closestPortalDist) {
          closestPortalDist = dist;
          closestPortal = {
            id: p.id,
            title: p.title,
            subtitle: p.subtitle,
            colorHex: p.colorHex,
          };
        }
        if (!portalTriggered && dist < 2.25) {
          portalTriggered = true;
          soundEngine.playCheckpoint();
          if (p.id === 'shop') {
            callbacksRef.current.onOpenShop();
          } else if (p.id === 'multiplayer') {
            callbacksRef.current.onOpenMultiplayer();
            window.setTimeout(() => {
              portalTriggered = false;
            }, 2000);
          } else {
            callbacksRef.current.onEnterGameMode(p.id);
          }
          break;
        }
      }
      const nextPortalId = closestPortal ? closestPortal.id : null;
      if (nextPortalId !== lastNearbyPortalId) {
        lastNearbyPortalId = nextPortalId;
        setNearbyPortal(closestPortal);
      }

      // Update Local Realtime Presence (throttled internally to 15 Hz Broadcast only when moving/changed)
      if (elapsed - lastBroadcast >= 0.066) {
        lastBroadcast = elapsed;
        presence.updateLocal({
          name: studentRef.current.name,
          grade: studentRef.current.grade,
          school: studentRef.current.school,
          avatarColor: studentRef.current.avatarColor,
          equippedHat: studentRef.current.equippedHat || null,
          equippedJersey: studentRef.current.equippedJersey || null,
          equippedBack: studentRef.current.equippedBack || null,
          equippedAura: studentRef.current.equippedAura || null,
          equippedTitle: curEquippedTitle,
          movementStyle: studentRef.current.movementStyle || 'classic',
          auraPower: curAuraPower,
          isFarmingAura: activeFarming,
          drivingVehicleId: activeVehId,
          isDriving: Boolean(activeVehId),
          vehicleType: activeVehicle ? activeVehicle.def.style : null,
          x: pos.x,
          y: pos.y,
          z: pos.z,
          rotY: localRig.root.rotation.y,
          isMoving: horizSpeed > 0.35,
          emote: currentEmote,
          chatMessage: currentChat,
        });
      }

      // =====================================================================
      // 60 FPS REALTIME ONLINE PEER INTERPOLATION & CLEANUP (> 10s STALE)
      // =====================================================================
      const livePeersList = onlinePeersRef.current;
      const livePeerIds = new Set<string>();
      const lerpAlpha = Math.min(1, delta * 12);

      for (const lp of livePeersList) {
        if (lp.id === student.id) continue;
        livePeerIds.add(lp.id);
        let entry = dynamicOnlinePeers.get(lp.id);

        if (!entry) {
          const group = new THREE.Group();
          const avatarRig = createAvatarRig(
            lp.avatarColor || '#38bdf8',
            lp.equippedHat || null,
            lp.equippedJersey || null
          );
          if (lp.equippedBack) {
            avatarRig.hatContainer.add(buildCosmeticRig(lp.equippedBack).group);
          }
          if (lp.equippedAura) {
            avatarRig.hatContainer.add(buildCosmeticRig(lp.equippedAura).group);
          }
          group.add(avatarRig.root);

          const labelSprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: createBillboardTexture(
                lp.name,
                lp.grade,
                lp.school,
                lp.auraPower || 0,
                Boolean(lp.isFarmingAura),
                lp.equippedTitle || null
              ),
              transparent: true,
            })
          );
          labelSprite.scale.set(3.6, lp.equippedTitle ? 1.28 : 1.1, 1);
          labelSprite.position.set(0, 3.25, 0);
          group.add(labelSprite);

          const chatSprite = new THREE.Sprite(
            new THREE.SpriteMaterial({ transparent: true, opacity: 0 })
          );
          chatSprite.scale.set(4.0, 1.1, 1);
          chatSprite.position.set(0, 4.35, 0);
          group.add(chatSprite);

          group.position.set(lp.x, lp.y, lp.z);
          scene.add(group);

          entry = {
            id: lp.id,
            group,
            avatarRig,
            kartRig: null,
            kartStyle: null,
            labelSprite,
            chatSprite,
            lastChat: null,
            lastTitle: lp.equippedTitle || null,
            lastAuraPower: lp.auraPower || 0,
            lastFarming: Boolean(lp.isFarmingAura),
            curPos: new THREE.Vector3(lp.x, lp.y, lp.z),
            curRotY: lp.rotY,
            lastSeenMs: now,
          };
          dynamicOnlinePeers.set(lp.id, entry);
        }

        entry.lastSeenMs = lp.updatedAt || now;

        // Smooth 60 FPS Position Lerp + Derived Velocity
        const prevX = entry.curPos.x;
        const prevZ = entry.curPos.z;
        _peerTargetPos.set(lp.x, lp.y, lp.z);
        entry.curPos.lerp(_peerTargetPos, lerpAlpha);
        const derivedSpeed = Math.hypot(entry.curPos.x - prevX, entry.curPos.z - prevZ) / Math.max(delta, 0.001);
        entry.group.position.copy(entry.curPos);

        // Shortest-Arc Rotation Interpolation
        let rotDiff = lp.rotY - entry.curRotY;
        while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
        while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
        entry.curRotY += rotDiff * lerpAlpha;

        // Toggle between Walking AvatarRig vs Driving KartRig
        const peerDriving = Boolean(lp.isDriving || lp.drivingVehicleId);
        if (peerDriving) {
          const desiredStyle = (lp.vehicleType as VehicleModelStyle) || 'sport_kart';
          if (!entry.kartRig || entry.kartStyle !== desiredStyle) {
            if (entry.kartRig) entry.group.remove(entry.kartRig.root);
            entry.kartRig = createKartRig(
              lp.avatarColor || '#38bdf8',
              lp.equippedHat || null,
              lp.equippedJersey || null,
              desiredStyle
            );
            entry.kartStyle = desiredStyle;
            entry.group.add(entry.kartRig.root);
          }
          entry.avatarRig.root.visible = false;
          entry.kartRig.root.visible = true;
          entry.kartRig.root.rotation.y = entry.curRotY;
          animateKartRig(entry.kartRig, derivedSpeed, 0, derivedSpeed > 12, 0, elapsed, delta);
        } else {
          entry.avatarRig.root.visible = true;
          if (entry.kartRig) entry.kartRig.root.visible = false;
          entry.avatarRig.root.rotation.y = entry.curRotY;
          animateAvatarRig(
            entry.avatarRig,
            Math.max(derivedSpeed, lp.isMoving ? 4.2 : 0),
            entry.curPos.y <= 0.12,
            elapsed,
            delta,
            lp.emote,
            lp.movementStyle || 'classic',
            Boolean(lp.isFarmingAura)
          );
        }

        // Refresh Peer Billboard if Title / Aura / Farming changed
        const peerTitle = lp.equippedTitle || null;
        if (
          peerTitle !== entry.lastTitle ||
          (lp.auraPower || 0) !== entry.lastAuraPower ||
          Boolean(lp.isFarmingAura) !== entry.lastFarming
        ) {
          entry.lastTitle = peerTitle;
          entry.lastAuraPower = lp.auraPower || 0;
          entry.lastFarming = Boolean(lp.isFarmingAura);
          const lMat = entry.labelSprite.material as THREE.SpriteMaterial;
          lMat.map = createBillboardTexture(
            lp.name,
            lp.grade,
            lp.school,
            entry.lastAuraPower,
            entry.lastFarming,
            peerTitle
          );
          entry.labelSprite.scale.set(3.6, peerTitle ? 1.28 : 1.1, 1);
          lMat.needsUpdate = true;
        }

        // Peer Speech Bubble + "Fá!" Audio Sync
        const peerChatActive =
          lp.chatMessage && now - lp.chatTimestamp < 4200 ? lp.chatMessage : null;
        if (peerChatActive !== entry.lastChat) {
          entry.lastChat = peerChatActive;
          const cMat = entry.chatSprite.material as THREE.SpriteMaterial;
          if (peerChatActive) {
            cMat.map = createSpeechBubbleTexture(peerChatActive);
            cMat.opacity = 1;
            if (peerChatActive.includes('Fá!')) {
              soundEngine.playMemeFaSound();
            }
          } else {
            cMat.opacity = 0;
          }
          cMat.needsUpdate = true;
        }
      }

      // Auto-remove disconnected or silent (> 10s) peers cleanly from scene
      for (const [peerId, entry] of dynamicOnlinePeers.entries()) {
        if (!livePeerIds.has(peerId) || now - entry.lastSeenMs > 10000) {
          scene.remove(entry.group);
          dynamicOnlinePeers.delete(peerId);
        }
      }

      // Animate Simulated Classmate Bots (hidden if real player with same ID is online)
      let idx = 0;
      peerEntities.forEach((pe) => {
        const isLiveOnline = livePeerIds.has(pe.id);
        pe.rig.root.visible = !isLiveOnline;
        if (isLiveOnline) {
          idx++;
          return;
        }
        if (pe.isSimFarming) {
          pe.rig.root.position.set(pe.baseX, 0.25, pe.baseZ);
          animateAvatarRig(pe.rig, 0, true, elapsed + pe.phase, delta, null, 'levitate', true);
        } else {
          const t = elapsed * 0.55 + pe.phase;
          const walkRadius = 1.9;
          const nx = pe.baseX + Math.cos(t) * walkRadius;
          const nz = pe.baseZ + Math.sin(t * 1.3) * walkRadius;
          const vx = nx - pe.rig.root.position.x;
          const vz = nz - pe.rig.root.position.z;
          pe.rig.root.position.set(nx, 0, nz);
          pe.rig.root.rotation.y = Math.atan2(vx, vz);

          const styles: MovementStyle[] = ['classic', 'ninja', 'levitate', 'champion'];
          const simStyle = styles[idx % styles.length];
          const cycle = (elapsed + idx * 3.5) % 14;
          const peerEmote: AvatarEmote =
            cycle > 11.5 ? (idx % 2 === 0 ? 'wave' : 'goal') : null;
          animateAvatarRig(
            pe.rig,
            peerEmote ? 0 : 3.2,
            true,
            elapsed + pe.phase,
            delta,
            peerEmote,
            simStyle,
            false
          );
        }
        idx++;
      });

      // =====================================================================
      // 3 MODOS DE CÂMERA + TRANSIÇÃO SUAVE (LERP) + FOV PORTRAIT AUTOMÁTICO
      // =====================================================================
      const camMode = cameraModeRef.current;
      const portraitNow = isPortraitRef.current;
      const fovBoost = portraitNow ? 10 : 0;

      let tgtFov = 72 + fovBoost;
      let tgtDist = activeVehicle ? 13.0 : 10.5;
      let tgtHeight = activeVehicle ? 6.0 : 5.2;
      let tgtLookY = 2.4;
      let tgtLookFwd = 3.5;

      if (camMode === 'aerial') {
        tgtFov = 64 + fovBoost;
        tgtDist = 13.0;
        tgtHeight = 17.0;
        tgtLookY = 1.2;
        tgtLookFwd = 1.0;
      } else if (camMode === 'action') {
        tgtFov = 56 + fovBoost;
        tgtDist = activeVehicle ? 8.2 : 5.0;
        tgtHeight = activeVehicle ? 3.4 : 2.6;
        tgtLookY = 1.85;
        tgtLookFwd = 2.2;
      }

      const camLerp = Math.min(1, delta * 7.0);
      curFov = THREE.MathUtils.lerp(curFov, tgtFov, camLerp);
      curCamDist = THREE.MathUtils.lerp(curCamDist, tgtDist, camLerp);
      curCamHeight = THREE.MathUtils.lerp(curCamHeight, tgtHeight, camLerp);
      curLookY = THREE.MathUtils.lerp(curLookY, tgtLookY, camLerp);
      curLookFwd = THREE.MathUtils.lerp(curLookFwd, tgtLookFwd, camLerp);

      if (Math.abs(camera.fov - curFov) > 0.05) {
        camera.fov = curFov;
        camera.updateProjectionMatrix();
      }

      const sinYaw = Math.sin(cameraYaw);
      const cosYaw = Math.cos(cameraYaw);
      const camX = pos.x + sinYaw * curCamDist;
      const camY = Math.max(1.4, pos.y + curCamHeight + cameraPitchOffset * curCamDist * 0.45);
      const camZ = pos.z + cosYaw * curCamDist;
      camera.position.set(camX, camY, camZ);

      // Ponto de visão elevado + deslocado à frente (horizonte aberto e placas legíveis)
      const lookX = pos.x - sinYaw * curLookFwd;
      const lookY = pos.y + curLookY;
      const lookZ = pos.z - cosYaw * curLookFwd;
      camera.lookAt(lookX, lookY, lookZ);
      envRig.updateShadowTarget(pos.x, pos.y, pos.z);

      // Anti-obstrução suave: reduz opacidade (0.22) de postes e árvores entre a câmera e o avatar
      const segX = pos.x - camX;
      const segZ = pos.z - camZ;
      const segLenSq = segX * segX + segZ * segZ;
      if (segLenSq > 0.25) {
        for (let oi = 0; oi < occludableProps.length; oi++) {
          const prop = occludableProps[oi];
          const t = ((prop.x - camX) * segX + (prop.z - camZ) * segZ) / segLenSq;
          let occluded = false;
          if (t > 0.06 && t < 0.94) {
            const projX = camX + t * segX;
            const projZ = camZ + t * segZ;
            const distSq = (prop.x - projX) ** 2 + (prop.z - projZ) ** 2;
            if (distSq < prop.radius * prop.radius) {
              occluded = true;
            }
          }
          const desiredOpacity = occluded ? 0.22 : 1.0;
          if (Math.abs(prop.currentOpacity - desiredOpacity) > 0.01) {
            prop.currentOpacity = THREE.MathUtils.lerp(
              prop.currentOpacity,
              desiredOpacity,
              Math.min(1, delta * 10)
            );
            const isTrans = prop.currentOpacity < 0.98;
            for (let mi = 0; mi < prop.materials.length; mi++) {
              const mat = prop.materials[mi];
              if (mat.transparent !== isTrans) {
                mat.transparent = isTrans;
                mat.needsUpdate = true;
              }
              mat.opacity = prop.currentOpacity;
              mat.depthWrite = prop.currentOpacity > 0.8;
            }
          }
        }
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      disposed = true;
      presence.stop();
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      disposeSceneResources(scene, renderer, envRig.envTexture);
    };
  }, [
    student.id,
    student.avatarColor,
    student.equippedHat,
    student.equippedJersey,
    top3Students,
    simulatedClassmates,
    graphicsQuality,
  ]);

  const totalOnlineCount = 1 + Math.max(onlinePeers.length, simulatedClassmates.length);
  const currentAuraLv = getAuraLevel(student.auraPower || 0);
  const currentMoveStyle = student.movementStyle || 'classic';
  const activeVehicleDef = drivingVehicleId
    ? PLAZA_VEHICLES.find((v) => v.id === drivingVehicleId) || null
    : null;

  const handleEnterNearbyPortal = () => {
    if (!nearbyPortal) return;
    soundEngine.playCheckpoint();
    if (nearbyPortal.id === 'shop') {
      onOpenShop();
    } else if (nearbyPortal.id === 'multiplayer') {
      onOpenMultiplayer();
    } else {
      onEnterGameMode(nearbyPortal.id);
    }
  };

  return (
    <div className="fixed inset-0 h-[100dvh] w-screen overflow-hidden bg-slate-950 select-none">
      <div
        ref={mountRef}
        className="touch-none-select h-full w-full cursor-grab active:cursor-grabbing"
      />

      {/* 2 Pílulas Superiores Translúcidas Flutuantes (100vw × 100dvh, Paisagem 1 linha / Vertical 2 linhas) */}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-30 flex flex-col gap-1.5 px-2.5 sm:px-4">
        <div
          className={`flex gap-2 ${
            isPortrait
              ? 'flex-col items-stretch'
              : 'flex-row items-center justify-between'
          }`}
        >
          {/* PÍLULA SUPERIOR ESQUERDA: Avatar + Nome + Série + XP + BloxCoins + ☰ Menu */}
          <div className="pointer-events-auto relative flex items-center justify-between gap-2 rounded-2xl border border-white/15 bg-slate-900/75 px-2.5 py-1.5 shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/25 font-display text-xs font-black text-white shadow-inner"
                style={{
                  backgroundColor: equippedClub ? equippedClub.primary : student.avatarColor,
                }}
              >
                {equippedClub ? equippedClub.shortTag : student.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="max-w-[115px] sm:max-w-[160px] truncate text-xs font-extrabold text-white">
                    {student.name}
                  </span>
                  <span className="shrink-0 text-[10px] font-bold text-sky-300">
                    {student.grade}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px] font-bold tabular-nums">
                  <span className="text-emerald-400">{student.xp} XP</span>
                  <span className="flex items-center gap-0.5 text-amber-300">
                    <Coins className="h-3 w-3 shrink-0" />
                    {student.coins}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setPlazaMenuOpen((v) => !v);
                setSocialDrawerOpen(false);
              }}
              className={`flex min-h-[34px] items-center gap-1 rounded-xl border px-2.5 py-1 text-xs font-extrabold transition-colors whitespace-nowrap shrink-0 ${
                plazaMenuOpen
                  ? 'border-sky-300 bg-sky-400 text-slate-950'
                  : 'border-white/15 bg-slate-950/75 text-white hover:bg-slate-800'
              }`}
              aria-label="Abrir menu da praça"
            >
              {plazaMenuOpen ? <X className="h-3.5 w-3.5" /> : <Menu className="h-3.5 w-3.5" />}
              <span>Menu</span>
            </button>

            {/* Drawer / Modal Limpo do Menu Principal */}
            {plazaMenuOpen && (
              <div className="absolute left-0 top-12 z-50 flex w-64 max-h-[72dvh] overflow-y-auto flex-col gap-1 rounded-2xl border border-white/15 bg-slate-950/95 p-2.5 shadow-2xl backdrop-blur-md">
                <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Navegação Rápida
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPlazaMenuOpen(false);
                    onOpenModes();
                  }}
                  className="flex min-h-[38px] items-center gap-2 rounded-xl bg-sky-500/15 px-3 py-1.5 text-xs font-black text-sky-300 hover:bg-sky-500/25"
                >
                  <Gamepad2 className="h-4 w-4 shrink-0" />
                  <span>6 Modalidades (Jogar)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlazaMenuOpen(false);
                    onOpenShop();
                  }}
                  className="flex min-h-[38px] items-center gap-2 rounded-xl bg-purple-500/15 px-3 py-1.5 text-xs font-black text-purple-300 hover:bg-purple-500/25"
                >
                  <ShoppingBag className="h-4 w-4 shrink-0" />
                  <span>Vestiário &amp; Times (19)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlazaMenuOpen(false);
                    onOpenRanking();
                  }}
                  className="flex min-h-[38px] items-center gap-2 rounded-xl bg-amber-500/15 px-3 py-1.5 text-xs font-black text-amber-300 hover:bg-amber-500/25"
                >
                  <Trophy className="h-4 w-4 shrink-0" />
                  <span>Ranking &amp; Batalha de Colégios</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlazaMenuOpen(false);
                    onOpenMultiplayer();
                  }}
                  className="flex min-h-[38px] items-center gap-2 rounded-xl bg-cyan-500/15 px-3 py-1.5 text-xs font-black text-cyan-300 hover:bg-cyan-500/25"
                >
                  <Swords className="h-4 w-4 shrink-0" />
                  <span>Arena Multiplayer</span>
                </button>

                <div className="my-1 border-t border-slate-800" />
                <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Portais Diretos
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPlazaMenuOpen(false);
                    onEnterGameMode('caete_boat');
                  }}
                  className="flex min-h-[34px] items-center rounded-xl px-3 py-1 text-xs font-bold text-teal-300 hover:bg-teal-500/15"
                >
                  🚤 Regata no Rio Caeté
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlazaMenuOpen(false);
                    onEnterGameMode('vehicle_rally');
                  }}
                  className="flex min-h-[34px] items-center rounded-xl px-3 py-1 text-xs font-bold text-yellow-300 hover:bg-yellow-500/15"
                >
                  🏎️ Rali de Kart (Ajuruteua)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlazaMenuOpen(false);
                    onEnterGameMode('penalty');
                  }}
                  className="flex min-h-[34px] items-center rounded-xl px-3 py-1 text-xs font-bold text-emerald-300 hover:bg-emerald-500/15"
                >
                  ⚽ Pênaltis da Matemática
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlazaMenuOpen(false);
                    onEnterGameMode('obby');
                  }}
                  className="flex min-h-[34px] items-center rounded-xl px-3 py-1 text-xs font-bold text-emerald-300 hover:bg-emerald-500/15"
                >
                  🏔️ Torre Obby 3D
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlazaMenuOpen(false);
                    onEnterGameMode('survival');
                  }}
                  className="flex min-h-[34px] items-center rounded-xl px-3 py-1 text-xs font-bold text-amber-300 hover:bg-amber-500/15"
                >
                  🔥 Arena Sobrevivência
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlazaMenuOpen(false);
                    onEnterGameMode('turbo_race');
                  }}
                  className="flex min-h-[34px] items-center rounded-xl px-3 py-1 text-xs font-bold text-sky-300 hover:bg-sky-500/15"
                >
                  ⚡ Corrida Turbo
                </button>

                <div className="my-1 border-t border-slate-800" />
                <button
                  type="button"
                  onClick={() => {
                    setPlazaMenuOpen(false);
                    setAudioModalOpen(true);
                  }}
                  className="flex min-h-[36px] items-center gap-2 rounded-xl px-3 py-1 text-xs font-bold text-slate-100 hover:bg-slate-800"
                >
                  <Sliders className="h-3.5 w-3.5 text-sky-400" />
                  <span>Som &amp; Gráficos 3D</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlazaMenuOpen(false);
                    onLogout();
                  }}
                  className="flex min-h-[36px] items-center gap-2 rounded-xl px-3 py-1 text-xs font-bold text-rose-300 hover:bg-rose-500/15"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Trocar Conta / Sair</span>
                </button>
              </div>
            )}
          </div>

          {/* PÍLULA SUPERIOR DIREITA: 📷 Câmera, 💬 Social, 🎯 Missões, ⛶ Tela Cheia, 🔊 */}
          <div className="pointer-events-auto flex items-center justify-between sm:justify-end gap-1 rounded-2xl border border-white/15 bg-slate-900/75 px-2 py-1.5 shadow-xl backdrop-blur-md">
            <button
              type="button"
              onClick={handleCycleCameraMode}
              className="flex min-h-[34px] items-center gap-1 rounded-xl border border-sky-400/40 bg-sky-500/15 px-2.5 py-1 text-[11px] font-extrabold text-sky-200 hover:bg-sky-400 hover:text-slate-950 active:scale-95 transition-all whitespace-nowrap shrink-0"
              title="Alternar modo de câmera (Angular / Aérea / Ação)"
            >
              <Camera className="h-3.5 w-3.5 shrink-0" />
              <span>{CAMERA_MODE_LABELS[cameraMode]}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSocialDrawerOpen((v) => !v);
                setPlazaMenuOpen(false);
              }}
              className={`flex min-h-[34px] items-center gap-1 rounded-xl border px-2.5 py-1 text-[11px] font-extrabold transition-colors whitespace-nowrap shrink-0 ${
                socialDrawerOpen || isFarmingAura
                  ? 'border-cyan-300 bg-cyan-400 text-slate-950'
                  : 'border-white/15 bg-slate-950/70 text-white hover:bg-slate-800'
              }`}
              aria-label="Abrir painel social"
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0" />
              <span>Social</span>
              <span className="hidden sm:inline-flex items-center gap-0.5 rounded-md bg-emerald-500/20 px-1 text-[10px] font-mono text-emerald-300">
                <Users className="h-2.5 w-2.5" />
                {totalOnlineCount}
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenMissions}
              className="relative flex min-h-[34px] items-center gap-1 rounded-xl border border-amber-400/50 bg-amber-500/15 px-2.5 py-1 text-[11px] font-extrabold text-amber-200 hover:bg-amber-400 hover:text-slate-950 transition-colors whitespace-nowrap shrink-0"
              title="Missões Diárias & Títulos"
            >
              <Target className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden xs:inline sm:inline">Missões</span>
              {claimableMissions > 0 && (
                <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-emerald-400 px-1 text-[10px] font-black text-slate-950">
                  {claimableMissions}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => void handleToggleFullscreen()}
              className="flex h-[34px] w-[34px] items-center justify-center rounded-xl border border-white/15 bg-slate-950/70 text-slate-100 hover:bg-slate-800 active:scale-95 transition-all shrink-0"
              aria-label="Alternar tela cheia"
              title={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5 text-sky-300" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5 text-sky-300" />
              )}
            </button>

            <button
              type="button"
              onClick={handleToggleMute}
              className="flex h-[34px] w-[34px] items-center justify-center rounded-xl border border-white/15 bg-slate-950/70 text-slate-100 hover:bg-slate-800 active:scale-95 transition-all shrink-0"
              aria-label={muted ? 'Ativar som' : 'Silenciar som'}
              title={muted ? 'Ativar som' : 'Silenciar som'}
            >
              {muted ? (
                <VolumeX className="h-3.5 w-3.5 text-rose-400" />
              ) : (
                <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
              )}
            </button>
          </div>
        </div>

        {/* Retractable Social Drawer: Multiplayer, Missões, Farmar Aura, Emotes, Estilos & Chat */}
        {socialDrawerOpen && (
          <div className="pointer-events-auto ml-auto w-full max-w-[300px] max-h-[58dvh] overflow-y-auto rounded-2xl border border-white/15 bg-slate-950/92 p-3 shadow-2xl backdrop-blur-md space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-cyan-300">
                Social ({totalOnlineCount} online) · Aura Nv. {currentAuraLv}
              </span>
              <button
                type="button"
                onClick={() => setSocialDrawerOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                aria-label="Fechar painel social"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Compact Multiplayer & Daily Missions Quick Actions */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setSocialDrawerOpen(false);
                  onOpenMultiplayer();
                }}
                className="flex min-h-[38px] items-center justify-center gap-1 rounded-xl border border-cyan-400/60 bg-gradient-to-r from-cyan-500/25 to-blue-500/25 px-2 py-1.5 text-[11px] font-black text-cyan-200 hover:bg-cyan-400 hover:text-slate-950 transition-all"
              >
                <span>⚔️ Jogar com Amigos</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSocialDrawerOpen(false);
                  onOpenMissions();
                }}
                className="relative flex min-h-[38px] items-center justify-center gap-1 rounded-xl border border-amber-400/60 bg-amber-500/20 px-2 py-1.5 text-[11px] font-black text-amber-200 hover:bg-amber-400 hover:text-slate-950 transition-all"
              >
                <span>🎯 Missões</span>
                {claimableMissions > 0 && (
                  <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-emerald-400 px-1 text-[10px] font-black text-slate-950">
                    {claimableMissions}
                  </span>
                )}
              </button>
            </div>

            {/* Farmar Aura */}
            <button
              type="button"
              onClick={handleToggleFarmAuraButton}
              className={`flex w-full min-h-[38px] items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black transition-all ${
                isFarmingAura
                  ? 'border-cyan-300 bg-cyan-400 text-slate-950'
                  : 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-400 hover:text-slate-950'
              }`}
            >
              <Flame className="h-3.5 w-3.5" />
              <span>
                {isFarmingAura
                  ? `Farmando Aura (${dailyAuraCoins}/${DAILY_AURA_MAX_COINS} Coins)`
                  : 'Ativar Farmar Aura'}
              </span>
            </button>

            {/* Movement Styles */}
            {!drivingVehicleId && (
              <div>
                <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <Footprints className="h-3 w-3 text-sky-400" />
                  Estilo de Passo
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {MOVEMENT_STYLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelectMovementStyle(opt.id)}
                      className={`min-h-[32px] rounded-lg px-2 py-1 text-[11px] font-bold transition-all ${
                        currentMoveStyle === opt.id
                          ? 'bg-sky-500 text-slate-950 font-extrabold'
                          : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Emotes + Viral 1-Click Buttons */}
            <div>
              <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <Smile className="h-3 w-3 text-amber-400" />
                Emotes &amp; Sons
              </p>
              <div className="flex flex-wrap gap-1.5">
                {EMOTE_BUTTONS.map((btn) => (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => triggerEmote(btn.id)}
                    className={`min-h-[32px] rounded-lg px-2 py-1 text-[11px] font-bold transition-all active:scale-95 ${
                      activeEmote === btn.id
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-slate-900 text-slate-200 border border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => triggerQuickChat('Fá! 🎺💥')}
                  className="min-h-[32px] rounded-lg border border-rose-500/70 bg-gradient-to-r from-rose-600 to-amber-500 px-2.5 py-1 text-[11px] font-black text-white active:scale-95"
                >
                  🎺 Fá! 💥
                </button>
                <button
                  type="button"
                  onClick={() => triggerQuickChat('Obrigado, meu prefeito! 🫡🏛️')}
                  className="min-h-[32px] rounded-lg border border-amber-400/60 bg-amber-500/20 px-2.5 py-1 text-[11px] font-extrabold text-amber-200 active:scale-95"
                >
                  🫡 Meu Prefeito!
                </button>
              </div>
            </div>

            {/* Quick Chat Phrases */}
            <div>
              <button
                type="button"
                onClick={() => setShowChatMenu((v) => !v)}
                className={`flex w-full min-h-[34px] items-center justify-between rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition-all ${
                  showChatMenu || activeChatMsg
                    ? 'bg-sky-500 text-slate-950'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                }`}
              >
                <span>Frases Rápidas ({QUICK_CHAT_PHRASES.length})</span>
                <span>{showChatMenu ? '▲' : '▼'}</span>
              </button>
              {showChatMenu && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {QUICK_CHAT_PHRASES.map((phrase) => (
                    <button
                      key={phrase}
                      type="button"
                      onClick={() => {
                        triggerQuickChat(phrase);
                        setSocialDrawerOpen(false);
                      }}
                      className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] font-bold text-slate-100 hover:border-sky-400"
                    >
                      “{phrase}”
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Compact Aura Farming Micro-Challenge */}
        {isFarmingAura && microSpark && (
          <div className="pointer-events-auto mx-auto flex items-center gap-2 rounded-xl border border-amber-400/50 bg-slate-950/85 px-3 py-1.5 shadow-xl backdrop-blur-sm">
            <span className="text-xs font-extrabold text-amber-300">{microSpark.prompt}</span>
            {microSpark.options.map((opt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleAnswerMicroSpark(idx as 0 | 1)}
                className="rounded-lg bg-amber-400 px-2.5 py-1 font-mono text-xs font-black text-slate-950 hover:bg-amber-300 active:scale-95"
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {auraToast && (
          <div className="mx-auto rounded-lg border border-cyan-400/70 bg-cyan-950/90 px-3 py-1 text-xs font-extrabold text-cyan-200 shadow-lg">
            {auraToast}
          </div>
        )}
      </div>

      {/* Zona Segura Inferior Elevada (>= 112px): Cartão de Proximidade de Portal + Controles de Veículo */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(114px+env(safe-area-inset-bottom))] z-[55] flex flex-col items-center gap-2 px-4">
        {nearbyPortal && !drivingVehicleId && (
          <button
            type="button"
            onClick={handleEnterNearbyPortal}
            className="pointer-events-auto flex items-center gap-2 rounded-2xl border-2 bg-slate-950/90 px-4 py-2.5 text-xs sm:text-sm font-black text-white shadow-2xl backdrop-blur-md active:scale-95 transition-transform"
            style={{ borderColor: nearbyPortal.colorHex }}
          >
            <span>🚪 Aproxime-se para entrar:</span>
            <span style={{ color: nearbyPortal.colorHex }}>{nearbyPortal.title}</span>
          </button>
        )}

        {nearbyVehicle && !drivingVehicleId && (
          <button
            type="button"
            onClick={handleEnterNearbyVehicle}
            className="pointer-events-auto flex items-center gap-2 rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 px-4 py-2 font-display text-xs sm:text-sm font-black text-slate-950 shadow-2xl active:scale-95 transition-transform"
          >
            <Car className="h-4 w-4" />
            <span>Dirigir ({nearbyVehicle.name})</span>
          </button>
        )}

        {drivingVehicleId && activeVehicleDef && (
          <div className="pointer-events-auto flex items-center justify-center gap-2 rounded-2xl border border-sky-400/70 bg-slate-950/90 px-3 py-2 shadow-2xl backdrop-blur-sm">
            <button
              type="button"
              onPointerDown={() => {
                driveControlsRef.current.throttle = true;
              }}
              onPointerUp={() => {
                driveControlsRef.current.throttle = false;
              }}
              onPointerLeave={() => {
                driveControlsRef.current.throttle = false;
              }}
              onPointerCancel={() => {
                driveControlsRef.current.throttle = false;
              }}
              className="rounded-xl bg-emerald-400 px-3.5 py-2 font-display text-xs font-black text-slate-950 shadow-md active:scale-95 touch-none"
            >
              ACELERAR
            </button>
            <button
              type="button"
              onPointerDown={() => {
                driveControlsRef.current.brakeReverse = true;
              }}
              onPointerUp={() => {
                driveControlsRef.current.brakeReverse = false;
              }}
              onPointerLeave={() => {
                driveControlsRef.current.brakeReverse = false;
              }}
              onPointerCancel={() => {
                driveControlsRef.current.brakeReverse = false;
              }}
              className="rounded-xl bg-amber-400 px-3 py-2 font-display text-xs font-black text-slate-950 shadow-md active:scale-95 touch-none"
            >
              FREAR
            </button>
            <button
              type="button"
              onClick={handleExitVehicle}
              className="flex items-center gap-1 rounded-xl border border-rose-400/60 bg-rose-500/20 px-3 py-2 text-xs font-black text-rose-200 hover:bg-rose-500 hover:text-white transition-colors"
            >
              <DoorOpen className="h-4 w-4" />
              <span>Sair</span>
            </button>
          </div>
        )}
      </div>

      {/* Audio & Graphics Settings Modal */}
      <AudioSettingsModal isOpen={audioModalOpen} onClose={() => setAudioModalOpen(false)} />

      {/* Mobile Touch Controls (Joystick + Isolated Elevated Jump Button) */}
      <MobileControls
        inputRef={mobileInputRef}
        onRotateCameraStep={() => setRotateCameraSignal((c) => c + 1)}
      />
    </div>
  );
}
