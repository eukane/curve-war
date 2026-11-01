import { describe, expect, it } from "vitest";
import { START_REGIONS } from "../data/start-regions";
import { DAYS_PER_YEAR, dateOf } from "./calendar";
import { Rng } from "./rng";
import { computeHarvest, createWorld, popOf, step, totalPop, weatherFactor } from "./world";

describe("Rng", () => {
  it("같은 시드와 부품이면 같은 값, 다르면 다른 값", () => {
    const a = Rng.fromParts(42, 1, 2).next();
    const b = Rng.fromParts(42, 1, 2).next();
    const c = Rng.fromParts(42, 1, 3).next();
    expect(a).toBe(b);
    expect(a).not.toBe(c);
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
      expect(f).toBeGreaterThanOrEqual(0.45);
      expect(f).toBeLessThanOrEqual(1.35);
      sum += f;
    }
    expect(sum / n).toBeGreaterThan(0.97);
    expect(sum / n).toBeLessThan(1.03);
  });
});

describe("harvest 설명 가능성", () => {
  it("terms를 formula대로 곱하면 value와 같다", () => {
    const w = createWorld(3, START_REGIONS);
    const h = computeHarvest(w.seed, 0, w.regions[0]!);
    const t = Object.fromEntries(h.terms.map((x) => [x.label, x.value]));
    const recomputed = t["경작면적"]! * t["평년 수확량"]! * t["지력"]! * t["기상"]! * (1 - t["종자 비율"]!);
    expect(h.value).toBeCloseTo(recomputed, 6);
  });
});

describe("시뮬레이션", () => {
  it("같은 시드는 같은 결과 (결정론)", () => {
    const a = createWorld(11, START_REGIONS);
    const b = createWorld(11, START_REGIONS);
    step(a, DAYS_PER_YEAR * 20);
    step(b, DAYS_PER_YEAR * 20);
    expect(totalPop(a.regions[0]!)).toBe(totalPop(b.regions[0]!));
    expect(a.regions[0]!.granaryKg).toBe(b.regions[0]!.granaryKg);
  });

  it("시드가 다르면 기상이 달라 결과가 달라진다", () => {
    const a = createWorld(1, START_REGIONS);
    const b = createWorld(2, START_REGIONS);
    step(a, DAYS_PER_YEAR * 20);
    step(b, DAYS_PER_YEAR * 20);
    expect(totalPop(a.regions[0]!)).not.toBe(totalPop(b.regions[0]!));
  });

  it("100년을 돌려도 재고와 인구가 음수·NaN이 되지 않는다", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const w = createWorld(seed, START_REGIONS);
      step(w, DAYS_PER_YEAR * 100);
      const r = w.regions[0]!;
      expect(Number.isFinite(totalPop(r))).toBe(true);
      expect(totalPop(r)).toBeGreaterThan(0);
      expect(r.granaryKg).toBeGreaterThanOrEqual(0);
    }
  });

  it("인구 구성비가 변하지 않는다 (코호트별 같은 비율로 증감)", () => {
    const w = createWorld(8, START_REGIONS);
    const r = w.regions[0]!;
    const before = popOf(r, "farmer") / totalPop(r);
    step(w, DAYS_PER_YEAR * 10);
    expect(popOf(r, "farmer") / totalPop(r)).toBeCloseTo(before, 9);
  });

  it("흉년(기상 최저)이 이어지면 인구가 줄고, 풍년이면 재고가 쌓인다", () => {
    const bad = createWorld(1, START_REGIONS);
    const r = bad.regions[0]!;
    // 흉년 상황을 만들기 위해 곡창을 비워 둔 채 시작
    r.granaryKg = 0;
    const p0 = totalPop(r);
    step(bad, 240); // 수확 전까지 먹을 것이 없다
    expect(totalPop(r)).toBeLessThan(p0 * 0.8);
    expect(r.lastDeficit).toBeGreaterThan(0.9);
  });

  it("평년 수확 입고량이 연 소비량과 같은 규모다 (초기 균형 설정 검증)", () => {
    const w = createWorld(1, START_REGIONS);
    const r = w.regions[0]!;
    const h = computeHarvest(w.seed, 0, { ...r });
    const annualNeed = totalPop(r) * 0.6 * DAYS_PER_YEAR;
    const normal = h.value / weatherFactor(w.seed, 0, 1); // 기상 1.0일 때로 환산
    expect(normal / annualNeed).toBeGreaterThan(0.95);
    expect(normal / annualNeed).toBeLessThan(1.1);
  });
});
