import { DifficultyConfig, GradeLevel, TowerDifficulty, WorldConfig } from '../types/game';

export const WORLDS: WorldConfig[] = [
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
    subtitle: 'Potências, MMC/MDC, decimais, porcentagens e ângulos',
    topics: ['MMC & MDC', 'Decimais', 'Porcentagem', 'Potenciação'],
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
    topics: ['Inteiros', 'Equações 1º Grau', 'Proporção', 'Área'],
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
    subtitle: 'Monômios, produtos notáveis, sistemas e ângulos em polígonos',
    topics: ['Álgebra', 'Produtos Notáveis', 'Sistemas', 'Geometria'],
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
    subtitle: 'Equações do 2º grau, Pitágoras, funções e trigonometria básica',
    topics: ['Bhaskara', 'Pitágoras', 'Funções', 'Radiciação'],
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
  return WORLDS.find((w) => w.id === worldId) || WORLDS[0];
}

export function getWorldIdForGrade(grade: GradeLevel): number {
  const found = WORLDS.find((w) => w.grade === grade);
  return found ? found.id : 1;
}

export function getDifficultyConfig(difficulty: TowerDifficulty): DifficultyConfig {
  return TOWER_DIFFICULTIES.find((d) => d.id === difficulty) || TOWER_DIFFICULTIES[0];
}
