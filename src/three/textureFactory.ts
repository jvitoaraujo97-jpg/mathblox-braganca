import * as THREE from 'three';

export type PbrTextureKind =
  | 'pavement'
  | 'asphalt'
  | 'grass'
  | 'water'
  | 'robloxStud'
  | 'mangroveMud'
  | 'mangroveWater';

export interface PbrTextureSet {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughness: number;
  bumpScale: number;
}

const TEX_SIZE = 512;

// Singleton canvas/texture cache shared across all 3D scenes (never disposed on scene unmount)
const cachedSets = new Map<PbrTextureKind, PbrTextureSet>();

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = Math.min(4, Math.max(1, maxAnisotropy));
  tex.userData.isSharedCachedTexture = true;
  tex.needsUpdate = true;
  return tex;
}

function buildPavementTextures(maxAnisotropy: number): PbrTextureSet {
  const rand = seededRand(104729);
  const cMap = document.createElement('canvas');
  cMap.width = TEX_SIZE;
  cMap.height = TEX_SIZE;
  const ctx = cMap.getContext('2d')!;

  const cBump = document.createElement('canvas');
  cBump.width = TEX_SIZE;
  cBump.height = TEX_SIZE;
  const bCtx = cBump.getContext('2d')!;

  // Dark grout base (#1E293B)
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  bCtx.fillStyle = '#181818';
  bCtx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  // Interlocking slate concrete blocks (#475569 base with subtle variation)
  const rows = 8;
  const cols = 4;
  const cellH = TEX_SIZE / rows;
  const cellW = TEX_SIZE / cols;
  const gap = 4;

  const palette = ['#475569', '#4B596E', '#414F63', '#526176', '#3E4B5E'];

  for (let r = 0; r < rows; r++) {
    const offset = r % 2 === 1 ? cellW * 0.5 : 0;
    for (let c = -1; c <= cols; c++) {
      const x = c * cellW + offset;
      const y = r * cellH;
      const tone = palette[Math.floor(rand() * palette.length)];

      // Albedo stone
      ctx.fillStyle = tone;
      ctx.fillRect(x + gap, y + gap, cellW - gap * 2, cellH - gap * 2);

      // Subtle bevel highlight & shadow
      ctx.fillStyle = 'rgba(226, 232, 240, 0.14)';
      ctx.fillRect(x + gap, y + gap, cellW - gap * 2, 3);
      ctx.fillRect(x + gap, y + gap, 3, cellH - gap * 2);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
      ctx.fillRect(x + gap, y + cellH - gap - 3, cellW - gap * 2, 3);

      // Height bump stone
      const hVal = 175 + Math.floor(rand() * 45);
      bCtx.fillStyle = `rgb(${hVal},${hVal},${hVal})`;
      bCtx.fillRect(x + gap, y + gap, cellW - gap * 2, cellH - gap * 2);
    }
  }

  // Micro-granulation mineral noise across pavement
  for (let i = 0; i < 6500; i++) {
    const px = Math.floor(rand() * TEX_SIZE);
    const py = Math.floor(rand() * TEX_SIZE);
    const light = rand() > 0.5;
    ctx.fillStyle = light ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.1)';
    ctx.fillRect(px, py, 2, 2);
    bCtx.fillStyle = light ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.12)';
    bCtx.fillRect(px, py, 2, 2);
  }

  return {
    map: finalizeTexture(cMap, true, maxAnisotropy),
    bumpMap: finalizeTexture(cBump, false, maxAnisotropy),
    roughness: 0.85,
    bumpScale: 0.08,
  };
}

