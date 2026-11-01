import { DAYS_PER_MONTH, DAYS_PER_YEAR, dateOf } from "./calendar";
import {
  BIRTHS_PER_1000_YEAR,
  BIRTH_SUPPRESSION_PER_DEFICIT,
  DEATHS_PER_1000_YEAR,
  GRAIN_KG_PER_PERSON_DAY,
  HARVEST_DAY_OF_YEAR,
  HA_PER_FARMER,
  SEED_FRACTION,
  STARVATION_DEATH_RATE_AT_FULL_DEFICIT,
  STORAGE_LOSS_PER_DAY,
  WEATHER_MAX,
  WEATHER_MIN,
  WEATHER_SIGMA,
  YIELD_KG_PER_HA,
} from "./constants";
import type { Explained } from "./explain";
import { Rng } from "./rng";

export type Stratum = "farmer" | "artisan" | "elite";

export interface Cohort {
  stratum: Stratum;
  /** 단위: 명 (소수로 보관하고 표시할 때만 반올림) */
  pop: number;
}

export interface RegionSeed {
  id: number;
  name: string;
  /** 경작 가능한 토지. 단위: ha */
  arableHa: number;
  /** 지력 계수. 단위: 무차원 (1.0 = 평균) */
  soil: number;
  /** 시작 시점 곡창 재고. 단위: kg */
  granaryKg: number;
  cohorts: Cohort[];
}

export interface Region extends RegionSeed {
  /** 이번 달 누적: 필요량, 실제 섭취량. 단위: kg */
  monthNeedKg: number;
  monthEatenKg: number;
  /** 지난달 식량 부족률(0~1). 첫 달에는 0 */
  lastDeficit: number;
  lastHarvest: Explained | null;
  lastDemography: { births: Explained; deaths: Explained } | null;
}

export interface World {
  seed: number;
  /** 시작 후 경과 일수 */
  day: number;
  regions: Region[];
}

export function totalPop(r: Region): number {
  return r.cohorts.reduce((s, c) => s + c.pop, 0);
}

export function popOf(r: Region, stratum: Stratum): number {
  return r.cohorts.filter((c) => c.stratum === stratum).reduce((s, c) => s + c.pop, 0);
}

export function createWorld(seed: number, seeds: RegionSeed[]): World {
  return {
    seed,
    day: 0,
    regions: seeds.map((s) => ({
      ...s,
      cohorts: s.cohorts.map((c) => ({ ...c })),
      monthNeedKg: 0,
      monthEatenKg: 0,
      lastDeficit: 0,
      lastHarvest: null,
      lastDemography: null,
    })),
  };
}

/** 그 해의 기상 계수. (시드, 해, 지역)만으로 결정되므로 호출 순서와 무관하다. */
export function weatherFactor(seed: number, year: number, regionId: number): number {
  const rng = Rng.fromParts(seed, 1, year, regionId);
  // 로그정규의 평균이 1이 되도록 mu = -sigma^2 / 2
  const f = Math.exp(-(WEATHER_SIGMA ** 2) / 2 + WEATHER_SIGMA * rng.normal());
  return Math.min(WEATHER_MAX, Math.max(WEATHER_MIN, f));
}

export function computeHarvest(seed: number, year: number, r: Region): Explained {
  const farmers = popOf(r, "farmer");
  const laborHa = farmers * HA_PER_FARMER;
  const cultivatedHa = Math.min(r.arableHa, laborHa);
  const weather = weatherFactor(seed, year, r.id);
  const grossKg = cultivatedHa * YIELD_KG_PER_HA * r.soil * weather;
  const netKg = grossKg * (1 - SEED_FRACTION);
  return {
    label: `${year + 1}년 수확 (곡창 입고분)`,
    value: netKg,
    unit: "kg",
    formula: "경작면적 × 평년 수확량 × 지력 × 기상 × (1 − 종자 비율)",
    terms: [
      {
        label: "경작면적",
        value: cultivatedHa,
        unit: "ha",
        note: laborHa < r.arableHa
          ? `일손이 모자라 경작 가능 토지 ${Math.round(r.arableHa)}ha 중 일부만 경작`
          : `일손은 충분하고 토지 ${Math.round(r.arableHa)}ha가 한계`,
      },
      { label: "평년 수확량", value: YIELD_KG_PER_HA, unit: "kg/ha" },
      { label: "지력", value: r.soil, unit: "배" },
      { label: "기상", value: weather, unit: "배", note: "평년 = 1.0" },
      { label: "종자 비율", value: SEED_FRACTION, unit: "비율", note: "다음 해 파종용으로 남김" },
    ],
  };
}

/** 하루를 진행한다. */
export function stepDay(w: World): void {
  const { year, dayOfYear } = dateOf(w.day);

  for (const r of w.regions) {
    // 1) 곡창 보관 손실
    r.granaryKg -= r.granaryKg * STORAGE_LOSS_PER_DAY;

    // 2) 수확
    if (dayOfYear === HARVEST_DAY_OF_YEAR) {
      const h = computeHarvest(w.seed, year, r);
      r.lastHarvest = h;
      r.granaryKg += h.value;
    }

    // 3) 소비. 지역 곡창에서 모두가 같은 비율로 먹는다(알려진 단순화).
    const need = totalPop(r) * GRAIN_KG_PER_PERSON_DAY;
    const eaten = Math.min(need, r.granaryKg);
    r.granaryKg -= eaten;
    r.monthNeedKg += need;
    r.monthEatenKg += eaten;
  }

  w.day += 1;

  // 4) 매월 말 인구 변화
  if (w.day % DAYS_PER_MONTH === 0) {
    for (const r of w.regions) applyMonthlyDemography(r);
  }
}

function applyMonthlyDemography(r: Region): void {
  const pop = totalPop(r);
  const deficit = r.monthNeedKg > 0 ? 1 - r.monthEatenKg / r.monthNeedKg : 0;
  const monthShare = DAYS_PER_MONTH / DAYS_PER_YEAR;

  const suppression = Math.min(1, BIRTH_SUPPRESSION_PER_DEFICIT * deficit);
  const baseBirths = (pop * BIRTHS_PER_1000_YEAR) / 1000 * monthShare;
  const births = baseBirths * (1 - suppression);

  const baseDeaths = (pop * DEATHS_PER_1000_YEAR) / 1000 * monthShare;
  const starvationDeaths = pop * STARVATION_DEATH_RATE_AT_FULL_DEFICIT * deficit * monthShare;
  const deaths = Math.min(pop, baseDeaths + starvationDeaths);

  const ratio = pop > 0 ? (pop + births - deaths) / pop : 1;
  for (const c of r.cohorts) c.pop *= ratio;

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

export function step(w: World, days: number): void {
  for (let i = 0; i < days; i++) stepDay(w);
}
