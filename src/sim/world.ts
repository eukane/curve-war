import { DAYS_PER_MONTH, DAYS_PER_YEAR, TURN_DAYS, dateOf } from "./calendar";
import {
  BAD_WEATHER,
  BIRTHS_PER_1000_YEAR,
  BIRTH_SUPPRESSION_PER_DEFICIT,
  CLEARING_LABOR_DAYS_PER_HA,
  DEATHS_PER_1000_YEAR,
  GRAIN_KG_PER_PERSON_DAY,
  HARVEST_DAY_OF_YEAR,
  HA_PER_FARMER,
  LEVY_TRAINING_DAYS,
  MAP_W,
  SEED_KG_PER_HA,
  SOIL_OF_CLEARED_LAND,
  SOWING_DAY_OF_YEAR,
  STARVATION_DEATH_RATE_AT_FULL_DEFICIT,
  STORAGE_LOSS_PER_DAY,
  WEATHER_MAX,
  WEATHER_MIN,
  WEATHER_SIGMA,
  YIELD_KG_PER_HA,
} from "./constants";
import { EVENTS } from "./events";
import type { EventDef } from "./events";
import type { Explained } from "./explain";
import { Rng } from "./rng";
import { pickProfile, planAi } from "./ai";
import { aiEdicts, tickEdicts } from "./edicts";
import { aiPlan, beginTurn, disbandTroops, endTurn, levyTroops, newWarState, playerAreaHa, soldiersOf, stepWarDay } from "./war";
import {
  SCENARIOS,
  clearingWorkersAt,
  defaultRules,
  dailyNeedKg,
  fieldFarmersAt,
  popOf,
  totalPop,
} from "./state";
import type { Checkpoint, Decision, Metrics, PendingEvent, Region, RegionSeed, ScenarioId, SeriesPoint, World } from "./state";

export * from "./state";

export function createWorld(
  seed: number,
  seeds: RegionSeed[],
  opts?: { war?: { playerRegionId: number; rivalRegionId: number; ai?: { mode?: "scripted" | "search"; profile?: string; edicts?: boolean } } },
): World {
  const w: World = {
    seed,
    day: 0,
    war: opts?.war ? newWarState(opts.war.playerRegionId, opts.war.rivalRegionId, { mode: opts.war.ai?.mode, profile: opts.war.ai?.profile ?? pickProfile(seed), edicts: opts.war.ai?.edicts }) : null,
    log: [],
    decisions: [],
    pending: null,
    eventsEnabled: true,
    firedKeys: [],
    regions: seeds.map((s) => ({
      ...s,
      cohorts: s.cohorts.map((c) => ({ ...c })),
      sownHa: 0,
      rules: defaultRules(),
      trainees: [],
      clearing: null,
      monthNeedKg: 0,
      monthEatenKg: 0,
      lastDeficit: 0,
      starvationDeathsTotal: 0,
      clearedTotalHa: 0,
      lastSowing: null,
      lastHarvest: null,
      lastHarvestFraction: null,
      lastDemography: null,
    })),
  };
  if (w.war) beginTurn(w);
  return w;
}

/** 그 해의 기상 계수. (시드, 해, 지역)만으로 결정되므로 호출 순서와 무관하다. */
export function weatherFactor(seed: number, year: number, regionId: number): number {
  const rng = Rng.fromParts(seed, 1, year, regionId);
  // 로그정규의 평균이 1이 되도록 mu = -sigma^2 / 2
  const f = Math.exp(-(WEATHER_SIGMA ** 2) / 2 + WEATHER_SIGMA * rng.normal());
  return Math.min(WEATHER_MAX, Math.max(WEATHER_MIN, f));
}

/**
 * 토지 한계로 정해지는 지속 가능 인구(평년, 일손은 충분하다고 가정). 단위: 명
 * `addClearedHa`를 주면 그만큼 더 개간한 뒤의 값을 돌려준다 (새 땅의 지력은 낮아 평균이 내려간다).
 */
