import { getSupabaseClient } from '../services/storageService';
import { GameModeType, MathQuestion, StudentProfile, TowerDifficulty } from '../types/game';
import { MATH_QUESTIONS } from './questions';

const CUSTOM_QUESTIONS_KEY = 'mathblox_custom_questions_v1';

// Global anti-repetition tracker for the browser session
const sessionUsedPrompts = new Set<string>();

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

function buildOptionsWithCorrect(
  correctVal: string,
  wrong1: string,
  wrong2: string,
  allowNegative = false
): { options: [string, string, string]; correctIndex: 0 | 1 | 2 } {
  const uniqueSet = new Set<string>([correctVal]);
  const candidates = allowNegative
    ? [wrong1, wrong2, `${correctVal}0`, `-${correctVal}`, '12', '24', '36']
    : [wrong1, wrong2, `${correctVal}0`, '12', '18', '24', '36', '48'];
  for (const w of candidates) {
    if (uniqueSet.size >= 3) break;
    if (w && w !== correctVal && (allowNegative || !w.startsWith('-'))) {
      uniqueSet.add(w);
    }
  }
  const arr = shuffleArray(Array.from(uniqueSet).slice(0, 3)) as [string, string, string];
  const correctIndex = arr.indexOf(correctVal) as 0 | 1 | 2;
  return {
    options: arr,
    correctIndex: correctIndex >= 0 ? correctIndex : 0,
  };
}

/**
 * CORRIDA TURBO: Regra Estrita de Operação Única e Pensamento Rápido (v6.0 / v9.0 BNCC).
 * Números negativos APENAS a partir do 7º Ano (worldId 3, 4 ou 5).
 * 5º Ano (1), 6º Ano (2) e Trilha Base (6) utilizam exclusivamente números naturais positivos.
 */
function generateTurboMentalQuestion(worldId: number, index: number): MathQuestion {
  const validWorldId = (worldId >= 1 && worldId <= 6 ? worldId : 1) as 1 | 2 | 3 | 4 | 5 | 6;
  const isAdvanced = validWorldId >= 3 && validWorldId <= 5;
  const bnccMap: Record<number, string> = {
    1: 'EF05MA08',
    2: 'EF06MA03',
    3: 'EF07MA04',
    4: 'EF08MA01',
    5: 'EF09MA04',
    6: 'EF05MA08',
  };
  const bnccCode = bnccMap[validWorldId];

  // 0 & 1 = Multiplicação (50%), 2 = Subtração (25%), 3 = Adição ou Divisão Exata (25%)
  const slot = index % 4;

  // 1. Tabuada de Multiplicação (50% das questões)
  if (slot === 0 || slot === 1) {
    // Para 7º a 9º ano, apenas em 1 de cada 4 multiplicações usamos sinal negativo simples (-a) × b
    if (isAdvanced && index % 8 === 1) {
      const a = [3, 4, 5, 6, 7, 8, 9][index % 7];
      const b = [4, 5, 6, 7, 8][(index * 3) % 5];
      const ans = -a * b;
      const { options, correctIndex } = buildOptionsWithCorrect(
        String(ans),
        String(a * b),
        String(ans - a),
        true
      );
      return {
        id: `turbo-mul-neg-${validWorldId}-${index}-${Date.now()}`,
        worldId: validWorldId,
        stageIndex: index,
        bnccCode,
        topic: `Multiplicação Rápida (${bnccCode})`,
        prompt: `(-${a}) × ${b} = ?`,
        options,
        correctIndex,
        explanation: `Sinais diferentes na multiplicação dão resultado negativo: (-${a}) × ${b} = ${ans}!`,
      };
    }

    const factorsA = validWorldId === 1 || validWorldId === 6
      ? [2, 3, 4, 5, 6, 7, 8, 9, 10]
      : [3, 4, 5, 6, 7, 8, 9, 11, 12];
    const factorsB = [2, 3, 4, 5, 6, 7, 8, 9, 10];
    const a = factorsA[(index * 3 + validWorldId) % factorsA.length];
    const b = factorsB[(index * 5 + validWorldId * 2) % factorsB.length];
    const ans = a * b;
    const { options, correctIndex } = buildOptionsWithCorrect(
      String(ans),
      String(ans + a),
      String(Math.max(2, ans - b)),
      false
    );
    return {
      id: `turbo-mul-${validWorldId}-${index}-${Date.now()}`,
      worldId: validWorldId,
      stageIndex: index,
      bnccCode,
      topic: `Tabuada Turbo (${bnccCode})`,
      prompt: `${a} × ${b} = ?`,
      options,
      correctIndex,
      explanation: `Tabuada direta: ${a} × ${b} = ${ans}!`,
    };
  }

  // 2. Subtração Rápida (25% das questões)
  if (slot === 2) {
    const pairs: [number, number][] = [
      [50, 18],
      [85, 29],
      [100, 37],
      [72, 25],
      [64, 19],
      [90, 34],
      [120, 45],
      [80, 32],
      [95, 28],
      [110, 35],
      [60, 23],
      [75, 18],
    ];
    const [a, b] = pairs[(index + validWorldId * 2) % pairs.length];
    const ans = a - b;
    const { options, correctIndex } = buildOptionsWithCorrect(
      String(ans),
      String(ans + 10),
      String(Math.max(1, ans - 4)),
      false
    );
    return {
      id: `turbo-sub-${validWorldId}-${index}-${Date.now()}`,
      worldId: validWorldId,
      stageIndex: index,
      bnccCode,
      topic: `Subtração Rápida (${bnccCode})`,
      prompt: `${a} - ${b} = ?`,
      options,
      correctIndex,
      explanation: `Subtração mental rápida: ${a} - ${b} = ${ans}!`,
    };
  }

  // 3. Adição Mental e Divisão Exata (25% das questões)
  const useDivision = (index + validWorldId) % 2 === 0;
  if (useDivision) {
    const divisors = [3, 4, 5, 6, 7, 8, 9];
    const quotients = [4, 5, 6, 7, 8, 9, 10, 12];
    const b = divisors[(index + validWorldId) % divisors.length];
    const q = quotients[(index * 2 + validWorldId) % quotients.length];
    const a = b * q;
    const { options, correctIndex } = buildOptionsWithCorrect(
      String(q),
      String(q + 2),
      String(Math.max(1, q - 1)),
      false
    );
    return {
      id: `turbo-div-${validWorldId}-${index}-${Date.now()}`,
      worldId: validWorldId,
      stageIndex: index,
      bnccCode,
      topic: `Divisão Exata (${bnccCode})`,
      prompt: `${a} ÷ ${b} = ?`,
      options,
      correctIndex,
      explanation: `Pois ${b} × ${q} = ${a}, logo ${a} ÷ ${b} = ${q}!`,
    };
  } else {
    const addPairs: [number, number][] = [
      [38, 45],
      [27, 36],
      [46, 39],
      [54, 28],
      [65, 27],
      [48, 35],
      [34, 49],
      [57, 26],
      [29, 44],
      [63, 29],
    ];
    const [a, b] = addPairs[(index + validWorldId * 3) % addPairs.length];
    const ans = a + b;
    const { options, correctIndex } = buildOptionsWithCorrect(
      String(ans),
      String(ans + 10),
      String(ans - 6),
      false
    );
    return {
      id: `turbo-add-${validWorldId}-${index}-${Date.now()}`,
      worldId: validWorldId,
      stageIndex: index,
      bnccCode,
      topic: `Adição Mental (${bnccCode})`,
      prompt: `${a} + ${b} = ?`,
      options,
      correctIndex,
      explanation: `Somando dezenas e unidades: ${a} + ${b} = ${ans}!`,
    };
  }
}

