import { MathQuestion } from '../types/game';

export type ValidWorldId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export function normalizeWorldId(worldId: number): ValidWorldId {
  if (worldId >= 1 && worldId <= 10 && Number.isInteger(worldId)) {
    return worldId as ValidWorldId;
  }
  return 1;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function buildUniqueOptions(
  correctVal: string,
  wrongs: string[],
  allowNegative = false
): { options: [string, string, string]; correctIndex: 0 | 1 | 2 } {
  const uniqueSet = new Set<string>([correctVal]);
  const fallbacks = allowNegative
    ? [`-${correctVal}`, `${correctVal}0`, '12', '24', '36', '-10']
    : [`${correctVal}0`, '10', '15', '20', '25', '36', '48'];
  for (const w of [...wrongs, ...fallbacks]) {
    if (uniqueSet.size >= 3) break;
    if (w && w !== correctVal && (allowNegative || !w.startsWith('-'))) {
      uniqueSet.add(w);
    }
  }
  const arr = shuffle(Array.from(uniqueSet).slice(0, 3)) as [string, string, string];
  const idx = arr.indexOf(correctVal) as 0 | 1 | 2;
  return { options: arr, correctIndex: idx >= 0 ? idx : 0 };
}

const NAMES = ['Lucas', 'Sofia', 'Miguel', 'Helena', 'Arthur', 'Alice', 'Davi', 'Laura', 'Gabriel', 'Rafaela', 'Pedro', 'Clara', 'Bia', 'Enzo'];
const ITEMS_EMOJI = [
  { singular: 'maçã', plural: 'maçãs', emoji: '🍎' },
  { singular: 'estrela', plural: 'estrelas', emoji: '⭐' },
  { singular: 'bolinha', plural: 'bolinhas', emoji: '⚽' },
  { singular: 'balão', plural: 'balões', emoji: '🎈' },
  { singular: 'flor', plural: 'flores', emoji: '🌻' },
  { singular: 'peixinho', plural: 'peixinhos', emoji: '🐠' },
] as const;

type GenFn = (stageIndex: number) => MathQuestion;

// =============================================================================
// MUNDO 7: 1º ANO (EF01MA) — 8 Geradores Dinâmicos
// =============================================================================
const GEN_W7: GenFn[] = [
  // 1. Soma visual com emojis até 20
  (idx) => {
    const a = randInt(2, 9);
    const b = randInt(2, Math.min(9, 19 - a));
    const it = pick(ITEMS_EMOJI);
    const ans = a + b;
    const { options, correctIndex } = buildUniqueOptions(
      `${ans} ${it.plural}`,
      [`${ans + 1} ${it.plural}`, `${Math.max(1, ans - 1)} ${it.plural}`, `${ans + 2} ${it.plural}`]
    );
    return {
      id: `p-w7-0-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 7,
      stageIndex: idx,
      bnccCode: 'EF01MA08',
      topic: 'Soma Visual até 20 (EF01MA08)',
      prompt: `Junte os grupos: ${it.emoji.repeat(a)} (${a}) + ${it.emoji.repeat(b)} (${b}). Quantos ${it.plural} há ao todo?`,
      options,
      correctIndex,
      explanation: `Contando tudo junto: ${a} + ${b} = ${ans} ${it.plural}!`,
    };
  },
  // 2. Subtração contextual até 20
  (idx) => {
    const a = randInt(8, 19);
    const b = randInt(2, Math.min(9, a - 1));
    const ans = a - b;
    const it = pick(ITEMS_EMOJI);
    const name = pick(NAMES);
    const { options, correctIndex } = buildUniqueOptions(
      `${ans} ${it.plural}`,
      [`${ans + 1} ${it.plural}`, `${Math.max(1, ans - 2)} ${it.plural}`, `${ans + 2} ${it.plural}`]
    );
    return {
      id: `p-w7-1-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 7,
      stageIndex: idx,
      bnccCode: 'EF01MA08',
      topic: 'Subtração até 20 (EF01MA08)',
      prompt: `${name} tinha ${a} ${it.plural} ${it.emoji} e deu ${b} para um amigo. Com quantos ficou?`,
      options,
      correctIndex,
      explanation: `Tirando ${b} de ${a}: ${a} - ${b} = ${ans} ${it.plural}!`,
    };
  },
  // 3. Antecessor e Sucessor até 99
  (idx) => {
    const n = randInt(11, 98);
    const askNext = Math.random() > 0.5;
    const ans = askNext ? n + 1 : n - 1;
    const { options, correctIndex } = buildUniqueOptions(
      String(ans),
      [String(askNext ? n - 1 : n + 1), String(ans + 2), String(Math.max(1, ans - 2))]
    );
    return {
      id: `p-w7-2-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 7,
      stageIndex: idx,
      bnccCode: 'EF01MA04',
      topic: 'Antecessor e Sucessor (EF01MA04)',
      prompt: askNext
        ? `Qual número vem LOGO DEPOIS (sucessor) de ${n}?`
        : `Qual número vem LOGO ANTES (antecessor) de ${n}?`,
      options,
      correctIndex,
      explanation: askNext ? `Depois de ${n} vem ${ans}!` : `Antes de ${n} vem ${ans}!`,
    };
  },
  // 4. Maior / Menor até 100
  (idx) => {
    const base = randInt(12, 82);
    const n1 = base;
    const n2 = base + randInt(4, 11);
    const n3 = Math.max(5, base - randInt(4, 9));
    const askBig = Math.random() > 0.5;
    const ans = askBig ? n2 : n3;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String(n1), String(askBig ? n3 : n2)]);
    return {
      id: `p-w7-3-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 7,
      stageIndex: idx,
      bnccCode: 'EF01MA05',
      topic: 'Comparação até 100 (EF01MA05)',
      prompt: askBig
        ? `Qual destes números é o MAIOR: ${n1}, ${n2} ou ${n3}?`
        : `Qual destes números é o MENOR: ${n1}, ${n2} ou ${n3}?`,
      options,
      correctIndex,
      explanation: askBig ? `${n2} é o maior dos três números!` : `${n3} é o menor dos três números!`,
    };
  },
  // 5. Cédulas R$ 2, R$ 5 e R$ 10
  (idx) => {
    const combos: [string, number, number, number][] = [
      ['1 nota de R$ 10 e 1 nota de R$ 5', 15, 12, 20],
      ['2 notas de R$ 5 e 1 nota de R$ 2', 12, 10, 14],
      ['1 nota de R$ 10 e 2 notas de R$ 2', 14, 12, 16],
      ['3 notas de R$ 5', 15, 10, 20],
      ['2 notas de R$ 10', 20, 15, 12],
      ['4 notas de R$ 2', 8, 6, 10],
      ['1 nota de R$ 5 e 2 notas de R$ 2', 9, 7, 11],
      ['1 nota de R$ 10 e 3 notas de R$ 2', 16, 14, 18],
    ];
    const [desc, ans, w1, w2] = pick(combos);
    const name = pick(NAMES);
    const { options, correctIndex } = buildUniqueOptions(`R$ ${ans}`, [`R$ ${w1}`, `R$ ${w2}`]);
    return {
      id: `p-w7-4-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 7,
      stageIndex: idx,
      bnccCode: 'EF01MA19',
      topic: 'Cédulas de Real (EF01MA19)',
      prompt: `${name} juntou ${desc}. Quantos reais ${name} tem ao todo?`,
      options,
      correctIndex,
      explanation: `Somando as cédulas: ${desc} = R$ ${ans}!`,
    };
  },
  // 6. Dias da semana
  (idx) => {
    const days = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    const i = randInt(0, 6);
    const askNext = Math.random() > 0.5;
    const ans = days[(i + (askNext ? 1 : 6)) % 7];
    const w1 = days[(i + 2) % 7];
    const w2 = days[(i + 4) % 7];
    const { options, correctIndex } = buildUniqueOptions(ans, [w1, w2]);
    return {
      id: `p-w7-5-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 7,
      stageIndex: idx,
      bnccCode: 'EF01MA17',
      topic: 'Dias da Semana (EF01MA17)',
      prompt: askNext
        ? `Se hoje é ${days[i]}, que dia será AMANHÃ?`
        : `Se hoje é ${days[i]}, que dia foi ONTEM?`,
      options,
      correctIndex,
      explanation: askNext ? `Depois de ${days[i]} vem ${ans}!` : `Antes de ${days[i]} vem ${ans}!`,
    };
  },
  // 7. Contagem de 10 em 10 até 100
  (idx) => {
    const start = randInt(1, 6) * 10;
    const ans = start + 30;
    const { options, correctIndex } = buildUniqueOptions(
      String(ans),
      [String(ans - 5), String(ans + 10)]
    );
    return {
      id: `p-w7-6-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 7,
      stageIndex: idx,
      bnccCode: 'EF01MA04',
      topic: 'Contagem de 10 em 10 (EF01MA04)',
      prompt: `Complete a trilha de 10 em 10: ${start}, ${start + 10}, ${start + 20}, ...`,
      options,
      correctIndex,
      explanation: `Somando 10 a ${start + 20}, chegamos a ${ans}!`,
    };
  },
  // 8. Formas planas em objetos cotidianos
  (idx) => {
    const shapes: [string, string, string, string][] = [
      ['uma fatia de pizza triangular', 'Triângulo', 'Círculo', 'Quadrado'],
      ['um relógio redondo de parede', 'Círculo', 'Triângulo', 'Retângulo'],
      ['uma tela de televisão comprida', 'Retângulo', 'Círculo', 'Triângulo'],
      ['um tabuleiro de xadrez com 4 lados iguais', 'Quadrado', 'Círculo', 'Triângulo'],
      ['uma placa de trânsito com 3 lados', 'Triângulo', 'Quadrado', 'Retângulo'],
    ];
    const [obj, ans, w1, w2] = pick(shapes);
    const { options, correctIndex } = buildUniqueOptions(ans, [w1, w2]);
    return {
      id: `p-w7-7-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 7,
      stageIndex: idx,
      bnccCode: 'EF01MA14',
      topic: 'Formas Geométricas Planas (EF01MA14)',
      prompt: `Qual forma geométrica plana lembra ${obj}?`,
      options,
      correctIndex,
      explanation: `${obj} tem o formato de um ${ans}!`,
    };
  },
];

// =============================================================================
// MUNDO 8: 2º ANO (EF02MA) — 8 Geradores Dinâmicos
// =============================================================================
const GEN_W8: GenFn[] = [
  // 1. Adição até 100
  (idx) => {
    const a = randInt(14, 58);
    const b = randInt(12, 99 - a);
    const ans = a + b;
    const name = pick(NAMES);
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String(ans + 10), String(ans - 2)]);
    return {
      id: `p-w8-0-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 8,
      stageIndex: idx,
      bnccCode: 'EF02MA05',
      topic: 'Adição até 100 (EF02MA05)',
      prompt: `${name} juntou ${a} figurinhas pela manhã e ${b} à tarde. Qual foi o total?`,
      options,
      correctIndex,
      explanation: `Somando ${a} + ${b} obtemos ${ans} figurinhas!`,
    };
  },
  // 2. Subtração até 100
  (idx) => {
    const a = randInt(45, 98);
    const b = randInt(12, a - 10);
    const ans = a - b;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String(ans + 10), String(Math.max(1, ans - 3))]);
    return {
      id: `p-w8-1-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 8,
      stageIndex: idx,
      bnccCode: 'EF02MA06',
      topic: 'Subtração até 100 (EF02MA06)',
      prompt: `Em uma caixa havia ${a} lápis de cor e foram usados ${b}. Quantos sobraram?`,
      options,
      correctIndex,
      explanation: `Subtraindo ${a} - ${b} = ${ans} lápis!`,
    };
  },
  // 3. Dobro
  (idx) => {
    const n = randInt(4, 24);
    const ans = n * 2;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String(n + 2), String(ans + 4)]);
    return {
      id: `p-w8-2-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 8,
      stageIndex: idx,
      bnccCode: 'EF02MA08',
      topic: 'Dobro (EF02MA08)',
      prompt: `Qual é o DOBRO do número ${n}?`,
      options,
      correctIndex,
      explanation: `O dobro de ${n} é ${n} + ${n} = ${ans}!`,
    };
  },
  // 4. Metade
  (idx) => {
    const half = randInt(4, 25);
    const total = half * 2;
    const { options, correctIndex } = buildUniqueOptions(String(half), [String(half + 2), String(half - 2)]);
    return {
      id: `p-w8-3-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 8,
      stageIndex: idx,
      bnccCode: 'EF02MA08',
      topic: 'Metade (EF02MA08)',
      prompt: `Qual é a METADE de ${total} adesivos?`,
      options,
      correctIndex,
      explanation: `Dividindo ${total} em 2 partes iguais: metade = ${half}!`,
    };
  },
  // 5. Multiplicação inicial (×2, ×3, ×4, ×5)
  (idx) => {
    const a = pick([2, 3, 4, 5]);
    const b = randInt(2, 10);
    const ans = a * b;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String(ans + a), String(Math.max(2, ans - a))]);
    return {
      id: `p-w8-4-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 8,
      stageIndex: idx,
      bnccCode: 'EF02MA07',
      topic: `Multiplicação ×${a} (EF02MA07)`,
      prompt: `Em cada pacote há ${a} balas. Quantas balas existem em ${b} pacotes iguais (${a} × ${b})?`,
      options,
      correctIndex,
      explanation: `${b} pacotes com ${a} balas cada = ${a} × ${b} = ${ans} balas!`,
    };
  },
  // 6. Composição unidade/dezena/centena
  (idx) => {
    const c = randInt(1, 5);
    const d = randInt(1, 8);
    const u = randInt(1, 9);
    const ans = c * 100 + d * 10 + u;
    const { options, correctIndex } = buildUniqueOptions(
      String(ans),
      [String(c * 100 + u * 10 + d), String(d * 100 + c * 10 + u)]
    );
    return {
      id: `p-w8-5-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 8,
      stageIndex: idx,
      bnccCode: 'EF02MA04',
      topic: 'Centena, Dezena e Unidade (EF02MA04)',
      prompt: `Que número é formado por ${c} centena(s), ${d} dezenas e ${u} unidades?`,
      options,
      correctIndex,
      explanation: `${c * 100} + ${d * 10} + ${u} = ${ans}!`,
    };
  },
  // 7. Sequências (2 em 2, 5 em 5, 10 em 10)
  (idx) => {
    const step = pick([2, 5, 10]);
    const start = randInt(2, 10) * step;
    const ans = start + step * 3;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String(ans + step), String(ans - 1)]);
    return {
      id: `p-w8-6-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 8,
      stageIndex: idx,
      bnccCode: 'EF02MA10',
      topic: `Sequência de ${step} em ${step} (EF02MA10)`,
      prompt: `Qual número completa a sequência: ${start}, ${start + step}, ${start + step * 2}, ...?`,
      options,
      correctIndex,
      explanation: `A sequência aumenta de ${step} em ${step}: ${start + step * 2} + ${step} = ${ans}!`,
    };
  },
  // 8. Horas exatas e meias horas
  (idx) => {
    const hour = randInt(7, 17);
    const addHalf = Math.random() > 0.5;
    const ans = addHalf ? `${hour}:30` : `${hour + 1}:00`;
    const w1 = addHalf ? `${hour + 1}:00` : `${hour}:30`;
    const w2 = `${hour + 1}:30`;
    const { options, correctIndex } = buildUniqueOptions(ans, [w1, w2]);
    return {
      id: `p-w8-7-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 8,
      stageIndex: idx,
      bnccCode: 'EF02MA19',
      topic: 'Horas e Meias Horas (EF02MA19)',
      prompt: addHalf
        ? `Um filme começou às ${hour}:00 e passou MEIA HORA. Que horas está marcando o relógio?`
        : `A brincadeira começou às ${hour}:30 e durou MEIA HORA. Que horas ela terminou?`,
      options,
      correctIndex,
      explanation: `Meia hora = 30 minutos! Logo o relógio marca ${ans}!`,
    };
  },
];

