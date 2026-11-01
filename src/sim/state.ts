import type { Explained } from "./explain";

export type Stratum = "farmer" | "artisan" | "elite" | "soldier";

export interface Cohort {
  stratum: Stratum;
  /** 단위: 명 (소수로 보관하고 표시할 때만 반올림) */
  pop: number;
}

export interface RegionSeed {
  id: number;
  name: string;
  /** 경작지 면적(휴경지 제외, 해마다 실제 파종 가능한 토지). 단위: ha */
  arableHa: number;
  /** 아직 개간하지 않은 개간 가능 토지. 단위: ha */
  clearableHa: number;
  /** 지력 계수. 단위: 배 (1.0 = 평균) */
  soil: number;
  /** 곡창 재고(종자 제외). 단위: kg */
  granaryKg: number;
  /** 별도로 보관한 종자. 단위: kg */
  seedKg: number;
  cohorts: Cohort[];
}

/** 개간 사업. 매일 일손에 비례해 땅이 조금씩 경작지가 된다. */
export interface ClearingProject {
  /** 배치한 인부 수. 단위: 명 */
  workers: number;
  /** 이번 사업의 목표 면적. 단위: ha */
  targetHa: number;
  /** 지금까지 개간한 면적. 단위: ha */
  progressHa: number;
  /** 수확을 위해 일시적으로 들로 돌려보낸 인부 수. 단위: 명 */
  reservedForHarvest: number;
  /** 돌려보낸 상태가 유지되는 마지막 날의 다음 날(절대 일수) */
  reservedUntilDay: number;
}

export interface Region extends RegionSeed {
  /** 올해 파종한 면적. 단위: ha */
  sownHa: number;
  clearing: ClearingProject | null;
  /** 이번 달 누적: 필요량, 실제 섭취량. 단위: kg */
  monthNeedKg: number;
  monthEatenKg: number;
  /** 지난달 식량 부족률(0~1). 첫 달에는 0 */
  lastDeficit: number;
  /** 누적 기아·질병 추가 사망. 단위: 명 */
  starvationDeathsTotal: number;
  /** 누적 개간 면적. 단위: ha */
  clearedTotalHa: number;
  lastSowing: Explained | null;
  lastHarvest: Explained | null;
  /** 지난 수확에서 실제로 거둔 비율(0~1) */
  lastHarvestFraction: number | null;
  lastDemography: { births: Explained; deaths: Explained } | null;
}

export interface LogEntry {
  day: number;
  regionId: number;
  kind: "event" | "player" | "system";
  text: string;
}

/** 결정 시점이나 예측 종료 시점의 상태 요약 */
export interface Metrics {
  pop: number;
  starvationDeaths: number;
  granaryKg: number;
  seedKg: number;
  arableHa: number;
  sownHa: number;
  lastHarvestKg: number | null;
  lastHarvestFraction: number | null;
  clearedTotalHa: number;
}

export interface Decision {
  id: number;
  day: number;
  regionId: number;
  eventId: string;
  title: string;
  optionId: string;
  optionLabel: string;
  /** 결정 직전 상태 */
  before: Metrics;
  /** 평년 시나리오 예측 (결정 시점에 모델을 복제해 돌린 결과) */
  forecast: Metrics;
  /** 이 날이 되면 실제 결과를 기록한다 */
  dueDay: number;
  actual: Metrics | null;
}

export interface Checkpoint {
  /** 결정 시점으로부터 며칠 뒤인가 */
  days: number;
  label: string;
}

export type ScenarioId = "normal" | "bad";

export const SCENARIOS: { id: ScenarioId; label: string; note: string }[] = [
  { id: "normal", label: "평년", note: "앞으로 기상이 모두 평년(1.0)일 때" },
  { id: "bad", label: "흉년 1회", note: "다음 수확만 흉년(0.55)이고 나머지는 평년일 때" },
];

export interface SeriesPoint {
  days: number;
  label: string;
  metrics: Metrics;
}

export interface PendingOption {
  id: string;
  label: string;
  /** 시나리오별 예측. 단기 이득과 장기 대가, 그리고 흉년 대비를 함께 보여주기 위함 */
  outcomes: Record<ScenarioId, { forecast: Metrics; series: SeriesPoint[] }>;
}

