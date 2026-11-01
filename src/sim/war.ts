/**
 * 전쟁 층: 곡선 전선, 병력 밀도, 압력, 사상, 영토 이동, 승패, 적 AI.
 *
 * 설계 결정(docs/DESIGN.md의 미결 사항을 이렇게 푼다):
 * - 전선은 y를 고정하고 x만 움직이는 제어점의 스플라인이다. x가 y의 함수이므로 곡선이 스스로 교차할 수 없다.
 *   대신 돌출부는 만들 수 있지만 안쪽으로 말려 들어가는 포위 지형은 표현하지 못한다(알려진 단순화).
 * - 영토 = 전선 왼쪽은 플레이어, 오른쪽은 적. 넓이는 곡선 아래 적분.
 * - 주민·경지는 땅에 붙어 있어서, 땅이 넘어가면 넓이 비율만큼 함께 넘어간다.
 */
import {
  AI_MAX_LEVY_SHARE_PER_TURN,
  AI_PUSH_DEPTH_UNITS,
  CASUALTY_RATE_PER_DAY,
  FOCUS_MAX_BONUS,
  FOCUS_REF_UNITS,
  FRONT_POINTS,
  HARVEST_DAY_OF_YEAR,
  HA_PER_UNIT2,
  LEVY_TRAINING_DAYS,
  LUCK_SPREAD,
  MAP_H,
  MAP_W,
  MAX_LEVY_SHARE_OF_FARMERS,
  PRESSURE_SCALE_PER_KM,
  SOWING_DAY_OF_YEAR,
  SUPPLY_FALLOFF_UNITS,
  SUPPLY_MIN,
  UNIT_KM,
  V_MAX_KM_PER_DAY,
  V_RETREAT_UNITS,
} from "./constants";
import { TURN_DAYS, dateOf, turnOf } from "./calendar";
import { Rng } from "./rng";
import { popOf, totalPop } from "./state";
import type { Realm, Region, Stratum, TurnReport, WarState, World } from "./state";

/** 구간 이름: 위에서 아래로 북부, 중부, 남부 */
export function sectorName(i: number): string {
  return `${i < 6 ? "북부" : i < 12 ? "중부" : "남부"} ${i + 1}번`;
}

export const frontY = (i: number): number => (i * MAP_H) / (FRONT_POINTS - 1);

/** 시작 전선. 곧은 선이 아니라 완만하게 굽은 선이다 (플레이어와 적 면적이 같도록 평균을 500에 둔다). */
export function initialFront(): number[] {
  return Array.from({ length: FRONT_POINTS }, (_, i) => 500 + 22 * Math.sin(i * 0.85));
}

/* ------------------------------------------------------------------ */
/* 기하                                                                */
/* ------------------------------------------------------------------ */

/** Catmull-Rom(균일)으로 x(y)를 촘촘히 샘플링한다. y가 균등 간격이라 x는 y의 함수로 남는다. */
export function sampleFront(front: number[], sub = 8): { x: number; y: number }[] {
  const n = front.length;
  const g = (i: number) => front[Math.max(0, Math.min(n - 1, i))]!;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
    for (let k = 0; k < sub; k++) {
      const t = k / sub;
      const t2 = t * t, t3 = t2 * t;
      const x = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
      out.push({ x, y: frontY(i) + (t * MAP_H) / (n - 1) });
    }
  }
  out.push({ x: g(n - 1), y: MAP_H });
  return out;
}

/** 전선 왼쪽(플레이어) 넓이. 단위: ha */
export function playerAreaHa(front: number[]): number {
  const pts = sampleFront(front);
  let a = 0;
  for (let i = 0; i < pts.length - 1; i++) a += ((pts[i]!.x + pts[i + 1]!.x) / 2) * (pts[i + 1]!.y - pts[i]!.y);
  return a * HA_PER_UNIT2;
}

export const totalAreaHa = (): number => MAP_W * MAP_H * HA_PER_UNIT2;

/** 구간(점 i와 i+1 사이)의 길이. 단위: km */
export function segmentLengthsKm(front: number[]): number[] {
  const pts = sampleFront(front);
  const sub = (pts.length - 1) / (front.length - 1);
  const out: number[] = [];
  for (let s = 0; s < front.length - 1; s++) {
    let len = 0;
    for (let k = 0; k < sub; k++) {
      const a = pts[s * sub + k]!, b = pts[s * sub + k + 1]!;
      len += Math.hypot(b.x - a.x, b.y - a.y);
    }
    out.push(len * UNIT_KM);
  }
  return out;
}

