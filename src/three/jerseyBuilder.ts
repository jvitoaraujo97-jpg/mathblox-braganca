import * as THREE from 'three';
import { JerseyId } from '../types/game';

export interface JerseyTextures {
  frontMap: THREE.CanvasTexture;
  backMap: THREE.CanvasTexture;
  sleeveColor: string;
  shortsColor: string;
}

const jerseyCache = new Map<string, JerseyTextures>();

function drawGeometricCrest(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  primary: string,
  secondary: string,
  accent: string
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - 24, cy - 26);
  ctx.lineTo(cx + 24, cy - 26);
  ctx.lineTo(cx + 24, cy + 4);
  ctx.lineTo(cx, cy + 28);
  ctx.lineTo(cx - 24, cy + 4);
  ctx.closePath();
  ctx.fillStyle = primary;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = accent;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy - 4, 10, 0, Math.PI * 2);
  ctx.fillStyle = secondary;
  ctx.fill();
  ctx.restore();
}

function drawBackNumber10(ctx: CanvasRenderingContext2D, numberColor: string, outlineColor: string) {
  ctx.save();
  ctx.font = '900 120px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = outlineColor;
  ctx.strokeText('10', 128, 138);
  ctx.fillStyle = numberColor;
  ctx.fillText('10', 128, 138);
  ctx.restore();
}

function drawCollar(ctx: CanvasRenderingContext2D, collarColor: string, vNeck = false) {
  ctx.save();
  ctx.fillStyle = collarColor;
  if (vNeck) {
    ctx.beginPath();
    ctx.moveTo(86, 0);
    ctx.lineTo(170, 0);
    ctx.lineTo(128, 42);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(128, 4, 38, 0, Math.PI);
    ctx.fill();
  }
  ctx.restore();
}

