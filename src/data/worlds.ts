import { DifficultyConfig, GradeLevel, TowerDifficulty, WorldConfig } from '../types/game';

/**
 * Ordem crescente de exibição nas interfaces (1º ao 9º Ano + Trilha Base).
 * REGRA SUPABASE EM PRODUÇÃO: os world_id existentes 1..6 são preservados integralmente:
 *   7 = 1º Ano | 8 = 2º Ano | 9 = 3º Ano | 10 = 4º Ano
 *   1 = 5º Ano | 2 = 6º Ano | 3 = 7º Ano | 4 = 8º Ano | 5 = 9º Ano | 6 = Trilha Base
 */
export const ORDERED_GRADES: GradeLevel[] = [
  '1º Ano',
  '2º Ano',
  '3º Ano',
  '4º Ano',
  '5º Ano',
  '6º Ano',
  '7º Ano',
  '8º Ano',
  '9º Ano',
  'Trilha Base',
];

export const WORLDS: WorldConfig[] = [
  {
    id: 7,
    grade: '1º Ano',
    title: 'Jardim dos Números',
    subtitle: 'Contagem até 100, soma/subtração até 20, formas planas, dias e cédulas',
    topics: ['Contagem até 100', 'Soma & Subtração até 20', 'Formas Planas', 'Cédulas R$'],
    skyColor: '#38BDF8',
    fogColor: '#BAE6FD',
    accentColor: '#22C55E',
    platformColors: ['#4ADE80', '#FACC15', '#38BDF8'],
    lavaColor: '#FF5500',
  },
  {
    id: 8,
    grade: '2º Ano',
    title: 'Parque das Dezenas',
    subtitle: 'Unidade/dezena/centena, adição até 100, dobro/metade, ×2 a ×5 e relógio',
    topics: ['Dezenas & Centenas', 'Dobro e Metade', 'Tabuada ×2 a ×5', 'Horas'],
    skyColor: '#2DD4BF',
    fogColor: '#99F6E4',
    accentColor: '#14B8A6',
    platformColors: ['#2DD4BF', '#FB923C', '#60A5FA'],
    lavaColor: '#FF4F00',
  },
  {
    id: 9,
    grade: '3º Ano',
    title: 'Vila da Tabuada',
    subtitle: 'Números até 1.000, tabuada completa (2 a 9), divisão exata, sólidos e troco',
    topics: ['Tabuada 2 a 9', 'Divisão Exata', 'Sólidos 3D', 'Horas & Troco'],
    skyColor: '#60A5FA',
    fogColor: '#BFDBFE',
    accentColor: '#3B82F6',
    platformColors: ['#60A5FA', '#F472B6', '#FBBF24'],
    lavaColor: '#FF4500',
  },
  {
    id: 10,
    grade: '4º Ano',
    title: 'Castelo das Frações',
    subtitle: 'Milhares, multiplicação por 2 algarismos, frações unitárias, R$ e perímetro',
    topics: ['Frações Unitárias', 'Decimais R$', 'Perímetro', 'Divisão & Milhares'],
    skyColor: '#818CF8',
    fogColor: '#C7D2FE',
    accentColor: '#6366F1',
    platformColors: ['#818CF8', '#34D399', '#F59E0B'],
    lavaColor: '#FF4800',
  },
  {
    id: 1,
    grade: '5º Ano',
    title: 'Torre das Operações',
    subtitle: 'Quatro operações, frações simples, medidas e perímetro',
    topics: ['Multiplicação', 'Divisão', 'Frações', 'Perímetro'],
    skyColor: '#4BA3F5',
    fogColor: '#8BC8FA',
    accentColor: '#0EA5E9',
    platformColors: ['#38BDF8', '#22C55E', '#FB923C'],
    lavaColor: '#FF5500',
  },
  {
    id: 2,
    grade: '6º Ano',
    title: 'Pico dos Múltiplos',
    subtitle: 'Expressões numéricas, MMC/MDC, frações, porcentagens e ângulos',
    topics: ['Expressões', 'MMC & MDC', 'Frações & %', 'Ângulos'],
    skyColor: '#38B2AC',
    fogColor: '#81E6D9',
    accentColor: '#10B981',
    platformColors: ['#34D399', '#3B82F6', '#FBBF24'],
    lavaColor: '#FF4500',
  },
  {
    id: 3,
    grade: '7º Ano',
    title: 'Cidadela dos Inteiros',
    subtitle: 'Números negativos, equações do 1º grau, razão e proporção',
    topics: ['Inteiros', 'Equações 1º Grau', 'Proporção', 'Triângulos'],
    skyColor: '#5B6BE1',
    fogColor: '#9AA5F5',
    accentColor: '#8B5CF6',
    platformColors: ['#A78BFA', '#06B6D4', '#F43F5E'],
    lavaColor: '#FF3B1F',
  },
  {
    id: 4,
    grade: '8º Ano',
    title: 'Observatório Algébrico',
    subtitle: 'Monômios, notação científica, sistemas, círculo e capacidade',
    topics: ['Álgebra', 'Notação Científica', 'Sistemas', 'Círculo & Área'],
    skyColor: '#0284C7',
    fogColor: '#7DD3FC',
    accentColor: '#06B6D4',
    platformColors: ['#22D3EE', '#6366F1', '#14B8A6'],
    lavaColor: '#FF4D00',
  },
  {
    id: 5,
    grade: '9º Ano',
    title: 'Pináculo de Bhaskara',
    subtitle: 'Equações do 2º grau, Pitágoras, Tales, funções e radicais',
    topics: ['Bhaskara', 'Pitágoras', 'Funções', 'Radicais'],
    skyColor: '#3B4C9B',
    fogColor: '#7E8CE0',
    accentColor: '#F59E0B',
    platformColors: ['#FBBF24', '#8B5CF6', '#EC4899'],
    lavaColor: '#FF3300',
  },
  {
    id: 6,
    grade: 'Trilha Base',
    title: 'Ilha dos Fundamentos',
    subtitle: 'Cálculo mental, sequência lógica, tabuada e raciocínio rápido',
    topics: ['Cálculo Mental', 'Tabuada', 'Lógica', 'Organização'],
    skyColor: '#3898EC',
    fogColor: '#90CDF4',
    accentColor: '#F97316',
    platformColors: ['#FB923C', '#2DD4BF', '#60A5FA'],
    lavaColor: '#FF5714',
  },
];