export function frontLengthKm(front: number[]): number {
  return segmentLengthsKm(front).reduce((a, b) => a + b, 0);
}

/** 점마다 맡는 전선 길이. 단위: km */
export function frontageKm(front: number[]): number[] {
  const seg = segmentLengthsKm(front);
  return front.map((_, i) => {
    const a = i > 0 ? seg[i - 1]! : 0;
    const b = i < seg.length ? seg[i]! : 0;
    return (a + b) / 2;
  });
}

/** y 위치에서 전선의 x */
export function frontXAt(front: number[], y: number): number {
  const pts = sampleFront(front);
  for (let i = 0; i < pts.length - 1; i++) {
    if (y <= pts[i + 1]!.y + 1e-9) {
      const t = (y - pts[i]!.y) / Math.max(1e-9, pts[i + 1]!.y - pts[i]!.y);
      return pts[i]!.x + t * (pts[i + 1]!.x - pts[i]!.x);
    }
  }
  return pts[pts.length - 1]!.x;
}

/* ------------------------------------------------------------------ */
/* 마을: 주민이 땅에 붙어 있다는 규칙(면적 비례 이전)을 눈에 보이게 하는 고정된 지점들         */
/* ------------------------------------------------------------------ */

export interface Village {
  x: number;
  y: number;
}

/** 지도에 흩어진 마을. 시드와 무관하게 항상 같은 배치다(14 × 10 격자에 흔들림을 준 것). */
export const VILLAGES: Village[] = (() => {
  const rng = new Rng(777);
  const out: Village[] = [];
  const cols = 14, rows = 10;
  for (let cx = 0; cx < cols; cx++) {
    for (let ry = 0; ry < rows; ry++) {
      const x = ((cx + 0.5 + (rng.next() - 0.5) * 0.7) * MAP_W) / cols;
      const y = ((ry + 0.5 + (rng.next() - 0.5) * 0.7) * MAP_H) / rows;
      // 수도 근처는 비워 둔다
      out.push({ x, y });
    }
  }
  return out;
})();

/** 전선 왼쪽(플레이어 쪽)에 있는 마을 수 */
export function playerVillageCount(front: number[]): number {
  const pts = sampleFront(front);
  const xAt = (y: number): number => {
    const idx = Math.min(pts.length - 2, Math.max(0, Math.floor((y / MAP_H) * (pts.length - 1))));
    const a = pts[idx]!, b = pts[idx + 1]!;
    const t = (y - a.y) / Math.max(1e-9, b.y - a.y);
    return a.x + t * (b.x - a.x);
  };
  return VILLAGES.filter((v) => v.x < xAt(v.y)).length;
}

/* ------------------------------------------------------------------ */
/* 병력과 압력                                                         */
/* ------------------------------------------------------------------ */

const regionOf = (w: World, id: number): Region => w.regions.find((r) => r.id === id)!;
const playerRegion = (w: World): Region => regionOf(w, w.war!.playerRegionId);
const rivalRegion = (w: World): Region => regionOf(w, w.war!.rivalRegionId);

export const soldiersOf = (r: Region): number => popOf(r, "soldier");

/** 지금 훈련 중인 병사 수 */
export function trainingCount(r: Region, day: number): number {
  return r.trainees.reduce((a, t) => a + (t.readyDay > day ? t.n : 0), 0);
}

/** 싸울 수 있는 병사: 훈련을 마친 병사만 센다 */
export function readySoldiers(r: Region, day: number): number {
  return Math.max(0, soldiersOf(r) - trainingCount(r, day));
}

/** 유효 병력: 훈련을 마친 병사 × (1 − 지난달 식량 부족률) × 전황 변수. 굶는 군대는 약하다. */
export function effectiveSoldiers(r: Region, day: number, luck = 1): number {
  return readySoldiers(r, day) * (1 - Math.min(1, Math.max(0, r.lastDeficit))) * luck;
}

/**
 * 전황 변수: 턴마다 각 세력의 전투력에 곱해지는 값. 지휘, 사기, 날씨, 정보의 우연을 한 숫자로 줄인 것이다.
 * 범위 ±LUCK_SPREAD. (시드, 턴, 세력)만으로 정해져 재현된다. 플레이어는 이번 턴에 얼마인지 미리 알 수 없다.
 */