function buildAsphaltTextures(maxAnisotropy: number): PbrTextureSet {
  const rand = seededRand(224737);
  const cMap = document.createElement('canvas');
  cMap.width = TEX_SIZE;
  cMap.height = TEX_SIZE;
  const ctx = cMap.getContext('2d')!;

  const cBump = document.createElement('canvas');
  cBump.width = TEX_SIZE;
  cBump.height = TEX_SIZE;
  const bCtx = cBump.getContext('2d')!;

  ctx.fillStyle = '#1E293B';
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  bCtx.fillStyle = '#707070';
  bCtx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  // Subtle tire wear vertical bands (along V)
  const wearGrad = ctx.createLinearGradient(0, 0, TEX_SIZE, 0);
  wearGrad.addColorStop(0.0, 'rgba(15, 23, 42, 0.28)');
  wearGrad.addColorStop(0.22, 'rgba(100, 116, 139, 0.12)');
  wearGrad.addColorStop(0.5, 'rgba(15, 23, 42, 0.08)');
  wearGrad.addColorStop(0.78, 'rgba(100, 116, 139, 0.12)');
  wearGrad.addColorStop(1.0, 'rgba(15, 23, 42, 0.28)');
  ctx.fillStyle = wearGrad;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  // Mineral aggregate grit
  for (let i = 0; i < 12000; i++) {
    const px = Math.floor(rand() * TEX_SIZE);
    const py = Math.floor(rand() * TEX_SIZE);
    const sz = rand() > 0.82 ? 3 : 2;
    const shade = Math.floor(26 + rand() * 54);
    ctx.fillStyle = `rgba(${shade + 10}, ${shade + 16}, ${shade + 26}, 0.55)`;
    ctx.fillRect(px, py, sz, sz);

    const bShade = Math.floor(80 + rand() * 140);
    bCtx.fillStyle = `rgb(${bShade},${bShade},${bShade})`;
    bCtx.fillRect(px, py, sz, sz);
  }

  // Faint asphalt micro-cracks
  ctx.strokeStyle = 'rgba(2, 6, 23, 0.24)';
  ctx.lineWidth = 1.5;
  for (let c = 0; c < 6; c++) {
    ctx.beginPath();
    let cx = rand() * TEX_SIZE;
    let cy = rand() * TEX_SIZE;
    ctx.moveTo(cx, cy);
    for (let s = 0; s < 5; s++) {
      cx += (rand() - 0.5) * 44;
      cy += (rand() - 0.5) * 44;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  return {
    map: finalizeTexture(cMap, true, maxAnisotropy),
    bumpMap: finalizeTexture(cBump, false, maxAnisotropy),
    roughness: 0.88,
    bumpScale: 0.06,
  };
}

function buildGrassTextures(maxAnisotropy: number): PbrTextureSet {
  const rand = seededRand(350377);
  const cMap = document.createElement('canvas');
  cMap.width = TEX_SIZE;
  cMap.height = TEX_SIZE;
  const ctx = cMap.getContext('2d')!;

  const cBump = document.createElement('canvas');
  cBump.width = TEX_SIZE;
  cBump.height = TEX_SIZE;
  const bCtx = cBump.getContext('2d')!;

  ctx.fillStyle = '#15803D';
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  bCtx.fillStyle = '#686868';
  bCtx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  // Soft organic soil/moss blotches
  for (let i = 0; i < 160; i++) {
    const x = rand() * TEX_SIZE;
    const y = rand() * TEX_SIZE;
    const r = 18 + rand() * 34;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(34, 197, 94, 0.25)' : 'rgba(20, 83, 45, 0.25)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dense grass blades & tufts
  const greens = ['#22C55E', '#16A34A', '#4ADE80', '#15803D', '#84CC16'];
  for (let i = 0; i < 6500; i++) {
    const x = rand() * TEX_SIZE;
    const y = rand() * TEX_SIZE;
    const h = 4 + rand() * 8;
    const tilt = (rand() - 0.5) * 4;
    ctx.strokeStyle = greens[Math.floor(rand() * greens.length)];
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + tilt, y - h);
    ctx.stroke();

    const bv = Math.floor(110 + rand() * 130);
    bCtx.strokeStyle = `rgb(${bv},${bv},${bv})`;
    bCtx.lineWidth = 1.5;
    bCtx.beginPath();
    bCtx.moveTo(x, y);
    bCtx.lineTo(x + tilt, y - h);
    bCtx.stroke();
  }

  return {
    map: finalizeTexture(cMap, true, maxAnisotropy),
    bumpMap: finalizeTexture(cBump, false, maxAnisotropy),
    roughness: 0.86,
    bumpScale: 0.09,
  };
}

function buildWaterTextures(maxAnisotropy: number): PbrTextureSet {
  const rand = seededRand(481129);
  const cMap = document.createElement('canvas');
  cMap.width = TEX_SIZE;
  cMap.height = TEX_SIZE;
  const ctx = cMap.getContext('2d')!;

  const cBump = document.createElement('canvas');
  cBump.width = TEX_SIZE;
  cBump.height = TEX_SIZE;
  const bCtx = cBump.getContext('2d')!;

  // Rich tropical turquoise / Atlantic blue base
  const grad = ctx.createLinearGradient(0, 0, 0, TEX_SIZE);
  grad.addColorStop(0.0, '#0284C7');
  grad.addColorStop(0.5, '#0891B2');
  grad.addColorStop(1.0, '#0284C7');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  // Seamless periodic wave bands & foam crests
  for (let w = 0; w < 26; w++) {
    const baseY = (w / 26) * TEX_SIZE;
    const amp = 4 + (w % 4) * 2.5;
    const freq = (Math.PI * 2 * (2 + (w % 3))) / TEX_SIZE;
    const phase = rand() * Math.PI * 2;

    ctx.strokeStyle = w % 3 === 0 ? 'rgba(224, 242, 254, 0.36)' : 'rgba(56, 189, 248, 0.32)';
    ctx.lineWidth = w % 4 === 0 ? 4.5 : 2.5;
    ctx.beginPath();
    for (let x = 0; x <= TEX_SIZE; x += 8) {
      const y = baseY + Math.sin(x * freq + phase) * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    bCtx.strokeStyle = w % 2 === 0 ? 'rgba(235, 235, 235, 0.48)' : 'rgba(30, 30, 30, 0.42)';
    bCtx.lineWidth = 5;
    bCtx.beginPath();
    for (let x = 0; x <= TEX_SIZE; x += 8) {
      const y = baseY + Math.sin(x * freq + phase) * amp;
      if (x === 0) bCtx.moveTo(x, y);
      else bCtx.lineTo(x, y);
    }
    bCtx.stroke();
  }

  // Sparkling foam flecks
  for (let i = 0; i < 380; i++) {
    const x = rand() * TEX_SIZE;
    const y = rand() * TEX_SIZE;
    const rx = 5 + rand() * 14;
    const ry = 1.5 + rand() * 3;
    ctx.fillStyle = 'rgba(240, 249, 255, 0.24)';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  return {
    map: finalizeTexture(cMap, true, maxAnisotropy),
    bumpMap: finalizeTexture(cBump, false, maxAnisotropy),
    roughness: 0.18,
    bumpScale: 0.07,
  };
}

function buildRobloxStudTextures(maxAnisotropy: number): PbrTextureSet {
  const cMap = document.createElement('canvas');
  cMap.width = TEX_SIZE;
  cMap.height = TEX_SIZE;
  const ctx = cMap.getContext('2d')!;

  const cBump = document.createElement('canvas');
  cBump.width = TEX_SIZE;
  cBump.height = TEX_SIZE;
  const bCtx = cBump.getContext('2d')!;

  // Neutral white albedo so material.color tints cleanly to any Obby block hue
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  bCtx.fillStyle = '#505050';
  bCtx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  const grid = 4; // 4x4 studs per 512px tile
  const cell = TEX_SIZE / grid;

  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      const cx = (c + 0.5) * cell;
      const cy = (r + 0.5) * cell;
      const radius = cell * 0.29;

      // Subtle tile grid seam
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)';
      ctx.lineWidth = 2;
      ctx.strokeRect(c * cell + 1, r * cell + 1, cell - 2, cell - 2);

      // Soft ambient occlusion micro-shadow around stud base
      const ao = ctx.createRadialGradient(cx, cy + 3, radius * 0.8, cx, cy + 3, radius * 1.38);
      ao.addColorStop(0, 'rgba(15, 23, 42, 0.34)');
      ao.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = ao;
      ctx.beginPath();
      ctx.arc(cx, cy + 3, radius * 1.38, 0, Math.PI * 2);
      ctx.fill();

      // Raised stud top with plastic bevel shading
      const studGrad = ctx.createRadialGradient(
        cx - radius * 0.3,
        cy - radius * 0.3,
        radius * 0.1,
        cx,
        cy,
        radius
      );
      studGrad.addColorStop(0, '#FFFFFF');
      studGrad.addColorStop(0.75, '#E2E8F0');
      studGrad.addColorStop(1, '#CBD5E1');
      ctx.fillStyle = studGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // Crisp specular rim on stud edge
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 2, Math.PI * 1.05, Math.PI * 1.85);
      ctx.stroke();

      // Bump height for stud
      const bGrad = bCtx.createRadialGradient(cx, cy, radius * 0.55, cx, cy, radius * 1.15);
      bGrad.addColorStop(0, '#FFFFFF');
      bGrad.addColorStop(0.78, '#E0E0E0');
      bGrad.addColorStop(1, '#484848');
      bCtx.fillStyle = bGrad;
      bCtx.beginPath();
      bCtx.arc(cx, cy, radius * 1.15, 0, Math.PI * 2);
      bCtx.fill();
    }
  }

  return {
    map: finalizeTexture(cMap, true, maxAnisotropy),
    bumpMap: finalizeTexture(cBump, false, maxAnisotropy),
    roughness: 0.38,
    bumpScale: 0.1,
  };
}

