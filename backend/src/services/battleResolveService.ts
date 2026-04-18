import { CaseDrop } from '@prisma/client';
import prisma from '../config/database.js';

type ResolveMode = 'BOT' | 'PVP';

type PickDebug = {
  chosenValue: number;
};

const round2 = (value: number) => Number(value.toFixed(2));

// RTU-based pickBattleDynamicDrop disabled (RTU freeze).
// Replaced with inverse-value weighted random pick.
const pickBattleInverseValue = (
  drops: CaseDrop[]
): { drop: CaseDrop; debug: PickDebug } => {
  if (drops.length <= 1) {
    return { drop: drops[0], debug: { chosenValue: round2(Number(drops[0]?.value || 0)) } };
  }

  const weights = drops.map((drop) => {
    const v = Number(drop.value || 0);
    return v > 0 ? 1 / v : 1;
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let chosen = drops[drops.length - 1];
  if (Number.isFinite(totalWeight) && totalWeight > 0) {
    let random = Math.random() * totalWeight;
    for (let i = 0; i < drops.length; i += 1) {
      random -= weights[i];
      if (random <= 0) {
        chosen = drops[i];
        break;
      }
    }
  }

  return {
    drop: chosen,
    debug: { chosenValue: round2(Number(chosen.value || 0)) },
  };
};

export const resolveBattleDrops = async (caseIds: string[], mode: ResolveMode) => {
  const rows = await prisma.case.findMany({
    where: { id: { in: caseIds }, isActive: true },
    include: { drops: true },
  });
  const byId = new Map(rows.map((item) => [item.id, item]));
  const orderedCases = caseIds.map((id) => byId.get(id)).filter(Boolean) as typeof rows;
  if (orderedCases.length !== caseIds.length) {
    throw new Error('Some cases are not available');
  }

  const rounds: Array<{
    caseId: string;
    caseName: string;
    token: string;
    tokenPrice: number;
    userDrop: any;
    opponentDrop: any;
    userDebug: PickDebug;
    opponentDebug: PickDebug;
  }> = [];

  for (const caseItem of orderedCases) {
    if (!caseItem.drops.length || !caseItem.tokenPrice) {
      throw new Error(`Case ${caseItem.id} has no drops or token price`);
    }
    const tokenSymbol = caseItem.tokenTicker || caseItem.currency;

    const userPick = pickBattleInverseValue(caseItem.drops);
    const opponentPick = pickBattleInverseValue(caseItem.drops);

    const tp = Number(caseItem.tokenPrice || 0);
    const userVal = round2(Number(userPick.drop.value || 0));
    const oppVal = round2(Number(opponentPick.drop.value || 0));

    rounds.push({
      caseId: caseItem.id,
      caseName: caseItem.name,
      token: tokenSymbol,
      tokenPrice: tp,
      userDrop: {
        ...userPick.drop,
        value: userVal,
        caseId: caseItem.id,
        tokenPrice: tp,
        valueUsdt: round2(userVal * tp),
      },
      opponentDrop: {
        ...opponentPick.drop,
        value: oppVal,
        caseId: caseItem.id,
        tokenPrice: tp,
        valueUsdt: round2(oppVal * tp),
      },
      userDebug: userPick.debug,
      opponentDebug: opponentPick.debug,
    });
  }

  return { mode, rounds };
};