/**
 * TORRE OBBY (PARKOUR) & RALI DE KART:
 * Gerador Paramétrico Estritamente Isolado por Série (BNCC por worldId 1..6).
 * Zero vazamento entre anos!
 */
function generateObbyParametricQuestion(worldId: number, index: number): MathQuestion {
  const validWorldId = (worldId >= 1 && worldId <= 6 ? worldId : 1) as 1 | 2 | 3 | 4 | 5 | 6;
  const variant = index % 4;

  // =========================================================================
  // MUNDO 1: 5º ANO (EF05MA01 a EF05MA21) — ZERO negativos, ZERO incógnitas x/y, ZERO potências
  // =========================================================================
  if (validWorldId === 1) {
    if (variant === 0) {
      const w = 4 + (index % 6);
      const h = 3 + ((index * 2) % 5);
      const area = w * h;
      const perim = 2 * (w + h);
      const askArea = index % 2 === 0;
      const ans = askArea ? `${area} m²` : `${perim} m`;
      const { options, correctIndex } = buildOptionsWithCorrect(
        ans,
        askArea ? `${perim} m²` : `${area} m`,
        askArea ? `${area + w} m²` : `${perim + 4} m`,
        false
      );
      return {
        id: `obby-w1-geo-${index}-${Date.now()}`,
        worldId: 1,
        stageIndex: index,
        bnccCode: 'EF05MA20',
        topic: 'Perímetro e Área (EF05MA20)',
        prompt: askArea
          ? `Qual é a ÁREA de um canteiro retangular de ${w} m por ${h} m?`
          : `Qual é o PERÍMETRO (contorno) de uma quadra retangular de ${w} m por ${h} m?`,
        options,
        correctIndex,
        explanation: askArea
          ? `Área do retângulo = largura × comprimento: ${w} × ${h} = ${area} m²!`
          : `Perímetro = soma dos 4 lados: ${w} + ${h} + ${w} + ${h} = ${perim} m!`,
      };
    }
    if (variant === 1) {
      const denoms = [2, 4, 5];
      const d = denoms[index % denoms.length];
      const mult = 3 + (index % 6);
      const total = d * mult;
      const num = d === 4 ? 3 : d === 5 ? 2 : 1;
      const ans = (total / d) * num;
      const { options, correctIndex } = buildOptionsWithCorrect(
        `${ans}`,
        `${ans + mult}`,
        `${Math.max(1, ans - 2)}`,
        false
      );
      return {
        id: `obby-w1-frac-${index}-${Date.now()}`,
        worldId: 1,
        stageIndex: index,
        bnccCode: 'EF05MA03',
        topic: 'Frações de Quantidade (EF05MA03)',
        prompt: `Quanto é ${num}/${d} de um pacote com ${total} figurinhas?`,
        options,
        correctIndex,
        explanation: `Dividimos ${total} por ${d} (${total / d}) e multiplicamos por ${num}: ${ans} figurinhas!`,
      };
    }
    if (variant === 2) {
      const meters = 2 + (index % 7);
      const extraCm = (1 + (index % 8)) * 10;
      const totalCm = meters * 100 + extraCm;
      const { options, correctIndex } = buildOptionsWithCorrect(
        `${totalCm} cm`,
        `${meters * 10 + extraCm} cm`,
        `${totalCm + 50} cm`,
        false
      );
      return {
        id: `obby-w1-med-${index}-${Date.now()}`,
        worldId: 1,
        stageIndex: index,
        bnccCode: 'EF05MA19',
        topic: 'Medidas de Comprimento (EF05MA19)',
        prompt: `Uma fita mede ${meters} metros e ${extraCm} centímetros. Quantos centímetros ela tem ao todo?`,
        options,
        correctIndex,
        explanation: `Cada 1 metro tem 100 cm. Logo, ${meters} m = ${meters * 100} cm, mais ${extraCm} cm = ${totalCm} cm!`,
      };
    }
    // Variant 3: Moedas e Decimais (R$)
    const reaisA = 5 + (index % 10);
    const reaisB = 2 + ((index * 2) % 6);
    const ansReais = reaisA + reaisB;
    const { options, correctIndex } = buildOptionsWithCorrect(
      `R$ ${ansReais},75`,
      `R$ ${ansReais},25`,
      `R$ ${ansReais + 1},50`,
      false
    );
    return {
      id: `obby-w1-dec-${index}-${Date.now()}`,
      worldId: 1,
      stageIndex: index,
      bnccCode: 'EF05MA07',
      topic: 'Decimais e Sistema Monetário (EF05MA07)',
      prompt: `Rafaela comprou um suco por R$ ${reaisA},50 e um biscoito por R$ ${reaisB},25. Quanto pagou no total?`,
      options,
      correctIndex,
      explanation: `Somando reais e centavos: ${reaisA},50 + ${reaisB},25 = R$ ${ansReais},75!`,
    };
  }

  // =========================================================================
  // MUNDO 2: 6º ANO (EF06MA01 a EF06MA30) — ZERO inteiros negativos, ZERO equações com x
  // =========================================================================
  if (validWorldId === 2) {
    if (variant === 0) {
      const a = 10 + (index % 12);
      const b = 2 + (index % 5);
      const c = 3 + ((index * 2) % 5);
      const ans = a + b * c;
      const wrongOrder = (a + b) * c;
      const { options, correctIndex } = buildOptionsWithCorrect(
        String(ans),
        String(wrongOrder),
        String(ans + b),
        false
      );
      return {
        id: `obby-w2-exp-${index}-${Date.now()}`,
        worldId: 2,
        stageIndex: index,
        bnccCode: 'EF06MA03',
        topic: 'Expressões Numéricas (EF06MA03)',
        prompt: `Calcule respeitando a ordem das operações: ${a} + ${b} × ${c} = ?`,
        options,
        correctIndex,
        explanation: `Primeiro fazemos a multiplicação (${b} × ${c} = ${b * c}) e depois somamos ${a}: ${a} + ${b * c} = ${ans}!`,
      };
    }
    if (variant === 1) {
      const k = 2 + (index % 5);
      const num = 1 + (index % 3);
      const den = num + 1 + (index % 3);
      const eqNum = num * k;
      const eqDen = den * k;
      const { options, correctIndex } = buildOptionsWithCorrect(
        `${num}/${den}`,
        `${num}/${den + 1}`,
        `${num + 1}/${den}`,
        false
      );
      return {
        id: `obby-w2-frac-${index}-${Date.now()}`,
        worldId: 2,
        stageIndex: index,
        bnccCode: 'EF06MA07',
        topic: 'Frações Equivalentes (EF06MA07)',
        prompt: `Simplificando a fração ${eqNum}/${eqDen} por ${k}, qual fração equivalente obtemos?`,
        options,
        correctIndex,
        explanation: `Dividindo numerador e denominador por ${k}: ${eqNum} ÷ ${k} = ${num} e ${eqDen} ÷ ${k} = ${den} => ${num}/${den}!`,
      };
    }
    if (variant === 2) {
      const angles: { deg: number; tipo: string }[] = [
        { deg: 45, tipo: 'Ângulo Agudo (< 90°)' },
        { deg: 90, tipo: 'Ângulo Reto (= 90°)' },
        { deg: 120, tipo: 'Ângulo Obtuso (> 90°)' },
        { deg: 60, tipo: 'Ângulo Agudo (< 90°)' },
        { deg: 135, tipo: 'Ângulo Obtuso (> 90°)' },
      ];
      const item = angles[index % angles.length];
      const { options, correctIndex } = buildOptionsWithCorrect(
        item.tipo,
        'Ângulo Agudo (< 90°)',
        item.deg === 90 ? 'Ângulo Obtuso (> 90°)' : 'Ângulo Reto (= 90°)',
        false
      );
      return {
        id: `obby-w2-ang-${index}-${Date.now()}`,
        worldId: 2,
        stageIndex: index,
        bnccCode: 'EF06MA25',
        topic: 'Classificação de Ângulos (EF06MA25)',
        prompt: `Como é classificado um ângulo cuja abertura mede exatamente ${item.deg}°?`,
        options,
        correctIndex,
        explanation: `Um ângulo de ${item.deg}° é classificado como ${item.tipo}!`,
      };
    }
    // Variant 3: Conversão de medidas (km/m ou kg/g)
    const km = 2 + (index % 8);
    const extraM = (1 + (index % 8)) * 100;
    const totalM = km * 1000 + extraM;
    const { options, correctIndex } = buildOptionsWithCorrect(
      `${totalM} m`,
      `${km * 100 + extraM} m`,
      `${totalM + 500} m`,
      false
    );
    return {
      id: `obby-w2-conv-${index}-${Date.now()}`,
      worldId: 2,
      stageIndex: index,
      bnccCode: 'EF06MA24',
      topic: 'Conversão de Medidas (EF06MA24)',
      prompt: `Uma ciclovia tem ${km} km e ${extraM} m de extensão. Quantos metros ela tem ao todo?`,
      options,
      correctIndex,
      explanation: `1 km = 1.000 metros. Logo, ${km} km = ${km * 1000} m. Somando ${extraM} m, temos ${totalM} m!`,
    };
  }

  // =========================================================================
  // MUNDO 3: 7º ANO (EF07MA01 a EF07MA34) — Inteiros Z, Equação 1º Grau, Ângulos do Triângulo, Volume
  // =========================================================================
  if (validWorldId === 3) {
    if (variant === 0) {
      const a = 2 + (index % 4);
      const x = 3 + ((index * 2) % 8);
      const b = 4 + (index % 9);
      const c = a * x + b;
      const { options, correctIndex } = buildOptionsWithCorrect(
        `x = ${x}`,
        `x = ${x + 2}`,
        `x = ${Math.max(1, x - 1)}`,
        true
      );
      return {
        id: `obby-w3-eq-${index}-${Date.now()}`,
        worldId: 3,
        stageIndex: index,
        bnccCode: 'EF07MA18',
        topic: 'Equação do 1º Grau (EF07MA18)',
        prompt: `Resolva a equação do 1º grau: ${a}x + ${b} = ${c}`,
        options,
        correctIndex,
        explanation: `Subtraindo ${b}: ${a}x = ${c - b}. Dividindo por ${a}: x = ${x}!`,
      };
    }
    if (variant === 1) {
      const a1 = 40 + (index % 5) * 10;
      const a2 = 50 + ((index * 2) % 4) * 10;
      const a3 = 180 - (a1 + a2);
      const { options, correctIndex } = buildOptionsWithCorrect(
        `${a3}°`,
        `${a3 + 10}°`,
        `${a3 - 10}°`,
        false
      );
      return {
        id: `obby-w3-tri-${index}-${Date.now()}`,
        worldId: 3,
        stageIndex: index,
        bnccCode: 'EF07MA24',
        topic: 'Ângulos do Triângulo (EF07MA24)',
        prompt: `Em um triângulo, dois ângulos internos medem ${a1}° e ${a2}°. Qual é a medida do 3º ângulo?`,
        options,
        correctIndex,
        explanation: `A soma dos ângulos internos do triângulo é 180°: 180° - (${a1}° + ${a2}°) = ${a3}°!`,
      };
    }
    if (variant === 2) {
      const c = 4 + (index % 5);
      const l = 3 + ((index * 2) % 4);
      const h = 2 + (index % 4);
      const vol = c * l * h;
      const { options, correctIndex } = buildOptionsWithCorrect(
        `${vol} cm³`,
        `${c + l + h} cm³`,
        `${vol + 12} cm³`,
        false
      );
      return {
        id: `obby-w3-vol-${index}-${Date.now()}`,
        worldId: 3,
        stageIndex: index,
        bnccCode: 'EF07MA30',
        topic: 'Volume do Bloco Retangular (EF07MA30)',
        prompt: `Qual é o volume de um bloco retangular de dimensões ${c} cm × ${l} cm × ${h} cm?`,
        options,
        correctIndex,
        explanation: `Volume = comprimento × largura × altura: ${c} × ${l} × ${h} = ${vol} cm³!`,
      };
    }
    // Variant 3: Operação com Números Inteiros Negativos
    const negA = -(12 + (index % 15));
    const posB = 5 + ((index * 2) % 10);
    const ans = negA + posB;
    const { options, correctIndex } = buildOptionsWithCorrect(
      String(ans),
      String(-ans),
      String(negA - posB),
      true
    );
    return {
      id: `obby-w3-int-${index}-${Date.now()}`,
      worldId: 3,
      stageIndex: index,
      bnccCode: 'EF07MA04',
      topic: 'Números Inteiros (EF07MA04)',
      prompt: `Calcule o resultado em Z: (${negA}) + (+${posB}) = ?`,
      options,
      correctIndex,
      explanation: `Sinais diferentes: subtraímos os módulos e conservamos o sinal do maior módulo: ${ans}!`,
    };
  }

  // =========================================================================
  // MUNDO 4: 8º ANO (EF08MA01 a EF08MA25) — Área do Círculo/Trapézio, Circunferência, Sistemas x+y, Capacidade m³/L
  // =========================================================================
  if (validWorldId === 4) {
    if (variant === 0) {
      const radii = [2, 3, 4, 5, 10];
      const r = radii[index % radii.length];
      const areaStr = (3.14 * r * r).toFixed(2).replace('.00', '').replace('.', ',');
      const circStr = (2 * 3.14 * r).toFixed(2).replace('.00', '').replace('.', ',');
      const askArea = index % 2 === 0;
      const ans = askArea ? `${areaStr} m²` : `${circStr} m`;
      const { options, correctIndex } = buildOptionsWithCorrect(
        ans,
        askArea ? `${circStr} m²` : `${areaStr} m`,
        askArea ? `${r * r} m²` : `${r * 3} m`,
        false
      );
      return {
        id: `obby-w4-circ-${index}-${Date.now()}`,
        worldId: 4,
        stageIndex: index,
        bnccCode: 'EF08MA19',
        topic: 'Círculo e Circunferência (EF08MA19)',
        prompt: askArea
          ? `Adotando π = 3,14, qual é a ÁREA de um círculo de raio r = ${r} m? (A = π · r²)`
          : `Adotando π = 3,14, qual é o COMPRIMENTO de uma circunferência de raio r = ${r} m? (C = 2 · π · r)`,
        options,
        correctIndex,
        explanation: askArea
          ? `A = π · r² = 3,14 × ${r}² = 3,14 × ${r * r} = ${areaStr} m²!`
          : `C = 2 · π · r = 2 × 3,14 × ${r} = ${circStr} m!`,
      };
    }
    if (variant === 1) {
      const x = 5 + (index % 7);
      const y = 2 + (index % 4);
      const sum = x + y;
      const diff = x - y;
      const { options, correctIndex } = buildOptionsWithCorrect(
        `x = ${x} e y = ${y}`,
        `x = ${x + 1} e y = ${y - 1}`,
        `x = ${y} e y = ${x}`,
        false
      );
      return {
        id: `obby-w4-sys-${index}-${Date.now()}`,
        worldId: 4,
        stageIndex: index,
        bnccCode: 'EF08MA08',
        topic: 'Sistema de Equações (EF08MA08)',
        prompt: `No sistema linear { x + y = ${sum} e x - y = ${diff} }, quais são os valores de x e y?`,
        options,
        correctIndex,
        explanation: `Somando as duas equações: 2x = ${sum + diff} => x = ${x}. Logo, y = ${sum} - ${x} = ${y}!`,
      };
    }
    if (variant === 2) {
      const volM3 = 2 + (index % 9);
      const liters = volM3 * 1000;
      const { options, correctIndex } = buildOptionsWithCorrect(
        `${liters} L`,
        `${volM3 * 100} L`,
        `${liters + 500} L`,
        false
      );
      return {
        id: `obby-w4-cap-${index}-${Date.now()}`,
        worldId: 4,
        stageIndex: index,
        bnccCode: 'EF08MA21',
        topic: 'Volume e Capacidade (EF08MA21)',
        prompt: `Um reservatório cilíndrico tem volume de ${volM3} m³. Qual é sua capacidade em litros (1 m³ = 1.000 L)?`,
        options,
        correctIndex,
        explanation: `Como 1 m³ equivale a 1.000 L, temos ${volM3} × 1.000 = ${liters} Litros!`,
      };
    }
    // Variant 3: Área do Triângulo ou Losango
    const base = 6 + (index % 6) * 2;
    const altura = 4 + ((index * 2) % 5);
    const areaTri = (base * altura) / 2;
    const { options, correctIndex } = buildOptionsWithCorrect(
      `${areaTri} cm²`,
      `${base * altura} cm²`,
      `${base + altura} cm²`,
      false
    );
    return {
      id: `obby-w4-tri-${index}-${Date.now()}`,
      worldId: 4,
      stageIndex: index,
      bnccCode: 'EF08MA19',
      topic: 'Área de Figuras Planas (EF08MA19)',
      prompt: `Qual é a área de um triângulo com base b = ${base} cm e altura h = ${altura} cm? (A = b·h ÷ 2)`,
      options,
      correctIndex,
      explanation: `Área do triângulo = (base × altura) ÷ 2 = (${base} × ${altura}) ÷ 2 = ${areaTri} cm²!`,
    };
  }

  // =========================================================================
  // MUNDO 5: 9º ANO (EF09MA01 a EF09MA22) — Pitágoras, Tales, Equação 2º Grau, Produtos Notáveis
  // =========================================================================
  if (validWorldId === 5) {
    if (variant === 0) {
      const triples: [number, number, number][] = [
        [3, 4, 5],
        [6, 8, 10],
        [5, 12, 13],
        [9, 12, 15],
        [8, 15, 17],
      ];
      const [b, c, a] = triples[index % triples.length];
      const { options, correctIndex } = buildOptionsWithCorrect(
        `${a} cm`,
        `${b + c} cm`,
        `${a + 2} cm`,
        false
      );
      return {
        id: `obby-w5-pit-${index}-${Date.now()}`,
        worldId: 5,
        stageIndex: index,
        bnccCode: 'EF09MA14',
        topic: 'Teorema de Pitágoras (EF09MA14)',
        prompt: `Em um triângulo retângulo de catetos ${b} cm e ${c} cm, quanto mede a hipotenusa? (a² = b² + c²)`,
        options,
        correctIndex,
        explanation: `a² = ${b}² + ${c}² = ${b * b} + ${c * c} = ${a * a} => a = √${a * a} = ${a} cm!`,
      };
    }
    if (variant === 1) {
      const root = 2 + (index % 8);
      const sq = root * root;
      const { options, correctIndex } = buildOptionsWithCorrect(
        `x = ${root} e x = -${root}`,
        `x = ${sq} e x = -${sq}`,
        `x = 0 e x = ${root}`,
        true
      );
      return {
        id: `obby-w5-eq2-${index}-${Date.now()}`,
        worldId: 5,
        stageIndex: index,
        bnccCode: 'EF09MA09',
        topic: 'Equação do 2º Grau (EF09MA09)',
        prompt: `Quais são as raízes reais da equação do 2º grau x² - ${sq} = 0?`,
        options,
        correctIndex,
        explanation: `Isolando x²: x² = ${sq} => x = ±√${sq} => x = ${root} e x = -${root}!`,
      };
    }
    if (variant === 2) {
      const k = 2 + (index % 6);
      const ans = `x² + ${2 * k}x + ${k * k}`;
      const { options, correctIndex } = buildOptionsWithCorrect(
        ans,
        `x² + ${k * k}`,
        `x² + ${k}x + ${k * k}`,
        false
      );
      return {
        id: `obby-w5-pn-${index}-${Date.now()}`,
        worldId: 5,
        stageIndex: index,
        bnccCode: 'EF09MA09',
        topic: 'Produtos Notáveis (EF09MA09)',
        prompt: `Desenvolvendo o produto notável (x + ${k})², obtemos:`,
        options,
        correctIndex,
        explanation: `Quadrado do 1º + 2·1º·2º + quadrado do 2º: x² + ${2 * k}x + ${k * k}!`,
      };
    }
    // Variant 3: Teorema de Tales / Semelhança de Triângulos
    const ratio = 2 + (index % 3);
    const s1 = 3 + (index % 4);
    const s2 = 4 + ((index * 2) % 4);
    const big1 = s1 * ratio;
    const big2 = s2 * ratio;
    const { options, correctIndex } = buildOptionsWithCorrect(
      `x = ${big2}`,
      `x = ${big2 + ratio}`,
      `x = ${s2 + ratio}`,
      false
    );
    return {
      id: `obby-w5-tales-${index}-${Date.now()}`,
      worldId: 5,
      stageIndex: index,
      bnccCode: 'EF09MA12',
      topic: 'Semelhança e Tales (EF09MA12)',
      prompt: `Dois triângulos são semelhantes. Os lados do primeiro medem ${s1} e ${s2}, e os correspondentes do segundo medem ${big1} e x. Quanto vale x?`,
      options,
      correctIndex,
      explanation: `A razão de semelhança é ${big1} ÷ ${s1} = ${ratio}. Logo, x = ${s2} × ${ratio} = ${big2}!`,
    };
  }

  // =========================================================================
  // MUNDO 6: TRILHA BASE (Joaquim) — Tabuada, Sequências Lógicas, Troco e Passo a Passo
  // =========================================================================
  const step = 3 + (index % 6);
  const start = step;
  const n5 = start + step * 4;
  const { options, correctIndex } = buildOptionsWithCorrect(
    String(n5),
    String(n5 + 2),
    String(n5 - step),
    false
  );
  return {
    id: `obby-w6-seq-${index}-${Date.now()}`,
    worldId: 6,
    stageIndex: index,
    bnccCode: 'EF05MA07',
    topic: 'Sequência Lógica (Trilha Base)',
    prompt: `Qual é o próximo número da sequência: ${start}, ${start + step}, ${start + step * 2}, ${start + step * 3}, ...?`,
    options,
    correctIndex,
    explanation: `A sequência soma +${step} a cada passo: ${start + step * 3} + ${step} = ${n5}!`,
  };
}

