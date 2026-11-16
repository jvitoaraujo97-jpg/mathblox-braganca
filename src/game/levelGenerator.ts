import { getQuestionsForMode } from '../data/questionEngine';
import { getDifficultyConfig, getWorldById } from '../data/worlds';
import { CoinDef, LevelData, PlatformDef, SignDef, TowerDifficulty } from '../types/game';

export function generateWorldLevel(
  worldId: number,
  difficultyId: TowerDifficulty = 'gold'
): LevelData {
  const world = getWorldById(worldId);
  const difficulty = getDifficultyConfig(difficultyId);
  const questions = getQuestionsForMode(worldId, 'obby', difficulty.stagesCount);

  const platforms: PlatformDef[] = [];
  const coins: CoinDef[] = [];
  const signs: SignDef[] = [];
  const stageCheckpoints: { stageIndex: number; x: number; y: number; z: number }[] = [];

  const totalStages = questions.length;
  const stageSpacingZ = 40;
  const speedMult = difficulty.speedMultiplier;

  for (let s = 0; s < totalStages; s++) {
    const q = questions[s];
    const baseY = s * 3.6;
    const zStart = -s * stageSpacingZ;
    const colA = world.platformColors[s % 3];
    const colB = world.platformColors[(s + 1) % 3];
    const colC = world.platformColors[(s + 2) % 3];

    // 1. Stage Starting / Checkpoint Landing
    platforms.push({
      id: `p-start-${s}`,
      kind: s === 0 ? 'start' : 'checkpoint',
      stageIndex: s,
      x: 0,
      y: baseY,
      z: zStart,
      w: s === 0 ? 8 : 6.8,
      h: 1.0,
      d: s === 0 ? 8 : 6.4,
      color: s === 0 ? '#10B981' : '#22C55E',
      solid: true,
    });

    stageCheckpoints.push({
      stageIndex: s,
      x: 0,
      y: baseY + 0.5,
      z: zStart,
    });

    // 2. Parkour Hop 1 (gentle weave)
    const dir = s % 2 === 0 ? 1 : -1;
    const hop1X = dir * (s >= 2 ? 1.8 : 0);
    platforms.push({
      id: `p-hop1-${s}`,
      kind: 'normal',
      stageIndex: s,
      x: hop1X,
      y: baseY + 0.5,
      z: zStart - 6.6,
      w: 3.4,
      h: 0.9,
      d: 3.2,
      color: colA,
      solid: true,
    });
    coins.push({
      id: `c-hop1-${s}`,
      x: hop1X,
      y: baseY + 2.0,
      z: zStart - 6.6,
      collected: false,
    });

    // 3. Parkour Hop 2 (moving block from stage 1+, scaled by difficulty speedMultiplier)
    const isMoving = s >= 1;
    const hop2X = isMoving ? 0 : -dir * 1.4;
    platforms.push({
      id: `p-hop2-${s}`,
      kind: isMoving ? 'moving' : 'normal',
      stageIndex: s,
      x: hop2X,
      y: baseY + 1.0,
      z: zStart - 11.8,
      w: 3.6,
      h: 0.9,
      d: 3.2,
      color: colB,
      solid: true,
      moveAxis: isMoving ? 'x' : undefined,
      moveRange: isMoving ? Math.min(2.8, (1.5 + s * 0.12) * Math.min(1.2, speedMult)) : undefined,
      moveSpeed: isMoving ? (1.15 + s * 0.08) * speedMult : undefined,
      movePhase: s * 0.9,
    });
    coins.push({
      id: `c-hop2-${s}`,
      x: hop2X,
      y: baseY + 2.5,
      z: zStart - 11.8,
      collected: false,
    });

    // 4. Parkour Hop 3 (step-up toward Arena, also moves on Gold difficulty for higher stages)
    const hop3Moving = difficulty.id === 'gold' && s >= 3;
    const hop3X = hop3Moving ? 0 : -dir * 1.2;
    platforms.push({
      id: `p-hop3-${s}`,
      kind: hop3Moving ? 'moving' : 'normal',
      stageIndex: s,
      x: hop3X,
      y: baseY + 1.4,
      z: zStart - 17.0,
      w: 3.6,
      h: 0.9,
      d: 3.2,
      color: colC,
      solid: true,
      moveAxis: hop3Moving ? 'x' : undefined,
      moveRange: hop3Moving ? 1.8 : undefined,
      moveSpeed: hop3Moving ? 1.4 * speedMult : undefined,
      movePhase: s * 1.4 + 1.2,
    });

    // 5. Question Arena (wide safe zone before the 3-choice bridge)
    platforms.push({
      id: `p-arena-${s}`,
      kind: 'arena',
      stageIndex: s,
      x: 0,
      y: baseY + 1.8,
      z: zStart - 22.8,
      w: 9.6,
      h: 1.0,
      d: 5.2,
      color: '#334155',
      solid: true,
    });

    // 3D Floating Question Sign facing player
    signs.push({
      id: `sign-${s}`,
      stageIndex: s,
      x: 0,
      y: baseY + 6.2,
      z: zStart - 25.0,
      topic: q.topic,
      prompt: q.prompt,
    });

    // 6. Ponte das 3 Escolhas (A = Azul, B = Amarela, C = Roxa)
    const answerColors = ['#2563EB', '#EAB308', '#9333EA'] as const;
    const letters = ['A', 'B', 'C'] as const;
    const xSlots = [-4.2, 0, 4.2];

    for (let slot = 0; slot < 3; slot++) {
      const typedSlot = slot as 0 | 1 | 2;
      platforms.push({
        id: `p-ans-${s}-${letters[slot]}`,
        kind: 'answer',
        stageIndex: s,
        x: xSlots[slot],
        y: baseY + 1.8,
        z: zStart - 29.0,
        w: 3.5,
        h: 1.0,
        d: 4.8,
        color: answerColors[slot],
        solid: true,
        answerSlot: typedSlot,
        answerLetter: letters[slot],
        answerLabel: q.options[slot],
        isTrap: slot !== q.correctIndex,
        triggered: false,
      });
    }

    // 7. Exit Bridge + Jump Pad (unlocked once stage question is answered!)
    platforms.push({
      id: `p-bridge-${s}`,
      kind: 'bridge',
      stageIndex: s,
      x: 0,
      y: baseY + 1.8,
      z: zStart - 33.4,
      w: 11.6,
      h: 0.8,
      d: 2.8,
      color: '#10B981',
      solid: false,
      unlockOnStage: s,
    });

    platforms.push({
      id: `p-jumppad-${s}`,
      kind: 'jumppad',
      stageIndex: s,
      x: 0,
      y: baseY + 2.3,
      z: zStart - 34.0,
      w: 3.2,
      h: 0.45,
      d: 2.2,
      color: '#22D3EE',
      solid: false,
      unlockOnStage: s,
    });
  }

  // Final Victory / Trophy Platform
  const finalZ = -totalStages * stageSpacingZ;
  const finalY = totalStages * 3.6;
  platforms.push({
    id: 'p-finish',
    kind: 'finish',
    stageIndex: totalStages,
    x: 0,
    y: finalY,
    z: finalZ,
    w: 10,
    h: 1.2,
    d: 10,
    color: '#FACC15',
    solid: true,
  });

  // Victory bonus coins arc
  for (let i = -1; i <= 1; i++) {
    coins.push({
      id: `c-finish-${i}`,
      x: i * 2.2,
      y: finalY + 2.2,
      z: finalZ,
      collected: false,
    });
  }

  return {
    world,
    difficulty,
    platforms,
    coins,
    signs,
    questions,
    stageCheckpoints,
  };
}