export function buildJerseyTextures(jerseyId: JerseyId | string): JerseyTextures {
  const cached = jerseyCache.get(jerseyId);
  if (cached) return cached;

  const frontCanvas = document.createElement('canvas');
  frontCanvas.width = 256;
  frontCanvas.height = 256;
  const fCtx = frontCanvas.getContext('2d')!;

  const backCanvas = document.createElement('canvas');
  backCanvas.width = 256;
  backCanvas.height = 256;
  const bCtx = backCanvas.getContext('2d')!;

  let sleeveColor = '#FFFFFF';
  let shortsColor = '#111827';
  let numColor = '#111827';
  let numOutline = '#FFFFFF';

  const paintBothBase = (color: string) => {
    fCtx.fillStyle = color;
    fCtx.fillRect(0, 0, 256, 256);
    bCtx.fillStyle = color;
    bCtx.fillRect(0, 0, 256, 256);
  };

  switch (jerseyId as JerseyId) {
    case 'remo': {
      // Clube do Remo: Azul-marinho profundo (#0F172A / #1E3A8A) com gola e punhos brancos, detalhes dourados e calção azul-marinho
      paintBothBase('#0F172A');
      sleeveColor = '#1E3A8A';
      shortsColor = '#0F172A';
      numColor = '#FACC15';
      numOutline = '#FFFFFF';
      // Faixas sutis azul royal e frisos dourados + punhos brancos
      fCtx.fillStyle = '#1E3A8A';
      fCtx.fillRect(0, 56, 256, 36);
      fCtx.fillRect(0, 136, 256, 36);
      fCtx.strokeStyle = '#FACC15';
      fCtx.lineWidth = 6;
      fCtx.strokeRect(4, 4, 248, 248);
      drawCollar(fCtx, '#FFFFFF', true);
      drawGeometricCrest(fCtx, 180, 74, '#0F172A', '#FFFFFF', '#FACC15');
      break;
    }
    case 'paysandu': {
      // Paysandu: Listras verticais em azul celeste (#38BDF8) e branco (#FFFFFF), gola polo branca e calção azul celeste
      sleeveColor = '#38BDF8';
      shortsColor = '#0284C7';
      numColor = '#1E3A8A';
      numOutline = '#FFFFFF';
      const cols = ['#38BDF8', '#FFFFFF', '#38BDF8', '#FFFFFF', '#38BDF8', '#FFFFFF', '#38BDF8'];
      const w = 256 / cols.length;
      cols.forEach((c, idx) => {
        fCtx.fillStyle = c;
        fCtx.fillRect(idx * w, 0, w + 1, 256);
        bCtx.fillStyle = c;
        bCtx.fillRect(idx * w, 0, w + 1, 256);
      });
      drawCollar(fCtx, '#FFFFFF', true);
      drawGeometricCrest(fCtx, 180, 74, '#38BDF8', '#FFFFFF', '#1E3A8A');
      break;
    }
    case 'bragantino_pa': {
      // Bragantino-PA (Tubarão do Caeté): Listras verticais em vermelho vibrante (#DC2626) e branco (#FFFFFF), detalhes em azul-marinho e calção branco
      sleeveColor = '#DC2626';
      shortsColor = '#FFFFFF';
      numColor = '#1E3A8A';
      numOutline = '#FFFFFF';
      const cols = ['#DC2626', '#FFFFFF', '#DC2626', '#FFFFFF', '#DC2626', '#FFFFFF', '#DC2626'];
      const w = 256 / cols.length;
      cols.forEach((c, idx) => {
        fCtx.fillStyle = c;
        fCtx.fillRect(idx * w, 0, w + 1, 256);
        bCtx.fillStyle = c;
        bCtx.fillRect(idx * w, 0, w + 1, 256);
      });
      // Friso azul-marinho no peito e gola azul-marinho
      fCtx.fillStyle = '#1E3A8A';
      fCtx.fillRect(0, 0, 256, 16);
      drawCollar(fCtx, '#1E3A8A', true);
      drawGeometricCrest(fCtx, 180, 74, '#DC2626', '#1E3A8A', '#FFFFFF');
      break;
    }
    case 'corinthians': {
      // Branca com mangas pretas, gola preta e detalhes dourados
      paintBothBase('#F8FAFC');
      sleeveColor = '#111827';
      shortsColor = '#111827';
      numColor = '#111827';
      numOutline = '#D97706';
      // Pinstripes sutis e detalhes dourados nos ombros
      fCtx.strokeStyle = '#D97706';
      fCtx.lineWidth = 6;
      fCtx.strokeRect(3, 3, 250, 250);
      drawCollar(fCtx, '#111827', true);
      drawGeometricCrest(fCtx, 180, 74, '#111827', '#F8FAFC', '#D97706');
      break;
    }
    case 'flamengo': {
      // Listras horizontais largas rubro-negras + calção branco
      sleeveColor = '#111827';
      shortsColor = '#F8FAFC';
      numColor = '#F8FAFC';
      numOutline = '#111827';
      const stripeH = 42;
      for (let i = 0; i < 7; i++) {
        const col = i % 2 === 0 ? '#DC2626' : '#111827';
        fCtx.fillStyle = col;
        fCtx.fillRect(0, i * stripeH, 256, stripeH);
        bCtx.fillStyle = col;
        bCtx.fillRect(0, i * stripeH, 256, stripeH);
      }
      drawCollar(fCtx, '#111827', true);
      drawGeometricCrest(fCtx, 180, 74, '#DC2626', '#111827', '#F8FAFC');
      break;
    }
    case 'palmeiras': {
      // Verde esmeralda com gola e punhos brancos + calção branco
      paintBothBase('#047857');
      sleeveColor = '#047857';
      shortsColor = '#F8FAFC';
      numColor = '#F8FAFC';
      numOutline = '#064E3B';
      // Geometric subtle pattern
      fCtx.fillStyle = 'rgba(255,255,255,0.06)';
      fCtx.fillRect(0, 60, 256, 30);
      fCtx.fillRect(0, 140, 256, 30);
      drawCollar(fCtx, '#F8FAFC', false);
      drawGeometricCrest(fCtx, 180, 74, '#047857', '#F8FAFC', '#F8FAFC');
      break;
    }
    case 'sao_paulo': {
      // Branca com duas faixas horizontais vermelha e preta no peito
      paintBothBase('#F8FAFC');
      sleeveColor = '#F8FAFC';
      shortsColor = '#F8FAFC';
      numColor = '#DC2626';
      numOutline = '#111827';
      // Faixas tricolores no peito
      fCtx.fillStyle = '#DC2626';
      fCtx.fillRect(0, 82, 256, 26);
      fCtx.fillStyle = '#FFFFFF';
      fCtx.fillRect(0, 108, 256, 10);
      fCtx.fillStyle = '#111827';
      fCtx.fillRect(0, 118, 256, 26);
      drawCollar(fCtx, '#DC2626', true);
      drawGeometricCrest(fCtx, 128, 114, '#111827', '#DC2626', '#F8FAFC');
      break;
    }
    case 'santos': {
      // Branca clássica com gola polo e detalhes pretos
      paintBothBase('#FFFFFF');
      sleeveColor = '#FFFFFF';
      shortsColor = '#FFFFFF';
      numColor = '#111827';
      numOutline = '#94A3B8';
      drawCollar(fCtx, '#111827', true);
      // Detalhe lateral preto
      fCtx.fillStyle = '#111827';
      fCtx.fillRect(0, 0, 14, 256);
      fCtx.fillRect(242, 0, 14, 256);
      drawGeometricCrest(fCtx, 180, 74, '#111827', '#FFFFFF', '#FACC15');
      break;
    }
    case 'vasco': {
      // Preta com faixa diagonal branca + detalhe vermelho no peito
      paintBothBase('#111827');
      sleeveColor = '#111827';
      shortsColor = '#111827';
      numColor = '#F8FAFC';
      numOutline = '#DC2626';
      // Faixa diagonal branca
      fCtx.save();
      fCtx.strokeStyle = '#F8FAFC';
      fCtx.lineWidth = 48;
      fCtx.beginPath();
      fCtx.moveTo(235, 10);
      fCtx.lineTo(20, 245);
      fCtx.stroke();
      fCtx.restore();
      // Cruz de malta geométrica vermelha no peito
      fCtx.fillStyle = '#DC2626';
      fCtx.fillRect(168, 56, 28, 28);
      drawCollar(fCtx, '#F8FAFC', true);
      break;
    }
    case 'fluminense': {
      // Listras verticais grená, verde e branco
      sleeveColor = '#7F1D1D';
      shortsColor = '#F8FAFC';
      numColor = '#F8FAFC';
      numOutline = '#111827';
      const cols = ['#7F1D1D', '#F8FAFC', '#065F46', '#F8FAFC', '#7F1D1D', '#F8FAFC', '#065F46'];
      const w = 256 / cols.length;
      cols.forEach((c, idx) => {
        fCtx.fillStyle = c;
        fCtx.fillRect(idx * w, 0, w + 1, 256);
        bCtx.fillStyle = c;
        bCtx.fillRect(idx * w, 0, w + 1, 256);
      });
      drawCollar(fCtx, '#F8FAFC', true);
      drawGeometricCrest(fCtx, 180, 74, '#7F1D1D', '#065F46', '#F8FAFC');
      break;
    }
    case 'botafogo': {
      // Listras verticais alvinegras + calção preto
      sleeveColor = '#111827';
      shortsColor = '#111827';
      numColor = '#FACC15';
      numOutline = '#111827';
      const cols = ['#111827', '#F8FAFC', '#111827', '#F8FAFC', '#111827', '#F8FAFC', '#111827'];
      const w = 256 / cols.length;
      cols.forEach((c, idx) => {
        fCtx.fillStyle = c;
        fCtx.fillRect(idx * w, 0, w + 1, 256);
        bCtx.fillStyle = c;
        bCtx.fillRect(idx * w, 0, w + 1, 256);
      });
      drawCollar(fCtx, '#111827', false);
      drawGeometricCrest(fCtx, 180, 74, '#111827', '#F8FAFC', '#F8FAFC');
      break;
    }
    case 'gremio': {
      // Listras verticais azul celeste, preto e branco
      sleeveColor = '#0284C7';
      shortsColor = '#111827';
      numColor = '#F8FAFC';
      numOutline = '#111827';
      const cols = ['#0284C7', '#F8FAFC', '#111827', '#0284C7', '#111827', '#F8FAFC', '#0284C7'];
      const w = 256 / cols.length;
      cols.forEach((c, idx) => {
        fCtx.fillStyle = c;
        fCtx.fillRect(idx * w, 0, w + 1, 256);
        bCtx.fillStyle = c;
        bCtx.fillRect(idx * w, 0, w + 1, 256);
      });
      drawCollar(fCtx, '#F8FAFC', true);
      drawGeometricCrest(fCtx, 180, 74, '#0284C7', '#111827', '#F8FAFC');
      break;
    }
    case 'internacional': {
      // Vermelha vibrante com gola e punhos brancos
      paintBothBase('#DC2626');
      sleeveColor = '#DC2626';
      shortsColor = '#F8FAFC';
      numColor = '#F8FAFC';
      numOutline = '#7F1D1D';
      drawCollar(fCtx, '#F8FAFC', false);
      drawGeometricCrest(fCtx, 180, 74, '#DC2626', '#F8FAFC', '#F8FAFC');
      break;
    }
    case 'cruzeiro': {
      // Azul royal intenso com constelação de 5 estrelas brancas no peito
      paintBothBase('#1D4ED8');
      sleeveColor = '#1D4ED8';
      shortsColor = '#F8FAFC';
      numColor = '#F8FAFC';
      numOutline = '#1E3A8A';
      drawCollar(fCtx, '#F8FAFC', true);
      // 5 Estrelas do Cruzeiro do Sul no peito
      fCtx.fillStyle = '#FFFFFF';
      const stars = [
        [176, 54],
        [160, 72],
        [192, 70],
        [176, 92],
        [184, 80],
      ];
      for (const [sx, sy] of stars) {
        fCtx.beginPath();
        fCtx.arc(sx, sy, 5.5, 0, Math.PI * 2);
        fCtx.fill();
      }
      break;
    }
    case 'atletico_mg': {
      // Listras verticais alvinegras + detalhe dourado
      sleeveColor = '#111827';
      shortsColor = '#111827';
      numColor = '#FACC15';
      numOutline = '#111827';
      const cols = ['#111827', '#F8FAFC', '#111827', '#F8FAFC', '#111827'];
      const w = 256 / cols.length;
      cols.forEach((c, idx) => {
        fCtx.fillStyle = c;
        fCtx.fillRect(idx * w, 0, w + 1, 256);
        bCtx.fillStyle = c;
        bCtx.fillRect(idx * w, 0, w + 1, 256);
      });
      drawCollar(fCtx, '#FACC15', true);
      drawGeometricCrest(fCtx, 180, 74, '#111827', '#F8FAFC', '#FACC15');
      break;
    }
    case 'bahia': {
      // Branca com detalhes em azul e vermelho tricolor
      paintBothBase('#F8FAFC');
      sleeveColor = '#1D4ED8';
      shortsColor = '#1D4ED8';
      numColor = '#DC2626';
      numOutline = '#1D4ED8';
      fCtx.fillStyle = '#1D4ED8';
      fCtx.fillRect(0, 0, 256, 28);
      fCtx.fillStyle = '#DC2626';
      fCtx.fillRect(0, 28, 256, 14);
      drawCollar(fCtx, '#DC2626', true);
      drawGeometricCrest(fCtx, 180, 80, '#1D4ED8', '#DC2626', '#F8FAFC');
      break;
    }
    case 'fortaleza': {
      // Listras horizontais azul, vermelho e branco
      sleeveColor = '#1D4ED8';
      shortsColor = '#1D4ED8';
      numColor = '#F8FAFC';
      numOutline = '#111827';
      const rows = ['#1D4ED8', '#F8FAFC', '#DC2626', '#F8FAFC', '#1D4ED8', '#F8FAFC', '#DC2626'];
      const h = 256 / rows.length;
      rows.forEach((c, idx) => {
        fCtx.fillStyle = c;
        fCtx.fillRect(0, idx * h, 256, h + 1);
        bCtx.fillStyle = c;
        bCtx.fillRect(0, idx * h, 256, h + 1);
      });
      drawCollar(fCtx, '#1D4ED8', true);
      drawGeometricCrest(fCtx, 180, 74, '#1D4ED8', '#DC2626', '#F8FAFC');
      break;
    }
    case 'athletico_pr': {
      // Preta com listras diagonais vermelhas
      paintBothBase('#111827');
      sleeveColor = '#111827';
      shortsColor = '#111827';
      numColor = '#F8FAFC';
      numOutline = '#DC2626';
      fCtx.save();
      fCtx.strokeStyle = '#DC2626';
      fCtx.lineWidth = 26;
      for (let k = -60; k < 260; k += 64) {
        fCtx.beginPath();
        fCtx.moveTo(k, 256);
        fCtx.lineTo(k + 160, 0);
        fCtx.stroke();
      }
      fCtx.restore();
      drawCollar(fCtx, '#DC2626', true);
      drawGeometricCrest(fCtx, 180, 74, '#DC2626', '#111827', '#F8FAFC');
      break;
    }
    case 'bragantino':
    default: {
      // RB Bragantino: Branca com detalhes geométricos vermelhos e cinza
      paintBothBase('#F8FAFC');
      sleeveColor = '#DC2626';
      shortsColor = '#DC2626';
      numColor = '#DC2626';
      numOutline = '#111827';
      // Polígonos geométricos cinza e vermelho no peito
      fCtx.fillStyle = '#E2E8F0';
      fCtx.beginPath();
      fCtx.moveTo(0, 70);
      fCtx.lineTo(140, 120);
      fCtx.lineTo(0, 180);
      fCtx.closePath();
      fCtx.fill();
      fCtx.fillStyle = '#DC2626';
      fCtx.fillRect(48, 105, 160, 28);
      drawCollar(fCtx, '#DC2626', true);
      drawGeometricCrest(fCtx, 180, 68, '#DC2626', '#FACC15', '#111827');
      break;
    }
  }

  // Draw number 10 on the back canvas
  drawBackNumber10(bCtx, numColor, numOutline);

  const frontMap = new THREE.CanvasTexture(frontCanvas);
  frontMap.colorSpace = THREE.SRGBColorSpace;
  frontMap.needsUpdate = true;

  const backMap = new THREE.CanvasTexture(backCanvas);
  backMap.colorSpace = THREE.SRGBColorSpace;
  backMap.needsUpdate = true;

  const result: JerseyTextures = {
    frontMap,
    backMap,
    sleeveColor,
    shortsColor,
  };
  jerseyCache.set(jerseyId, result);
  return result;
}