export function carryingCapacity(r: Region, addClearedHa = 0): number {
  const arable = r.arableHa + addClearedHa;
  const soil = addClearedHa > 0 ? (r.soil * r.arableHa + SOIL_OF_CLEARED_LAND * addClearedHa) / arable : r.soil;
  const netKgPerHa = YIELD_KG_PER_HA * soil - SEED_KG_PER_HA;
  return (arable * netKgPerHa) / (GRAIN_KG_PER_PERSON_DAY * DAYS_PER_YEAR);
}

const fmt = (v: number, d = 0) => v.toLocaleString("ko-KR", { maximumFractionDigits: d, minimumFractionDigits: d });

function addLog(w: World, regionId: number, kind: "event" | "player" | "system", text: string) {
  w.log.push({ day: w.day, regionId, kind, text });
}

/* ------------------------------------------------------------------ */
/* 파종                                                                */
/* ------------------------------------------------------------------ */
export function computeSowing(r: Region, day: number): Explained {
  const field = fieldFarmersAt(r, day);
  const laborHa = field * HA_PER_FARMER;
  const seedHa = r.seedKg / SEED_KG_PER_HA;
  const sown = Math.min(r.arableHa, laborHa, seedHa);
  const limit =
    sown === r.arableHa
      ? "토지가 한계"
      : sown === laborHa
        ? "일손이 한계 (개간 인부나 징집으로 들에 나갈 사람이 모자람)"
        : "종자가 한계 (종자가 모자라 다 심지 못함)";
  return {
    label: "올해 파종 면적",
    value: sown,
    unit: "ha",
    formula: "min(경작지, 일손으로 심을 수 있는 면적, 종자로 심을 수 있는 면적)",
    terms: [
      { label: "경작지", value: r.arableHa, unit: "ha" },
      { label: "일손으로 심을 수 있는 면적", value: laborHa, unit: "ha", note: `들에 나갈 농민 ${fmt(field)}명 × ${HA_PER_FARMER}ha` },
      { label: "종자로 심을 수 있는 면적", value: seedHa, unit: "ha", note: `종자 ${fmt(r.seedKg / 1000)}t ÷ ${SEED_KG_PER_HA}kg/ha` },
      { label: "한계 요인", value: 0, unit: "", note: limit },
    ],
  };
}

function sow(r: Region, day: number) {
  const e = computeSowing(r, day);
  r.lastSowing = e;
  r.sownHa = e.value;
  // 쓰고 남은 종자는 곡창으로 돌린다
  const used = r.sownHa * SEED_KG_PER_HA;
  r.granaryKg += Math.max(0, r.seedKg - used);
  r.seedKg = 0;
}

/* ------------------------------------------------------------------ */
/* 수확                                                                */
/* ------------------------------------------------------------------ */
export function computeHarvest(
  seed: number,
  year: number,
  r: Region,
  day: number,
  override?: (year: number, regionId: number) => number,
): Explained & { grossKg: number; seedReserveKg: number; fraction: number } {
  const field = fieldFarmersAt(r, day);
  const capacityHa = field * HA_PER_FARMER;
  const fraction = r.sownHa > 0 ? Math.min(1, capacityHa / r.sownHa) : 1;
  const weather = override ? override(year, r.id) : weatherFactor(seed, year, r.id);
  const grossKg = r.sownHa * YIELD_KG_PER_HA * r.soil * weather * fraction;
  const seedReserveKg = Math.min(grossKg, SEED_KG_PER_HA * r.arableHa);
  const toGranary = grossKg - seedReserveKg;
  return {
    label: `${year + 1}년 수확 (곡창 입고분)`,
    value: toGranary,
    unit: "kg",
    formula: "파종 면적 × 평년 수확량 × 지력 × 기상 × 수확 완료율 − 내년 종자 보존분",
    terms: [
      { label: "파종 면적", value: r.sownHa, unit: "ha", note: "봄에 실제로 심은 면적" },
      { label: "평년 수확량", value: YIELD_KG_PER_HA, unit: "kg/ha" },
      { label: "지력", value: r.soil, unit: "배" },
      { label: "기상", value: weather, unit: "배", note: "평년 = 1.0" },
      {
        label: "수확 완료율",
        value: fraction,
        unit: "비율",
        note: fraction < 1 ? `들에 남은 일손 ${fmt(field)}명으로는 ${fmt(capacityHa)}ha만 거둘 수 있음` : "일손이 충분해 전부 거둠",
      },
      { label: "내년 종자 보존분", value: seedReserveKg, unit: "kg", note: `${SEED_KG_PER_HA}kg/ha × 경작지 ${fmt(r.arableHa)}ha` },
    ],
    grossKg,
    seedReserveKg,
    fraction,
  };
}