export function turnLuck(w: World, realm: Realm): number {
  if (w.war?.expected) return 1;
  const rng = Rng.fromParts(w.seed, 2, turnOf(w.day).index, realm === "player" ? 1 : 2);
  return 1 + LUCK_SPREAD * (rng.next() * 2 - 1);
}

/** 명령선이 현재 전선보다 앞서 있을수록 그 구간에 병력을 더 몰아준다. */
export function focusWeights(front: number[], orders: number[], realm: Realm): number[] {
  return front.map((x, i) => {
    const ahead = realm === "player" ? orders[i]! - x : x - orders[i]!;
    return 1 + Math.min(FOCUS_MAX_BONUS, Math.max(0, ahead / FOCUS_REF_UNITS));
  });
}

/** 점마다 보급 배율. 자기 수도에서 멀수록 약하다. */
export function supplyMultipliers(front: number[], capitalX: number): number[] {
  return front.map((x) => Math.max(SUPPLY_MIN, 1 - Math.abs(x - capitalX) / SUPPLY_FALLOFF_UNITS));
}

export interface Pressure {
  frontage: number[];
  playerDensity: number[];
  rivalDensity: number[];
  /** 점마다 플레이어 밀도 - 적 밀도. 단위: 명/km */
  net: number[];
  /** 힘으로만 정해지는 하루 이동(지도 단위, 양수 = 오른쪽). 명령 제한을 적용하기 전 */
  force: number[];
}

/**
 * 점마다 밀도와 압력을 구한다. `withLuck`이 참일 때만 이번 턴의 전황 변수를 곱한다.
 * 화면에 보여 주는 값은 변수를 모르는 상태여야 하므로 기본값은 거짓이다.
 */
export function computePressure(w: World, withLuck = false): Pressure {
  const war = w.war!;
  const frontage = frontageKm(war.front);
  const wP = focusWeights(war.front, war.orders.player, "player");
  const wR = focusWeights(war.front, war.orders.rival, "rival");
  // 병력은 전선 길이와 집중 가중치에 비례해 배치한다: 점 i의 병력 = S × (w_i × 길이_i) / Σ(w × 길이).
  // 따라서 가중치가 같으면 밀도는 어디서나 S / 전체 길이로 같고, 전선이 길어지면 밀도가 떨어진다.
  const sP = wP.reduce((a, w, i) => a + w * frontage[i]!, 0);
  const sR = wR.reduce((a, w, i) => a + w * frontage[i]!, 0);
  const effP = effectiveSoldiers(playerRegion(w), w.day, withLuck ? turnLuck(w, "player") : 1);
  const effR = effectiveSoldiers(rivalRegion(w), w.day, withLuck ? turnLuck(w, "rival") : 1);
  const supP = supplyMultipliers(war.front, war.capitals.player.x);
  const supR = supplyMultipliers(war.front, war.capitals.rival.x);
  const playerDensity = frontage.map((_, i) => ((effP * wP[i]!) / sP) * supP[i]!);
  const rivalDensity = frontage.map((_, i) => ((effR * wR[i]!) / sR) * supR[i]!);
  const net = playerDensity.map((d, i) => d - rivalDensity[i]!);
  const vmaxUnits = V_MAX_KM_PER_DAY / UNIT_KM;
  const force = net.map((n) => vmaxUnits * Math.tanh(n / PRESSURE_SCALE_PER_KM));
  return { frontage, playerDensity, rivalDensity, net, force };
}

/** 명령선과 힘을 합쳐 실제 하루 이동을 구한다. */
export function dailyMoves(w: World, p: Pressure): number[] {
  const war = w.war!;
  return war.front.map((x, i) => {
    let move = p.force[i]!;
    const oP = war.orders.player[i]!;
    const oR = war.orders.rival[i]!;
    if (move > 0) move = Math.min(move, Math.max(0, oP - x)); // 플레이어는 명령선 너머로 밀고 나가지 않는다
    else if (move < 0) move = Math.max(move, -Math.max(0, x - oR)); // 적도 마찬가지
    // 자발적 후퇴는 플레이어만 한다. 적의 명령선이 전선 뒤에 있다는 것은 "그 선까지 되찾겠다"는 뜻이지,
    // 우리가 물러나서 생긴 땅을 되돌려 주겠다는 뜻이 아니다.
    if (oP < x - 0.5) move = Math.min(move, -Math.min(V_RETREAT_UNITS, x - oP));
    return move;
  });
}