export interface PendingEvent {
  eventId: string;
  regionId: number;
  day: number;
  title: string;
  text: string;
  horizonDays: number;
  checkpoints: Checkpoint[];
  before: Metrics;
  options: PendingOption[];
}

export type Realm = "player" | "rival";

export interface MonthReport {
  /** 이 달 말의 절대 일수 */
  day: number;
  /** 지난 한 달 동안 */
  playerAreaHaDelta: number;
  /** 우리 쪽 마을 수의 변화 (양수 = 점령) */
  villagesDelta: number;
  playerSoldiersStart: number;
  playerSoldiersEnd: number;
  rivalSoldiersStart: number;
  rivalSoldiersEnd: number;
  playerCasualties: number;
  rivalCasualties: number;
  /** 가장 크게 전진한 구간(점 번호)과 이동량(지도 단위). 전진이 없으면 -1, 0 */
  bestAdvancePoint: number;
  bestAdvanceUnits: number;
  /** 가장 크게 후퇴한 구간(점 번호)과 이동량(지도 단위, 양수). 후퇴가 없으면 -1, 0 */
  worstRetreatPoint: number;
  worstRetreatUnits: number;
  /** 이 달의 식량 부족률 */
  playerDeficit: number;
}

export interface WarState {
  /** 전선 제어점의 x 좌표. y는 균등 간격으로 고정 (x가 y의 함수이므로 곡선이 스스로 교차하지 못한다) */
  front: number[];
  /** 각 세력의 명령선(절대 x). 플레이어는 오른쪽으로 갈수록, 적은 왼쪽으로 갈수록 전진이다 */
  orders: Record<Realm, number[]>;
  playerRegionId: number;
  rivalRegionId: number;
  capitals: Record<Realm, { x: number; y: number }>;
  result: "win" | "loss" | null;
  /** 예측용: 전황 변수를 평균(1.0)으로 고정한다 */
  expected?: boolean;
  ai: { aggression: number; startDay: number; levyShare: number; harvestLevyShare: number };
  reports: MonthReport[];
  /** 이번 달 진행 중 누적 */
  monthStart: { day: number; playerAreaHa: number; playerVillages: number; playerSoldiers: number; rivalSoldiers: number; front: number[]; playerCasualties: number; rivalCasualties: number };
}

export interface World {
  seed: number;
  /** 전쟁 상태. 없으면 순수 경제 모델 */
  war: WarState | null;
  /** 시작 후 경과 일수 */
  day: number;
  regions: Region[];
  log: LogEntry[];
  decisions: Decision[];
  pending: PendingEvent | null;
  eventsEnabled: boolean;
  /** 이미 발생한 이벤트 키 "이벤트:지역:해" */
  firedKeys: string[];
  /** 시험용: 기상을 고정한다. 없으면 시드에서 계산 */
  weatherOverride?: (year: number, regionId: number) => number;
}

export function totalPop(r: Region): number {
  return r.cohorts.reduce((s, c) => s + c.pop, 0);
}

export function popOf(r: Region, stratum: Stratum): number {
  return r.cohorts.filter((c) => c.stratum === stratum).reduce((s, c) => s + c.pop, 0);
}

/** 어느 날의 개간 현장 실제 인원. 수확 때문에 돌려보낸 인원은 뺀다. */
export function clearingWorkersAt(r: Region, day: number): number {
  const c = r.clearing;
  if (!c) return 0;
  const reserved = day < c.reservedUntilDay ? c.reservedForHarvest : 0;
  return Math.min(popOf(r, "farmer"), Math.max(0, c.workers - reserved));
}

/** 어느 날 들에 나갈 수 있는 농민 수 */
export function fieldFarmersAt(r: Region, day: number): number {
  return Math.max(0, popOf(r, "farmer") - clearingWorkersAt(r, day));
}

import { GRAIN_KG_PER_PERSON_DAY } from "./constants";

/** 하루 곡물 필요량. 단위: kg */
export function dailyNeedKg(r: Region): number {
  return totalPop(r) * GRAIN_KG_PER_PERSON_DAY;
}
