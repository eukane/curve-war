/**
 * 적 AI (탐색형). 로드맵 단계 1.
 *
 * 규칙으로 정한 행동 대신, 복제한 세계에서 후보 명령을 실제로 돌려 보고 점수가 가장 높은 것을 고른다.
 * 점수 가중치가 지도자의 성향이다. 같은 상황에서도 성향에 따라 다르게 행동한다.
 *
 * 공정성: 적은 우리 명령선과 병력을 정확히 모른다. 병력은 ±10%, 명령선은 ±15단위의 오차로 본다
 * (척후의 보고라고 가정). 오차는 (시드, 턴)으로 정해져 재현된다.
 *
 * 한계(알려진 단순화): 후보 생성은 "중앙 돌출"과 "방어 집중" 두 꼴로 한정된다. 후퇴, 양면 공격 같은 꼴은 없다.
 * 모든 수치는 임시다.
 */
import { TURN_DAYS, turnOf } from "./calendar";
import { AI_MAX_LEVY_SHARE_PER_TURN, AI_PUSH_DEPTH_UNITS, FRONT_POINTS } from "./constants";
import { Rng } from "./rng";
import { popOf, totalPop } from "./state";
import type { World } from "./state";
import { computePressure, disbandTroops, levyTroops, playerAreaHa, playerRegion, readySoldiers, rivalRegion, soldiersOf, totalAreaHa } from "./war";

export interface AiProfile {
  id: string;
  name: string;
  /** 플레이어가 알아볼 수 있는 한 줄 설명 */
  blurb: string;
  w: {
    /** 영토 1%p 얻을 때의 점수 */
    area: number;
    /** 아군 전사 100명당 감점 */
    ownCas: number;
    /** 적(우리) 전사 100명당 가점 */
    enemyCas: number;
    /** 아군 기아 사망 100명당 감점 */
    starve: number;
    /** 인구 1,000명 증가당 가점 */
    pop: number;
    /** 전투 가능 병력 1,000명당 가점 */
    kept: number;
  };
}

export const AI_PROFILES: AiProfile[] = [
  { id: "aggressor", name: "정복형", blurb: "영토를 가장 중요하게 본다. 피해를 감수하고 밀어붙인다.", w: { area: 3.0, ownCas: 0.3, enemyCas: 0.5, starve: 0.5, pop: 0.5, kept: 0.2 } },
  { id: "cautious", name: "신중형", blurb: "병력과 백성을 아낀다. 유리하지 않으면 지킨다.", w: { area: 1.0, ownCas: 1.4, enemyCas: 0.3, starve: 1.6, pop: 1.0, kept: 0.7 } },
  { id: "opportunist", name: "기회주의형", blurb: "균형을 보다가 약한 곳이 보이면 친다.", w: { area: 2.0, ownCas: 0.8, enemyCas: 0.6, starve: 1.0, pop: 0.8, kept: 0.4 } },
];

export function profileOf(id: string): AiProfile {
  return AI_PROFILES.find((p) => p.id === id) ?? AI_PROFILES[0]!;
}

/** 시드로 지도자 성향을 정한다 */
export function pickProfile(seed: number): string {
  return AI_PROFILES[Rng.fromParts(seed, 3).next() * AI_PROFILES.length | 0]!.id;
}

/** ai.ts가 세계 모듈에 거꾸로 의존하지 않도록 필요한 기능을 주입받는다 */
export interface AiDeps {
  clone: (w: World) => World;
  step: (w: World, days: number) => number;
}

interface Candidate {
  levyTarget: number;
  orders: number[];
  label: string;
}

/** 후보를 돌려 본 결과의 요약 (적 입장) */
export interface Outcome {
  /** 적이 얻은 영토 (%p) */
  rivalGainPct: number;
  ownCas: number;
  enemyCas: number;
  starve: number;
  popGain: number;
  kept: number;
  /** 플레이어의 수도가 함락되면 "rival", 적의 수도가 함락되면 "player" */
  winner: "rival" | "player" | null;
}

/** 성향의 가중치를 결과에 적용해 점수로 만든다. 같은 결과도 성향에 따라 선호가 갈린다. */
export function scoreOutcome(profile: AiProfile, o: Outcome): number {
  let score =
    profile.w.area * o.rivalGainPct -
    (profile.w.ownCas * o.ownCas) / 100 +
    (profile.w.enemyCas * o.enemyCas) / 100 -
    (profile.w.starve * o.starve) / 100 +
    (profile.w.pop * o.popGain) / 1000 +
    (profile.w.kept * o.kept) / 1000;
  if (o.winner === "rival") score += 60;
  if (o.winner === "player") score -= 60;
  return score;
}

