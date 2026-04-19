import { CaseDrop } from '@prisma/client';
import prisma from '../config/database.js';
import { pickDropByRtu } from './dropProbabilityService.js';

type ResolveMode = 'BOT' | 'PVP';

type PickDebug = {
  chosenValue: number;
  picker: 'rtu' | 'inverse_value_fallback';
};

const round2 = (value: number) => Number(value.toFixed(2));

const pickBattleDrop = (
  drops: CaseDrop[],
  casePrice: number,
  rtuPercent: number,
  tokenPriceUsdt: number,
): { drop: CaseDrop; debug: PickDebug } => {
  if (drops.length <= 1) {
    return {
      drop: drops[0],
      debug: { chosenValue: round2(Number(drops[0]?.value || 0)), picker: 'rtu' },
    };
  }
  const result = pickDropByRtu(drops, casePrice, rtuPercent, tokenPriceUsdt);
  return {
    drop: result.drop,
    debug: {
      chosenValue: round2(Number(result.drop.value || 0)),
      picker: result.usedFallback ? 'inverse_value_fallback' : 'rtu',
    },
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

    const tp = Number(caseItem.tokenPrice || 0);
    const casePrice = Number(caseItem.price || 0);
    const rtuPercent = Number(caseItem.rtu || 0);
    const userPick = pickBattleDrop(caseItem.drops, casePrice, rtuPercent, tp);
    const opponentPick = pickBattleDrop(caseItem.drops, casePrice, rtuPercent, tp);

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