/* ------------------------------------------------------------------ */
/* 땅과 사람의 이동                                                    */
/* ------------------------------------------------------------------ */

/** from의 땅 fraction만큼(주민·경지·개간지·파종지)을 to로 넘긴다. */
export function transferLand(from: Region, to: Region, fraction: number): void {
  if (fraction <= 0) return;
  const f = Math.min(1, fraction);
  for (const c of from.cohorts) {
    if (c.stratum === "soldier") continue;
    const moved = c.pop * f;
    c.pop -= moved;
    let dest = to.cohorts.find((x) => x.stratum === c.stratum);
    if (!dest) {
      dest = { stratum: c.stratum, pop: 0 };
      to.cohorts.push(dest);
    }
    dest.pop += moved;
  }
  const arable = from.arableHa * f;
  to.soil = (to.soil * to.arableHa + from.soil * arable) / Math.max(1e-9, to.arableHa + arable);
  from.arableHa -= arable;
  to.arableHa += arable;
  const clr = from.clearableHa * f;
  from.clearableHa -= clr;
  to.clearableHa += clr;
  const sown = from.sownHa * f;
  from.sownHa -= sown;
  to.sownHa += sown;
}

/* ------------------------------------------------------------------ */
/* 병력 조달                                                           */
/* ------------------------------------------------------------------ */

function ensureCohort(r: Region, stratum: Stratum) {
  let c = r.cohorts.find((x) => x.stratum === stratum);
  if (!c) {
    c = { stratum, pop: 0 };
    r.cohorts.push(c);
  }
  return c;
}

/**
 * 농민 n명을 병사로 징집한다. 농민은 곧바로 농사에서 빠지지만 병사는 LEVY_TRAINING_DAYS일 동안
 * 훈련 중이라 싸우지 못한다(곡식은 먹는다). 잔류 농민은 그만큼 줄어 일손이 준다.
 */
export function levyTroops(r: Region, n: number, day: number): number {
  const farmers = ensureCohort(r, "farmer");
  const soldiers = ensureCohort(r, "soldier");
  const cap = (farmers.pop + soldiers.pop) * MAX_LEVY_SHARE_OF_FARMERS - soldiers.pop;
  const take = Math.max(0, Math.min(n, farmers.pop - 1, cap));
  if (take <= 0) return 0;
  farmers.pop -= take;
  soldiers.pop += take;
  r.trainees.push({ readyDay: day + LEVY_TRAINING_DAYS, n: take });
  return take;
}

/**
 * 병사 n명을 해산해 농민으로 돌려보낸다. 훈련 중인 병사부터(가장 최근 징집분부터) 돌려보내므로,
 * 방금 한 징집은 곧바로 취소할 수 있다.
 */
export function disbandTroops(r: Region, n: number, day: number): number {
  const farmers = ensureCohort(r, "farmer");
  const soldiers = ensureCohort(r, "soldier");
  let remaining = Math.max(0, Math.min(n, soldiers.pop));
  const give = remaining;
  for (let i = r.trainees.length - 1; i >= 0 && remaining > 0; i--) {
    const t = r.trainees[i]!;
    if (t.readyDay <= day) continue;
    const take = Math.min(t.n, remaining);
    t.n -= take;
    remaining -= take;
  }
  r.trainees = r.trainees.filter((t) => t.n > 1e-9 && t.readyDay > day);
  soldiers.pop -= give;
  farmers.pop += give;
  return give;
}

/* ------------------------------------------------------------------ */
/* 하루 진행                                                           */
/* ------------------------------------------------------------------ */

export interface WarDayResult {
  moves: number[];
  playerCasualties: number;
  rivalCasualties: number;
}