function harvest(w: World, r: Region, year: number) {
  const h = computeHarvest(w.seed, year, r, w.day, w.weatherOverride);
  r.lastHarvest = { label: h.label, value: h.value, unit: h.unit, formula: h.formula, terms: h.terms };
  r.lastHarvestFraction = h.fraction;
  r.seedKg += h.seedReserveKg;
  r.granaryKg += h.value;
  // 파종 면적은 다음 파종 때까지 유지하지 않는다
  r.sownHa = 0;
}

/* ------------------------------------------------------------------ */
/* 개간                                                                */
/* ------------------------------------------------------------------ */
function advanceClearing(w: World, r: Region) {
  const c = r.clearing;
  if (!c) return;
  const workers = clearingWorkersAt(r, w.day);
  const possible = workers / CLEARING_LABOR_DAYS_PER_HA;
  const d = Math.min(possible, c.targetHa - c.progressHa, r.clearableHa);
  if (d > 0) {
    // 새 땅은 평균보다 지력이 낮다: 면적 가중 평균
    r.soil = (r.soil * r.arableHa + SOIL_OF_CLEARED_LAND * d) / (r.arableHa + d);
    r.arableHa += d;
    r.clearableHa -= d;
    r.clearedTotalHa += d;
    c.progressHa += d;
  }
  if (c.progressHa >= c.targetHa - 1e-9 || r.clearableHa <= 1e-9) {
    addLog(w, r.id, "system", `개간 사업이 끝났다. ${fmt(c.progressHa, 1)}ha가 경작지가 되었다.`);
    r.clearing = null;
  }
}

export type CommandResult = { ok: true } | { ok: false; reason: string };

export function startClearing(w: World, regionId: number, workers: number, targetHa: number): CommandResult {
  const r = w.regions.find((x) => x.id === regionId);
  if (!r) return { ok: false, reason: "없는 지역입니다." };
  if (r.clearing) return { ok: false, reason: "이미 진행 중인 개간 사업이 있습니다." };
  if (!(workers >= 1)) return { ok: false, reason: "인부는 1명 이상이어야 합니다." };
  if (workers > popOf(r, "farmer")) return { ok: false, reason: "농민 수보다 많은 인부를 보낼 수 없습니다." };
  if (!(targetHa > 0)) return { ok: false, reason: "목표 면적이 0보다 커야 합니다." };
  if (targetHa > r.clearableHa) return { ok: false, reason: `개간 가능한 땅은 ${fmt(r.clearableHa)}ha뿐입니다.` };
  r.clearing = { workers, targetHa, progressHa: 0, reservedForHarvest: 0, reservedUntilDay: 0 };
  addLog(w, r.id, "player", `개간 사업을 시작했다. 인부 ${fmt(workers)}명, 목표 ${fmt(targetHa)}ha.`);
  return { ok: true };
}

