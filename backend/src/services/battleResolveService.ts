import { CaseDrop } from '@prisma/client';
import prisma from '../config/database.js';
import { getDynamicOpenRtuPercent } from './rtuPolicyService.js';

type ResolveMode = 'BOT' | 'PVP';

type LedgerState = {
  spent: number;
  issued: number;
};

type PickDebug = {
  currentSpent: number;
  currentIssued: number;
  nextSpent: number;
  openTargetRtu: number;
  targetIssuedAfterOpen: number;
  declaredAllowedAfterOpen: number;
  idealDrop: number;
  maxSafeDrop: number;
  chosenValue: number;
};

const round2 = (value: number) => Number(value.toFixed(2));

const pickBattleDynamicDrop = (
  drops: CaseDrop[],
  params: {
    casePriceDeltaUsdt: number;
    declaredRtuPercent: number;
    tokenPriceUsdt: number;
    ledger: LedgerState;
  }
): { drop: CaseDrop; debug: PickDebug } => {
  const sortedDrops = [...drops].sort((a, b) => Number(a.value) - Number(b.value));
  const currentSpent = Number(params.ledger.spent || 0);
  const currentIssued = Number(params.ledger.issued || 0);
  const nextSpent = currentSpent + Number(params.casePriceDeltaUsdt || 0);
  const openTargetRtu = getDynamicOpenRtuPercent(params.declaredRtuPercent);

  const targetIssuedAfterOpen =
    params.tokenPriceUsdt > 0 ? (nextSpent * (openTargetRtu / 100)) / params.tokenPriceUsdt : 0;
  const declaredAllowedAfterOpen =
    params.tokenPriceUsdt > 0 ? (nextSpent * (params.declaredRtuPercent / 100)) / params.tokenPriceUsdt : 0;

  const idealDrop = Math.max(0, targetIssuedAfterOpen - currentIssued);
  const maxSafeDrop = Math.max(0, declaredAllowedAfterOpen - currentIssued);
  const safeDrops =
    maxSafeDrop > 0
      ? sortedDrops.filter((drop) => Number(drop.value || 0) <= maxSafeDrop + 1e-9)
      : [];
  const candidates = safeDrops.length > 0 ? safeDrops : [sortedDrops[0]];
  const shouldBiasLower = currentIssued >= targetIssuedAfterOpen;
  const n = Math.max(1, candidates.length);
  const weights = candidates.map((drop, index) => {
    const value = Number(drop.value || 0);
    const distance = Math.abs(value - idealDrop);
    const base = 1 / (1 + distance);
    const rank = shouldBiasLower ? (n - index) / n : (index + 1) / n;
    return Math.max(1e-6, base * (1 + rank * 1.5));
  });

  const totalWeight = weights.reduce((acc, weight) => acc + weight, 0);
  let chosen = candidates[candidates.length - 1];
  if (Number.isFinite(totalWeight) && totalWeight > 0) {
    let random = Math.random() * totalWeight;
    for (let i = 0; i < candidates.length; i += 1) {
      random -= weights[i];
      if (random <= 0) {
        chosen = candidates[i];
        break;
      }
    }
  }

  return {
    drop: chosen,
    debug: {
      currentSpent: round2(currentSpent),
      currentIssued: round2(currentIssued),
      nextSpent: round2(nextSpent),
      openTargetRtu: round2(openTargetRtu),
      targetIssuedAfterOpen: round2(targetIssuedAfterOpen),
      declaredAllowedAfterOpen: round2(declaredAllowedAfterOpen),
      idealDrop: round2(idealDrop),
      maxSafeDrop: round2(maxSafeDrop),
      chosenValue: round2(Number(chosen.value || 0)),
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

  const ledgerState = new Map<string, LedgerState>();
  const rounds: Array<{
    caseId: string;
    caseName: string;
    token: string;
    userDrop: any;
    opponentDrop: any;
    userDebug: PickDebug;
    opponentDebug: PickDebug;
    stateAfter: LedgerState;
  }> = [];

  for (const caseItem of orderedCases) {
    if (!caseItem.drops.length || !caseItem.tokenPrice) {
      throw new Error(`Case ${caseItem.id} has no drops or token price`);
    }
    const tokenSymbol = caseItem.tokenTicker || caseItem.currency;
    const stateKey = `${caseItem.id}:${tokenSymbol}`;
    if (!ledgerState.has(stateKey)) {
      const ledger = await prisma.rtuLedger.findFirst({
        where: { caseId: caseItem.id, tokenSymbol },
        select: { totalSpentUsdt: true, totalTokenIssued: true },
      });
      ledgerState.set(stateKey, {
        spent: Number(ledger?.totalSpentUsdt || 0),
        issued: Number(ledger?.totalTokenIssued || 0),
      });
    }

    const state = ledgerState.get(stateKey)!;
    const userPick = pickBattleDynamicDrop(caseItem.drops, {
      casePriceDeltaUsdt: Number(caseItem.price || 0),
      declaredRtuPercent: Number(caseItem.rtu || 0),
      tokenPriceUsdt: Number(caseItem.tokenPrice || 0),
      ledger: state,
    });
    state.spent += Number(caseItem.price || 0);
    state.issued += Number(userPick.drop.value || 0);

    const opponentPriceDelta = mode === 'PVP' ? Number(caseItem.price || 0) : 0;
    const opponentPick = pickBattleDynamicDrop(caseItem.drops, {
      casePriceDeltaUsdt: opponentPriceDelta,
      declaredRtuPercent: Number(caseItem.rtu || 0),
      tokenPriceUsdt: Number(caseItem.tokenPrice || 0),
      ledger: state,
    });
    state.spent += opponentPriceDelta;
    state.issued += Number(opponentPick.drop.value || 0);

    rounds.push({
      caseId: caseItem.id,
      caseName: caseItem.name,
      token: tokenSymbol,
      userDrop: {
        ...userPick.drop,
        value: round2(Number(userPick.drop.value || 0)),
        caseId: caseItem.id,
      },
      opponentDrop: {
        ...opponentPick.drop,
        value: round2(Number(opponentPick.drop.value || 0)),
        caseId: caseItem.id,
      },
      userDebug: userPick.debug,
      opponentDebug: opponentPick.debug,
      stateAfter: {
        spent: round2(state.spent),
        issued: round2(state.issued),
      },
    });
  }

  return { mode, rounds };
};