// =============================================================================
// MUNDO 9: 3º ANO (EF03MA) — 8 Geradores Dinâmicos
// =============================================================================
const GEN_W9: GenFn[] = [
  // 1. Soma com reserva até 1.000
  (idx) => {
    const a = randInt(135, 485);
    const b = randInt(127, 999 - a);
    const ans = a + b;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String(ans + 10), String(ans - 10)]);
    return {
      id: `p-w9-0-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 9,
      stageIndex: idx,
      bnccCode: 'EF03MA05',
      topic: 'Adição com Reserva (EF03MA05)',
      prompt: `Uma biblioteca tem ${a} livros infantis e recebeu mais ${b}. Qual é o novo total?`,
      options,
      correctIndex,
      explanation: `Somando com reserva: ${a} + ${b} = ${ans} livros!`,
    };
  },
  // 2. Subtração com reserva até 1.000
  (idx) => {
    const a = randInt(410, 950);
    const b = randInt(135, a - 80);
    const ans = a - b;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String(ans + 10), String(ans - 10)]);
    return {
      id: `p-w9-1-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 9,
      stageIndex: idx,
      bnccCode: 'EF03MA06',
      topic: 'Subtração com Reserva (EF03MA06)',
      prompt: `Um álbum comporta ${a} figurinhas e ${pick(NAMES)} já colou ${b}. Quantas ainda faltam?`,
      options,
      correctIndex,
      explanation: `Subtraindo ${a} - ${b} = ${ans} figurinhas!`,
    };
  },
  // 3. Tabuada completa (2 a 9)
  (idx) => {
    const a = randInt(3, 9);
    const b = randInt(3, 9);
    const ans = a * b;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String(ans + a), String(Math.max(4, ans - b))]);
    return {
      id: `p-w9-2-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 9,
      stageIndex: idx,
      bnccCode: 'EF03MA07',
      topic: 'Tabuada Completa (EF03MA07)',
      prompt: `Numa estante há ${a} prateleiras com ${b} jogos em cada uma. Quantos jogos há no total (${a} × ${b})?`,
      options,
      correctIndex,
      explanation: `Pela tabuada: ${a} × ${b} = ${ans} jogos!`,
    };
  },
  // 4. Divisão exata
  (idx) => {
    const div = randInt(3, 9);
    const quo = randInt(3, 9);
    const total = div * quo;
    const { options, correctIndex } = buildUniqueOptions(String(quo), [String(quo + 1), String(Math.max(1, quo - 1))]);
    return {
      id: `p-w9-3-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 9,
      stageIndex: idx,
      bnccCode: 'EF03MA08',
      topic: 'Divisão Exata (EF03MA08)',
      prompt: `Repartindo igualmente ${total} cartas entre ${div} jogadores, quantas cada um recebe (${total} ÷ ${div})?`,
      options,
      correctIndex,
      explanation: `Como ${div} × ${quo} = ${total}, cada jogador recebe ${quo} cartas!`,
    };
  },
  // 5. Decomposição até 1.000
  (idx) => {
    const c = randInt(2, 9);
    const d = randInt(1, 9);
    const u = randInt(1, 9);
    const num = c * 100 + d * 10 + u;
    const { options, correctIndex } = buildUniqueOptions(
      `${c * 100} + ${d * 10} + ${u}`,
      [`${c * 10} + ${d * 10} + ${u}`, `${c * 100} + ${u * 10} + ${d}`]
    );
    return {
      id: `p-w9-4-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 9,
      stageIndex: idx,
      bnccCode: 'EF03MA02',
      topic: 'Decomposição até 1.000 (EF03MA02)',
      prompt: `Qual é a decomposição correta do número ${num}?`,
      options,
      correctIndex,
      explanation: `${num} = ${c} centenas (${c * 100}) + ${d} dezenas (${d * 10}) + ${u} unidades!`,
    };
  },
  // 6. Horas e minutos
  (idx) => {
    const h = randInt(8, 18);
    const mStart = pick([10, 15, 20, 25]);
    const dur = pick([20, 25, 30, 35]);
    const mEnd = mStart + dur;
    const endH = h + Math.floor(mEnd / 60);
    const endM = mEnd % 60;
    const fmt = (hr: number, mn: number) => `${hr}:${String(mn).padStart(2, '0')}`;
    const ans = fmt(endH, endM);
    const { options, correctIndex } = buildUniqueOptions(ans, [fmt(endH, (endM + 10) % 60), fmt(h, Math.max(0, mStart + 15))]);
    return {
      id: `p-w9-5-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 9,
      stageIndex: idx,
      bnccCode: 'EF03MA22',
      topic: 'Horas e Minutos (EF03MA22)',
      prompt: `Um jogo começou às ${fmt(h, mStart)} e durou ${dur} minutos. A que horas terminou?`,
      options,
      correctIndex,
      explanation: `Somando ${dur} minutos a ${fmt(h, mStart)}, chegamos às ${ans}!`,
    };
  },
  // 7. Troco simples
  (idx) => {
    const bill = pick([20, 50, 100]);
    const price = bill === 20 ? randInt(7, 17) : bill === 50 ? randInt(16, 42) : randInt(28, 78);
    const ans = bill - price;
    const { options, correctIndex } = buildUniqueOptions(`R$ ${ans}`, [`R$ ${ans + 2}`, `R$ ${Math.max(1, ans - 2)}`]);
    return {
      id: `p-w9-6-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 9,
      stageIndex: idx,
      bnccCode: 'EF03MA24',
      topic: 'Troco Simples (EF03MA24)',
      prompt: `${pick(NAMES)} comprou um item de R$ ${price} e pagou com uma nota de R$ ${bill}. Qual é o troco?`,
      options,
      correctIndex,
      explanation: `Troco = ${bill} - ${price} = R$ ${ans}!`,
    };
  },
  // 8. Sólidos geométricos
  (idx) => {
    const solids: [string, string, string, string][] = [
      ['um cubo mágico com 6 faces quadradas', 'Cubo', 'Cone', 'Esfera'],
      ['uma laranja ou globo terrestre', 'Esfera', 'Cilindro', 'Pirâmide'],
      ['um cone de trânsito laranja', 'Cone', 'Cubo', 'Cilindro'],
      ['um rolo de papel ou tambor redondo', 'Cilindro', 'Pirâmide', 'Esfera'],
      ['uma tenda com base quadrada e 4 lados triangulares', 'Pirâmide', 'Cone', 'Cubo'],
    ];
    const [desc, ans, w1, w2] = pick(solids);
    const { options, correctIndex } = buildUniqueOptions(ans, [w1, w2]);
    return {
      id: `p-w9-7-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 9,
      stageIndex: idx,
      bnccCode: 'EF03MA13',
      topic: 'Sólidos Geométricos (EF03MA13)',
      prompt: `Qual sólido geométrico 3D corresponde a ${desc}?`,
      options,
      correctIndex,
      explanation: `${desc} possui exatamente o formato de um(a) ${ans}!`,
    };
  },
];