/**
 * ARENA SOBREVIVÊNCIA:
 * Gerador Paramétrico Estritamente Isolado por Série (BNCC por worldId 1..6).
 * Zero vazamento entre anos!
 */
function generateSurvivalParametricQuestion(worldId: number, index: number): MathQuestion {
  const validWorldId = (worldId >= 1 && worldId <= 6 ? worldId : 1) as 1 | 2 | 3 | 4 | 5 | 6;
  const variant = index % 4;

  // =========================================================================
  // MUNDO 1: 5º ANO (EF05MA01 a EF05MA21)
  // =========================================================================
  if (validWorldId === 1) {
    if (variant === 0) {
      const pcts = [10, 25, 50];
      const pct = pcts[index % pcts.length];
      const base = (2 + (index % 6)) * 20;
      const ans = (base * pct) / 100;
      const { options, correctIndex } = buildOptionsWithCorrect(
        String(ans),
        String(ans + 5),
        String(Math.max(2, ans - 4)),
        false
      );
      return {
        id: `surv-w1-pct-${index}-${Date.now()}`,
        worldId: 1,
        stageIndex: index,
        bnccCode: 'EF05MA06',
        topic: 'Porcentagem Básica (EF05MA06)',
        prompt: `Quanto é ${pct}% de ${base} moedas?`,
        options,
        correctIndex,
        explanation: `${pct}% de ${base} = (${pct} × ${base}) ÷ 100 = ${ans} moedas!`,
      };
    }
    if (variant === 1) {
      const centenasMilhar = 1 + (index % 8);
      const dezenasMilhar = 2 + ((index * 2) % 7);
      const milhar = 4;
      const numStr = `${centenasMilhar}${dezenasMilhar}${milhar}.000`;
      const valorPosicional = `${dezenasMilhar * 10}.000`;
      const { options, correctIndex } = buildOptionsWithCorrect(
        valorPosicional,
        `${dezenasMilhar}.000`,
        `${dezenasMilhar * 100}.000`,
        false
      );
      return {
        id: `surv-w1-snd-${index}-${Date.now()}`,
        worldId: 1,
        stageIndex: index,
        bnccCode: 'EF05MA01',
        topic: 'Sistema de Numeração Decimal (EF05MA01)',
        prompt: `No número ${numStr}, qual é o valor posicional do algarismo ${dezenasMilhar}?`,
        options,
        correctIndex,
        explanation: `O algarismo ${dezenasMilhar} ocupa a ordem das dezenas de milhar, valendo ${valorPosicional}!`,
      };
    }
    if (variant === 2) {
      const hours = 2 + (index % 4);
      const extraMin = (1 + (index % 5)) * 10;
      const totalMin = hours * 60 + extraMin;
      const { options, correctIndex } = buildOptionsWithCorrect(
        `${totalMin} min`,
        `${hours * 100 + extraMin} min`,
        `${totalMin - 20} min`,
        false
      );
      return {
        id: `surv-w1-time-${index}-${Date.now()}`,
        worldId: 1,
        stageIndex: index,
        bnccCode: 'EF05MA19',
        topic: 'Medidas de Tempo (EF05MA19)',
        prompt: `Um filme durou ${hours} horas e ${extraMin} minutos. Quantos minutos ele durou ao todo?`,
        options,
        correctIndex,
        explanation: `Cada 1 hora tem 60 minutos: ${hours} × 60 = ${hours * 60} min. Somando ${extraMin} min = ${totalMin} min!`,
      };
    }
    // Variant 3: Divisão Exata com Naturais
    const friends = 3 + (index % 6);
    const each = 6 + ((index * 2) % 7);
    const total = friends * each;
    const { options, correctIndex } = buildOptionsWithCorrect(
      `${each}`,
      `${each + 2}`,
      `${each - 1}`,
      false
    );
    return {
      id: `surv-w1-div-${index}-${Date.now()}`,
      worldId: 1,
      stageIndex: index,
      bnccCode: 'EF05MA08',
      topic: 'Divisão de Naturais (EF05MA08)',
      prompt: `Distribuindo igualmente ${total} adesivos entre ${friends} amigos, quantos cada um recebe?`,
      options,
      correctIndex,
      explanation: `Dividindo ${total} ÷ ${friends} = ${each} adesivos para cada amigo!`,
    };
  }

  // =========================================================================
  // MUNDO 2: 6º ANO (EF06MA01 a EF06MA30)
  // =========================================================================
  if (validWorldId === 2) {
    if (variant === 0) {
      const mmcPairs: [number, number, number][] = [
        [3, 4, 12],
        [4, 6, 12],
        [6, 8, 24],
        [4, 10, 20],
        [5, 6, 30],
        [8, 12, 24],
      ];
      const [a, b, mmc] = mmcPairs[index % mmcPairs.length];
      const { options, correctIndex } = buildOptionsWithCorrect(
        String(mmc),
        String(a + b),
        String(mmc * 2),
        false
      );
      return {
        id: `surv-w2-mmc-${index}-${Date.now()}`,
        worldId: 2,
        stageIndex: index,
        bnccCode: 'EF06MA06',
        topic: 'Múltiplos e MMC (EF06MA06)',
        prompt: `Qual é o Mínimo Múltiplo Comum — MMC(${a}, ${b})?`,
        options,
        correctIndex,
        explanation: `O menor múltiplo comum diferente de zero entre ${a} e ${b} é ${mmc}!`,
      };
    }
    if (variant === 1) {
      const pcts = [10, 20, 25, 50];
      const pct = pcts[index % pcts.length];
      const base = (3 + (index % 5)) * 40;
      const ans = (base * pct) / 100;
      const { options, correctIndex } = buildOptionsWithCorrect(
        String(ans),
        String(ans + 10),
        String(Math.max(4, ans - 6)),
        false
      );
      return {
        id: `surv-w2-pct-${index}-${Date.now()}`,
        worldId: 2,
        stageIndex: index,
        bnccCode: 'EF06MA13',
        topic: 'Porcentagens (EF06MA13)',
        prompt: `Em uma prova com ${base} pontos, Clara acertou ${pct}%. Quantos pontos ela fez?`,
        options,
        correctIndex,
        explanation: `${pct}% de ${base} = (${pct} × ${base}) ÷ 100 = ${ans} pontos!`,
      };
    }
    if (variant === 2) {
      const a = 4 + (index % 6);
      const b = 3 + ((index * 2) % 5);
      const c = 2 + (index % 4);
      const ans = (a + b) * c;
      const { options, correctIndex } = buildOptionsWithCorrect(
        String(ans),
        String(a + b * c),
        String(ans + c),
        false
      );
      return {
        id: `surv-w2-par-${index}-${Date.now()}`,
        worldId: 2,
        stageIndex: index,
        bnccCode: 'EF06MA03',
        topic: 'Expressões com Parênteses (EF06MA03)',
        prompt: `Resolva a expressão numérica: (${a} + ${b}) × ${c} = ?`,
        options,
        correctIndex,
        explanation: `Resolvemos primeiro os parênteses (${a} + ${b} = ${a + b}) e multiplicamos por ${c}: ${ans}!`,
      };
    }
    // Variant 3: Soma de Frações de mesmo denominador
    const den = 7 + (index % 4);
    const n1 = 2 + (index % 3);
    const n2 = 1 + ((index * 2) % 3);
    const { options, correctIndex } = buildOptionsWithCorrect(
      `${n1 + n2}/${den}`,
      `${n1 + n2}/${den * 2}`,
      `${n1 * n2}/${den}`,
      false
    );
    return {
      id: `surv-w2-fsum-${index}-${Date.now()}`,
      worldId: 2,
      stageIndex: index,
      bnccCode: 'EF06MA10',
      topic: 'Adição de Frações (EF06MA10)',
      prompt: `Qual é o resultado da adição de frações ${n1}/${den} + ${n2}/${den}?`,
      options,
      correctIndex,
      explanation: `Com denominadores iguais, somamos os numeradores (${n1} + ${n2} = ${n1 + n2}) e mantemos o denominador ${den}!`,
    };
  }

  // =========================================================================
  // MUNDO 3: 7º ANO (EF07MA01 a EF07MA34)
  // =========================================================================
  if (validWorldId === 3) {
    if (variant === 0) {
      const unitPrice = 6 + (index % 9);
      const qty1 = 3;
      const qty2 = 5 + (index % 4);
      const total1 = unitPrice * qty1;
      const total2 = unitPrice * qty2;
      const { options, correctIndex } = buildOptionsWithCorrect(
        `R$ ${total2}`,
        `R$ ${total2 + unitPrice}`,
        `R$ ${total2 - unitPrice}`,
        false
      );
      return {
        id: `surv-w3-prop-${index}-${Date.now()}`,
        worldId: 3,
        stageIndex: index,
        bnccCode: 'EF07MA17',
        topic: 'Regra de Três Simples (EF07MA17)',
        prompt: `Se ${qty1} ingressos custam R$ ${total1}, quanto custarão ${qty2} ingressos iguais?`,
        options,
        correctIndex,
        explanation: `Cada ingresso custa ${total1} ÷ ${qty1} = R$ ${unitPrice}. Logo, ${qty2} × ${unitPrice} = R$ ${total2}!`,
      };
    }
    if (variant === 1) {
      const mean = 10 + (index % 12);
      const v1 = mean - 3;
      const v2 = mean;
      const v3 = mean + 3;
      const { options, correctIndex } = buildOptionsWithCorrect(
        String(mean),
        String(mean + 2),
        String(v1 + v2 + v3),
        false
      );
      return {
        id: `surv-w3-mean-${index}-${Date.now()}`,
        worldId: 3,
        stageIndex: index,
        bnccCode: 'EF07MA35',
        topic: 'Média Aritmética (EF07MA35)',
        prompt: `Qual é a média aritmética simples entre as notas ${v1}, ${v2} e ${v3}?`,
        options,
        correctIndex,
        explanation: `Somamos (${v1} + ${v2} + ${v3} = ${mean * 3}) e dividimos por 3: média = ${mean}!`,
      };
    }
    if (variant === 2) {
      const price = 100 + (index % 5) * 50;
      const discountPct = [10, 20, 30][index % 3];
      const finalPrice = price - (price * discountPct) / 100;
      const { options, correctIndex } = buildOptionsWithCorrect(
        `R$ ${finalPrice}`,
        `R$ ${price - discountPct}`,
        `R$ ${(price * discountPct) / 100}`,
        false
      );
      return {
        id: `surv-w3-desc-${index}-${Date.now()}`,
        worldId: 3,
        stageIndex: index,
        bnccCode: 'EF07MA02',
        topic: 'Desconto Percentual (EF07MA02)',
        prompt: `Um produto de R$ ${price} teve ${discountPct}% de desconto. Qual é o novo valor final?`,
        options,
        correctIndex,
        explanation: `Desconto de ${discountPct}% sobre ${price} é R$ ${(price * discountPct) / 100}. Novo preço: R$ ${finalPrice}!`,
      };
    }
    // Variant 3: Multiplicação de Inteiros
    const a = -(3 + (index % 6));
    const b = 4 + ((index * 2) % 6);
    const ans = a * b;
    const { options, correctIndex } = buildOptionsWithCorrect(
      String(ans),
      String(-ans),
      String(ans - b),
      true
    );
    return {
      id: `surv-w3-zmul-${index}-${Date.now()}`,
      worldId: 3,
      stageIndex: index,
      bnccCode: 'EF07MA04',
      topic: 'Multiplicação em Z (EF07MA04)',
      prompt: `Qual é o produto dos números inteiros (${a}) × (+${b})?`,
      options,
      correctIndex,
      explanation: `Menos com mais na multiplicação resulta em negativo: (${a}) × (+${b}) = ${ans}!`,
    };
  }

  // =========================================================================
  // MUNDO 4: 8º ANO (EF08MA01 a EF08MA25)
  // =========================================================================
  if (validWorldId === 4) {
    if (variant === 0) {
      const xVal = 2 + (index % 5);
      const coef = 3 + (index % 4);
      const k = 4 + ((index * 2) % 6);
      const ans = coef * xVal + k;
      const { options, correctIndex } = buildOptionsWithCorrect(
        String(ans),
        String(ans + coef),
        String(coef * xVal - k),
        false
      );
      return {
        id: `surv-w4-alg-${index}-${Date.now()}`,
        worldId: 4,
        stageIndex: index,
        bnccCode: 'EF08MA06',
        topic: 'Valor Numérico Algébrico (EF08MA06)',
        prompt: `Qual é o valor numérico da expressão ${coef}x + ${k} para x = ${xVal}?`,
        options,
        correctIndex,
        explanation: `Substituindo x por ${xVal}: ${coef} × ${xVal} + ${k} = ${coef * xVal} + ${k} = ${ans}!`,
      };
    }
    if (variant === 1) {
      const bases = [2, 3, 4, 5, 10];
      const base = bases[index % bases.length];
      const exp = base >= 4 ? 2 : 3;
      const ans = Math.pow(base, exp);
      const { options, correctIndex } = buildOptionsWithCorrect(
        String(ans),
        String(base * exp),
        String(ans + base),
        false
      );
      return {
        id: `surv-w4-pot-${index}-${Date.now()}`,
        worldId: 4,
        stageIndex: index,
        bnccCode: 'EF08MA01',
        topic: 'Potenciação (EF08MA01)',
        prompt: `Qual é o valor da potência ${base}^${exp}?`,
        options,
        correctIndex,
        explanation: `${base} elevado a ${exp} equivale a multiplicar a base ${base} por ela mesma ${exp} vezes = ${ans}!`,
      };
    }
    if (variant === 2) {
      const speed1 = 40;
      const time1 = 3 + (index % 3);
      const dist = speed1 * time1;
      const speed2 = 60;
      const time2 = dist / speed2;
      const { options, correctIndex } = buildOptionsWithCorrect(
        `${time2} horas`,
        `${time1 + 1} horas`,
        `${time1 * 2} horas`,
        false
      );
      return {
        id: `surv-w4-inv-${index}-${Date.now()}`,
        worldId: 4,
        stageIndex: index,
        bnccCode: 'EF08MA13',
        topic: 'Proporcionalidade (EF08MA13)',
        prompt: `Um ônibus percorre ${dist} km a ${speed2} km/h constantes. Em quantas horas ele completa o trajeto?`,
        options,
        correctIndex,
        explanation: `Tempo = Distância ÷ Velocidade: ${dist} ÷ ${speed2} = ${time2} horas!`,
      };
    }
    // Variant 3: Monômios Semelhantes
    const a = 4 + (index % 6);
    const b = 2 + ((index * 2) % 5);
    const ans = `${a + b}x²`;
    const { options, correctIndex } = buildOptionsWithCorrect(
      ans,
      `${a + b}x⁴`,
      `${a * b}x²`,
      false
    );
    return {
      id: `surv-w4-mon-${index}-${Date.now()}`,
      worldId: 4,
      stageIndex: index,
      bnccCode: 'EF08MA06',
      topic: 'Operações com Monômios (EF08MA06)',
      prompt: `Reduzindo os monômios semelhantes ${a}x² + ${b}x², obtemos:`,
      options,
      correctIndex,
      explanation: `Somamos os coeficientes (${a} + ${b} = ${a + b}) e conservamos a parte literal x²: ${ans}!`,
    };
  }

  // =========================================================================
  // MUNDO 5: 9º ANO (EF09MA01 a EF09MA22)
  // =========================================================================
  if (validWorldId === 5) {
    if (variant === 0) {
      const a = 2 + (index % 4);
      const b = 3 + ((index * 2) % 5);
      const x = 2 + (index % 5);
      const fx = a * x + b;
      const { options, correctIndex } = buildOptionsWithCorrect(
        String(fx),
        String(fx + a),
        String(a + b + x),
        false
      );
      return {
        id: `surv-w5-afim-${index}-${Date.now()}`,
        worldId: 5,
        stageIndex: index,
        bnccCode: 'EF09MA06',
        topic: 'Função Afim (EF09MA06)',
        prompt: `Considere a função afim f(x) = ${a}x + ${b}. Qual é o valor de f(${x})?`,
        options,
        correctIndex,
        explanation: `Substituindo x = ${x}: f(${x}) = ${a}·(${x}) + ${b} = ${a * x} + ${b} = ${fx}!`,
      };
    }
    if (variant === 1) {
      const k = 2 + (index % 6);
      const radA = k * k * 2;
      const { options, correctIndex } = buildOptionsWithCorrect(
        `${k}√2`,
        `${k * 2}√2`,
        `2√${k}`,
        false
      );
      return {
        id: `surv-w5-rad-${index}-${Date.now()}`,
        worldId: 5,
        stageIndex: index,
        bnccCode: 'EF09MA04',
        topic: 'Simplificação de Radicais (EF09MA04)',
        prompt: `Simplificando o radical √${radA}, qual forma obtemos?`,
        options,
        correctIndex,
        explanation: `Fatorando ${radA} = ${k * k} × 2: √(${k * k} · 2) = √${k * k} · √2 = ${k}√2!`,
      };
    }
    if (variant === 2) {
      const r1 = 1 + (index % 4);
      const r2 = r1 + 2;
      const sum = r1 + r2;
      const prod = r1 * r2;
      const { options, correctIndex } = buildOptionsWithCorrect(
        `x = ${r1} e x = ${r2}`,
        `x = -${r1} e x = -${r2}`,
        `x = ${sum} e x = ${prod}`,
        true
      );
      return {
        id: `surv-w5-bhask-${index}-${Date.now()}`,
        worldId: 5,
        stageIndex: index,
        bnccCode: 'EF09MA09',
        topic: 'Raízes da Equação do 2º Grau (EF09MA09)',
        prompt: `Quais são as raízes reais da equação x² - ${sum}x + ${prod} = 0?`,
        options,
        correctIndex,
        explanation: `Pela Soma (${sum}) e Produto (${prod}), os números que somam ${sum} e multiplicam ${prod} são ${r1} e ${r2}!`,
      };
    }
    // Variant 3: Probabilidade (EF09MA20)
    const greenBalls = 3 + (index % 4);
    const blueBalls = 7 - (index % 4);
    const totalBalls = greenBalls + blueBalls; // 10
    const pctProb = greenBalls * 10;
    const { options, correctIndex } = buildOptionsWithCorrect(
      `${pctProb}%`,
      `${blueBalls * 10}%`,
      `${greenBalls}%`,
      false
    );
    return {
      id: `surv-w5-prob-${index}-${Date.now()}`,
      worldId: 5,
      stageIndex: index,
      bnccCode: 'EF09MA20',
      topic: 'Probabilidade (EF09MA20)',
      prompt: `Em uma urna há ${greenBalls} bolas verdes e ${blueBalls} bolas azuis (total = ${totalBalls}). Qual a probabilidade de sortear uma bola verde?`,
      options,
      correctIndex,
      explanation: `Probabilidade = casos favoráveis ÷ total = ${greenBalls}/${totalBalls} = ${pctProb}%!`,
    };
  }

  // =========================================================================
  // MUNDO 6: TRILHA BASE (Joaquim)
  // =========================================================================
  const price = 8 + (index % 10);
  const bill = 20;
  const change = bill - price;
  const { options, correctIndex } = buildOptionsWithCorrect(
    `R$ ${change},00`,
    `R$ ${change + 2},00`,
    `R$ ${Math.max(1, change - 2)},00`,
    false
  );
  return {
    id: `surv-w6-change-${index}-${Date.now()}`,
    worldId: 6,
    stageIndex: index,
    bnccCode: 'EF05MA07',
    topic: 'Passo a Passo — Troco (Trilha Base)',
    prompt: `Joaquim comprou um caderno de R$ ${price},00 e pagou com uma nota de R$ ${bill},00. Qual é o troco?`,
    options,
    correctIndex,
    explanation: `Subtraindo o valor da compra da nota entregue: ${bill} - ${price} = R$ ${change},00!`,
  };
}