export interface JerseyClubConfig {
  id: JerseyId;
  clubName: string;
  shortTag: string;
  primary: string;
  secondary: string;
  numberColor: string;
}

const JERSEY_CLUB_CONFIGS: Record<JerseyId, JerseyClubConfig> = {
  remo: {
    id: 'remo',
    clubName: 'Clube do Remo',
    shortTag: 'REM',
    primary: '#0f172a',
    secondary: '#1e3a8a',
    numberColor: '#facc15',
  },
  paysandu: {
    id: 'paysandu',
    clubName: 'Paysandu',
    shortTag: 'PAY',
    primary: '#38bdf8',
    secondary: '#ffffff',
    numberColor: '#1e3a8a',
  },
  bragantino_pa: {
    id: 'bragantino_pa',
    clubName: 'Bragantino-PA',
    shortTag: 'BRA-PA',
    primary: '#dc2626',
    secondary: '#1e3a8a',
    numberColor: '#ffffff',
  },
  corinthians: {
    id: 'corinthians',
    clubName: 'Corinthians',
    shortTag: 'COR',
    primary: '#f8fafc',
    secondary: '#111827',
    numberColor: '#111827',
  },
  flamengo: {
    id: 'flamengo',
    clubName: 'Flamengo',
    shortTag: 'FLA',
    primary: '#dc2626',
    secondary: '#111827',
    numberColor: '#ffffff',
  },
  palmeiras: {
    id: 'palmeiras',
    clubName: 'Palmeiras',
    shortTag: 'PAL',
    primary: '#047857',
    secondary: '#ffffff',
    numberColor: '#ffffff',
  },
  sao_paulo: {
    id: 'sao_paulo',
    clubName: 'São Paulo',
    shortTag: 'SAO',
    primary: '#ffffff',
    secondary: '#dc2626',
    numberColor: '#dc2626',
  },
  santos: {
    id: 'santos',
    clubName: 'Santos',
    shortTag: 'SAN',
    primary: '#ffffff',
    secondary: '#111827',
    numberColor: '#111827',
  },
  vasco: {
    id: 'vasco',
    clubName: 'Vasco da Gama',
    shortTag: 'VAS',
    primary: '#111827',
    secondary: '#ffffff',
    numberColor: '#ffffff',
  },
  fluminense: {
    id: 'fluminense',
    clubName: 'Fluminense',
    shortTag: 'FLU',
    primary: '#7f1d1d',
    secondary: '#065f46',
    numberColor: '#ffffff',
  },
  botafogo: {
    id: 'botafogo',
    clubName: 'Botafogo',
    shortTag: 'BOT',
    primary: '#111827',
    secondary: '#ffffff',
    numberColor: '#facc15',
  },
  gremio: {
    id: 'gremio',
    clubName: 'Grêmio',
    shortTag: 'GRE',
    primary: '#0284c7',
    secondary: '#111827',
    numberColor: '#ffffff',
  },
  internacional: {
    id: 'internacional',
    clubName: 'Internacional',
    shortTag: 'INT',
    primary: '#dc2626',
    secondary: '#ffffff',
    numberColor: '#ffffff',
  },
  cruzeiro: {
    id: 'cruzeiro',
    clubName: 'Cruzeiro',
    shortTag: 'CRU',
    primary: '#1d4ed8',
    secondary: '#ffffff',
    numberColor: '#ffffff',
  },
  atletico_mg: {
    id: 'atletico_mg',
    clubName: 'Atlético-MG',
    shortTag: 'CAM',
    primary: '#111827',
    secondary: '#facc15',
    numberColor: '#facc15',
  },
  bahia: {
    id: 'bahia',
    clubName: 'Bahia',
    shortTag: 'BAH',
    primary: '#1d4ed8',
    secondary: '#dc2626',
    numberColor: '#dc2626',
  },
  fortaleza: {
    id: 'fortaleza',
    clubName: 'Fortaleza',
    shortTag: 'FOR',
    primary: '#1d4ed8',
    secondary: '#dc2626',
    numberColor: '#ffffff',
  },
  athletico_pr: {
    id: 'athletico_pr',
    clubName: 'Athletico-PR',
    shortTag: 'CAP',
    primary: '#dc2626',
    secondary: '#111827',
    numberColor: '#ffffff',
  },
  bragantino: {
    id: 'bragantino',
    clubName: 'RB Bragantino',
    shortTag: 'RBB',
    primary: '#f8fafc',
    secondary: '#dc2626',
    numberColor: '#dc2626',
  },
};

export function normalizeJerseyId(id?: string | null): JerseyId | null {
  if (!id) return null;
  const cleaned = id.replace(/^jersey_/, '') as JerseyId;
  return cleaned in JERSEY_CLUB_CONFIGS ? cleaned : null;
}

export function getJerseyConfig(id?: string | null): JerseyClubConfig | null {
  const norm = normalizeJerseyId(id);
  return norm ? JERSEY_CLUB_CONFIGS[norm] : null;
}