// =============================================================================
// MUNDO 10: 4º ANO (EF04MA) — 8 Geradores Dinâmicos
// =============================================================================
const GEN_W10: GenFn[] = [
  // 1. Operações até dezenas de milhar
  (idx) => {
    const a = randInt(11, 35) * 1000 + randInt(1, 8) * 100;
    const b = randInt(10, 25) * 1000 + randInt(1, 5) * 100;
    const ans = a + b;
    const fmt = (n: number) => n.toLocaleString('pt-BR');
    const { options, correctIndex } = buildUniqueOptions(fmt(ans), [fmt(ans + 1000), fmt(ans - 1000)]);
    return {
      id: `p-w10-0-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 10,
      stageIndex: idx,
      bnccCode: 'EF04MA03',
      topic: 'Operações com Milhares (EF04MA03)',
      prompt: `Um festival teve ${fmt(a)} visitantes na sexta e ${fmt(b)} no sábado. Qual foi o total?`,
      options,
      correctIndex,
      explanation: `${fmt(a)} + ${fmt(b)} = ${fmt(ans)} visitantes!`,
    };
  },
  // 2. Multiplicação por 2 algarismos simples
  (idx) => {
    const a = randInt(11, 19);
    const b = pick([10, 11, 12, 15, 20]);
    const ans = a * b;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String(ans + a), String(ans - b)]);
    return {
      id: `p-w10-1-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 10,
      stageIndex: idx,
      bnccCode: 'EF04MA06',
      topic: 'Multiplicação por 2 Algarismos (EF04MA06)',
      prompt: `Qual é o resultado da multiplicação ${a} × ${b}?`,
      options,
      correctIndex,
      explanation: `Multiplicando passo a passo: ${a} × ${b} = ${ans}!`,
    };
  },
  // 3. Divisão exata (centenas)
  (idx) => {
    const d = randInt(3, 9);
    const q = randInt(12, 35);
    const total = d * q;
    const { options, correctIndex } = buildUniqueOptions(String(q), [String(q + 2), String(q - 2)]);
    return {
      id: `p-w10-2-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 10,
      stageIndex: idx,
      bnccCode: 'EF04MA07',
      topic: 'Divisão Exata (EF04MA07)',
      prompt: `Dividindo ${total} livros igualmente em ${d} estantes, quantos livros ficam em cada estante?`,
      options,
      correctIndex,
      explanation: `${total} ÷ ${d} = ${q} livros por estante!`,
    };
  },
  // 4. Frações unitárias (1/2, 1/3, 1/4, 1/5, 1/10)
  (idx) => {
    const den = pick([2, 3, 4, 5, 10]);
    const ans = randInt(4, 15);
    const total = den * ans;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String(ans + 2), String(Math.max(1, ans - 2))]);
    return {
      id: `p-w10-3-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 10,
      stageIndex: idx,
      bnccCode: 'EF04MA09',
      topic: `Fração Unitária 1/${den} (EF04MA09)`,
      prompt: `Quanto vale a fração unitária 1/${den} de ${total} figurinhas?`,
      options,
      correctIndex,
      explanation: `Para calcular 1/${den} dividimos por ${den}: ${total} ÷ ${den} = ${ans}!`,
    };
  },
  // 5. Decimais em dinheiro (R$) — Soma
  (idx) => {
    const r1 = randInt(6, 22);
    const r2 = randInt(3, 14);
    const c1 = pick([25, 50, 75]);
    const c2 = pick([25, 50]);
    const totalCents = (r1 + r2) * 100 + c1 + c2;
    const fmtMoney = (cents: number) => {
      const reais = Math.floor(cents / 100);
      const rem = cents % 100;
      return `R$ ${reais},${String(rem).padStart(2, '0')}`;
    };
    const ans = fmtMoney(totalCents);
    const { options, correctIndex } = buildUniqueOptions(ans, [fmtMoney(totalCents + 50), fmtMoney(totalCents - 50)]);
    return {
      id: `p-w10-4-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 10,
      stageIndex: idx,
      bnccCode: 'EF04MA10',
      topic: 'Decimais em Dinheiro (EF04MA10)',
      prompt: `${pick(NAMES)} comprou um lanche de ${fmtMoney(r1 * 100 + c1)} e um suco de ${fmtMoney(r2 * 100 + c2)}. Quanto gastou?`,
      options,
      correctIndex,
      explanation: `Somando reais e centavos obtemos exatamente ${ans}!`,
    };
  },
  // 6. Perímetro de Quadrado
  (idx) => {
    const lado = randInt(5, 22);
    const perim = lado * 4;
    const { options, correctIndex } = buildUniqueOptions(`${perim} m`, [`${lado * 2} m`, `${perim + 4} m`]);
    return {
      id: `p-w10-5-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 10,
      stageIndex: idx,
      bnccCode: 'EF04MA20',
      topic: 'Perímetro do Quadrado (EF04MA20)',
      prompt: `Uma praça quadrada tem cada lado medindo ${lado} metros. Qual é o seu perímetro?`,
      options,
      correctIndex,
      explanation: `O quadrado tem 4 lados iguais: 4 × ${lado} = ${perim} metros!`,
    };
  },
  // 7. Perímetro de Retângulo
  (idx) => {
    const comp = randInt(8, 20);
    const larg = randInt(4, comp - 2);
    const perim = 2 * (comp + larg);
    const { options, correctIndex } = buildUniqueOptions(`${perim} cm`, [`${comp + larg} cm`, `${comp * larg} cm`]);
    return {
      id: `p-w10-6-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 10,
      stageIndex: idx,
      bnccCode: 'EF04MA20',
      topic: 'Perímetro do Retângulo (EF04MA20)',
      prompt: `Um quadro retangular mede ${comp} cm de comprimento por ${larg} cm de altura. Qual é o seu perímetro?`,
      options,
      correctIndex,
      explanation: `Somando os 4 lados: ${comp} + ${larg} + ${comp} + ${larg} = ${perim} cm!`,
    };
  },
  // 8. Troco em R$ com centavos
  (idx) => {
    const bill = pick([20, 50]);
    const reais = randInt(6, bill - 4);
    const priceCents = reais * 100 + 50;
    const changeCents = bill * 100 - priceCents;
    const fmt = (cents: number) => `R$ ${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
    const ans = fmt(changeCents);
    const { options, correctIndex } = buildUniqueOptions(ans, [fmt(changeCents + 100), fmt(changeCents - 50)]);
    return {
      id: `p-w10-7-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 10,
      stageIndex: idx,
      bnccCode: 'EF04MA10',
      topic: 'Troco com Decimais (EF04MA10)',
      prompt: `Você pagou uma compra de ${fmt(priceCents)} com uma nota de R$ ${bill},00. Quanto recebeu de troco?`,
      options,
      correctIndex,
      explanation: `R$ ${bill},00 - ${fmt(priceCents)} = ${ans}!`,
    };
  },
];

// =============================================================================
// MUNDO 1: 5º ANO (EF05MA) — 8 Geradores Dinâmicos (ZERO negativos, ZERO incógnitas)
// =============================================================================
const GEN_W1: GenFn[] = [
  // 1. Área e Perímetro de retângulos
  (idx) => {
    const w = randInt(4, 14);
    const h = randInt(3, 10);
    const askArea = Math.random() > 0.5;
    const area = w * h;
    const perim = 2 * (w + h);
    const ans = askArea ? `${area} m²` : `${perim} m`;
    const { options, correctIndex } = buildUniqueOptions(
      ans,
      askArea ? [`${perim} m²`, `${area + w} m²`] : [`${area} m`, `${perim + 4} m`]
    );
    return {
      id: `p-w1-0-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 1,
      stageIndex: idx,
      bnccCode: 'EF05MA20',
      topic: 'Área e Perímetro (EF05MA20)',
      prompt: askArea
        ? `Qual é a ÁREA de um jardim retangular de ${w} m por ${h} m?`
        : `Qual é o PERÍMETRO de uma quadra retangular de ${w} m por ${h} m?`,
      options,
      correctIndex,
      explanation: askArea
        ? `Área = largura × comprimento = ${w} × ${h} = ${area} m²!`
        : `Perímetro = ${w} + ${h} + ${w} + ${h} = ${perim} m!`,
    };
  },
  // 2. Frações de quantidade
  (idx) => {
    const d = pick([2, 3, 4, 5]);
    const mult = randInt(3, 12);
    const total = d * mult;
    const num = d === 2 ? 1 : randInt(1, d - 1);
    const ans = mult * num;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String(ans + mult), String(Math.max(1, ans - 2))]);
    return {
      id: `p-w1-1-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 1,
      stageIndex: idx,
      bnccCode: 'EF05MA03',
      topic: 'Frações de Quantidade (EF05MA03)',
      prompt: `Em uma caixa há ${total} figurinhas e ${pick(NAMES)} separou ${num}/${d} delas. Quantas figurinhas separou?`,
      options,
      correctIndex,
      explanation: `Dividimos ${total} por ${d} (= ${mult}) e multiplicamos por ${num}: ${ans}!`,
    };
  },
  // 3. Porcentagem básica (10%, 25%, 50%)
  (idx) => {
    const pct = pick([10, 25, 50]);
    const base = randInt(2, 12) * 20;
    const ans = (base * pct) / 100;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String(ans + 10), String(Math.max(2, ans - 5))]);
    return {
      id: `p-w1-2-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 1,
      stageIndex: idx,
      bnccCode: 'EF05MA06',
      topic: 'Porcentagem Básica (EF05MA06)',
      prompt: `Quanto é ${pct}% de ${base} pontos em um torneio?`,
      options,
      correctIndex,
      explanation: `${pct}% de ${base} = (${pct} × ${base}) ÷ 100 = ${ans} pontos!`,
    };
  },
  // 4. Conversão de comprimento (m <-> cm)
  (idx) => {
    const m = randInt(2, 12);
    const cm = randInt(1, 9) * 10;
    const total = m * 100 + cm;
    const { options, correctIndex } = buildUniqueOptions(`${total} cm`, [`${m * 10 + cm} cm`, `${total + 50} cm`]);
    return {
      id: `p-w1-3-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 1,
      stageIndex: idx,
      bnccCode: 'EF05MA19',
      topic: 'Medidas de Comprimento (EF05MA19)',
      prompt: `Uma corda tem ${m} metros e ${cm} centímetros. Quantos centímetros ela mede no total?`,
      options,
      correctIndex,
      explanation: `1 m = 100 cm. Logo, ${m} × 100 + ${cm} = ${total} cm!`,
    };
  },
  // 5. Medidas de tempo (h <-> min)
  (idx) => {
    const h = randInt(2, 6);
    const min = pick([10, 15, 20, 30, 45]);
    const total = h * 60 + min;
    const { options, correctIndex } = buildUniqueOptions(`${total} min`, [`${h * 100 + min} min`, `${total - 20} min`]);
    return {
      id: `p-w1-4-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 1,
      stageIndex: idx,
      bnccCode: 'EF05MA19',
      topic: 'Medidas de Tempo (EF05MA19)',
      prompt: `Um passeio durou ${h} horas e ${min} minutos. Quantos minutos durou ao todo?`,
      options,
      correctIndex,
      explanation: `${h} horas = ${h * 60} min. Somando ${min} min = ${total} minutos!`,
    };
  },
  // 6. Sistema decimal até centena de milhar
  (idx) => {
    const cm = randInt(1, 9);
    const dm = randInt(1, 9);
    const um = randInt(1, 9);
    const numStr = `${cm}${dm}${um}.000`;
    const ans = `${dm * 10}.000`;
    const { options, correctIndex } = buildUniqueOptions(ans, [`${dm}.000`, `${dm * 100}.000`]);
    return {
      id: `p-w1-5-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 1,
      stageIndex: idx,
      bnccCode: 'EF05MA01',
      topic: 'Valor Posicional (EF05MA01)',
      prompt: `No número ${numStr}, qual é o valor posicional do algarismo ${dm} (segunda casa à esquerda)?`,
      options,
      correctIndex,
      explanation: `Ele ocupa a ordem das dezenas de milhar, valendo ${ans}!`,
    };
  },
  // 7. Decimais em dinheiro (R$)
  (idx) => {
    const a = randInt(6, 25);
    const b = randInt(3, 15);
    const ans = `R$ ${a + b},75`;
    const { options, correctIndex } = buildUniqueOptions(ans, [`R$ ${a + b},25`, `R$ ${a + b + 1},50`]);
    return {
      id: `p-w1-6-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 1,
      stageIndex: idx,
      bnccCode: 'EF05MA07',
      topic: 'Decimais e R$ (EF05MA07)',
      prompt: `${pick(NAMES)} comprou um lanche de R$ ${a},50 e uma bebida de R$ ${b},25. Qual foi o total?`,
      options,
      correctIndex,
      explanation: `Alinhando as vírgulas: ${a},50 + ${b},25 = ${ans}!`,
    };
  },
  // 8. Divisão exata com naturais
  (idx) => {
    const friends = randInt(4, 9);
    const each = randInt(8, 25);
    const total = friends * each;
    const { options, correctIndex } = buildUniqueOptions(`${each}`, [`${each + 3}`, `${each - 2}`]);
    return {
      id: `p-w1-7-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 1,
      stageIndex: idx,
      bnccCode: 'EF05MA08',
      topic: 'Divisão de Naturais (EF05MA08)',
      prompt: `Distribuindo ${total} moedas igualmente entre ${friends} jogadores, quantas cada um ganha?`,
      options,
      correctIndex,
      explanation: `Dividindo ${total} ÷ ${friends} = ${each} moedas por jogador!`,
    };
  },
];

// =============================================================================
// MUNDO 2: 6º ANO (EF06MA) — 8 Geradores Dinâmicos (ZERO negativos, ZERO x/y)
// =============================================================================
const GEN_W2: GenFn[] = [
  // 1. Expressões numéricas (ordem das operações)
  (idx) => {
    const a = randInt(8, 30);
    const b = randInt(2, 8);
    const c = randInt(3, 9);
    const ans = a + b * c;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String((a + b) * c), String(ans + b)]);
    return {
      id: `p-w2-0-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 2,
      stageIndex: idx,
      bnccCode: 'EF06MA03',
      topic: 'Expressões Numéricas (EF06MA03)',
      prompt: `Respeitando a ordem das operações, quanto vale ${a} + ${b} × ${c}?`,
      options,
      correctIndex,
      explanation: `Primeiro multiplicamos (${b} × ${c} = ${b * c}) e depois somamos ${a}: ${ans}!`,
    };
  },
  // 2. Expressões com parênteses
  (idx) => {
    const a = randInt(4, 14);
    const b = randInt(3, 11);
    const c = randInt(2, 6);
    const ans = (a + b) * c;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String(a + b * c), String(ans + c)]);
    return {
      id: `p-w2-1-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 2,
      stageIndex: idx,
      bnccCode: 'EF06MA03',
      topic: 'Uso de Parênteses (EF06MA03)',
      prompt: `Calcule o valor da expressão com parênteses: (${a} + ${b}) × ${c} = ?`,
      options,
      correctIndex,
      explanation: `Resolvemos primeiro (${a} + ${b} = ${a + b}) e multiplicamos por ${c}: ${ans}!`,
    };
  },
  // 3. MMC simples
  (idx) => {
    const pairs: [number, number, number][] = [
      [3, 4, 12], [4, 6, 12], [6, 8, 24], [4, 10, 20],
      [5, 6, 30], [8, 12, 24], [6, 9, 18], [10, 15, 30],
    ];
    const [a, b, mmc] = pick(pairs);
    const { options, correctIndex } = buildUniqueOptions(String(mmc), [String(a + b), String(mmc * 2)]);
    return {
      id: `p-w2-2-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 2,
      stageIndex: idx,
      bnccCode: 'EF06MA06',
      topic: 'Múltiplos e MMC (EF06MA06)',
      prompt: `Qual é o Mínimo Múltiplo Comum — MMC(${a}, ${b})?`,
      options,
      correctIndex,
      explanation: `O menor múltiplo comum positivo de ${a} e ${b} é ${mmc}!`,
    };
  },
  // 4. Frações equivalentes / simplificação
  (idx) => {
    const k = randInt(2, 7);
    const basePairs: [number, number][] = [[1, 2], [1, 3], [2, 3], [3, 4], [2, 5], [3, 5], [4, 5]];
    const [num, den] = pick(basePairs);
    const { options, correctIndex } = buildUniqueOptions(`${num}/${den}`, [`${num}/${den + 1}`, `${num + 1}/${den}`]);
    return {
      id: `p-w2-3-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 2,
      stageIndex: idx,
      bnccCode: 'EF06MA07',
      topic: 'Frações Equivalentes (EF06MA07)',
      prompt: `Simplificando a fração ${num * k}/${den * k} dividindo por ${k}, obtemos:`,
      options,
      correctIndex,
      explanation: `${num * k} ÷ ${k} = ${num} e ${den * k} ÷ ${k} = ${den} => ${num}/${den}!`,
    };
  },
  // 5. Porcentagens (10%, 20%, 25%, 50%)
  (idx) => {
    const pct = pick([10, 20, 25, 50]);
    const base = randInt(2, 10) * 40;
    const ans = (base * pct) / 100;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String(ans + 10), String(Math.max(4, ans - 8))]);
    return {
      id: `p-w2-4-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 2,
      stageIndex: idx,
      bnccCode: 'EF06MA13',
      topic: 'Porcentagens (EF06MA13)',
      prompt: `Em um desafio de ${base} pontos, ${pick(NAMES)} conquistou ${pct}%. Quantos pontos fez?`,
      options,
      correctIndex,
      explanation: `${pct}% de ${base} = (${pct} × ${base}) ÷ 100 = ${ans} pontos!`,
    };
  },
  // 6. Classificação de ângulos
  (idx) => {
    const angles: [number, string][] = [
      [35, 'Ângulo Agudo (< 90°)'],
      [60, 'Ângulo Agudo (< 90°)'],
      [90, 'Ângulo Reto (= 90°)'],
      [115, 'Ângulo Obtuso (> 90°)'],
      [140, 'Ângulo Obtuso (> 90°)'],
      [180, 'Ângulo Raso (= 180°)'],
    ];
    const [deg, tipo] = pick(angles);
    const pool = ['Ângulo Agudo (< 90°)', 'Ângulo Reto (= 90°)', 'Ângulo Obtuso (> 90°)', 'Ângulo Raso (= 180°)'].filter((t) => t !== tipo);
    const { options, correctIndex } = buildUniqueOptions(tipo, pool);
    return {
      id: `p-w2-5-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 2,
      stageIndex: idx,
      bnccCode: 'EF06MA25',
      topic: 'Classificação de Ângulos (EF06MA25)',
      prompt: `Um ângulo com abertura de exatamente ${deg}° é classificado como:`,
      options,
      correctIndex,
      explanation: `O ângulo de ${deg}° é classificado como ${tipo}!`,
    };
  },
  // 7. Conversão de medidas (km/m ou L/mL)
  (idx) => {
    const useLitros = Math.random() > 0.5;
    const whole = randInt(2, 9);
    const extra = randInt(1, 8) * 100;
    const total = whole * 1000 + extra;
    const unitBig = useLitros ? 'L' : 'km';
    const unitSmall = useLitros ? 'mL' : 'm';
    const { options, correctIndex } = buildUniqueOptions(`${total} ${unitSmall}`, [`${whole * 100 + extra} ${unitSmall}`, `${total + 500} ${unitSmall}`]);
    return {
      id: `p-w2-6-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 2,
      stageIndex: idx,
      bnccCode: 'EF06MA24',
      topic: 'Conversão de Medidas (EF06MA24)',
      prompt: `Converta ${whole} ${unitBig} e ${extra} ${unitSmall} totalmente para ${unitSmall}:`,
      options,
      correctIndex,
      explanation: `1 ${unitBig} = 1.000 ${unitSmall}. Logo, ${whole * 1000} + ${extra} = ${total} ${unitSmall}!`,
    };
  },
  // 8. Adição de frações de mesmo denominador
  (idx) => {
    const den = randInt(7, 13);
    const n1 = randInt(1, Math.floor(den / 2));
    const n2 = randInt(1, den - n1 - 1);
    const { options, correctIndex } = buildUniqueOptions(`${n1 + n2}/${den}`, [`${n1 + n2}/${den * 2}`, `${n1 + n2 + 1}/${den}`]);
    return {
      id: `p-w2-7-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 2,
      stageIndex: idx,
      bnccCode: 'EF06MA10',
      topic: 'Soma de Frações (EF06MA10)',
      prompt: `Qual é o resultado da soma de frações ${n1}/${den} + ${n2}/${den}?`,
      options,
      correctIndex,
      explanation: `Conservamos o denominador ${den} e somamos os numeradores: ${n1} + ${n2} = ${n1 + n2} => ${n1 + n2}/${den}!`,
    };
  },
];

// =============================================================================
// MUNDO 3: 7º ANO (EF07MA) — 8 Geradores Dinâmicos
// =============================================================================
const GEN_W3: GenFn[] = [
  // 1. Equação do 1º grau (ax + b = c)
  (idx) => {
    const a = randInt(2, 6);
    const x = randInt(2, 12);
    const b = randInt(3, 15);
    const c = a * x + b;
    const { options, correctIndex } = buildUniqueOptions(`x = ${x}`, [`x = ${x + 2}`, `x = ${Math.max(1, x - 1)}`], true);
    return {
      id: `p-w3-0-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 3,
      stageIndex: idx,
      bnccCode: 'EF07MA18',
      topic: 'Equação do 1º Grau (EF07MA18)',
      prompt: `Resolva a equação do 1º grau: ${a}x + ${b} = ${c}`,
      options,
      correctIndex,
      explanation: `${a}x = ${c} - ${b} => ${a}x = ${c - b} => x = ${x}!`,
    };
  },
  // 2. Adição com inteiros negativos
  (idx) => {
    const negA = -randInt(10, 32);
    const posB = randInt(4, 19);
    const ans = negA + posB;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String(-ans), String(negA - posB)], true);
    return {
      id: `p-w3-1-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 3,
      stageIndex: idx,
      bnccCode: 'EF07MA04',
      topic: 'Números Inteiros (EF07MA04)',
      prompt: `Qual é o resultado da adição em Z: (${negA}) + (+${posB})?`,
      options,
      correctIndex,
      explanation: `Sinais diferentes: subtraímos os módulos e mantemos o sinal do maior: ${ans}!`,
    };
  },
  // 3. Multiplicação em Z
  (idx) => {
    const a = -randInt(3, 9);
    const b = Math.random() > 0.5 ? -randInt(3, 9) : randInt(3, 9);
    const ans = a * b;
    const bStr = b > 0 ? `+${b}` : `${b}`;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String(-ans), String(ans + a)], true);
    return {
      id: `p-w3-2-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 3,
      stageIndex: idx,
      bnccCode: 'EF07MA04',
      topic: 'Multiplicação em Z (EF07MA04)',
      prompt: `Aplicando a regra de sinais, calcule (${a}) × (${bStr}):`,
      options,
      correctIndex,
      explanation: `(${a}) × (${bStr}) = ${ans}!`,
    };
  },
  // 4. Regra de Três Simples
  (idx) => {
    const unit = randInt(5, 16);
    const q1 = randInt(2, 4);
    const q2 = randInt(5, 9);
    const t1 = unit * q1;
    const t2 = unit * q2;
    const { options, correctIndex } = buildUniqueOptions(`R$ ${t2}`, [`R$ ${t2 + unit}`, `R$ ${t2 - unit}`]);
    return {
      id: `p-w3-3-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 3,
      stageIndex: idx,
      bnccCode: 'EF07MA17',
      topic: 'Regra de Três Simples (EF07MA17)',
      prompt: `Se ${q1} ingressos custam R$ ${t1}, quanto custarão ${q2} ingressos iguais?`,
      options,
      correctIndex,
      explanation: `Cada ingresso vale R$ ${unit}. Logo, ${q2} × ${unit} = R$ ${t2}!`,
    };
  },
  // 5. Desconto percentual
  (idx) => {
    const price = pick([100, 150, 200, 250, 300, 400]);
    const pct = pick([10, 20, 30]);
    const disc = (price * pct) / 100;
    const finalP = price - disc;
    const { options, correctIndex } = buildUniqueOptions(`R$ ${finalP}`, [`R$ ${price - pct}`, `R$ ${disc}`]);
    return {
      id: `p-w3-4-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 3,
      stageIndex: idx,
      bnccCode: 'EF07MA02',
      topic: 'Desconto Percentual (EF07MA02)',
      prompt: `Um tênis de R$ ${price} recebeu ${pct}% de desconto. Qual é o novo preço?`,
      options,
      correctIndex,
      explanation: `${pct}% de ${price} = R$ ${disc}. Preço com desconto: ${price} - ${disc} = R$ ${finalP}!`,
    };
  },
  // 6. Soma dos ângulos do triângulo (180°)
  (idx) => {
    const a1 = randInt(3, 8) * 10;
    const a2 = randInt(4, 7) * 10;
    const a3 = 180 - a1 - a2;
    const { options, correctIndex } = buildUniqueOptions(`${a3}°`, [`${a3 + 10}°`, `${Math.max(10, a3 - 10)}°`]);
    return {
      id: `p-w3-5-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 3,
      stageIndex: idx,
      bnccCode: 'EF07MA24',
      topic: 'Ângulos do Triângulo (EF07MA24)',
      prompt: `Dois ângulos internos de um triângulo medem ${a1}° e ${a2}°. Quanto mede o 3º ângulo?`,
      options,
      correctIndex,
      explanation: `A soma interna é 180°: 180° - (${a1}° + ${a2}°) = ${a3}°!`,
    };
  },
  // 7. Média aritmética simples
  (idx) => {
    const mean = randInt(7, 22);
    const delta = randInt(2, 5);
    const v1 = mean - delta;
    const v2 = mean;
    const v3 = mean + delta;
    const { options, correctIndex } = buildUniqueOptions(String(mean), [String(mean + 2), String(v1 + v2 + v3)]);
    return {
      id: `p-w3-6-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 3,
      stageIndex: idx,
      bnccCode: 'EF07MA35',
      topic: 'Média Aritmética (EF07MA35)',
      prompt: `Qual é a média aritmética simples entre ${v1}, ${v2} e ${v3}?`,
      options,
      correctIndex,
      explanation: `(${v1} + ${v2} + ${v3}) ÷ 3 = ${mean * 3} ÷ 3 = ${mean}!`,
    };
  },
  // 8. Volume do bloco retangular
  (idx) => {
    const c = randInt(4, 10);
    const l = randInt(3, 7);
    const h = randInt(2, 6);
    const vol = c * l * h;
    const { options, correctIndex } = buildUniqueOptions(`${vol} cm³`, [`${c + l + h} cm³`, `${vol + 10} cm³`]);
    return {
      id: `p-w3-7-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 3,
      stageIndex: idx,
      bnccCode: 'EF07MA30',
      topic: 'Volume do Bloco (EF07MA30)',
      prompt: `Qual é o volume de uma caixa retangular de ${c} cm × ${l} cm × ${h} cm?`,
      options,
      correctIndex,
      explanation: `Volume = ${c} × ${l} × ${h} = ${vol} cm³!`,
    };
  },
];

// =============================================================================
// MUNDO 4: 8º ANO (EF08MA) — 8 Geradores Dinâmicos
// =============================================================================
const GEN_W4: GenFn[] = [
  // 1. Círculo e Circunferência (π = 3,14)
  (idx) => {
    const r = pick([2, 3, 4, 5, 6, 8, 10]);
    const askArea = Math.random() > 0.5;
    const areaStr = (3.14 * r * r).toFixed(2).replace('.00', '').replace('.', ',');
    const circStr = (2 * 3.14 * r).toFixed(2).replace('.00', '').replace('.', ',');
    const ans = askArea ? `${areaStr} m²` : `${circStr} m`;
    const { options, correctIndex } = buildUniqueOptions(
      ans,
      askArea ? [`${circStr} m²`, `${r * r} m²`] : [`${areaStr} m`, `${r * 3} m`]
    );
    return {
      id: `p-w4-0-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 4,
      stageIndex: idx,
      bnccCode: 'EF08MA19',
      topic: 'Círculo e Circunferência (EF08MA19)',
      prompt: askArea
        ? `Usando π = 3,14, qual é a ÁREA de um círculo de raio r = ${r} m? (A = π·r²)`
        : `Usando π = 3,14, qual é o COMPRIMENTO da circunferência de raio r = ${r} m? (C = 2·π·r)`,
      options,
      correctIndex,
      explanation: askArea
        ? `A = 3,14 × ${r}² = 3,14 × ${r * r} = ${areaStr} m²!`
        : `C = 2 × 3,14 × ${r} = ${circStr} m!`,
    };
  },
  // 2. Sistema de equações 2x2 (x + y, x - y)
  (idx) => {
    const x = randInt(6, 15);
    const y = randInt(2, x - 2);
    const sum = x + y;
    const diff = x - y;
    const { options, correctIndex } = buildUniqueOptions(
      `x = ${x} e y = ${y}`,
      [`x = ${x + 1} e y = ${Math.max(1, y - 1)}`, `x = ${y} e y = ${x}`]
    );
    return {
      id: `p-w4-1-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 4,
      stageIndex: idx,
      bnccCode: 'EF08MA08',
      topic: 'Sistema de Equações (EF08MA08)',
      prompt: `No sistema { x + y = ${sum} e x - y = ${diff} }, qual é o par ordenado (x, y)?`,
      options,
      correctIndex,
      explanation: `Somando as equações: 2x = ${sum + diff} => x = ${x}. Logo, y = ${sum} - ${x} = ${y}!`,
    };
  },
  // 3. Valor numérico de expressão algébrica
  (idx) => {
    const coef = randInt(2, 6);
    const x = randInt(2, 7);
    const k = randInt(3, 12);
    const ans = coef * x + k;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String(ans + coef), String(Math.max(1, coef * x - k))]);
    return {
      id: `p-w4-2-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 4,
      stageIndex: idx,
      bnccCode: 'EF08MA06',
      topic: 'Valor Numérico Algébrico (EF08MA06)',
      prompt: `Calcule o valor numérico da expressão ${coef}x + ${k} para x = ${x}:`,
      options,
      correctIndex,
      explanation: `${coef} × ${x} + ${k} = ${coef * x} + ${k} = ${ans}!`,
    };
  },
  // 4. Potenciação e propriedades
  (idx) => {
    const base = pick([2, 3, 4, 5, 6, 10]);
    const exp = base >= 5 ? 2 : 3;
    const ans = Math.pow(base, exp);
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String(base * exp), String(ans + base)]);
    return {
      id: `p-w4-3-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 4,
      stageIndex: idx,
      bnccCode: 'EF08MA01',
      topic: 'Potenciação (EF08MA01)',
      prompt: `Qual é o valor da potência ${base}^${exp}?`,
      options,
      correctIndex,
      explanation: `${base}^${exp} = ${ans}!`,
    };
  },
  // 5. Capacidade m³ -> Litros
  (idx) => {
    const m3 = randInt(2, 18);
    const liters = m3 * 1000;
    const { options, correctIndex } = buildUniqueOptions(
      `${liters.toLocaleString('pt-BR')} L`,
      [`${(m3 * 100).toLocaleString('pt-BR')} L`, `${(liters + 500).toLocaleString('pt-BR')} L`]
    );
    return {
      id: `p-w4-4-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 4,
      stageIndex: idx,
      bnccCode: 'EF08MA21',
      topic: 'Volume e Capacidade (EF08MA21)',
      prompt: `Um tanque tem volume de ${m3} m³. Sabendo que 1 m³ = 1.000 L, quantos litros cabem nele?`,
      options,
      correctIndex,
      explanation: `${m3} × 1.000 = ${liters.toLocaleString('pt-BR')} Litros!`,
    };
  },
  // 6. Área de triângulo
  (idx) => {
    const b = randInt(3, 11) * 2;
    const h = randInt(3, 10);
    const area = (b * h) / 2;
    const { options, correctIndex } = buildUniqueOptions(`${area} cm²`, [`${b * h} cm²`, `${b + h} cm²`]);
    return {
      id: `p-w4-5-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 4,
      stageIndex: idx,
      bnccCode: 'EF08MA19',
      topic: 'Área do Triângulo (EF08MA19)',
      prompt: `Calcule a área de um triângulo de base b = ${b} cm e altura h = ${h} cm (A = b·h ÷ 2):`,
      options,
      correctIndex,
      explanation: `(${b} × ${h}) ÷ 2 = ${area} cm²!`,
    };
  },
  // 7. Monômios semelhantes
  (idx) => {
    const a = randInt(3, 12);
    const b = randInt(2, 9);
    const ans = `${a + b}x²`;
    const { options, correctIndex } = buildUniqueOptions(ans, [`${a + b}x⁴`, `${a * b}x²`]);
    return {
      id: `p-w4-6-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 4,
      stageIndex: idx,
      bnccCode: 'EF08MA06',
      topic: 'Monômios Semelhantes (EF08MA06)',
      prompt: `Reduzindo os monômios semelhantes ${a}x² + ${b}x², obtemos:`,
      options,
      correctIndex,
      explanation: `Somamos os coeficientes (${a} + ${b} = ${a + b}) mantendo x²: ${ans}!`,
    };
  },
  // 8. Notação Científica
  (idx) => {
    const d1 = randInt(2, 9);
    const d2 = randInt(1, 9);
    const exp = pick([4, 5, 6, 7]);
    const rawNum = (d1 * 10 + d2) * Math.pow(10, exp - 1);
    const supMap: Record<number, string> = { 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 3: '³', 8: '⁸' };
    const ans = `${d1},${d2} × 10${supMap[exp]}`;
    const { options, correctIndex } = buildUniqueOptions(ans, [`${d1},${d2} × 10${supMap[exp - 1]}`, `${d1}${d2} × 10${supMap[exp]}`]);
    return {
      id: `p-w4-7-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 4,
      stageIndex: idx,
      bnccCode: 'EF08MA01',
      topic: 'Notação Científica (EF08MA01)',
      prompt: `Como escrevemos o número ${rawNum.toLocaleString('pt-BR')} em Notação Científica?`,
      options,
      correctIndex,
      explanation: `Deslocando a vírgula ${exp} casas à esquerda obtemos ${ans}!`,
    };
  },
];

// =============================================================================
// MUNDO 5: 9º ANO (EF09MA) — 8 Geradores Dinâmicos
// =============================================================================
const GEN_W5: GenFn[] = [
  // 1. Teorema de Pitágoras
  (idx) => {
    const triples: [number, number, number][] = [
      [3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15], [8, 15, 17], [12, 16, 20],
    ];
    const [b, c, a] = pick(triples);
    const { options, correctIndex } = buildUniqueOptions(`${a} cm`, [`${b + c} cm`, `${a + 2} cm`]);
    return {
      id: `p-w5-0-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 5,
      stageIndex: idx,
      bnccCode: 'EF09MA14',
      topic: 'Teorema de Pitágoras (EF09MA14)',
      prompt: `Um triângulo retângulo tem catetos ${b} cm e ${c} cm. Quanto mede a hipotenusa a?`,
      options,
      correctIndex,
      explanation: `a² = ${b}² + ${c}² = ${a * a} => a = √${a * a} = ${a} cm!`,
    };
  },
  // 2. Equação do 2º grau incompleta (x² - q = 0)
  (idx) => {
    const r = randInt(2, 12);
    const sq = r * r;
    const { options, correctIndex } = buildUniqueOptions(`x = ${r} e x = -${r}`, [`x = ${sq} e x = -${sq}`, `x = 0 e x = ${r}`], true);
    return {
      id: `p-w5-1-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 5,
      stageIndex: idx,
      bnccCode: 'EF09MA09',
      topic: 'Equação do 2º Grau (EF09MA09)',
      prompt: `Quais são as raízes reais da equação x² - ${sq} = 0?`,
      options,
      correctIndex,
      explanation: `x² = ${sq} => x = ±√${sq} => x = ${r} e x = -${r}!`,
    };
  },
  // 3. Equação do 2º grau completa (Soma e Produto)
  (idx) => {
    const r1 = randInt(1, 6);
    const r2 = r1 + randInt(1, 4);
    const sum = r1 + r2;
    const prod = r1 * r2;
    const { options, correctIndex } = buildUniqueOptions(
      `x = ${r1} e x = ${r2}`,
      [`x = -${r1} e x = -${r2}`, `x = ${sum} e x = ${prod}`],
      true
    );
    return {
      id: `p-w5-2-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 5,
      stageIndex: idx,
      bnccCode: 'EF09MA09',
      topic: 'Bhaskara / Soma e Produto (EF09MA09)',
      prompt: `Quais são as raízes reais da equação x² - ${sum}x + ${prod} = 0?`,
      options,
      correctIndex,
      explanation: `Os números cuja soma é ${sum} e o produto é ${prod} são x = ${r1} e x = ${r2}!`,
    };
  },
  // 4. Produtos notáveis (x + k)²
  (idx) => {
    const k = randInt(2, 9);
    const ans = `x² + ${2 * k}x + ${k * k}`;
    const { options, correctIndex } = buildUniqueOptions(ans, [`x² + ${k * k}`, `x² + ${k}x + ${k * k}`]);
    return {
      id: `p-w5-3-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 5,
      stageIndex: idx,
      bnccCode: 'EF09MA09',
      topic: 'Produtos Notáveis (EF09MA09)',
      prompt: `Desenvolvendo o quadrado da soma (x + ${k})², obtemos:`,
      options,
      correctIndex,
      explanation: `(x + ${k})² = x² + 2·x·${k} + ${k}² = ${ans}!`,
    };
  },
  // 5. Função Afim f(x) = ax + b
  (idx) => {
    const a = randInt(2, 6);
    const b = randInt(2, 10);
    const x = randInt(2, 8);
    const fx = a * x + b;
    const { options, correctIndex } = buildUniqueOptions(String(fx), [String(fx + a), String(a + b + x)]);
    return {
      id: `p-w5-4-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 5,
      stageIndex: idx,
      bnccCode: 'EF09MA06',
      topic: 'Função Afim (EF09MA06)',
      prompt: `Para a função afim f(x) = ${a}x + ${b}, qual é o valor de f(${x})?`,
      options,
      correctIndex,
      explanation: `f(${x}) = ${a}·(${x}) + ${b} = ${fx}!`,
    };
  },
  // 6. Simplificação de radicais
  (idx) => {
    const k = randInt(2, 8);
    const rad = k * k * 2;
    const { options, correctIndex } = buildUniqueOptions(`${k}√2`, [`${k * 2}√2`, `2√${k}`]);
    return {
      id: `p-w5-5-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 5,
      stageIndex: idx,
      bnccCode: 'EF09MA04',
      topic: 'Radicais (EF09MA04)',
      prompt: `Simplificando o radical √${rad}, qual expressão obtemos?`,
      options,
      correctIndex,
      explanation: `√(${k * k} × 2) = √${k * k} · √2 = ${k}√2!`,
    };
  },
  // 7. Semelhança / Teorema de Tales
  (idx) => {
    const ratio = randInt(2, 4);
    const s1 = randInt(3, 7);
    const s2 = randInt(4, 9);
    const big1 = s1 * ratio;
    const big2 = s2 * ratio;
    const { options, correctIndex } = buildUniqueOptions(`x = ${big2}`, [`x = ${big2 + ratio}`, `x = ${s2 + ratio}`]);
    return {
      id: `p-w5-6-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 5,
      stageIndex: idx,
      bnccCode: 'EF09MA12',
      topic: 'Teorema de Tales (EF09MA12)',
      prompt: `Em dois triângulos semelhantes, os lados correspondentes seguem a proporção ${s1}/${big1} = ${s2}/x. Quanto vale x?`,
      options,
      correctIndex,
      explanation: `A razão de ampliação é ${ratio}. Logo, x = ${s2} × ${ratio} = ${big2}!`,
    };
  },
  // 8. Probabilidade percentual
  (idx) => {
    const fav = randInt(2, 8);
    const other = 10 - fav;
    const pct = fav * 10;
    const { options, correctIndex } = buildUniqueOptions(`${pct}%`, [`${other * 10}%`, `${fav}%`]);
    return {
      id: `p-w5-7-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 5,
      stageIndex: idx,
      bnccCode: 'EF09MA20',
      topic: 'Probabilidade (EF09MA20)',
      prompt: `Numa urna há ${fav} bolas verdes e ${other} bolas azuis (total 10). Qual a probabilidade de sortear uma verde?`,
      options,
      correctIndex,
      explanation: `${fav} em 10 = ${fav}/10 = ${pct}%!`,
    };
  },
];

// =============================================================================
// MUNDO 6: TRILHA BASE — 8 Geradores Dinâmicos (ZERO negativos, ZERO álgebra)
// =============================================================================
const GEN_W6: GenFn[] = [
  // 1. Sequência crescente
  (idx) => {
    const step = randInt(3, 9);
    const start = step * randInt(1, 3);
    const ans = start + step * 4;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String(ans + 2), String(ans - step)]);
    return {
      id: `p-w6-0-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 6,
      stageIndex: idx,
      bnccCode: 'EF05MA07',
      topic: 'Sequência Lógica (Trilha Base)',
      prompt: `Qual é o próximo número: ${start}, ${start + step}, ${start + step * 2}, ${start + step * 3}, ...?`,
      options,
      correctIndex,
      explanation: `Soma +${step} a cada passo: ${start + step * 3} + ${step} = ${ans}!`,
    };
  },
  // 2. Troco passo a passo
  (idx) => {
    const bill = pick([20, 50]);
    const price = randInt(6, bill - 4);
    const change = bill - price;
    const { options, correctIndex } = buildUniqueOptions(`R$ ${change},00`, [`R$ ${change + 2},00`, `R$ ${Math.max(1, change - 2)},00`]);
    return {
      id: `p-w6-1-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 6,
      stageIndex: idx,
      bnccCode: 'EF05MA07',
      topic: 'Passo a Passo — Troco (Trilha Base)',
      prompt: `${pick(NAMES)} comprou um lanche de R$ ${price},00 e pagou com R$ ${bill},00. Qual é o troco?`,
      options,
      correctIndex,
      explanation: `${bill} - ${price} = R$ ${change},00!`,
    };
  },
  // 3. Tabuada contextual
  (idx) => {
    const a = randInt(3, 9);
    const b = randInt(4, 9);
    const ans = a * b;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String(ans + a), String(ans - b)]);
    return {
      id: `p-w6-2-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 6,
      stageIndex: idx,
      bnccCode: 'EF05MA08',
      topic: 'Tabuada Essencial (Trilha Base)',
      prompt: `Se cada caixa guarda ${a} bolas e temos ${b} caixas cheias, quantas bolas há (${a} × ${b})?`,
      options,
      correctIndex,
      explanation: `${a} × ${b} = ${ans} bolas!`,
    };
  },
  // 4. Divisão exata
  (idx) => {
    const d = randInt(3, 8);
    const q = randInt(4, 10);
    const total = d * q;
    const { options, correctIndex } = buildUniqueOptions(String(q), [String(q + 1), String(Math.max(1, q - 1))]);
    return {
      id: `p-w6-3-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 6,
      stageIndex: idx,
      bnccCode: 'EF05MA08',
      topic: 'Divisão Exata (Trilha Base)',
      prompt: `Dividindo ${total} figurinhas igualmente entre ${d} colegas, quantas cada um ganha?`,
      options,
      correctIndex,
      explanation: `Como ${d} × ${q} = ${total}, cada colega ganha ${q}!`,
    };
  },
  // 5. Soma mental de 3 parcelas
  (idx) => {
    const a = randInt(10, 30);
    const b = randInt(5, 20);
    const c = randInt(10, 25);
    const ans = a + b + c;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String(ans + 5), String(ans - 5)]);
    return {
      id: `p-w6-4-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 6,
      stageIndex: idx,
      bnccCode: 'EF05MA07',
      topic: 'Organização de Dados (Trilha Base)',
      prompt: `Em 3 fases você fez ${a}, ${b} e ${c} pontos. Qual foi sua pontuação total?`,
      options,
      correctIndex,
      explanation: `${a} + ${b} + ${c} = ${ans} pontos!`,
    };
  },
  // 6. Dobro e Triplo
  (idx) => {
    const a = randInt(6, 18);
    const b = randInt(3, 9);
    const ans = a * 2 + b * 3;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String(ans + 4), String(ans - 3)]);
    return {
      id: `p-w6-5-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 6,
      stageIndex: idx,
      bnccCode: 'EF05MA08',
      topic: 'Dobro e Triplo (Trilha Base)',
      prompt: `Qual é o resultado de somar o dobro de ${a} com o triplo de ${b}?`,
      options,
      correctIndex,
      explanation: `Dobro de ${a} = ${a * 2}; triplo de ${b} = ${b * 3}; soma = ${ans}!`,
    };
  },
  // 7. Fator oculto
  (idx) => {
    const a = randInt(3, 9);
    const b = randInt(4, 9);
    const prod = a * b;
    const { options, correctIndex } = buildUniqueOptions(String(b), [String(b + 1), String(Math.max(1, b - 1))]);
    return {
      id: `p-w6-6-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 6,
      stageIndex: idx,
      bnccCode: 'EF05MA08',
      topic: 'Fator Oculto (Trilha Base)',
      prompt: `Qual número multiplicado por ${a} resulta em ${prod} (${a} × ? = ${prod})?`,
      options,
      correctIndex,
      explanation: `Como ${a} × ${b} = ${prod}, o número oculto é ${b}!`,
    };
  },
  // 8. Multiplicação por 10 / 100
  (idx) => {
    const n = randInt(12, 65);
    const mult = pick([10, 100]);
    const ans = n * mult;
    const { options, correctIndex } = buildUniqueOptions(String(ans), [String(n * (mult === 10 ? 100 : 10)), String(ans + mult)]);
    return {
      id: `p-w6-7-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      worldId: 6,
      stageIndex: idx,
      bnccCode: 'EF05MA08',
      topic: 'Cálculo Rápido ×10/×100 (Trilha Base)',
      prompt: `Quanto é ${n} × ${mult}?`,
      options,
      correctIndex,
      explanation: `Basta acrescentar ${mult === 10 ? '1 zero' : '2 zeros'} ao final de ${n}: ${ans}!`,
    };
  },
];

const GENERATORS_BY_WORLD: Record<ValidWorldId, GenFn[]> = {
  1: GEN_W1,
  2: GEN_W2,
  3: GEN_W3,
  4: GEN_W4,
  5: GEN_W5,
  6: GEN_W6,
  7: GEN_W7,
  8: GEN_W8,
  9: GEN_W9,
  10: GEN_W10,
};

/**
 * Generates a dynamic parametric BNCC question strictly isolated to `worldId` (1..10).
 * Every single world has 8 distinct parametric generators.
 */
export function generateParametricQuestionForWorld(
  worldId: number,
  stageIndex: number,
  generatorSlot?: number
): MathQuestion {
  const validId = normalizeWorldId(worldId);
  const gens = GENERATORS_BY_WORLD[validId];
  const fn =
    generatorSlot !== undefined
      ? gens[((generatorSlot % gens.length) + gens.length) % gens.length]
      : pick(gens);
  return fn(stageIndex);
}