function buildMangroveMudTextures(maxAnisotropy: number): PbrTextureSet {
  const rand = seededRand(612947);
  const cMap = document.createElement('canvas');
  cMap.width = TEX_SIZE;
  cMap.height = TEX_SIZE;
  const ctx = cMap.getContext('2d')!;

  const cBump = document.createElement('canvas');
  cBump.width = TEX_SIZE;
  cBump.height = TEX_SIZE;
  const bCtx = cBump.getContext('2d')!;

  // Base dark wet brownish-gray mangrove mud (#3F342B)
  ctx.fillStyle = '#3F342B';
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  bCtx.fillStyle = '#787878';
  bCtx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  // Soft organic tidal silt & wet mud patches (#2E2620 / #4A3D32 / #261F1A)
  const mudTones = [
    'rgba(46, 38, 32, 0.42)',
    'rgba(74, 61, 50, 0.35)',
    'rgba(36, 30, 25, 0.48)',
    'rgba(63, 52, 43, 0.38)',
    'rgba(30, 44, 34, 0.22)',
  ];
  for (let i = 0; i < 240; i++) {
    const x = rand() * TEX_SIZE;
    const y = rand() * TEX_SIZE;
    const rx = 14 + rand() * 44;
    const ry = 10 + rand() * 32;
    const rot = rand() * Math.PI;
    ctx.fillStyle = mudTones[Math.floor(rand() * mudTones.length)];
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();

    const bv = rand() > 0.5 ? 165 : 52;
    bCtx.fillStyle = `rgba(${bv},${bv},${bv},0.34)`;
    bCtx.beginPath();
    bCtx.ellipse(x, y, rx * 0.9, ry * 0.9, rot, 0, Math.PI * 2);
    bCtx.fill();
  }

  // Subtle wet tidal sheen & organic root/leaf detritus flecks
  for (let i = 0; i < 7500; i++) {
    const px = Math.floor(rand() * TEX_SIZE);
    const py = Math.floor(rand() * TEX_SIZE);
    const sz = rand() > 0.8 ? 3 : 2;
    const r = rand();
    if (r > 0.72) {
      ctx.fillStyle = 'rgba(92, 76, 62, 0.25)';
    } else if (r > 0.35) {
      ctx.fillStyle = 'rgba(28, 22, 18, 0.35)';
    } else {
      ctx.fillStyle = 'rgba(42, 58, 38, 0.22)';
    }
    ctx.fillRect(px, py, sz, sz);

    const bShade = Math.floor(45 + rand() * 165);
    bCtx.fillStyle = `rgb(${bShade},${bShade},${bShade})`;
    bCtx.fillRect(px, py, sz, sz);
  }

  // Faint tidal drainage ripples across the mud
  for (let w = 0; w < 18; w++) {
    const baseY = (w / 18) * TEX_SIZE;
    const amp = 4 + (w % 3) * 3;
    ctx.strokeStyle = 'rgba(24, 19, 15, 0.26)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    bCtx.strokeStyle = 'rgba(28, 28, 28, 0.45)';
    bCtx.lineWidth = 4;
    bCtx.beginPath();
    for (let x = 0; x <= TEX_SIZE; x += 12) {
      const y = baseY + Math.sin((x / TEX_SIZE) * Math.PI * 4 + w) * amp;
      if (x === 0) {
        ctx.moveTo(x, y);
        bCtx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
        bCtx.lineTo(x, y);
      }
    }
    ctx.stroke();
    bCtx.stroke();
  }

  return {
    map: finalizeTexture(cMap, true, maxAnisotropy),
    bumpMap: finalizeTexture(cBump, false, maxAnisotropy),
    roughness: 0.55,
    bumpScale: 0.11,
  };
}