export const TOWER_DIFFICULTIES: DifficultyConfig[] = [
  {
    id: 'bronze',
    name: 'Torre Bronze',
    subtitle: 'Aquecimento · 5 Estágios · 10 BloxCoins por acerto + 50 Bônus Final',
    stagesCount: 5,
    speedMultiplier: 1.0,
    rewardMultiplier: 1.0,
    coinsPerQuestion: 10,
    completionBonusCoins: 50,
    badgeColor: 'text-amber-500',
    accentHex: '#D97706',
  },
  {
    id: 'silver',
    name: 'Torre Prata',
    subtitle: 'Intermediário · 8 Estágios · 20 BloxCoins por acerto + 50 Bônus Final',
    stagesCount: 8,
    speedMultiplier: 1.25,
    rewardMultiplier: 1.5,
    coinsPerQuestion: 20,
    completionBonusCoins: 50,
    badgeColor: 'text-slate-300',
    accentHex: '#94A3B8',
  },
  {
    id: 'gold',
    name: 'Torre Ouro',
    subtitle: 'Torre Completa · 10 Estágios · 35 BloxCoins por acerto + 50 Bônus Final',
    stagesCount: 10,
    speedMultiplier: 1.5,
    rewardMultiplier: 2.0,
    coinsPerQuestion: 35,
    completionBonusCoins: 50,
    badgeColor: 'text-yellow-400',
    accentHex: '#FACC15',
  },
];

export function getWorldById(worldId: number): WorldConfig {
  return WORLDS.find((w) => w.id === worldId) || WORLDS.find((w) => w.id === 1) || WORLDS[0];
}

export function getWorldIdForGrade(grade: GradeLevel): number {
  const found = WORLDS.find((w) => w.grade === grade);
  return found ? found.id : 1;
}

export function getDifficultyConfig(difficulty: TowerDifficulty): DifficultyConfig {
  return TOWER_DIFFICULTIES.find((d) => d.id === difficulty) || TOWER_DIFFICULTIES[0];
}
