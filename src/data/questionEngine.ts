import { getSupabaseClient } from '../services/storageService';
import { GameModeType, MathQuestion, StudentProfile, TowerDifficulty } from '../types/game';
import {
  buildUniqueOptions,
  generateParametricQuestionForWorld,
  normalizeWorldId,
  ValidWorldId,
} from './parametricGenerators';
import { MATH_QUESTIONS } from './questions';

const CUSTOM_QUESTIONS_KEY = 'mathblox_custom_questions_v1';
const HISTORY_STORAGE_PREFIX = 'mathblox_q_history_';
const MAX_PERSISTED_HISTORY = 150;

// In-memory session tracker complementing persistent localStorage history
const sessionUsedHashes = new Set<string>();

/**
 * Fast deterministic FNV-1a 32-bit hash for normalized question prompts.
 */
export function hashQuestionPrompt(prompt: string): string {
  const normalized = prompt.trim().toLowerCase().replace(/\s+/g, ' ');
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function getHistoryKey(studentId?: string): string {
  return `${HISTORY_STORAGE_PREFIX}${studentId || 'default'}`;
}

function loadStudentHistory(studentId?: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getHistoryKey(studentId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveStudentHistory(studentId: string | undefined, history: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = history.slice(-MAX_PERSISTED_HISTORY);
    localStorage.setItem(getHistoryKey(studentId), JSON.stringify(trimmed));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Records a prompt hash into the student's persistent 150-question anti-repetition history.
 */
export function recordAnsweredQuestion(studentId: string | undefined, prompt: string): void {
  const h = hashQuestionPrompt(prompt);
  sessionUsedHashes.add(h);
  const current = loadStudentHistory(studentId);
  if (!current.includes(h)) {
    current.push(h);
    saveStudentHistory(studentId, current);
  }
}

export function loadCustomQuestionsFromLocal(): MathQuestion[] {
  try {
    const raw = localStorage.getItem(CUSTOM_QUESTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MathQuestion[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function syncCustomQuestionsFromSupabase(): Promise<MathQuestion[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return loadCustomQuestionsFromLocal();
  try {
    const { data, error } = await supabase.from('custom_questions').select('*');
    if (!error && Array.isArray(data) && data.length > 0) {
      localStorage.setItem(CUSTOM_QUESTIONS_KEY, JSON.stringify(data));
      return data as MathQuestion[];
    }
  } catch {
    // Fallback to localStorage
  }
  return loadCustomQuestionsFromLocal();
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * CORRIDA TURBO: Regra Estrita de Operação Única e Pensamento Rápido (BNCC 1º ao 9º Ano + Trilha Base).
 * - 1º Ano (7): Soma e subtração até 20 (exclusivamente naturais positivos)
 * - 2º Ano (8): Soma/subtração até 100 e multiplicação ×2, ×3, ×4, ×5
 * - 3º Ano (9): Tabuada completa 2–9, divisão exata, soma/subtração
 * - 4º Ano (10), 5º Ano (1), 6º Ano (2), Trilha Base (6): Tabuada, divisão, adição e subtração naturais
 * - 7º Ano (3), 8º Ano (4), 9º Ano (5): Inclui multiplicação simples com inteiros negativos
 */
function generateTurboMentalQuestion(worldId: ValidWorldId, stageIndex: number): MathQuestion {
  const bnccMap: Record<ValidWorldId, string> = {
    7: 'EF01MA08',
    8: 'EF02MA07',
    9: 'EF03MA07',
    10: 'EF04MA06',
    1: 'EF05MA08',
    2: 'EF06MA03',
    3: 'EF07MA04',
    4: 'EF08MA01',
    5: 'EF09MA04',
    6: 'EF05MA08',
  };
  const bnccCode = bnccMap[worldId];

  // 1º ANO (worldId 7): Apenas soma e subtração até 20
  if (worldId === 7) {
    const isAdd = Math.random() > 0.45;
    if (isAdd) {
      const a = randInt(2, 11);
      const b = randInt(2, Math.min(9, 20 - a));
      const ans = a + b;
      const { options, correctIndex } = buildUniqueOptions(String(ans), [
        String(ans + 1),
        String(Math.max(1, ans - 1)),
        String(ans + 2),
      ]);
      return {
        id: `turbo-w7-add-${stageIndex}-${Math.random().toString(36).slice(2, 7)}`,
        worldId: 7,
        stageIndex,
        bnccCode,
        topic: `Soma Rápida (${bnccCode})`,
        prompt: `${a} + ${b} = ?`,
        options,
        correctIndex,
        explanation: `Somando rapidinho: ${a} + ${b} = ${ans}!`,
      };
    }
    const a = randInt(7, 20);
    const b = randInt(2, a - 1);
    const ans = a - b;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [
      String(ans + 1),
      String(Math.max(1, ans - 2)),
      String(ans + 2),
    ]);
    return {
      id: `turbo-w7-sub-${stageIndex}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 7,
      stageIndex,
      bnccCode,
      topic: `Subtração Rápida (${bnccCode})`,
      prompt: `${a} - ${b} = ?`,
      options,
      correctIndex,
      explanation: `Subtraindo: ${a} - ${b} = ${ans}!`,
    };
  }

  // 2º ANO (worldId 8): Multiplicação ×2..×5 (50%) + Soma/Subtração até 100 (50%)
  if (worldId === 8) {
    const roll = Math.random();
    if (roll < 0.5) {
      const a = [2, 3, 4, 5][randInt(0, 3)];
      const b = randInt(2, 10);
      const ans = a * b;
      const { options, correctIndex } = buildUniqueOptions(String(ans), [
        String(ans + a),
        String(Math.max(2, ans - a)),
      ]);
      return {
        id: `turbo-w8-mul-${stageIndex}-${Math.random().toString(36).slice(2, 7)}`,
        worldId: 8,
        stageIndex,
        bnccCode,
        topic: `Tabuada Inicial (${bnccCode})`,
        prompt: `${a} × ${b} = ?`,
        options,
        correctIndex,
        explanation: `Tabuada do ${a}: ${a} × ${b} = ${ans}!`,
      };
    }
    if (roll < 0.75) {
      const a = randInt(15, 55);
      const b = randInt(10, 95 - a);
      const ans = a + b;
      const { options, correctIndex } = buildUniqueOptions(String(ans), [
        String(ans + 10),
        String(Math.max(2, ans - 4)),
      ]);
      return {
        id: `turbo-w8-add-${stageIndex}-${Math.random().toString(36).slice(2, 7)}`,
        worldId: 8,
        stageIndex,
        bnccCode: 'EF02MA05',
        topic: `Adição Rápida (EF02MA05)`,
        prompt: `${a} + ${b} = ?`,
        options,
        correctIndex,
        explanation: `${a} + ${b} = ${ans}!`,
      };
    }
    const a = randInt(35, 95);
    const b = randInt(10, a - 8);
    const ans = a - b;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [
      String(ans + 10),
      String(Math.max(1, ans - 5)),
    ]);
    return {
      id: `turbo-w8-sub-${stageIndex}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 8,
      stageIndex,
      bnccCode: 'EF02MA06',
      topic: `Subtração Rápida (EF02MA06)`,
      prompt: `${a} - ${b} = ?`,
      options,
      correctIndex,
      explanation: `${a} - ${b} = ${ans}!`,
    };
  }

  // 3º ao 9º ANO & TRILHA BASE: 50% Tabuada, 25% Subtração, 25% Adição/Divisão Exata
  const isAdvanced = worldId >= 3 && worldId <= 5;
  const roll = Math.random();

  if (roll < 0.5) {
    // Inteiros negativos SOMENTE para 7º, 8º e 9º ano (25% das multiplicações)
    if (isAdvanced && Math.random() < 0.28) {
      const a = randInt(3, 9);
      const b = randInt(3, 9);
      const ans = -a * b;
      const { options, correctIndex } = buildUniqueOptions(
        String(ans),
        [String(a * b), String(ans - a)],
        true
      );
      return {
        id: `turbo-mul-neg-${worldId}-${stageIndex}-${Math.random().toString(36).slice(2, 7)}`,
        worldId,
        stageIndex,
        bnccCode,
        topic: `Multiplicação em Z (${bnccCode})`,
        prompt: `(-${a}) × ${b} = ?`,
        options,
        correctIndex,
        explanation: `Sinais diferentes na multiplicação dão negativo: (-${a}) × ${b} = ${ans}!`,
      };
    }

    const maxFactor = worldId === 9 || worldId === 1 || worldId === 6 ? 9 : 12;
    const a = randInt(2, maxFactor);
    const b = randInt(2, 10);
    const ans = a * b;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [
      String(ans + a),
      String(Math.max(2, ans - b)),
    ]);
    return {
      id: `turbo-mul-${worldId}-${stageIndex}-${Math.random().toString(36).slice(2, 7)}`,
      worldId,
      stageIndex,
      bnccCode,
      topic: `Tabuada Turbo (${bnccCode})`,
      prompt: `${a} × ${b} = ?`,
      options,
      correctIndex,
      explanation: `Tabuada direta: ${a} × ${b} = ${ans}!`,
    };
  }

  if (roll < 0.75) {
    const a = randInt(48, 145);
    const b = randInt(14, Math.min(68, a - 12));
    const ans = a - b;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [
      String(ans + 10),
      String(Math.max(1, ans - 4)),
    ]);
    return {
      id: `turbo-sub-${worldId}-${stageIndex}-${Math.random().toString(36).slice(2, 7)}`,
      worldId,
      stageIndex,
      bnccCode,
      topic: `Subtração Rápida (${bnccCode})`,
      prompt: `${a} - ${b} = ?`,
      options,
      correctIndex,
      explanation: `Subtração mental rápida: ${a} - ${b} = ${ans}!`,
    };
  }

  // Adição mental ou Divisão exata
  if (Math.random() < 0.55) {
    const b = randInt(3, 9);
    const q = randInt(3, worldId === 9 ? 9 : 12);
    const a = b * q;
    const { options, correctIndex } = buildUniqueOptions(String(q), [
      String(q + 2),
      String(Math.max(1, q - 1)),
    ]);
    return {
      id: `turbo-div-${worldId}-${stageIndex}-${Math.random().toString(36).slice(2, 7)}`,
      worldId,
      stageIndex,
      bnccCode,
      topic: `Divisão Exata (${bnccCode})`,
      prompt: `${a} ÷ ${b} = ?`,
      options,
      correctIndex,
      explanation: `Pois ${b} × ${q} = ${a}, logo ${a} ÷ ${b} = ${q}!`,
    };
  }

  const a = randInt(24, 78);
  const b = randInt(18, 65);
  const ans = a + b;
  const { options, correctIndex } = buildUniqueOptions(String(ans), [
    String(ans + 10),
    String(ans - 6),
  ]);
  return {
    id: `turbo-add-${worldId}-${stageIndex}-${Math.random().toString(36).slice(2, 7)}`,
    worldId,
    stageIndex,
    bnccCode,
    topic: `Adição Mental (${bnccCode})`,
    prompt: `${a} + ${b} = ?`,
    options,
    correctIndex,
    explanation: `Somando mentalmente: ${a} + ${b} = ${ans}!`,
  };
}

/**
 * Gerador dedicado de Raciocínio Lógico com Tabuada para a Regata de Voadeira no Rio Caeté.
 * Calibrado estritamente por faixa escolar (1º-2º, 3º-4º, 5º-9º + Trilha Base)
 * com tópico unificado 'Raciocínio Lógico — Tabuada' para análise científica.
 */
export function generateMultiplicationLogicQuestion(
  worldId: number,
  stageIndex: number
): MathQuestion {
  const w = normalizeWorldId(worldId);
  const topic = 'Raciocínio Lógico — Tabuada';
  const makeId = (tag: string) =>
    `caete-logic-w${w}-s${stageIndex}-${tag}-${Math.random().toString(36).slice(2, 7)}`;
  const pickItem = <T,>(arr: readonly T[]): T =>
    arr[Math.floor(Math.random() * arr.length)];

  // Helper for numeric distractors
  const buildNumOptions = (ans: number, alt1: number, alt2: number) => {
    const safe1 = alt1 === ans || alt1 <= 0 ? ans + 2 : alt1;
    let safe2 = alt2 === ans || alt2 === safe1 || alt2 <= 0 ? ans + 4 : alt2;
    if (safe2 === safe1 || safe2 === ans) safe2 = ans + 6;
    return buildUniqueOptions(String(ans), [String(safe1), String(safe2)]);
  };

  // =========================================================================
  // 1º e 2º ANO (worldId 7 e 8): Agrupamento, dobro, triplo e tabuada inicial (x2, x3, x4, x5)
  // =========================================================================
  if (w === 7 || w === 8) {
    const variant = (stageIndex + randInt(0, 4)) % 5;
    if (variant === 0) {
      const perBoat = randInt(2, 5);
      const boats = randInt(2, 5);
      const ans = perBoat * boats;
      const { options, correctIndex } = buildNumOptions(ans, ans + perBoat, Math.max(2, ans - perBoat));
      return {
        id: makeId('v1'),
        worldId: w,
        stageIndex,
        topic,
        prompt: `Cada voadeira leva ${perBoat} alunos. Em ${boats} voadeiras vão quantos alunos?`,
        options,
        correctIndex,
        explanation: `${boats} grupos de ${perBoat} = ${boats} × ${perBoat} = ${ans} alunos!`,
      };
    }
    if (variant === 1) {
      const factor = pickItem([2, 3, 4, 5]);
      const hidden = randInt(2, 6);
      const prod = factor * hidden;
      const { options, correctIndex } = buildNumOptions(hidden, hidden + 1, Math.max(1, hidden - 1));
      return {
        id: makeId('v2'),
        worldId: w,
        stageIndex,
        topic,
        prompt: `Qual número vezes ${factor} resulta em ${prod}?`,
        options,
        correctIndex,
        explanation: `${hidden} × ${factor} = ${prod}!`,
      };
    }
    if (variant === 2) {
      const n = randInt(3, 10);
      const ans = n * 2;
      const { options, correctIndex } = buildNumOptions(ans, ans + 2, n + 2);
      return {
        id: makeId('v3'),
        worldId: w,
        stageIndex,
        topic,
        prompt: `Se uma cesta tem ${n} peixes, quantos peixes há no DOBRO de cestas?`,
        options,
        correctIndex,
        explanation: `O dobro de ${n} é 2 × ${n} = ${ans}!`,
      };
    }
    if (variant === 3) {
      const n = randInt(2, 7);
      const ans = n * 3;
      const { options, correctIndex } = buildNumOptions(ans, n * 2, ans + 3);
      return {
        id: makeId('v4'),
        worldId: w,
        stageIndex,
        topic,
        prompt: `Qual é o TRIPLO de ${n} remos no trapiche?`,
        options,
        correctIndex,
        explanation: `O triplo de ${n} é 3 × ${n} = ${ans}!`,
      };
    }
    const items = pickItem([2, 3, 4, 5]);
    const baskets = randInt(3, 6);
    const ans = items * baskets;
    const { options, correctIndex } = buildNumOptions(ans, items + baskets, ans + items);
    return {
      id: makeId('v5'),
      worldId: w,
      stageIndex,
      topic,
      prompt: `Cada paneiro tem ${items} cachos de açaí. Em ${baskets} paneiros há quantos cachos?`,
      options,
      correctIndex,
      explanation: `${baskets} × ${items} = ${ans} cachos de açaí!`,
    };
  }

  // =========================================================================
  // 3º e 4º ANO (worldId 9 e 10): Fator oculto, sequências múltiplas, comparação & divisão inversa
  // =========================================================================
  if (w === 9 || w === 10) {
    const variant = (stageIndex + randInt(0, 3)) % 4;
    if (variant === 0) {
      // Fator Oculto na Tabuada
      const a = randInt(4, 9);
      const b = randInt(3, 9);
      const prod = a * b;
      const hideFirst = Math.random() < 0.5;
      const ans = hideFirst ? a : b;
      const { options, correctIndex } = buildNumOptions(ans, ans + 1, Math.max(2, ans - 1));
      return {
        id: makeId('m1'),
        worldId: w,
        stageIndex,
        topic,
        prompt: hideFirst ? `? × ${b} = ${prod}` : `${a} × ? = ${prod}`,
        options,
        correctIndex,
        explanation: `Como ${a} × ${b} = ${prod}, o fator oculto é ${ans}!`,
      };
    }
    if (variant === 1) {
      // Sequência Lógica Múltipla
      const step = randInt(3, 9);
      const startMul = randInt(1, 3);
      const seq = [0, 1, 2, 3, 4].map((k) => step * (startMul + k));
      const ans = seq[3];
      const { options, correctIndex } = buildNumOptions(ans, ans + step, Math.max(step, ans - 2));
      return {
        id: makeId('m2'),
        worldId: w,
        stageIndex,
        topic,
        prompt: `Complete a sequência da tabuada: ${seq[0]}, ${seq[1]}, ${seq[2]}, ?, ${seq[4]}`,
        options,
        correctIndex,
        explanation: `A sequência aumenta de ${step} em ${step}: ${seq[2]} + ${step} = ${ans}!`,
      };
    }
    if (variant === 2) {
      // Comparação Lógica Rápida (qual expressão tem o maior resultado)
      const pairs: [number, number][] = [
        [6, 7],
        [8, 5],
        [9, 4],
        [7, 7],
        [6, 8],
        [9, 5],
        [8, 7],
        [9, 6],
        [7, 5],
        [8, 6],
        [9, 7],
        [8, 8],
      ];
      const shuffledPairs = shuffleArray(pairs);
      const chosen: [number, number][] = [];
      const seenVals = new Set<number>();
      for (const p of shuffledPairs) {
        const val = p[0] * p[1];
        if (!seenVals.has(val)) {
          seenVals.add(val);
          chosen.push(p);
          if (chosen.length === 3) break;
        }
      }
      let bestIdx: 0 | 1 | 2 = 0;
      for (let i = 1; i < 3; i++) {
        if (chosen[i][0] * chosen[i][1] > chosen[bestIdx][0] * chosen[bestIdx][1]) {
          bestIdx = i as 0 | 1 | 2;
        }
      }
      const best = chosen[bestIdx];
      return {
        id: makeId('m3'),
        worldId: w,
        stageIndex,
        topic,
        prompt: `Qual expressão tem o MAIOR resultado?`,
        options: [
          `${chosen[0][0]} × ${chosen[0][1]}`,
          `${chosen[1][0]} × ${chosen[1][1]}`,
          `${chosen[2][0]} × ${chosen[2][1]}`,
        ],
        correctIndex: bestIdx,
        explanation: `${best[0]} × ${best[1]} = ${best[0] * best[1]} é o maior resultado!`,
      };
    }
    // Lógica Inversa (Divisão pela Tabuada)
    const divisors = randInt(3, 9);
    const perBasket = randInt(4, 9);
    const total = divisors * perBasket;
    const { options, correctIndex } = buildNumOptions(
      perBasket,
      perBasket + 1,
      Math.max(2, perBasket - 2)
    );
    return {
      id: makeId('m4'),
      worldId: w,
      stageIndex,
      topic,
      prompt: `Tenho ${total} açaís para dividir igualmente em ${divisors} paneiros. Quantos cabem em cada?`,
      options,
      correctIndex,
      explanation: `Como ${divisors} × ${perBasket} = ${total}, cabem ${perBasket} açaís em cada paneiro!`,
    };
  }

  // =========================================================================
  // 5º ao 9º ANO + TRILHA BASE (worldId 1..6):
  // Distributiva, Equação Lógica de 2 Passos e Proporções Rápidas (Tabuada do 6 ao 12)
  // =========================================================================
  const variant = (stageIndex + randInt(0, 3)) % 4;
  if (variant === 0) {
    // Dedução por Propriedade Distributiva / Dobro de Fator
    const baseA = randInt(3, 6);
    const baseB = randInt(6, 12);
    const baseProd = baseA * baseB;
    const modeDist = randInt(0, 1);
    if (modeDist === 0) {
      const targetA = baseA * 2;
      const ans = baseProd * 2;
      const { options, correctIndex } = buildNumOptions(ans, ans + baseB, ans - baseB);
      return {
        id: makeId('h1a'),
        worldId: w,
        stageIndex,
        topic,
        prompt: `Se ${baseA} × ${baseB} = ${baseProd}, quanto vale ${targetA} × ${baseB} sem armar a conta?`,
        options,
        correctIndex,
        explanation: `Dobrando o fator (${baseA} → ${targetA}), dobramos o resultado: 2 × ${baseProd} = ${ans}!`,
      };
    }
    const targetB = baseB + 1;
    const ans = baseProd + baseA;
    const { options, correctIndex } = buildNumOptions(ans, baseProd + baseB, ans + baseA);
    return {
      id: makeId('h1b'),
      worldId: w,
      stageIndex,
      topic,
      prompt: `Se ${baseA} × ${baseB} = ${baseProd}, quanto vale ${baseA} × ${targetB}?`,
      options,
      correctIndex,
      explanation: `Pela distributiva: ${baseA} × (${baseB} + 1) = ${baseProd} + ${baseA} = ${ans}!`,
    };
  }

  if (variant === 1) {
    // Equação Lógica de 2 Passos com Tabuada
    const x = randInt(4, 11);
    const mult = randInt(6, 11);
    const add = randInt(3, 9);
    const total = x * mult + add;
    const { options, correctIndex } = buildNumOptions(x, x + 1, Math.max(2, x - 1));
    return {
      id: makeId('h2'),
      worldId: w,
      stageIndex,
      topic,
      prompt: `Pensei em um número, multipliquei por ${mult} e somei ${add}, dando ${total}. Que número é esse?`,
      options,
      correctIndex,
      explanation: `${total} − ${add} = ${x * mult}; dividindo por ${mult}, o número pensado é ${x}!`,
    };
  }

  if (variant === 2) {
    // Padrões e Proporções Rápidas no Rio Caeté (Tabuada do 6 ao 12)
    const unitMin = randInt(6, 12);
    const laps1 = randInt(2, 4);
    const laps2 = laps1 + randInt(2, 4);
    const min1 = laps1 * unitMin;
    const ans = laps2 * unitMin;
    const { options, correctIndex } = buildNumOptions(ans, ans + unitMin, Math.max(unitMin, ans - unitMin));
    return {
      id: makeId('h3'),
      worldId: w,
      stageIndex,
      topic,
      prompt: `Se ${laps1} voltas no Rio Caeté levam ${min1} min, quantos min levam ${laps2} voltas no mesmo ritmo?`,
      options,
      correctIndex,
      explanation: `Cada volta leva ${min1} ÷ ${laps1} = ${unitMin} min. Logo, ${laps2} × ${unitMin} = ${ans} min!`,
    };
  }

  // Sequência / Comparação Avançada da Tabuada do 6 ao 12
  const base = randInt(6, 12);
  const k = randInt(3, 7);
  const s0 = base * k;
  const s1 = base * (k + 1);
  const s2 = base * (k + 2);
  const ans = base * (k + 3);
  const s4 = base * (k + 4);
  const { options, correctIndex } = buildNumOptions(ans, ans + base, ans - 2);
  return {
    id: makeId('h4'),
    worldId: w,
    stageIndex,
    topic,
    prompt: `Descubra o múltiplo faltante na sequência: ${s0}, ${s1}, ${s2}, ?, ${s4}`,
    options,
    correctIndex,
    explanation: `O padrão soma ${base} a cada passo: ${s2} + ${base} = ${ans}!`,
  };
}

/**
 * Motor Anti-Repetição Massivo (FASE 1):
 * - Isolamento BNCC estrito por `worldId` (1..10) — ZERO vazamento entre séries!
 * - Combina 20 questões conceituais por série + 8 geradores paramétricos dinâmicos por série.
 * - Persiste os últimos 150 hashes de questões por aluno em `localStorage` (`mathblox_q_history_${studentId}`).
 * - Rejeita enunciados já vistos nos últimos 150 registros (até 25 tentativas antes de reciclar os mais antigos).
 */
export function getQuestionsForMode(
  worldId: number,
  mode: GameModeType,
  count = 12,
  studentId?: string
): MathQuestion[] {
  const validWorldId = normalizeWorldId(worldId);

  const persistedHistory = loadStudentHistory(studentId);
  const blockedHashes = new Set<string>([...persistedHistory, ...sessionUsedHashes]);
  const newlySelectedHashes: string[] = [];
  const batchHashes = new Set<string>();

  const acceptQuestion = (q: MathQuestion, stageIndex: number): MathQuestion => {
    const h = hashQuestionPrompt(q.prompt);
    batchHashes.add(h);
    blockedHashes.add(h);
    sessionUsedHashes.add(h);
    newlySelectedHashes.push(h);
    return { ...q, worldId: validWorldId, stageIndex };
  };

  // 1. CORRIDA TURBO: 100% operações únicas mentais calibradas para a série
  if (mode === 'turbo_race') {
    const result: MathQuestion[] = [];
    for (let i = 0; i < count; i++) {
      let chosen = generateTurboMentalQuestion(validWorldId, i);
      let attempts = 0;
      while (attempts < 25) {
        const h = hashQuestionPrompt(chosen.prompt);
        if (!blockedHashes.has(h) && !batchHashes.has(h)) break;
        chosen = generateTurboMentalQuestion(validWorldId, i);
        attempts++;
      }
      // If all 25 collided with old history, still ensure uniqueness inside this match
      let safety = 0;
      while (batchHashes.has(hashQuestionPrompt(chosen.prompt)) && safety < 15) {
        chosen = generateTurboMentalQuestion(validWorldId, i);
        safety++;
      }
      result.push(acceptQuestion(chosen, i));
    }
    saveStudentHistory(studentId, [...persistedHistory, ...newlySelectedHashes]);
    return result;
  }

  // 1B. REGATA DE VOADEIRA NO RIO CAETÉ: 100% Raciocínio Lógico com Tabuada calibrado por série
  if (mode === 'caete_boat') {
    const result: MathQuestion[] = [];
    for (let i = 0; i < count; i++) {
      let chosen = generateMultiplicationLogicQuestion(validWorldId, i);
      let attempts = 0;
      while (attempts < 25) {
        const h = hashQuestionPrompt(chosen.prompt);
        if (!blockedHashes.has(h) && !batchHashes.has(h)) break;
        chosen = generateMultiplicationLogicQuestion(validWorldId, i + attempts + 1);
        attempts++;
      }
      let safety = 0;
      while (batchHashes.has(hashQuestionPrompt(chosen.prompt)) && safety < 15) {
        chosen = generateMultiplicationLogicQuestion(validWorldId, i + safety + 7);
        safety++;
      }
      result.push(acceptQuestion(chosen, i));
    }
    saveStudentHistory(studentId, [...persistedHistory, ...newlySelectedHashes]);
    return result;
  }

  // 2. OBBY, ARENA SOBREVIVÊNCIA & RALI DE KART:
  // Mistura inteligente: ~40% conceituais estáticas inéditas + ~60% paramétricas dinâmicas inéditas
  const customQuestions = loadCustomQuestionsFromLocal().filter(
    (q) => q.worldId === validWorldId
  );
  const baseQuestions = MATH_QUESTIONS.filter((q) => q.worldId === validWorldId);
  const allStatic = [...customQuestions, ...baseQuestions];

  // Separação temática leve entre Obby/Rali e Sobrevivência para diversificar modalidades
  const preferredStatic =
    mode === 'obby' || mode === 'vehicle_rally'
      ? allStatic.filter((_, idx) => idx % 2 === 0)
      : allStatic.filter((_, idx) => idx % 2 === 1);
  const secondaryStatic =
    mode === 'obby' || mode === 'vehicle_rally'
      ? allStatic.filter((_, idx) => idx % 2 === 1)
      : allStatic.filter((_, idx) => idx % 2 === 0);

  const unseenStatic = shuffleArray([...preferredStatic, ...secondaryStatic]).filter(
    (q) => !blockedHashes.has(hashQuestionPrompt(q.prompt))
  );

  const selected: MathQuestion[] = [];
  const staticQuota = Math.min(unseenStatic.length, Math.max(2, Math.floor(count * 0.4)));

  for (let i = 0; i < staticQuota && selected.length < count; i++) {
    const q = unseenStatic[i];
    const h = hashQuestionPrompt(q.prompt);
    if (!batchHashes.has(h)) {
      selected.push(acceptQuestion(q, selected.length));
    }
  }

  // Preenche o restante com os 8 geradores paramétricos dinâmicos da série (rotacionando slots para variedade)
  const slotOffset = Math.floor(Math.random() * 8);
  let genCursor = 0;
  while (selected.length < count) {
    const stageIdx = selected.length;
    let candidate = generateParametricQuestionForWorld(
      validWorldId,
      stageIdx,
      slotOffset + genCursor
    );
    let attempts = 0;
    while (attempts < 25) {
      const h = hashQuestionPrompt(candidate.prompt);
      if (!blockedHashes.has(h) && !batchHashes.has(h)) break;
      genCursor++;
      candidate = generateParametricQuestionForWorld(
        validWorldId,
        stageIdx,
        slotOffset + genCursor
      );
      attempts++;
    }

    // Se todas as 25 tentativas bateram no histórico antigo, recicla os registros mais antigos
    if (attempts >= 25 && persistedHistory.length > 40) {
      const oldestQuarter = persistedHistory.slice(0, Math.floor(persistedHistory.length / 3));
      oldestQuarter.forEach((oldH) => {
        blockedHashes.delete(oldH);
        sessionUsedHashes.delete(oldH);
      });
    }

    // Garante que dentro da mesma partida nunca haja 2 questões iguais
    let batchSafety = 0;
    while (batchHashes.has(hashQuestionPrompt(candidate.prompt)) && batchSafety < 12) {
      genCursor++;
      candidate = generateParametricQuestionForWorld(
        validWorldId,
        stageIdx,
        slotOffset + genCursor
      );
      batchSafety++;
    }

    selected.push(acceptQuestion(candidate, stageIdx));
    genCursor++;
  }

  // Mistura a ordem final para intercalar conceituais e paramétricas
  const finalShuffled = shuffleArray(selected).map((q, idx) => ({
    ...q,
    stageIndex: idx,
  }));

  saveStudentHistory(studentId, [...persistedHistory, ...newlySelectedHashes]);
  return finalShuffled;
}

/**
 * Função oficial BNCC (1º ao 9º Ano + Trilha Base): recebe o perfil do aluno, modalidade e dificuldade
 * e retorna apenas questões da série do aluno (`question.worldId === student.worldId`).
 */
export function getQuestionsForSession(
  student: Pick<StudentProfile, 'worldId' | 'grade'> & { id?: string },
  mode: GameModeType,
  difficulty: TowerDifficulty = 'bronze',
  customCount?: number
): MathQuestion[] {
  const defaultCount =
    customCount ??
    (mode === 'turbo_race'
      ? 24
      : difficulty === 'gold'
        ? 12
        : difficulty === 'silver'
          ? 10
          : 8);
  return getQuestionsForMode(student.worldId, mode, defaultCount, student.id);
}