export function stepWarDay(w: World): void {
  const war = w.war;
  if (!war || war.result) return;
  const P = playerRegion(w);
  const R = rivalRegion(w);

  P.trainees = P.trainees.filter((t) => t.readyDay > w.day);
  R.trainees = R.trainees.filter((t) => t.readyDay > w.day);
  const pr = computePressure(w, true);
  const moves = dailyMoves(w, pr);
  const areaBefore = playerAreaHa(war.front);
  const effP = effectiveSoldiers(P, w.day, turnLuck(w, "player"));
  const effR = effectiveSoldiers(R, w.day, turnLuck(w, "rival"));

  for (let i = 0; i < war.front.length; i++) {
    war.front[i] = Math.min(MAP_W - 8, Math.max(8, war.front[i]! + moves[i]!));
  }

  // 사상: 란체스터 제곱법칙 형태. 상대 유효 병력에 비례한다.
  const lossP = Math.min(readySoldiers(P, w.day), CASUALTY_RATE_PER_DAY * effR);
  const lossR = Math.min(readySoldiers(R, w.day), CASUALTY_RATE_PER_DAY * effP);
  ensureCohort(P, "soldier").pop -= lossP;
  ensureCohort(R, "soldier").pop -= lossR;
  war.turnStart.playerCasualties += lossP;
  war.turnStart.rivalCasualties += lossR;

  // 땅의 이동
  const areaAfter = playerAreaHa(war.front);
  const d = areaAfter - areaBefore;
  if (d > 0) transferLand(R, P, d / (totalAreaHa() - areaBefore));
  else if (d < 0) transferLand(P, R, -d / areaBefore);

  // 승패
  const capP = war.capitals.player;
  const capR = war.capitals.rival;
  if (frontXAt(war.front, capR.y) >= capR.x) war.result = "win";
  else if (frontXAt(war.front, capP.y) <= capP.x) war.result = "loss";
}

/* ------------------------------------------------------------------ */
/* 턴 보고                                                             */
/* ------------------------------------------------------------------ */

export function beginTurn(w: World): void {
  const war = w.war!;
  war.turnStart = {
    day: w.day,
    playerAreaHa: playerAreaHa(war.front),
    playerVillages: playerVillageCount(war.front),
    playerSoldiers: soldiersOf(playerRegion(w)),
    rivalSoldiers: soldiersOf(rivalRegion(w)),
    front: [...war.front],
    playerCasualties: 0,
    rivalCasualties: 0,
    pop: totalPop(playerRegion(w)),
  };
}

export function endTurn(w: World): TurnReport {
  const war = w.war!;
  const ms = war.turnStart;
  const P = playerRegion(w);
  const turn = turnOf(ms.day);
  let advI = -1, adv = 0, retI = -1, ret = 0;
  war.front.forEach((x, i) => {
    const d = x - ms.front[i]!;
    if (d > adv) {
      adv = d;
      advI = i;
    }
    if (-d > ret) {
      ret = -d;
      retI = i;
    }
  });
  // 이 턴에 파종일이나 수확일이 있었는가
  const yearStart = turn.year * 360;
  const sowDay = yearStart + SOWING_DAY_OF_YEAR;
  const harvestDay = yearStart + HARVEST_DAY_OF_YEAR;
  const sowIn = sowDay >= ms.day && sowDay < w.day;
  const harvestIn = harvestDay >= ms.day && harvestDay < w.day;
  const sowTerm = P.lastSowing?.terms.find((t) => t.label === "한계 요인");
  const hv = P.lastHarvest;
  const report: TurnReport = {
    day: w.day,
    turnIndex: turn.index,
    year: turn.year,
    season: turn.season,
    popStart: ms.pop,
    popEnd: totalPop(P),
    sowing: sowIn && P.lastSowing ? { sownHa: P.lastSowing.value, arableHa: P.arableHa, limit: sowTerm?.note ?? "" } : null,
    harvest:
      harvestIn && hv
        ? { netKg: hv.value, weather: hv.terms.find((t) => t.label === "기상")?.value ?? 1, fraction: P.lastHarvestFraction ?? 1 }
        : null,
    playerAreaHaDelta: playerAreaHa(war.front) - ms.playerAreaHa,
    villagesDelta: playerVillageCount(war.front) - ms.playerVillages,
    playerSoldiersStart: ms.playerSoldiers,
    playerSoldiersEnd: soldiersOf(P),
    rivalSoldiersStart: ms.rivalSoldiers,
    rivalSoldiersEnd: soldiersOf(rivalRegion(w)),
    playerCasualties: ms.playerCasualties,
    rivalCasualties: ms.rivalCasualties,
    bestAdvancePoint: advI,
    bestAdvanceUnits: adv,
    worstRetreatPoint: retI,
    worstRetreatUnits: ret,
    playerDeficit: P.lastDeficit,
  };
  war.reports.push(report);
  if (war.reports.length > 40) war.reports.shift();
  return report;
}