/** 후보를 복제한 세계에서 돌려 점수를 낸다. (적 입장의 점수) */
function evaluate(w: World, cand: Candidate, deps: AiDeps, profile: AiProfile, perceivedPlayerOrders: number[], horizonDays: number): number {
  const c = deps.clone(w);
  c.eventsEnabled = false;
  c.pending = null;
  c.weatherOverride = () => 1.0;
  const war = c.war!;
  war.expected = true;
  war.ai.mode = "scripted"; // 다음 턴의 적은 고정 규칙으로 근사 (재귀를 막고 계산을 줄인다)
  war.ai.skipPlanOnce = true; // 이번 턴 시작에는 후보를 적용하므로 계획을 건너뛴다
  war.orders.player = [...perceivedPlayerOrders];
  const R = rivalRegion(c);
  const P = playerRegion(c);
  // 후보 적용
  const cur = soldiersOf(R);
  if (cand.levyTarget > cur) levyTroops(R, Math.min(cand.levyTarget - cur, AI_MAX_LEVY_SHARE_PER_TURN * popOf(R, "farmer")), c.day);
  else if (cand.levyTarget < cur) disbandTroops(R, Math.min(cur - cand.levyTarget, AI_MAX_LEVY_SHARE_PER_TURN * popOf(R, "farmer")), c.day);
  war.orders.rival = [...cand.orders];

  const areaBefore = playerAreaHa(war.front);
  const popBefore = totalPop(R);
  const starveBefore = R.starvationDeathsTotal;
  const reportsBefore = war.reports.length;
  deps.step(c, horizonDays);

  const total = totalAreaHa();
  const rep = war.reports.slice(reportsBefore);
  void P;
  return scoreOutcome(profile, {
    rivalGainPct: ((areaBefore - playerAreaHa(war.front)) / total) * 100, // 우리 땅이 줄면 적이 얻은 것
    ownCas: rep.reduce((a, r) => a + r.rivalCasualties, 0),
    enemyCas: rep.reduce((a, r) => a + r.playerCasualties, 0),
    starve: R.starvationDeathsTotal - starveBefore,
    popGain: totalPop(R) - popBefore,
    kept: readySoldiers(R, c.day),
    winner: war.result === "loss" ? "rival" : war.result === "win" ? "player" : null,
  });
}

/**
 * 턴 시작에 적이 병력과 명령선을 정한다.
 * 후보: 병력 목표 3가지 × 명령선 계획 5가지(방어 집중, 중앙 돌출 2곳 × 깊이 2). 지평은 두 턴(180일).
 */
export function planAi(w: World, deps: AiDeps, opts: { horizonTurns?: number } = {}): void {
  const war = w.war!;
  const profile = profileOf(war.ai.profile);
  const R = rivalRegion(w);
  const P = playerRegion(w);
  const turn = turnOf(w.day);
  const rng = Rng.fromParts(w.seed, 4, turn.index);

  // 정보의 한계: 척후가 전한 것
  const noise = 1 + (rng.next() * 2 - 1) * 0.1;
  const perceivedThreat = soldiersOf(P) * noise;
  const perceivedOrders = war.orders.player.map((o) => o + (rng.next() * 2 - 1) * 15);

  const x = war.front;
  const harvestDay = turn.year * 360 + 240;
  const harvestTurn = harvestDay >= turn.startDay && harvestDay < turn.endDay;

  // 병력 후보
  const base = (harvestTurn ? war.ai.harvestLevyShare : war.ai.levyShare) * totalPop(R);
  const ratios = harvestTurn ? [0.4, 0.6, 0.9] : [0.8, 1.05, 1.4];
  const levyTargets = [...new Set(ratios.map((r) => Math.round(Math.max(base, r * perceivedThreat))))];

  // 명령선 후보
  const defense = x.map((xi, i) => Math.min(AI_PUSH_DEPTH_UNITS, Math.max(0, perceivedOrders[i]! - xi)));
  const withDefense = (extra: number[]) => x.map((xi, i) => Math.max(8, xi - Math.max(extra[i] ?? 0, defense[i]!)));
  const plans: { orders: number[]; label: string }[] = [{ orders: withDefense([]), label: "방어" }];
  if (w.day >= war.ai.startDay) {
    const pr = computePressure(w);
    // 적 입장에서 국지 우위가 큰 곳 두 곳 (정보 오차를 위해 약간의 잡음)
    const adv = pr.net.map((n, i) => ({ i, a: -n * (1 + (rng.next() * 2 - 1) * 0.1) }));
    const centers: number[] = [];
    for (const { i } of adv.filter((v) => v.i >= 2 && v.i < FRONT_POINTS - 2).sort((a, b) => b.a - a.a)) {
      if (centers.every((c) => Math.abs(c - i) >= 4)) centers.push(i);
      if (centers.length === 2) break;
    }
    for (const c of centers) {
      for (const f of [0.5, 1.0]) {
        const push = x.map((_, i) => AI_PUSH_DEPTH_UNITS * f * Math.exp(-(((i - c) / 2.2) ** 2)));
        plans.push({ orders: withDefense(push), label: `돌출 ${c}번 ${f}` });
      }
    }
  }

  const horizon = TURN_DAYS * (opts.horizonTurns ?? 2);
  let best: { score: number; cand: Candidate } | null = null;
  for (const levyTarget of levyTargets) {
    for (const p of plans) {
      const cand: Candidate = { levyTarget, orders: p.orders, label: p.label };
      const score = evaluate(w, cand, deps, profile, perceivedOrders, horizon);
      if (!best || score > best.score) best = { score, cand };
    }
  }

  // 선택 적용
  const pick = best!.cand;
  const cur = soldiersOf(R);
  const cap = AI_MAX_LEVY_SHARE_PER_TURN * popOf(R, "farmer");
  if (pick.levyTarget > cur) levyTroops(R, Math.min(pick.levyTarget - cur, cap), w.day);
  else if (pick.levyTarget < cur) disbandTroops(R, Math.min(cur - pick.levyTarget, cap), w.day);
  war.orders.rival = [...pick.orders];
}
