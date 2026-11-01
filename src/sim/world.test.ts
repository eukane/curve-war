import { describe, expect, it } from "vitest";
import { START_REGIONS } from "../data/start-regions";
import { DAYS_PER_YEAR, dateOf } from "./calendar";
import {
  CLEARING_LABOR_DAYS_PER_HA,
  GRAIN_KG_PER_PERSON_DAY,
  HARVEST_DAY_OF_YEAR,
  HA_PER_FARMER,
  SEED_KG_PER_HA,
  SOIL_OF_CLEARED_LAND,
  SOWING_DAY_OF_YEAR,
  YIELD_KG_PER_HA,
} from "./constants";
import { EVENTS } from "./events";
import type { EventDef } from "./events";
import { REJECTED_EVENTS } from "./fixtures/rejected-events";
import { dominatedOptions, dominates } from "./quality";
import { Rng } from "./rng";
import {
  carryingCapacity,
  computeHarvest,
  createWorld,
  forecast,
  forecastSeries,
  popOf,
  resolveEvent,
  startClearing,
  step,
  stopClearing,
  totalPop,
  weatherFactor,
} from "./world";
import type { Metrics, PendingOption } from "./world";

const fresh = (seed = 1) => {
  const w = createWorld(seed, START_REGIONS);
  return { w, r: w.regions[0]! };
};