/**
 * Retorna um banco de questões estritamente isolado pelo worldId (série BNCC) e pela modalidade,
 * garantindo ZERO vazamento entre séries e evitando repetir enunciados já exibidos na sessão.
 */
export function getQuestionsForMode(
  worldId: number,
  mode: GameModeType,
  count = 15
): MathQuestion[] {
  const validWorldId = (worldId >= 1 && worldId <= 6 ? worldId : 1) as 1 | 2 | 3 | 4 | 5 | 6;

  // Corrida Turbo: 100% operações únicas mentais calibradas para o worldId do aluno
  if (mode === 'turbo_race') {
    const turboQuestions: MathQuestion[] = [];
    let seed = Math.floor(Math.random() * 20);
    for (let i = 0; i < count; i++) {
      let q = generateTurboMentalQuestion(validWorldId, seed + i);
      let attempts = 0;
      while (sessionUsedPrompts.has(q.prompt) && attempts < 14) {
        seed += 3;
        q = generateTurboMentalQuestion(validWorldId, seed + i);
        attempts++;
      }
      sessionUsedPrompts.add(q.prompt);
      turboQuestions.push({ ...q, stageIndex: i });
    }
    return turboQuestions;
  }

  // Filtra ESTRITAMENTE por question.worldId === validWorldId (ZERO fallback para outras séries)
  const customQuestions = loadCustomQuestionsFromLocal().filter(
    (q) => q.worldId === validWorldId
  );
  const baseQuestions = MATH_QUESTIONS.filter((q) => q.worldId === validWorldId);
  const allWorldPool = [...customQuestions, ...baseQuestions];

  // Separação temática entre Obby/Rali (índices pares primeiro) e Survival (índices ímpares primeiro)
  const preferredPool =
    mode === 'obby' || mode === 'vehicle_rally'
      ? allWorldPool.filter((_, idx) => idx % 2 === 0)
      : allWorldPool.filter((_, idx) => idx % 2 === 1);
  const secondaryPool =
    mode === 'obby' || mode === 'vehicle_rally'
      ? allWorldPool.filter((_, idx) => idx % 2 === 1)
      : allWorldPool.filter((_, idx) => idx % 2 === 0);

  let unseenPreferred = shuffleArray(preferredPool).filter(
    (q) => !sessionUsedPrompts.has(q.prompt)
  );
  const unseenSecondary = shuffleArray(secondaryPool).filter(
    (q) => !sessionUsedPrompts.has(q.prompt)
  );

  // Se todas as questões estáticas daquela série já foram vistas, limpa apenas os enunciados daquela série
  if (unseenPreferred.length + unseenSecondary.length === 0) {
    allWorldPool.forEach((q) => sessionUsedPrompts.delete(q.prompt));
    unseenPreferred = shuffleArray(preferredPool);
  }

  const selected: MathQuestion[] = [];
  for (const q of [...unseenPreferred, ...unseenSecondary]) {
    if (selected.length >= count) break;
    if (!selected.some((s) => s.prompt === q.prompt)) {
      selected.push({ ...q, worldId: validWorldId, stageIndex: selected.length });
      sessionUsedPrompts.add(q.prompt);
    }
  }

  // Completa com gerador paramétrico exclusivo do validWorldId (BNCC da própria série)
  let paramSeed = Math.floor(Math.random() * 15);
  while (selected.length < count) {
    const idx = selected.length;
    const generated =
      mode === 'obby' || mode === 'vehicle_rally'
        ? generateObbyParametricQuestion(validWorldId, paramSeed + idx)
        : generateSurvivalParametricQuestion(validWorldId, paramSeed + idx);
    paramSeed += 3;
    if (!selected.some((s) => s.prompt === generated.prompt)) {
      selected.push({ ...generated, worldId: validWorldId, stageIndex: idx });
      sessionUsedPrompts.add(generated.prompt);
    }
  }

  return selected;
}

/**
 * Função oficial v9.0 alinhada à BNCC: recebe o perfil do aluno, a modalidade e a dificuldade
 * e retorna apenas questões da série do aluno (`question.worldId === student.worldId`).
 */
export function getQuestionsForSession(
  student: Pick<StudentProfile, 'worldId' | 'grade'>,
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
  return getQuestionsForMode(student.worldId, mode, defaultCount);
}