export function stopClearing(w: World, regionId: number): CommandResult {
  const r = w.regions.find((x) => x.id === regionId);
  if (!r || !r.clearing) return { ok: false, reason: "진행 중인 개간 사업이 없습니다." };
  addLog(w, r.id, "player", `개간 사업을 중단했다. 지금까지 ${fmt(r.clearing.progressHa, 1)}ha를 개간했다.`);
  r.clearing = null;
  return { ok: true };
}

export function levy(w: World, regionId: number, n: number): CommandResult {
  const r = w.regions.find((x) => x.id === regionId);
  if (!r) return { ok: false, reason: "없는 지역입니다." };
  if (!(n >= 1)) return { ok: false, reason: "징집은 1명 이상이어야 합니다." };
  const took = levyTroops(r, n, w.day);
  if (took < 1) return { ok: false, reason: "더 징집할 수 없습니다(농민의 40%가 상한이고, 최소한의 농민은 남겨야 합니다)." };
  addLog(w, r.id, "player", `농민 ${fmt(took)}명을 징집했다(훈련 ${LEVY_TRAINING_DAYS}일). 병력 ${fmt(soldiersOf(r))}명.`);
  return { ok: true };
}

export function disband(w: World, regionId: number, n: number): CommandResult {
  const r = w.regions.find((x) => x.id === regionId);
  if (!r) return { ok: false, reason: "없는 지역입니다." };
  const gave = disbandTroops(r, n, w.day);
  if (gave < 1) return { ok: false, reason: "해산할 병사가 없습니다." };
  addLog(w, r.id, "player", `병사 ${fmt(gave)}명을 해산해 농민으로 돌려보냈다. 병력 ${fmt(soldiersOf(r))}명.`);
  return { ok: true };
}

/** 플레이어가 전선 점 i의 명령선을 정한다. 절대 x좌표. */
export function setOrder(w: World, i: number, x: number): void {
  const war = w.war;
  if (!war) return;
  if (i < 0 || i >= war.orders.player.length) return;
  war.orders.player[i] = Math.min(MAP_W - 12, Math.max(war.capitals.player.x + 5, x));
}

/* ------------------------------------------------------------------ */
/* 예측                                                                */
/* ------------------------------------------------------------------ */
export function metricsOf(r: Region): Metrics {
  return {
    pop: totalPop(r),
    starvationDeaths: r.starvationDeathsTotal,
    granaryKg: r.granaryKg,
    seedKg: r.seedKg,
    arableHa: r.arableHa,
    sownHa: r.sownHa,
    lastHarvestKg: r.lastHarvest ? r.lastHarvest.value : null,
    lastHarvestFraction: r.lastHarvestFraction,
    clearedTotalHa: r.clearedTotalHa,
  };
}

/** 모델 전체를 복제한다. 기상 고정 함수는 복제 대상이 아니다. */
export function cloneWorld(w: World): World {
  const { weatherOverride: _drop, ...rest } = w;
  void _drop;
  return structuredClone(rest) as World;
}

/** 다음 수확이 일어나는 해 */
function nextHarvestYear(w: World): number {
  const { year, dayOfYear } = dateOf(w.day);
  return dayOfYear <= HARVEST_DAY_OF_YEAR ? year : year + 1;
}

/**
 * 시나리오를 가정하고 모델을 복제해 각 시점까지 돌리며 상태를 기록한다.
 * 선택지의 결과를 손으로 쓰지 않고 모델 자체로 계산하기 위한 함수다.
 * - normal: 앞으로의 기상이 모두 평년(1.0)
 * - bad: 다음 수확만 흉년(BAD_WEATHER)이고 나머지는 평년
 */
