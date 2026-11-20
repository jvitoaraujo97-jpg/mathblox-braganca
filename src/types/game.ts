export type GradeLevel =
  | '1º Ano'
  | '2º Ano'
  | '3º Ano'
  | '4º Ano'
  | '5º Ano'
  | '6º Ano'
  | '7º Ano'
  | '8º Ano'
  | '9º Ano'
  | 'Trilha Base';

export type HatId =
  | 'top_hat'
  | 'crown'
  | 'astronaut'
  | 'cyber_glasses'
  | 'wizard_hat'
  | 'racer_helmet'
  | 'ninja_bandana'
  | 'cowboy_hat'
  | 'cat_ears_neon'
  | 'ice_crown'
  | 'jetpack_wings'
  | 'golden_cape'
  | 'hero_cape'
  | 'nitro_twin'
  | 'legend_shield'
  | 'fire_aura'
  | 'lightning_aura'
  | 'speed_trail'
  | 'star_orbit'
  | 'shadow_aura'
  | 'champion_aura';

export type JerseyId =
  | 'remo'
  | 'paysandu'
  | 'bragantino_pa'
  | 'corinthians'
  | 'flamengo'
  | 'palmeiras'
  | 'sao_paulo'
  | 'santos'
  | 'vasco'
  | 'fluminense'
  | 'botafogo'
  | 'gremio'
  | 'internacional'
  | 'cruzeiro'
  | 'atletico_mg'
  | 'bahia'
  | 'fortaleza'
  | 'athletico_pr'
  | 'bragantino';

export type TowerDifficulty = 'bronze' | 'silver' | 'gold';

export type GameModeType =
  | 'obby'
  | 'survival'
  | 'turbo_race'
  | 'vehicle_rally'
  | 'penalty'
  | 'caete_boat';

export type MultiplayerGameType = 'kart' | 'duel';

export interface MultiplayerPlayerInfo {
  id: string;
  name: string;
  grade: GradeLevel;
  worldId: number;
  school: string;
  avatarColor: string;
  equippedHat: string | null;
  equippedJersey: string | null;
  equippedTitle?: string | null;
  ready: boolean;
  joinedAt: number;
}

export interface MultiplayerSessionConfig {
  mode: MultiplayerGameType;
  roomCode: string; // 'PUBLIC' or 4-digit code
  channelName: string;
  isPublic: boolean;
  players: MultiplayerPlayerInfo[];
  seed: number;
}

export type AvatarEmote = 'wave' | 'goal' | 'dance' | 'trophy' | 'salute' | null;

export type MovementStyle = 'classic' | 'ninja' | 'levitate' | 'champion';

export type ItemRarity = 'Comum' | 'Raro' | 'Épico' | 'Lendário';

export interface DifficultyConfig {
  id: TowerDifficulty;
  name: string;
  subtitle: string;
  stagesCount: number;
  speedMultiplier: number;
  rewardMultiplier: number;
  coinsPerQuestion: number;
  completionBonusCoins: number;
  badgeColor: string;
  accentHex: string;
}

export interface StudentProfile {
  id: string;
  name: string;
  grade: GradeLevel;
  worldId: number;
  school: string;
  pin: string; // PIN padrão inicial: "1234"
  xp: number;
  weeklyXp?: number;
  coins: number;
  questionsAnswered: number;
  questionsCorrect: number;
  bestStreak: number;
  unlockedItems: string[];
  equippedHat: string | null;
  equippedJersey?: string | null;
  equippedBack?: string | null;
  equippedAura?: string | null;
  avatarColor: string;
  movementStyle?: MovementStyle;
  auraPower?: number;
  equippedTitle?: string | null;
  unlockedTitles?: string[];
  updatedAt?: string;
}

export interface WorldConfig {
  id: number;
  grade: GradeLevel;
  title: string;
  subtitle: string;
  topics: string[];
  skyColor: string;
  fogColor: string;
  accentColor: string;
  platformColors: [string, string, string];
  lavaColor: string;
}

export interface MathQuestion {
  id: string;
  worldId: number;
  stageIndex: number;
  bnccCode?: string;
  topic: string;
  prompt: string;
  options: [string, string, string];
  correctIndex: 0 | 1 | 2;
  explanation: string;
}

export type ShopCategory = 'head' | 'back' | 'aura' | 'jersey' | 'color';

export interface ShopItem {
  id: string;
  name: string;
  category: ShopCategory;
  price: number;
  rarity?: ItemRarity;
  description: string;
  hatId?: HatId;
  jerseyId?: JerseyId;
  colorHex?: string;
  swatchColor: string;
}

export type PlatformKind =
  | 'start'
  | 'normal'
  | 'moving'
  | 'checkpoint'
  | 'arena'
  | 'answer'
  | 'jumppad'
  | 'bridge'
  | 'finish';

export interface PlatformDef {
  id: string;
  kind: PlatformKind;
  stageIndex: number;
  x: number;
  y: number;
  z: number;
  w: number; // X width
  h: number; // Y height
  d: number; // Z depth
  color: string;
  solid: boolean;
  // Moving platform properties
  moveAxis?: 'x' | 'y' | 'z';
  moveRange?: number;
  moveSpeed?: number;
  movePhase?: number;
  // Answer platform properties
  answerSlot?: 0 | 1 | 2;
  answerLetter?: 'A' | 'B' | 'C';
  answerLabel?: string;
  isTrap?: boolean;
  triggered?: boolean;
  // Bridge / JumpPad activation tied to stage answer completion
  unlockOnStage?: number;
}

export interface CoinDef {
  id: string;
  x: number;
  y: number;
  z: number;
  collected: boolean;
}

export interface SignDef {
  id: string;
  stageIndex: number;
  x: number;
  y: number;
  z: number;
  topic: string;
  prompt: string;
}

export interface LevelData {
  world: WorldConfig;
  difficulty: DifficultyConfig;
  platforms: PlatformDef[];
  coins: CoinDef[];
  signs: SignDef[];
  questions: MathQuestion[];
  stageCheckpoints: { stageIndex: number; x: number; y: number; z: number }[];
}

export interface TrapFeedback {
  stageIndex: number;
  question: MathQuestion;
  chosenLetter: 'A' | 'B' | 'C';
  chosenAnswer: string;
}

export interface GameHUDState {
  currentStage: number;
  totalStages: number;
  streak: number;
  speedBoostLeft: number;
  sessionXp: number;
  sessionCoins: number;
  sessionAnswered: number;
  sessionCorrect: number;
  activeQuestion: MathQuestion | null;
  completedStages: number[];
  victory: boolean;
}

export interface OnlinePlayerPresence {
  id: string;
  name: string;
  grade: GradeLevel;
  school: string;
  avatarColor: string;
  equippedHat: string | null;
  equippedJersey: string | null;
  equippedBack?: string | null;
  equippedAura?: string | null;
  equippedTitle?: string | null;
  movementStyle?: MovementStyle;
  auraPower?: number;
  isFarmingAura?: boolean;
  isDriving?: boolean;
  vehicleType?: string | null;
  drivingVehicleId?: string | null;
  x: number;
  y: number;
  z: number;
  rotY: number;
  isMoving: boolean;
  emote: AvatarEmote;
  emoteTimestamp: number;
  chatMessage: string | null;
  chatTimestamp: number;
  updatedAt: number;
}