/* ------------------------------------------------------------------ */
/* 적 AI (규칙 기반)                                                   */
/* ------------------------------------------------------------------ */

/**
 * 매 턴 초에 적이 하는 일 (플레이어와 같은 주기로 결정한다):
 * 1. 병력 조정: 기본은 인구의 levyShare(수확이 있는 턴에는 harvestLevyShare)이고, 우리 병력을 보고
 *    평시 90%, 수확 턴 50%까지는 따라 징집한다(훈련 기간 때문에 즉시 전력이 되지는 않는다).
 *    수확 턴에 일손이 필요해 병력을 줄인다는 것이 플레이어가 노릴 수 있는 약점이다.
 * 2. 명령선: 공세 시작일 이후, 자기 쪽 국지 우위가 가장 큰 곳을 중심으로 명령선을 앞으로 내민다.
 *    우리가 병력을 몰아 둔 곳(명령선을 내민 곳)에는 맞서 병력을 모은다.
 */
export function aiPlan(w: World): void {
  const war = w.war!;
  const R = rivalRegion(w);
  const turn = turnOf(w.day);
  const harvestDay = turn.year * 360 + HARVEST_DAY_OF_YEAR;
  const harvestTurn = harvestDay >= turn.startDay && harvestDay < turn.endDay;
  // 적은 우리 병력을 보고 따라 징집한다. 군비 경쟁은 양쪽 경제를 갉아먹는다.
  const threat = soldiersOf(playerRegion(w));
  const base = (harvestTurn ? war.ai.harvestLevyShare : war.ai.levyShare) * totalPop(R);
  const target = Math.round(Math.max(base, (harvestTurn ? 0.6 : 1.05) * threat));
  const cur = soldiersOf(R);
  const cap = AI_MAX_LEVY_SHARE_PER_TURN * popOf(R, "farmer"); // 한 턴에 바꿀 수 있는 규모
  if (target > cur) levyTroops(R, Math.min(target - cur, cap), w.day);
  else if (target < cur) disbandTroops(R, Math.min(cur - target, cap), w.day);

  const x = war.front;
  // 방어: 우리가 명령선을 앞으로 내민 곳(= 병력을 몰아 둔 곳)에 적도 병력을 몰아 맞선다.
  // (적이 우리 집중 지점을 본다고 가정한다. 척후가 있는 전근대 군대로서 무리한 가정은 아니다.)
  const defense = x.map((xi, i) => Math.min(AI_PUSH_DEPTH_UNITS, Math.max(0, war.orders.player[i]! - xi)));
  if (w.day < war.ai.startDay) {
    war.orders.rival = x.map((xi, i) => Math.max(8, xi - defense[i]!));
    return;
  }
  const pr = computePressure(w);
  // 적 입장의 국지 우위 = 적 밀도 - 플레이어 밀도 (= -net)
  let c = Math.floor(x.length / 2);
  let bestAdv = -Infinity;
  for (let i = 2; i < x.length - 2; i++) {
    const adv = -pr.net[i]!;
    if (adv > bestAdv) {
      bestAdv = adv;
      c = i;
    }
  }
  const depth = war.ai.aggression * AI_PUSH_DEPTH_UNITS; // 한 턴에 내미는 최대 깊이(지도 단위)
  war.orders.rival = x.map((xi, i) => {
    const g = Math.exp(-(((i - c) / 2.2) ** 2));
    return Math.max(8, xi - Math.max(depth * g, defense[i]!));
  });
}

export function newWarState(playerRegionId: number, rivalRegionId: number): WarState {
  const front = initialFront();
  return {
    front,
    orders: { player: [...front], rival: [...front] },
    playerRegionId,
    rivalRegionId,
    capitals: { player: { x: 90, y: 320 }, rival: { x: 910, y: 320 } },
    result: null,
    ai: { aggression: 0.6, startDay: 90, levyShare: 0.05, harvestLevyShare: 0.02 },
    reports: [],
    turnStart: { day: 0, playerAreaHa: playerAreaHa(front), playerVillages: playerVillageCount(front), playerSoldiers: 0, rivalSoldiers: 0, front: [...front], playerCasualties: 0, rivalCasualties: 0, pop: 0 },
  };
}