export function forecastSeries(
  w: World,
  regionId: number,
  checkpoints: Checkpoint[],
  mutate?: (c: World, r: Region) => void,
  scenario: ScenarioId = "normal",
): SeriesPoint[] {
  const c = cloneWorld(w);
  c.eventsEnabled = false;
  c.pending = null;
  const badYear = nextHarvestYear(w);
  c.weatherOverride = scenario === "bad" ? (y) => (y === badYear ? BAD_WEATHER : 1.0) : () => 1.0;
  const r = c.regions.find((x) => x.id === regionId)!;
  mutate?.(c, r);
  const out: SeriesPoint[] = [];
  let done = 0;
  for (const cp of checkpoints) {
    step(c, cp.days - done);
    done = cp.days;
    out.push({ days: cp.days, label: cp.label, metrics: metricsOf(c.regions.find((x) => x.id === regionId)!) });
  }
  return out;
}

export function forecast(w: World, regionId: number, days: number, mutate?: (c: World, r: Region) => void, scenario: ScenarioId = "normal"): Metrics {
  return forecastSeries(w, regionId, [{ days, label: "" }], mutate, scenario)[0]!.metrics;
}

export interface TurnPreview {
  /** 이번 턴이 끝났을 때의 전선 */
  front: number[];
  playerAreaHaDelta: number;
  playerSoldiers: number;
  rivalSoldiers: number;
  playerCasualties: number;
  rivalCasualties: number;
  result: "win" | "loss" | null;
  /** 이번 턴 안에 점마다 움직이는 양(지도 단위, 양수 = 적 쪽) */
  shifts: number[];
  /** 이번 턴에 적이 정한 명령선 */
  rivalOrders: number[];
}

/**
 * 다음 턴 경계(90일 배수)까지 모델을 복제해 돌린다. 전황 변수는 평균(1.0)으로 고정하므로
 * 실제 결과는 이 예측에서 ±12% 정도의 전투력 차이만큼 달라질 수 있다. 적의 반응(징집, 명령선)은 그대로 반영된다.
 */
export function previewTurn(w: World): TurnPreview | null {
  if (!w.war) return null;
  const c = cloneWorld(w);
  c.eventsEnabled = false;
  c.pending = null;
  c.weatherOverride = () => 1.0;
  c.war!.expected = true;
  const days = TURN_DAYS - (w.day % TURN_DAYS);
  const before = [...w.war!.front];
  const startArea = playerAreaHa(w.war!.front);
  const P0 = soldiersOf(w.regions.find((r) => r.id === w.war!.playerRegionId)!);
  const R0 = soldiersOf(w.regions.find((r) => r.id === w.war!.rivalRegionId)!);
  step(c, days);
  void P0; void R0;
  const war = c.war!;
  const P = c.regions.find((r) => r.id === war.playerRegionId)!;
  const R = c.regions.find((r) => r.id === war.rivalRegionId)!;
  const lastReport = war.reports[war.reports.length - 1];
  return {
    front: [...war.front],
    playerAreaHaDelta: playerAreaHa(war.front) - startArea,
    playerSoldiers: soldiersOf(P),
    rivalSoldiers: soldiersOf(R),
    playerCasualties: lastReport ? lastReport.playerCasualties : 0,
    rivalCasualties: lastReport ? lastReport.rivalCasualties : 0,
    result: war.result,
    shifts: war.front.map((x, i) => x - before[i]!),
    rivalOrders: [...war.orders.rival],
  };
}