describe("Rng", () => {
  it("같은 시드와 부품이면 같은 값, 다르면 다른 값", () => {
    const a = Rng.fromParts(42, 1, 2).next();
    expect(a).toBe(Rng.fromParts(42, 1, 2).next());
    expect(a).not.toBe(Rng.fromParts(42, 1, 3).next());
  });
  it("[0,1) 범위", () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("calendar", () => {
  it("360일 = 1년, 90일 = 한 계절", () => {
    expect(dateOf(0)).toMatchObject({ year: 0, month: 1, dayOfMonth: 1, season: "봄" });
    expect(dateOf(DAYS_PER_YEAR)).toMatchObject({ year: 1, month: 1 });
    expect(dateOf(240).season).toBe("가을");
    expect(dateOf(359).season).toBe("겨울");
  });
});

describe("weather", () => {
  it("호출 순서와 무관하게 (시드, 해, 지역)으로 결정된다", () => {
    const a = weatherFactor(1, 5, 1);
    weatherFactor(1, 6, 1);
    expect(weatherFactor(1, 5, 1)).toBe(a);
  });
  it("범위 안에 있고 평균이 대략 1이다", () => {
    let sum = 0;
    const n = 4000;
    for (let y = 0; y < n; y++) {
      const f = weatherFactor(99, y, 1);
      expect(f).toBeGreaterThanOrEqual(0.4);
      expect(f).toBeLessThanOrEqual(1.35);
      sum += f;
    }
    expect(sum / n).toBeGreaterThan(0.97);
    expect(sum / n).toBeLessThan(1.03);
  });
});

describe("파종과 수확", () => {
  it("수확 설명: 항들로 값이 정확히 재현된다", () => {
    const { w, r } = fresh(3);
    step(w, SOWING_DAY_OF_YEAR + 1);
    const h = computeHarvest(w.seed, 0, r, HARVEST_DAY_OF_YEAR, w.weatherOverride);
    const t = Object.fromEntries(h.terms.map((x) => [x.label, x.value]));
    const gross = t["파종 면적"]! * t["평년 수확량"]! * t["지력"]! * t["기상"]! * t["수확 완료율"]!;
    expect(h.grossKg).toBeCloseTo(gross, 6);
    expect(h.value).toBeCloseTo(gross - t["내년 종자 보존분"]!, 6);
  });

  it("파종 면적은 토지·일손·종자 중 가장 작은 값이다", () => {
    // 종자가 절반뿐이면 절반만 심는다
    const a = fresh();
    a.r.seedKg = (a.r.arableHa * SEED_KG_PER_HA) / 2;
    step(a.w, SOWING_DAY_OF_YEAR + 1);
    expect(a.r.sownHa).toBeCloseTo(a.r.arableHa / 2, 6);
    expect(a.r.lastSowing!.terms.find((t) => t.label === "한계 요인")!.note).toContain("종자");

    // 개간 인부가 3,000명 나가 있으면 일손이 한계다
    const b = fresh();
    startClearing(b.w, 1, 3000, 3000); // 20ha/일 × 60일 = 1,200ha: 파종일까지 사업이 계속된다
    step(b.w, SOWING_DAY_OF_YEAR + 1);
    expect(b.r.sownHa).toBeCloseTo((popOf(b.r, "farmer") - 3000) * HA_PER_FARMER, 6);
    expect(b.r.lastSowing!.terms.find((t) => t.label === "한계 요인")!.note).toContain("일손");
  });

  it("남은 종자는 곡창으로 돌아간다 (종자가 없어지지 않는다)", () => {
    const { w, r } = fresh();
    const before = r.granaryKg + r.seedKg;
    // 일손으로 1/2만 심게 만든다: 필요한 종자의 절반이 남아야 한다
    startClearing(w, 1, 9000, 500);
    step(w, SOWING_DAY_OF_YEAR + 1);
    expect(r.seedKg).toBe(0);
    const eaten = totalPop(r) * GRAIN_KG_PER_PERSON_DAY * (SOWING_DAY_OF_YEAR + 1);
    // 곡창 손실(연 5%)을 감안해 대략적인 보존만 확인: 곡창 + 심은 종자 ≈ 이전 합 - 소비 - 손실
    const sownSeed = r.sownHa * SEED_KG_PER_HA;
    expect(r.granaryKg + sownSeed).toBeGreaterThan(before - eaten - before * 0.02);
    expect(r.granaryKg + sownSeed).toBeLessThan(before - eaten + 1);
  });

  it("수확 때 일손이 부족하면 부족한 비율만큼 못 거둔다", () => {
    const { w, r } = fresh();
    w.weatherOverride = () => 1.0;
    step(w, SOWING_DAY_OF_YEAR + 1); // 12,600ha 파종
    startClearing(w, 1, 1800, 1000); // 파종 뒤에 인부 1,800명이 나감
    const h = computeHarvest(w.seed, 0, r, HARVEST_DAY_OF_YEAR, w.weatherOverride);
    const expected = ((popOf(r, "farmer") - 1800) * HA_PER_FARMER) / r.sownHa;
    expect(h.fraction).toBeCloseTo(expected, 9);
    expect(h.fraction).toBeLessThan(1);
    expect(h.grossKg).toBeCloseTo(r.sownHa * YIELD_KG_PER_HA * h.fraction, 3);
  });

  it("일손이 남는 지역에서는 인부를 보내도 파종 면적이 줄지 않는다", () => {
    const { w, r } = fresh();
    r.cohorts = [
      { stratum: "farmer", pop: 21_500 },
      { stratum: "artisan", pop: 11_000 },
      { stratum: "elite", pop: 3_500 },
    ];
    r.seedKg = 14_000 * SEED_KG_PER_HA; // 종자는 넉넉하게
    startClearing(w, 1, 1500, 3000); // 파종일까지 계속되는 사업
    step(w, SOWING_DAY_OF_YEAR + 1);
    expect(r.clearing).not.toBeNull();
    // 파종일(60일차) 아침의 경작지 = 12,600 + 10ha/일 × 60일. 토지가 한계이고 일손이 아니다
    expect(r.sownHa).toBeCloseTo(12_600 + (1500 / CLEARING_LABOR_DAYS_PER_HA) * SOWING_DAY_OF_YEAR, 6);
    expect(r.lastSowing!.terms.find((t) => t.label === "한계 요인")!.note).toContain("토지");
  });
});

describe("개간", () => {
  it("매일 인부 수 ÷ 150 ha씩 경작지가 늘고, 새 땅은 지력이 낮아 평균이 내려간다", () => {
    const { w, r } = fresh();
    const arable0 = r.arableHa;
    startClearing(w, 1, 3000, 400);
    step(w, 10);
    const perDay = 3000 / CLEARING_LABOR_DAYS_PER_HA;
    expect(r.arableHa).toBeCloseTo(arable0 + perDay * 10, 6);
    expect(r.clearableHa).toBeCloseTo(4000 - perDay * 10, 6);
    const added = perDay * 10;
    expect(r.soil).toBeCloseTo((1.0 * arable0 + SOIL_OF_CLEARED_LAND * added) / (arable0 + added), 9);
  });

  it("목표 면적에서 멈추고 사업이 끝난다", () => {
    const { w, r } = fresh();
    startClearing(w, 1, 3000, 400); // 20ha/일 → 20일
    step(w, 25);
    expect(r.clearedTotalHa).toBeCloseTo(400, 6);
    expect(r.clearing).toBeNull();
    expect(w.log.some((l) => l.text.includes("개간 사업이 끝났다"))).toBe(true);
  });

  it("중단해도 이미 개간한 땅은 남는다", () => {
    const { w, r } = fresh();
    startClearing(w, 1, 1500, 1000);
    step(w, 30);
    const done = r.clearedTotalHa;
    expect(done).toBeGreaterThan(0);
    expect(stopClearing(w, 1).ok).toBe(true);
    step(w, 30);
    expect(r.clearedTotalHa).toBe(done);
  });

  it("잘못된 명령은 이유와 함께 거절된다", () => {
    const { w } = fresh();
    expect(startClearing(w, 1, 0, 100)).toMatchObject({ ok: false });
    expect(startClearing(w, 1, 999_999, 100)).toMatchObject({ ok: false });
    expect(startClearing(w, 1, 100, 99_999)).toMatchObject({ ok: false });
    expect(startClearing(w, 1, 100, 100)).toEqual({ ok: true });
    expect(startClearing(w, 1, 100, 100)).toMatchObject({ ok: false });
  });

  it("개간하면 수용력이 실제로 커진다", () => {
    const { w, r } = fresh();
    const k0 = carryingCapacity(r);
    startClearing(w, 1, 3000, 1000);
    step(w, 60);
    expect(carryingCapacity(r)).toBeGreaterThan(k0);
  });
});

describe("시뮬레이션 전체", () => {
  it("같은 시드는 같은 결과 (결정론)", () => {
    const a = fresh(11);
    const b = fresh(11);
    step(a.w, DAYS_PER_YEAR * 20);
    step(b.w, DAYS_PER_YEAR * 20);
    expect(totalPop(a.r)).toBe(totalPop(b.r));
    expect(a.r.granaryKg).toBe(b.r.granaryKg);
  });

  it("시드가 다르면 기상이 달라 곡창 재고가 달라진다", () => {
    const a = fresh(1);
    const b = fresh(2);
    step(a.w, DAYS_PER_YEAR * 20);
    step(b.w, DAYS_PER_YEAR * 20);
    expect(a.r.granaryKg).not.toBe(b.r.granaryKg);
  });

  it("100년을 돌려도 재고와 인구가 음수·NaN이 되지 않는다", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { w, r } = fresh(seed);
      step(w, DAYS_PER_YEAR * 100);
      expect(Number.isFinite(totalPop(r))).toBe(true);
      expect(totalPop(r)).toBeGreaterThan(0);
      expect(r.granaryKg).toBeGreaterThanOrEqual(0);
      expect(r.seedKg).toBeGreaterThanOrEqual(0);
    }
  });

  it("인구 구성비가 변하지 않는다 (코호트별 같은 비율로 증감)", () => {
    const { w, r } = fresh(8);
    const before = popOf(r, "farmer") / totalPop(r);
    step(w, DAYS_PER_YEAR * 10);
    expect(popOf(r, "farmer") / totalPop(r)).toBeCloseTo(before, 9);
  });

  it("장기 안정성: 시드 10개 × 200년에서 인구가 수용력 근처에 머문다", () => {
    const finals: number[] = [];
    for (let seed = 1; seed <= 10; seed++) {
      const { w, r } = fresh(seed);
      step(w, DAYS_PER_YEAR * 200);
      finals.push(totalPop(r));
    }
    finals.sort((a, b) => a - b);
    // 수용력 = 12,600ha × (700 − 150)kg/ha ÷ (0.5kg × 360일) = 38,500명 (docs/MODEL.md)
    expect(finals[0]!).toBeGreaterThan(26_000);
    expect(finals[finals.length - 1]!).toBeLessThan(42_000);
  });

  it("대기근 검증: 안정 상태에서 2년 연속 기상 0.5면 3년 뒤 인구가 8~25% 줄어든다", () => {
    // 참고 목표(2차 출처): 잉글랜드 1315~1325년 인구 -12% (1315~17년 대기근 포함 10년).
    const { w, r } = fresh(1);
    w.weatherOverride = (y) => (y >= 60 && y < 62 ? 0.5 : 1.0);
    step(w, DAYS_PER_YEAR * 60);
    const before = totalPop(r);
    step(w, DAYS_PER_YEAR * 3);
    const ratio = totalPop(r) / before;
    expect(ratio).toBeGreaterThan(0.75);
    expect(ratio).toBeLessThan(0.92);
  });

  it("곡창이 비면 식량 부족률이 1에 가깝고 인구가 줄어든다 (방향만 검증)", () => {
    // 한계: 기아 사망이 부족률에 선형이라 완전 기아의 치명성을 과소평가한다. 크기는 검증하지 않는다.
    const { w, r } = fresh();
    r.granaryKg = 0;
    const p0 = totalPop(r);
    step(w, 240);
    expect(totalPop(r)).toBeLessThan(p0 * 0.95);
    expect(r.lastDeficit).toBeGreaterThan(0.9);
  });

  it("평년 수확 입고량이 연 소비량보다 약 28% 많다 (초기 균형 설정 검증)", () => {
    const { w, r } = fresh();
    w.weatherOverride = () => 1.0;
    step(w, SOWING_DAY_OF_YEAR + 1);
    const h = computeHarvest(w.seed, 0, r, HARVEST_DAY_OF_YEAR, w.weatherOverride);
    const annualNeed = totalPop(r) * GRAIN_KG_PER_PERSON_DAY * DAYS_PER_YEAR;
    expect(h.value / annualNeed).toBeGreaterThan(1.2);
    expect(h.value / annualNeed).toBeLessThan(1.35);
  });
});

/* ------------------------------------------------------------------ */
/* 이벤트 엔진과 품질 검사                                              */
/* ------------------------------------------------------------------ */
function withEvents<T>(defs: EventDef[], fn: () => T): T {
  const saved = EVENTS.splice(0, EVENTS.length, ...defs);
  try {
    return fn();
  } finally {
    EVENTS.splice(0, EVENTS.length, ...saved);
  }
}

const m = (o: Partial<Metrics>): Metrics => ({
  pop: 30_000,
  starvationDeaths: 0,
  granaryKg: 5_000_000,
  seedKg: 0,
  arableHa: 12_600,
  sownHa: 0,
  lastHarvestKg: 6_000_000,
  lastHarvestFraction: 1,
  clearedTotalHa: 0,
  ...o,
});

describe("품질 검사: 가짜 선택지 판별", () => {
  it("모든 지표에서 같거나 낫고 하나라도 확실히 나으면 지배한다", () => {
    expect(dominates(m({ pop: 31_000 }), m({ pop: 30_000 }))).toBe(true);
    expect(dominates(m({ pop: 30_000 }), m({ pop: 30_000 }))).toBe(false); // 같으면 지배 아님
    expect(dominates(m({ pop: 30_100 }), m({ pop: 30_000 }))).toBe(false); // 0.5% 이내는 같음
  });

  it("진짜 상충(인구는 높고 재고는 낮음)은 지배가 아니다", () => {
    const a = m({ pop: 31_000, granaryKg: 1_000_000 });
    const b = m({ pop: 30_000, granaryKg: 5_000_000 });
    expect(dominates(a, b)).toBe(false);
    expect(dominates(b, a)).toBe(false);
  });

  const opt = (id: string, normal: Metrics, bad: Metrics): PendingOption => ({
    id,
    label: id,
    outcomes: { normal: { forecast: normal, series: [] }, bad: { forecast: bad, series: [] } },
  });

  it("모든 시나리오에서 지배당한 선택지를 찾아낸다", () => {
    const opts = [
      opt("x", m({ pop: 31_000 }), m({ pop: 31_000 })),
      opt("y", m({ pop: 29_000 }), m({ pop: 29_000 })),
    ];
    expect(dominatedOptions(opts)).toEqual([{ id: "y", by: "x" }]);
  });

  it("평년에는 지지만 흉년에는 이기는 선택지(비축 같은 보험)는 가짜가 아니다", () => {
    const opts = [
      opt("쓴다", m({ pop: 31_000 }), m({ pop: 26_000 })), // 평년엔 낫고 흉년엔 크게 손해
      opt("아낀다", m({ pop: 30_000 }), m({ pop: 29_000 })), // 평년엔 조금 손해, 흉년엔 이득
    ];
    expect(dominatedOptions(opts)).toEqual([]);
  });
});

describe("폐기한 이벤트는 품질 검사에서 실제로 걸린다", () => {
  it("종자 이벤트: 종자를 먹는 선택지는 지평 끝에서 '먹지 않음'에 지배당한다", () => {
    withEvents(REJECTED_EVENTS, () => {
      const { w } = fresh(1);
      w.weatherOverride = (y) => (y === 1 ? 0.4 : 1.0);
      let guard = 0;
      while (!w.pending && guard++ < 360 * 3) step(w, 1);
      expect(w.pending?.eventId).toBe("spring-seed-dilemma");
      const dominated = dominatedOptions(w.pending!.options);
      expect(dominated.map((d) => d.id)).toEqual(expect.arrayContaining(["half"]));
      // 단기 이득은 실제로 있다: 첫 시점(올가을 수확 직후)에는 half의 인구가 더 높다.
      const keep = w.pending!.options.find((o) => o.id === "keep")!;
      const half = w.pending!.options.find((o) => o.id === "half")!;
      expect(half.outcomes.normal.series[0]!.metrics.pop).toBeGreaterThan(keep.outcomes.normal.series[0]!.metrics.pop);
      expect(half.outcomes.normal.series[2]!.metrics.pop).toBeLessThan(keep.outcomes.normal.series[2]!.metrics.pop);
    });
  });

  it("수확 인부 이벤트: 계속 개간하는 선택지는 인부를 돌려보내는 선택지에 지배당한다", () => {
    withEvents(REJECTED_EVENTS, () => {
      const { w } = fresh(1);
      w.weatherOverride = () => 1.0;
      step(w, 100);
      startClearing(w, 1, 1500, 2000);
      let guard = 0;
      while (!w.pending && guard++ < 400) step(w, 1);
      expect(w.pending?.eventId).toBe("harvest-labor-conflict");
      expect(dominatedOptions(w.pending!.options).map((d) => d.id)).toContain("continue");
    });
  });
});

describe("이벤트 엔진", () => {
  // 엔진 시험용 이벤트: 선택 결과를 모델로 예측하는 구조만 검증한다 (출시용 이벤트가 아님).
  const probe: EventDef = {
    id: "probe",
    title: "시험용",
    checkpoints: [
      { days: 100, label: "100일 뒤" },
      { days: 400, label: "400일 뒤" },
    ],
    check: (w) => w.day === 20, // 첫 해에 한 번만
    text: () => "시험",
    options: () => [
      { id: "none", label: "아무것도 하지 않는다", apply: () => {}, logText: () => "아무것도 하지 않았다." },
      {
        id: "clear",
        label: "개간한다",
        apply: (ww) => {
          startClearing(ww, 1, 3000, 1000);
        },
        logText: () => "개간을 시작했다.",
      },
    ],
  };

  it("사건이 열리면 시간이 멈추고, 처리하면 다시 흐른다. 같은 해에 다시 열리지 않는다", () => {
    withEvents([probe], () => {
      const { w } = fresh();
      const advanced = step(w, 100);
      expect(advanced).toBe(20);
      expect(w.pending).not.toBeNull();
      expect(step(w, 50)).toBe(0); // 멈춰 있다
      expect(resolveEvent(w, "clear")).toEqual({ ok: true });
      expect(w.pending).toBeNull();
      expect(step(w, 100)).toBe(100);
      expect(w.pending).toBeNull(); // 같은 해에는 다시 열리지 않음
    });
  });

  it("선택지마다 모델을 실제로 돌린 예측이 붙고, 선택에 따라 결과가 크게 갈린다", () => {
    withEvents([probe], () => {
      const { w } = fresh();
      step(w, 100);
      const [none, clear] = w.pending!.options;
      expect(none!.outcomes.normal.series.map((s) => s.days)).toEqual([100, 400]);
      // 개간을 선택하면 경작지가 실제로 늘고, 일손이 줄어 수확은 줄어든다
      expect(clear!.outcomes.normal.forecast.arableHa).toBeGreaterThan(none!.outcomes.normal.forecast.arableHa + 900);
      expect(clear!.outcomes.normal.forecast.lastHarvestKg!).toBeLessThan(none!.outcomes.normal.forecast.lastHarvestKg!);
    });
  });

  it("평년 기상이면 예측과 실제가 정확히 일치한다 (예측이 정직하다)", () => {
    withEvents([probe], () => {
      const { w, r } = fresh(5);
      w.weatherOverride = () => 1.0;
      step(w, 100);
      const predicted = w.pending!.options.find((o) => o.id === "clear")!.outcomes.normal.forecast;
      resolveEvent(w, "clear");
      step(w, 400);
      const d = w.decisions[0]!;
      expect(d.actual).not.toBeNull();
      expect(d.actual!.pop).toBeCloseTo(predicted.pop, 6);
      expect(d.actual!.granaryKg).toBeCloseTo(predicted.granaryKg, 3);
      expect(d.actual!.arableHa).toBeCloseTo(predicted.arableHa, 6);
      expect(r.clearedTotalHa).toBeCloseTo(predicted.clearedTotalHa, 6);
    });
  });

  it("실제 기상이 평년과 다르면 예측과 실제가 갈린다 (예측은 평년 가정)", () => {
    withEvents([probe], () => {
      const { w } = fresh(5);
      w.weatherOverride = (y) => (y === 0 ? 0.5 : 1.0);
      step(w, 100);
      const predicted = w.pending!.options.find((o) => o.id === "none")!.outcomes.normal.forecast;
      resolveEvent(w, "none");
      step(w, 400);
      expect(Math.abs(w.decisions[0]!.actual!.granaryKg - predicted.granaryKg)).toBeGreaterThan(500_000);
    });
  });

  it("흉년 시나리오는 다음 수확만 BAD_WEATHER로 돌리고 나머지는 평년이다", () => {
    const { w } = fresh(5);
    step(w, 100); // 첫 수확(240일차) 전
    const normal = forecastSeries(w, 1, [{ days: 400, label: "" }], undefined, "normal")[0]!.metrics;
    const bad = forecastSeries(w, 1, [{ days: 400, label: "" }], undefined, "bad")[0]!.metrics;
    // 400일 뒤 = 두 번째 수확(600일차) 전. 마지막으로 거둔 수확은 첫 수확이고, 흉년 시나리오에서는 그것이 흉년이다.
    expect(bad.lastHarvestKg!).toBeLessThan(normal.lastHarvestKg! * 0.7);
    // 두 번째 수확은 평년으로 돌아간다
    const normal2 = forecastSeries(w, 1, [{ days: 600, label: "" }], undefined, "normal")[0]!.metrics;
    const bad2 = forecastSeries(w, 1, [{ days: 600, label: "" }], undefined, "bad")[0]!.metrics;
    expect(bad2.lastHarvestKg!).toBeGreaterThan(normal2.lastHarvestKg! * 0.9);
  });

  it("예측용 복제는 원본을 건드리지 않는다", () => {
    const { w, r } = fresh();
    const snap = JSON.stringify({ d: w.day, p: totalPop(r), g: r.granaryKg, c: r.clearing });
    forecast(w, 1, 400, (c) => {
      startClearing(c, 1, 3000, 1000);
    });
    expect(JSON.stringify({ d: w.day, p: totalPop(r), g: r.granaryKg, c: r.clearing })).toBe(snap);
  });
});
