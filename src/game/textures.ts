import * as THREE from 'three';

const studTextureCache = new Map<string, THREE.CanvasTexture>();

export function createStudTexture(
  colorHex: string,
  maxAnisotropy: number,
  repeatX = 1,
  repeatZ = 1
): THREE.CanvasTexture {
  const key = `${colorHex}_${repeatX.toFixed(1)}_${repeatZ.toFixed(1)}`;
  const cached = studTextureCache.get(key);
  if (cached) return cached;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Base block color
  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, size, size);

  // Subtle brick edge bevel
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.14)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, size - 4, size - 4);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 2;
  ctx.strokeRect(5, 5, size - 10, size - 10);

  // Classic 2x2 studs per tile
  const positions = [size * 0.25, size * 0.75];
  const radius = size * 0.15;

  for (const cx of positions) {
    for (const cy of positions) {
      // Drop shadow beneath stud
      ctx.beginPath();
      ctx.arc(cx + 2, cy + 3, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.fill();

      // Stud body
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = colorHex;
      ctx.fill();

      // Stud rim highlight & shadow
      ctx.beginPath();
      ctx.arc(cx, cy, radius, Math.PI * 0.9, Math.PI * 1.85);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, radius, -Math.PI * 0.1, Math.PI * 0.85);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.24)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(Math.max(1, repeatX), Math.max(1, repeatZ));
  texture.anisotropy = Math.min(8, maxAnisotropy);
  texture.needsUpdate = true;

  studTextureCache.set(key, texture);
  return texture;
}

export function createLavaTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#E03200';
  ctx.fillRect(0, 0, size, size);

  // Organic glowing magma cells
  const blobs = [
    { x: 42, y: 48, r: 44, c: '#FF6A00' },
    { x: 150, y: 70, r: 54, c: '#FF5500' },
    { x: 210, y: 185, r: 48, c: '#FF7700' },
    { x: 78, y: 180, r: 50, c: '#FF4500' },
    { x: 128, y: 132, r: 32, c: '#FFB703' },
    { x: 35, y: 220, r: 26, c: '#FCA311' },
    { x: 215, y: 40, r: 28, c: '#FFB703' },
  ];

  for (const b of blobs) {
    const grad = ctx.createRadialGradient(b.x, b.y, 4, b.x, b.y, b.r);
    grad.addColorStop(0, b.c);
    grad.addColorStop(1, 'rgba(224, 50, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Crust fissures
  ctx.strokeStyle = 'rgba(90, 12, 0, 0.45)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, 110);
  ctx.quadraticCurveTo(90, 80, 160, 135);
  ctx.quadraticCurveTo(210, 175, 256, 120);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(28, 28);
  texture.anisotropy = Math.min(8, maxAnisotropy);
  texture.needsUpdate = true;
  return texture;
}

export function createFaceTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#FCD34D';
  ctx.fillRect(0, 0, size, size);

  // Eyes
  ctx.fillStyle = '#0F172A';
  ctx.beginPath();
  ctx.ellipse(88, 102, 16, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(168, 102, 16, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eye sparkles
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(93, 94, 5, 0, Math.PI * 2);
  ctx.arc(173, 94, 5, 0, Math.PI * 2);
  ctx.fill();

  // Smile
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(128, 134, 42, Math.PI * 0.16, Math.PI * 0.84);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createQuestionSignTexture(
  stageNum: number,
  totalStages: number,
  topic: string,
  prompt: string,
  accentColor: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Dark high-contrast slate card
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, 1024, 512);

  // Top accent strip
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, 1024, 72);

  // Border frame
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 1014, 502);

  // Header text
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 34px Outfit, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(`DESAFIO ${stageNum}/${totalStages}  ·  ${topic.toUpperCase()}`, 38, 38);

  // Word-wrap prompt
  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 46px "Plus Jakarta Sans", sans-serif';
  const words = prompt.split(' ');
  const lines: string[] = [];
  let current = '';
  const maxWidth = 920;

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  const lineHeight = 62;
  const startY = 260 - ((lines.length - 1) * lineHeight) / 2;
  ctx.textAlign = 'center';
  lines.forEach((line, idx) => {
    ctx.fillText(line, 512, startY + idx * lineHeight);
  });

  // Footer instruction
  ctx.fillStyle = '#94A3B8';
  ctx.font = '600 26px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Pule na plataforma A, B ou C com a resposta correta!', 512, 464);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createAnswerPadTexture(
  letter: 'A' | 'B' | 'C',
  label: string,
  bgHex: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle stud dots in corners
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  const corners = [
    [48, 48],
    [464, 48],
    [48, 464],
    [464, 464],
  ];
  for (const [cx, cy] of corners) {
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fill();
  }

  // Border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.lineWidth = 16;
  ctx.strokeRect(12, 12, 488, 488);

  // Dark legible backing panel inside
  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.fillRect(46, 118, 420, 290);

  // Letter badge at top
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 84px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 256, 72);

  // Answer text (adaptive font size)
  ctx.fillStyle = '#FFFFFF';
  const fontSize = label.length > 14 ? 42 : label.length > 9 ? 54 : 68;
  ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;

  const words = label.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > 380) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  const lh = fontSize * 1.18;
  const startY = 264 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => {
    ctx.fillText(l, 256, startY + i * lh);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}