/** 모든 시나리오의 예측을 한꺼번에 돌린다. */
export function forecastAll(
  w: World,
  regionId: number,
  checkpoints: Checkpoint[],
  mutate?: (c: World, r: Region) => void,
): Record<ScenarioId, { forecast: Metrics; series: SeriesPoint[] }> {
  const out = {} as Record<ScenarioId, { forecast: Metrics; series: SeriesPoint[] }>;
  for (const sc of SCENARIOS) {
    const series = forecastSeries(w, regionId, checkpoints, mutate, sc.id);
    out[sc.id] = { forecast: series[series.length - 1]!.metrics, series };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 이벤트                                                              */
/* ------------------------------------------------------------------ */
function eventKey(ev: EventDef, r: Region, w: World): string {
  return `${ev.id}:${r.id}:${dateOf(w.day).year}`;
}

function openPendingIfTriggered(w: World): boolean {
  if (!w.eventsEnabled || w.pending) return false;
  for (const r of w.regions) {
    for (const ev of EVENTS) {
      if (w.firedKeys.includes(eventKey(ev, r, w))) continue;
      if (!ev.check(w, r)) continue;
      const opts = ev.options(w, r);
      const horizonDays = ev.checkpoints[ev.checkpoints.length - 1]!.days;
      const pending: PendingEvent = {
        eventId: ev.id,
        regionId: r.id,
        day: w.day,
        title: ev.title,
        text: ev.text(w, r),
        horizonDays,
        checkpoints: ev.checkpoints,
        before: metricsOf(r),
        options: opts.map((o) => ({
          id: o.id,
          label: o.label,
          outcomes: forecastAll(w, r.id, ev.checkpoints, (c, rr) => o.apply(c, rr)),
        })),
      };
      w.pending = pending;
      w.firedKeys.push(eventKey(ev, r, w));
      return true;
    }
  }
  return false;
}

export function resolveEvent(w: World, optionId: string): CommandResult {
  const p = w.pending;
  if (!p) return { ok: false, reason: "처리할 사건이 없습니다." };
  const ev = EVENTS.find((e) => e.id === p.eventId)!;
  const r = w.regions.find((x) => x.id === p.regionId)!;
  const opt = ev.options(w, r).find((o) => o.id === optionId);
  const po = p.options.find((o) => o.id === optionId);
  if (!opt || !po) return { ok: false, reason: "없는 선택지입니다." };
  const logText = opt.logText(w, r);
  opt.apply(w, r);
  addLog(w, r.id, "event", `${p.title}: ${opt.label}. ${logText}`);
  const decision: Decision = {
    id: w.decisions.length + 1,
    day: w.day,
    regionId: r.id,
    eventId: p.eventId,
    title: p.title,
    optionId: opt.id,
    optionLabel: opt.label,
    before: p.before,
    forecast: po.outcomes.normal.forecast,
    dueDay: w.day + p.horizonDays,
    actual: null,
  };
  w.decisions.push(decision);
  w.pending = null;
  return { ok: true };
}

function settleDecisions(w: World) {
  for (const d of w.decisions) {
    if (d.actual || w.day < d.dueDay) continue;
    const r = w.regions.find((x) => x.id === d.regionId)!;
    d.actual = metricsOf(r);
    addLog(
      w,
      r.id,
      "system",
      `결정 결과 확인 — ${d.optionLabel}: 예측 인구 ${fmt(d.forecast.pop)}명, 실제 ${fmt(d.actual.pop)}명.`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* 하루 진행                                                           */
/* ------------------------------------------------------------------ */
/** 하루를 진행한다. 사건이 열려 진행하지 못하면 false. */
export function stepDay(w: World): boolean {
  if (w.pending) return false;
  if (w.war?.result) return false;
  if (openPendingIfTriggered(w)) return false;
  // 매 턴 초: 적이 병력과 명령선을 정한다 (플레이어와 같은 주기)
  if (w.war && w.day % TURN_DAYS === 0) {
    if (w.war.ai.skipPlanOnce) w.war.ai.skipPlanOnce = false;
    else if (w.war.ai.mode === "search") planAi(w, { clone: cloneWorld, step });
    else aiPlan(w);
    aiEdicts(w);
  }

  const { year, dayOfYear } = dateOf(w.day);

  for (const r of w.regions) {
    // 1) 곡창 보관 손실
    r.granaryKg -= r.granaryKg * STORAGE_LOSS_PER_DAY;

    // 2) 파종·수확
    if (dayOfYear === SOWING_DAY_OF_YEAR) sow(r, w.day);
    if (dayOfYear === HARVEST_DAY_OF_YEAR) harvest(w, r, year);

    // 3) 개간
    advanceClearing(w, r);

    // 4) 소비. 지역 곡창에서 모두가 같은 비율로 먹는다(알려진 단순화).
    const need = dailyNeedKg(r);
    const eaten = Math.min(need, r.granaryKg);
    r.granaryKg -= eaten;
    r.monthNeedKg += need;
    r.monthEatenKg += eaten;
  }

  // 5) 전쟁과 법령
  tickEdicts(w);
  stepWarDay(w);

  w.day += 1;

  // 6) 매월 말 인구 변화, 매 턴 끝 보고
  if (w.day % DAYS_PER_MONTH === 0) {
    for (const r of w.regions) applyMonthlyDemography(r);
  }
  if (w.war && w.day % TURN_DAYS === 0) {
    endTurn(w);
    beginTurn(w);
  }

  settleDecisions(w);
  return true;
}

function applyMonthlyDemography(r: Region): void {
  const pop = totalPop(r);
  const deficit = r.monthNeedKg > 0 ? 1 - r.monthEatenKg / r.monthNeedKg : 0;
  const monthShare = DAYS_PER_MONTH / DAYS_PER_YEAR;

  // 병사는 아이를 낳지 않는다: 출생은 민간 인구에서만 나오고, 사망은 모두에게 같은 비율로 적용된다.
  const civ = pop - popOf(r, "soldier");
  const suppression = Math.min(1, BIRTH_SUPPRESSION_PER_DEFICIT * deficit);
  const baseBirths = (civ * BIRTHS_PER_1000_YEAR) / 1000 * monthShare;
  const births = baseBirths * (1 - suppression);

  const baseDeaths = (pop * DEATHS_PER_1000_YEAR) / 1000 * monthShare;
  const starvationDeaths = pop * STARVATION_DEATH_RATE_AT_FULL_DEFICIT * deficit * monthShare;
  const deaths = Math.min(pop, baseDeaths + starvationDeaths);
  r.starvationDeathsTotal += Math.min(starvationDeaths, deaths);

  const deathRatio = pop > 0 ? deaths / pop : 0;
  for (const c of r.cohorts) {
    const before = c.pop;
    c.pop = before * (1 - deathRatio) + (c.stratum !== "soldier" && civ > 0 ? (births * before) / civ : 0);
  }

  r.lastDeficit = deficit;
  r.lastDemography = {
    births: {
      label: "이번 달 출생",
      value: births,
      unit: "명",
      formula: "인구 × 출생률 × 월 비중 × (1 − 출산 억제)",
      terms: [
        { label: "인구", value: pop, unit: "명" },
        { label: "출생률", value: BIRTHS_PER_1000_YEAR, unit: "‰/년" },
        { label: "식량 부족률", value: deficit, unit: "비율", note: "지난 한 달 필요량 대비 못 먹은 비율" },
        { label: "출산 억제", value: suppression, unit: "비율" },
      ],
    },
    deaths: {
      label: "이번 달 사망",
      value: deaths,
      unit: "명",
      formula: "평시 사망 + 기아·질병 추가 사망",
      terms: [
        { label: "평시 사망", value: baseDeaths, unit: "명", note: `${DEATHS_PER_1000_YEAR}‰/년` },
        { label: "기아·질병 추가 사망", value: starvationDeaths, unit: "명", note: "식량 부족률에 비례(임시 가정)" },
      ],
    },
  };

  r.monthNeedKg = 0;
  r.monthEatenKg = 0;
}

/** days일 진행한다. 사건이 열리면 거기서 멈추고, 실제로 진행한 일수를 돌려준다. */
export function step(w: World, days: number): number {
  let done = 0;
  for (let i = 0; i < days; i++) {
    if (!stepDay(w)) break;
    done++;
  }
  return done;
}