function buildMangroveWaterTextures(maxAnisotropy: number): PbrTextureSet {
  const rand = seededRand(784319);
  const cMap = document.createElement('canvas');
  cMap.width = TEX_SIZE;
  cMap.height = TEX_SIZE;
  const ctx = cMap.getContext('2d')!;

  const cBump = document.createElement('canvas');
  cBump.width = TEX_SIZE;
  cBump.height = TEX_SIZE;
  const bCtx = cBump.getContext('2d')!;

  // Murky estuarine mangrove water base: olive-moss & muddy-brown blend (#4B5943 / #5A573B / #3F4D3A)
  const baseGrad = ctx.createLinearGradient(0, 0, TEX_SIZE, TEX_SIZE);
  baseGrad.addColorStop(0.0, '#4B5943');
  baseGrad.addColorStop(0.35, '#5A573B');
  baseGrad.addColorStop(0.7, '#3F4D3A');
  baseGrad.addColorStop(1.0, '#4B5943');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  bCtx.fillStyle = '#7E7E7E';
  bCtx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  // Suspended estuarine silt & murky organic current clouds
  const siltTones = [
    'rgba(90, 87, 59, 0.36)',  // #5A573B muddy silt
    'rgba(75, 89, 67, 0.34)',  // #4B5943 olive moss
    'rgba(63, 77, 58, 0.42)',  // #3F4D3A deep mangrove channel
    'rgba(108, 96, 66, 0.24)', // warm clay sediment plume
    'rgba(48, 59, 44, 0.32)',  // shadowed tidal pocket
  ];
  for (let i = 0; i < 180; i++) {
    const x = rand() * TEX_SIZE;
    const y = rand() * TEX_SIZE;
    const rx = 22 + rand() * 58;
    const ry = 10 + rand() * 24;
    const rot = (rand() - 0.5) * 0.45;
    ctx.fillStyle = siltTones[Math.floor(rand() * siltTones.length)];
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
  }

  // Periodic slow tidal current ripples & subtle yellowish-beige organic foam lines
  for (let w = 0; w < 24; w++) {
    const baseY = (w / 24) * TEX_SIZE;
    const amp = 4 + (w % 4) * 2.4;
    const freq = (Math.PI * 2 * (1 + (w % 3))) / TEX_SIZE;
    const phase = rand() * Math.PI * 2;

    const isFoamStreak = w % 5 === 0;
    ctx.strokeStyle = isFoamStreak
      ? 'rgba(218, 206, 166, 0.28)' // thin yellowish-beige estuarine foam line
      : w % 2 === 0
        ? 'rgba(116, 114, 78, 0.26)'
        : 'rgba(42, 53, 38, 0.3)';
    ctx.lineWidth = isFoamStreak ? 2.2 : 3.2;
    ctx.beginPath();
    for (let x = 0; x <= TEX_SIZE; x += 8) {
      const y = baseY + Math.sin(x * freq + phase) * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    bCtx.strokeStyle = w % 2 === 0 ? 'rgba(205, 205, 205, 0.42)' : 'rgba(55, 55, 55, 0.4)';
    bCtx.lineWidth = 4.5;
    bCtx.beginPath();
    for (let x = 0; x <= TEX_SIZE; x += 8) {
      const y = baseY + Math.sin(x * freq + phase) * amp;
      if (x === 0) bCtx.moveTo(x, y);
      else bCtx.lineTo(x, y);
    }
    bCtx.stroke();
  }

  // Fine drifting organic sediment flecks & subtle beige micro-foam clusters
  for (let i = 0; i < 420; i++) {
    const x = rand() * TEX_SIZE;
    const y = rand() * TEX_SIZE;
    const rx = 3 + rand() * 11;
    const ry = 1.2 + rand() * 2.6;
    ctx.fillStyle =
      i % 4 === 0 ? 'rgba(214, 199, 156, 0.22)' : 'rgba(72, 66, 45, 0.24)';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, (rand() - 0.5) * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  return {
    map: finalizeTexture(cMap, true, maxAnisotropy),
    bumpMap: finalizeTexture(cBump, false, maxAnisotropy),
    roughness: 0.35,
    bumpScale: 0.06,
  };
}

/**
 * Returns the singleton cached 512×512 procedural PBR texture set (`map` + `bumpMap`).
 * Use `getTiledPbrTexture` when you need custom repeat or independent UV scrolling.
 */
export function getPbrTextureSet(kind: PbrTextureKind, maxAnisotropy = 4): PbrTextureSet {
  const existing = cachedSets.get(kind);
  if (existing) return existing;

  let created: PbrTextureSet;
  switch (kind) {
    case 'pavement':
      created = buildPavementTextures(maxAnisotropy);
      break;
    case 'asphalt':
      created = buildAsphaltTextures(maxAnisotropy);
      break;
    case 'grass':
      created = buildGrassTextures(maxAnisotropy);
      break;
    case 'water':
      created = buildWaterTextures(maxAnisotropy);
      break;
    case 'robloxStud':
      created = buildRobloxStudTextures(maxAnisotropy);
      break;
    case 'mangroveMud':
      created = buildMangroveMudTextures(maxAnisotropy);
      break;
    case 'mangroveWater':
      created = buildMangroveWaterTextures(maxAnisotropy);
      break;
  }

  cachedSets.set(kind, created);
  return created;
}

/**
 * Creates lightweight cloned texture handles sharing the singleton cached HTMLCanvasElement
 * so each mesh can set its own `repeat` or scroll `offset` independently without duplicating pixel generation.
 */
export function createTiledPbrTextures(
  kind: PbrTextureKind,
  repeatX: number,
  repeatY: number,
  maxAnisotropy = 4
): PbrTextureSet {
  const base = getPbrTextureSet(kind, maxAnisotropy);
  const map = base.map.clone();
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeatX, repeatY);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = Math.min(4, Math.max(1, maxAnisotropy));
  map.userData.isSharedCachedTexture = false;
  map.needsUpdate = true;

  const bumpMap = base.bumpMap.clone();
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(repeatX, repeatY);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.anisotropy = Math.min(4, Math.max(1, maxAnisotropy));
  bumpMap.userData.isSharedCachedTexture = false;
  bumpMap.needsUpdate = true;

  return {
    map,
    bumpMap,
    roughness: base.roughness,
    bumpScale: base.bumpScale,
  };
}
