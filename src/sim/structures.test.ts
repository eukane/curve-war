import { describe, expect, it } from "vitest";
import { WAR_REGIONS } from "../data/start-regions";
import { FORT_DAYS, FORT_WORKERS, FRONT_POINTS, MAX_CONCURRENT_BUILDS, ROAD_DAYS } from "./constants";
import { activeBuilds, aiBuild, cancelBuild, canBuild, fortController, fortMultipliers, roadFalloffMultipliers, startBuild, tickBuilds } from "./structures";
import { computePressure } from "./war";
import { createWorld, fieldFarmersAt, forecast, stepDay } from "./world";
import type { World } from "./world";

const newWar = (seed = 1): World => createWorld(seed, WAR_REGIONS, { war: { playerRegionId: 1, rivalRegionId: 2, ai: { mode: "scripted", edicts: false } } });
const P = (w: World) => w.regions[0]!;
const flat = (w: World, x = 500) => {
  w.war!.front = Array(FRONT_POINTS).fill(x);
  w.war!.orders.player = Array(FRONT_POINTS).fill(x);
  w.war!.orders.rival = Array(FRONT_POINTS).fill(x);
};
const finish = (w: World, id: number) => {
  const s = w.war!.structures.find((x) => x.id === id)!;
  while (!s.done) tickBuilds(w);
};

describe("건설: 공사 수명", () => {
  it("시작하면 인부가 농사에서 빠지고, 정해진 날수 뒤에 완공되어 인부가 돌아온다", () => {
    const w = newWar();
    const before = fieldFarmersAt(P(w), w.day);
    const r = startBuild(w, "player", "fort", 8);
    expect(r.ok).toBe(true);
    expect(fieldFarmersAt(P(w), w.day)).toBeCloseTo(before - FORT_WORKERS * P(w).rules.fieldLaborMult, 5);
    for (let i = 0; i < FORT_DAYS - 1; i++) tickBuilds(w);
    expect(w.war!.structures[0]!.done).toBe(false);
    tickBuilds(w);
    expect(w.war!.structures[0]!.done).toBe(true);
    expect(fieldFarmersAt(P(w), w.day)).toBeCloseTo(before, 5);
    expect(P(w).buildWorkers).toBe(0);
  });

  it("도로는 요새보다 오래 걸린다", () => {
    expect(ROAD_DAYS).toBeGreaterThan(FORT_DAYS);
  });

  it("취소하면 진행이 사라지고 인부가 즉시 돌아온다", () => {
    const w = newWar();
    const before = fieldFarmersAt(P(w), w.day);
    const r = startBuild(w, "player", "fort", 8);
    if (!r.ok) throw new Error(r.reason);
    for (let i = 0; i < 30; i++) tickBuilds(w);
    expect(cancelBuild(w, "player", r.id).ok).toBe(true);
    expect(w.war!.structures.length).toBe(0);
    expect(fieldFarmersAt(P(w), w.day)).toBeCloseTo(before, 5);
    expect(cancelBuild(w, "player", r.id).ok).toBe(false);
  });

  it("완공된 건물은 취소할 수 없다", () => {
    const w = newWar();
    const r = startBuild(w, "player", "fort", 8);
    if (!r.ok) throw new Error(r.reason);
    finish(w, r.id);
    expect(cancelBuild(w, "player", r.id).ok).toBe(false);
  });
});

describe("건설: 제약", () => {
  it(`동시에 ${MAX_CONCURRENT_BUILDS}곳까지만`, () => {
    const w = newWar();
    expect(startBuild(w, "player", "fort", 3).ok).toBe(true);
    expect(startBuild(w, "player", "road", 9).ok).toBe(true);
    const third = startBuild(w, "player", "fort", 14);
    expect(third.ok).toBe(false);
    expect(activeBuilds(w, "player").length).toBe(MAX_CONCURRENT_BUILDS);
  });

  it("같은 종류를 가까이 겹쳐 지을 수 없다", () => {
    const w = newWar();
    expect(startBuild(w, "player", "fort", 8).ok).toBe(true);
    expect(canBuild(w, "player", "fort", 9).ok).toBe(false);
    expect(canBuild(w, "player", "fort", 13).ok).toBe(true);
  });

  it("농민이 모자라면 짓지 못한다", () => {
    const w = newWar();
    P(w).cohorts.find((c) => c.stratum === "farmer")!.pop = FORT_WORKERS;
    expect(canBuild(w, "player", "fort", 8).ok).toBe(false);
  });

  it("전선 밖 구간은 거부한다", () => {
    const w = newWar();
    expect(canBuild(w, "player", "fort", -1).ok).toBe(false);
    expect(canBuild(w, "player", "fort", FRONT_POINTS).ok).toBe(false);
  });
});

describe("건설: 효과", () => {
  it("공사 중인 요새는 효과가 없고, 완공되면 그 구간 근처의 우리 밀도만 오른다", () => {
    const w = newWar();
    flat(w, 500);
    const base = computePressure(w);
    const r = startBuild(w, "player", "fort", 8);
    if (!r.ok) throw new Error(r.reason);
    expect(computePressure(w).playerDensity[8]).toBeCloseTo(base.playerDensity[8]!, 9);
    finish(w, r.id);
    const after = computePressure(w);
    expect(after.playerDensity[8]!).toBeGreaterThan(base.playerDensity[8]! * 1.2);
    expect(after.playerDensity[0]!).toBeCloseTo(base.playerDensity[0]!, 9); // 먼 구간은 그대로
    expect(after.rivalDensity[8]!).toBeCloseTo(base.rivalDensity[8]!, 9); // 적 밀도는 그대로
  });

  it("전선이 요새를 넘으면 요새는 적의 것이 되어 적 밀도를 올린다", () => {
    const w = newWar();
    flat(w, 500);
    const r = startBuild(w, "player", "fort", 8);
    if (!r.ok) throw new Error(r.reason);
    finish(w, r.id);
    const s = w.war!.structures[0]!;
    expect(fortController(w, s)).toBe("player");
    expect(fortMultipliers(w).player[8]!).toBeGreaterThan(1);
    w.war!.front[8] = s.x - 5; // 전선이 요새 뒤로 밀림
    expect(fortController(w, s)).toBe("rival");
    expect(fortMultipliers(w).rival[8]!).toBeGreaterThan(1);
    expect(fortMultipliers(w).player[8]!).toBe(1);
  });

  it("요새 효과는 전선이 요새에서 멀어지면 사라진다", () => {
    const w = newWar();
    flat(w, 500);
    const r = startBuild(w, "player", "fort", 8);
    if (!r.ok) throw new Error(r.reason);
    finish(w, r.id);
    w.war!.front[8] = w.war!.structures[0]!.x + 400; // 요새는 한참 뒤
    expect(fortMultipliers(w).player[8]!).toBe(1);
  });

  it("도로는 완공 뒤에만, 그 구간 주변의 보급 배율만 올린다", () => {
    const w = newWar();
    const r = startBuild(w, "player", "road", 8);
    if (!r.ok) throw new Error(r.reason);
    expect(roadFalloffMultipliers(w).player[8]).toBe(1);
    finish(w, r.id);
    const m = roadFalloffMultipliers(w);
    expect(m.player[8]!).toBeGreaterThan(1);
    expect(m.player[0]!).toBe(1);
    expect(m.rival[8]!).toBe(1);
  });

  it("도로가 있으면 먼 전선에서 우리 밀도가 더 높다 (보급)", () => {
    const w = newWar();
    flat(w, 900); // 수도에서 먼 선
    const base = computePressure(w).playerDensity[8]!;
    const r = startBuild(w, "player", "road", 8);
    if (!r.ok) throw new Error(r.reason);
    finish(w, r.id);
    expect(computePressure(w).playerDensity[8]!).toBeGreaterThan(base);
  });
});

describe("건설: 시간과 예측", () => {
  it("stepDay로 돌리면 날마다 진행되어 완공된다 (결정성 포함)", () => {
    const run = () => {
      const w = newWar(7);
      startBuild(w, "player", "fort", 8);
      for (let i = 0; i < FORT_DAYS; i++) stepDay(w);
      return JSON.stringify([w.war!.structures, w.war!.front]);
    };
    const a = run();
    expect(a).toBe(run());
    expect(JSON.parse(a)[0][0].done).toBe(true);
  });

  it("봄에 인부를 빼면 그해 수확이 줄고, 여름에 빼면 줄지 않는다 (일손 모델이 계절 논리를 만든다)", () => {
    // 같은 날까지 돌린 같은 세계에서 "짓는 경우"와 "안 짓는 경우"를 비교한다 (기준선을 날짜마다 따로 잡는다)
    const harvest = (startDay: number, build: boolean) => {
      const w = newWar(3);
      while (w.day < startDay) stepDay(w);
      const m = forecast(w, 1, 370 - w.day, (c) => {
        if (build) startBuild(c, "player", "fort", 8);
      });
      return m.lastHarvestKg!;
    };
    const springLoss = 1 - harvest(0, true) / harvest(0, false);
    const summerLoss = 1 - harvest(100, true) / harvest(100, false);
    expect(springLoss).toBeGreaterThan(0.01);
    // 여름 공사도 완공된 요새가 전선을 조금 바꾸므로 0은 아니다. 일손 때문에 생기는 손실(봄)에 비해 훨씬 작아야 한다.
    expect(Math.abs(summerLoss)).toBeLessThan(springLoss / 5);
  });
});

describe("건설: 적 AI", () => {
  it("봄·가을에는 짓지 않고, 여름·겨울에 앞선 구간에 요새를 최대 둘까지 짓는다", () => {
    const w = newWar();
    const net = Array(FRONT_POINTS).fill(0);
    net[6] = 20;
    net[11] = 15;
    net[13] = 12;
    w.day = 10; // 봄
    aiBuild(w, net);
    expect(w.war!.structures.length).toBe(0);
    w.day = 100; // 여름
    aiBuild(w, net);
    expect(w.war!.structures.length).toBe(1);
    expect(w.war!.structures[0]!.realm).toBe("rival");
    expect(w.war!.structures[0]!.sector).toBe(6);
    w.day = 280; // 겨울
    aiBuild(w, net);
    expect(w.war!.structures.length).toBe(2);
    aiBuild(w, net);
    expect(w.war!.structures.filter((s) => s.kind === "fort").length).toBe(2); // 상한
  });

  it("우리가 앞서지 않으면 짓지 않는다", () => {
    const w = newWar();
    w.day = 100;
    aiBuild(w, Array(FRONT_POINTS).fill(3));
    expect(w.war!.structures.length).toBe(0);
  });
});
