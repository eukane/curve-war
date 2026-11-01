import { describe, expect, it } from "vitest";
import { WAR_REGIONS } from "../data/start-regions";
import { COMMANDER_DAYS_PER_LEVEL, COMMANDER_TRAVEL_DAYS, COMMAND_ZONES, FRONT_POINTS } from "./constants";
import { aiCommanders, autoAssign, assignCommander, commanderAt, commanderDensityMultipliers, commanderSupplyMultipliers, effectOf, levelOf, tickCommanders } from "./commanders";
import { computePressure } from "./war";
import { createWorld, stepDay } from "./world";
import type { World } from "./world";

const newWar = (seed = 1): World => createWorld(seed, WAR_REGIONS, { war: { playerRegionId: 1, rivalRegionId: 2, ai: { mode: "scripted", edicts: false } } });
const flat = (w: World, x = 500) => {
  w.war!.front = Array(FRONT_POINTS).fill(x);
  w.war!.orders.player = Array(FRONT_POINTS).fill(x);
  w.war!.orders.rival = Array(FRONT_POINTS).fill(x);
};
const arrive = (w: World, id: number, zone: number) => {
  expect(assignCommander(w, "player", id, zone).ok).toBe(true);
  for (let i = 0; i < COMMANDER_TRAVEL_DAYS; i++) {
    w.day += 1;
    tickCommanders(w);
  }
};
const SEO = 1, HAN = 2, DOHA = 3; // 공세형, 수성형, 군수형 (플레이어)

describe("지휘관: 배치와 이동", () => {
  it("배치하면 이동 중에는 효과가 없고, 도착하면 그 구간에서 효과가 난다", () => {
    const w = newWar();
    flat(w);
    for (let i = 8; i < 11; i++) w.war!.orders.player[i] = 560; // 중부에서 앞으로 내민다
    const base = computePressure(w).playerDensity[8]!;
    assignCommander(w, "player", SEO, 1);
    expect(commanderAt(w, "player", 1)).toBeUndefined();
    expect(computePressure(w).playerDensity[8]).toBeCloseTo(base, 9);
    for (let i = 0; i < COMMANDER_TRAVEL_DAYS; i++) {
      w.day += 1;
      tickCommanders(w);
    }
    expect(commanderAt(w, "player", 1)?.id).toBe(SEO);
    expect(computePressure(w).playerDensity[8]!).toBeGreaterThan(base * 1.05);
  });

  it("한 구간에는 한 사람만, 같은 구간으로 다시 보내지 못한다", () => {
    const w = newWar();
    expect(assignCommander(w, "player", SEO, 0).ok).toBe(true);
    expect(assignCommander(w, "player", HAN, 0).ok).toBe(false);
    expect(assignCommander(w, "player", SEO, 0).ok).toBe(false);
    expect(assignCommander(w, "player", SEO, 3).ok).toBe(false);
    expect(assignCommander(w, "player", 99, 0).ok).toBe(false);
  });

  it("대기시키면 효과가 즉시 사라진다", () => {
    const w = newWar();
    flat(w);
    arrive(w, SEO, 1);
    expect(commanderAt(w, "player", 1)).toBeDefined();
    assignCommander(w, "player", SEO, null);
    expect(commanderAt(w, "player", 1)).toBeUndefined();
  });
});

describe("지휘관: 성향은 명령에 따라 득이 되기도 실이 되기도 한다", () => {
  const dens = (trait: number, advancing: boolean) => {
    const w = newWar();
    flat(w);
    const base = computePressure(w).playerDensity[8]!;
    if (advancing) for (let i = 6; i <= 10; i++) w.war!.orders.player[i] = 560;
    const withoutCmd = computePressure(w).playerDensity[8]!;
    arrive(w, trait, 1);
    return computePressure(w).playerDensity[8]! / withoutCmd - base * 0; // 배율
  };
  it("공세형: 내밀 때 +, 지킬 때 −", () => {
    expect(dens(SEO, true)).toBeGreaterThan(1);
    expect(dens(SEO, false)).toBeLessThan(1);
  });
  it("수성형: 지킬 때 +, 내밀 때 −", () => {
    expect(dens(HAN, false)).toBeGreaterThan(1);
    expect(dens(HAN, true)).toBeLessThan(1);
  });
  it("군수형: 밀도 배율은 그대로, 보급 배율만 오른다", () => {
    const w = newWar();
    flat(w);
    arrive(w, DOHA, 2);
    expect(commanderDensityMultipliers(w).player[14]).toBe(1);
    expect(commanderSupplyMultipliers(w).player[14]!).toBeGreaterThan(1);
    expect(commanderSupplyMultipliers(w).player[3]).toBe(1);
  });
  it("지휘관이 없는 구간은 기본 규칙 그대로다 (불이익 없음)", () => {
    const w = newWar();
    flat(w);
    arrive(w, SEO, 1);
    expect(commanderDensityMultipliers(w).player[0]).toBe(1);
    expect(commanderDensityMultipliers(w).player[14]).toBe(1);
  });
});

describe("지휘관: 경험", () => {
  it("근무한 날수에 따라 계급이 오르고 효과가 커진다 (최대 3)", () => {
    const w = newWar();
    arrive(w, SEO, 1);
    const c = w.war!.commanders.find((x) => x.id === SEO)!;
    const e0 = effectOf(c);
    for (let i = 0; i < COMMANDER_DAYS_PER_LEVEL; i++) tickCommanders(w);
    expect(levelOf(c)).toBe(1);
    expect(effectOf(c)).toBeGreaterThan(e0);
    for (let i = 0; i < COMMANDER_DAYS_PER_LEVEL * 10; i++) tickCommanders(w);
    expect(levelOf(c)).toBe(3);
  });
  it("이동 중이거나 대기 중에는 근무 일수가 쌓이지 않고, 옮겨도 계급은 유지된다", () => {
    const w = newWar();
    arrive(w, SEO, 1);
    for (let i = 0; i < COMMANDER_DAYS_PER_LEVEL; i++) tickCommanders(w);
    const c = w.war!.commanders.find((x) => x.id === SEO)!;
    const worked = c.workDays;
    assignCommander(w, "player", SEO, 0);
    for (let i = 0; i < 10; i++) {
      w.day += 1;
      tickCommanders(w);
    }
    expect(c.workDays).toBe(worked);
    expect(levelOf(c)).toBe(1);
  });
});

describe("지휘관: 적", () => {
  it("적 지휘관은 성향에 맞는 구간으로 배치되고, 구간이 겹치지 않는다", () => {
    const w = newWar();
    flat(w);
    aiCommanders(w, Array(FRONT_POINTS).fill(0));
    const zones = w.war!.commanders.filter((c) => c.realm === "rival").map((c) => c.toZone);
    expect(new Set(zones).size).toBe(3);
    expect(zones.every((z) => z !== null)).toBe(true);
  });
  it("적 공세형은 적이 가장 앞선 구간, 수성형은 가장 밀리는 구간을 고른다", () => {
    const w = newWar();
    flat(w);
    const net = Array(FRONT_POINTS).fill(0);
    for (let i = 11; i <= 16; i++) net[i] = -20; // 남부는 적이 앞선다
    for (let i = 0; i <= 5; i++) net[i] = 20; // 북부는 적이 밀린다
    aiCommanders(w, net);
    const at = (id: number) => w.war!.commanders.find((c) => c.id === id)!.toZone;
    expect(at(4)).toBe(2); // 공세형 카슬 → 남부
    expect(at(5)).toBe(0); // 수성형 모란 → 북부
  });
  it("AI가 켜진 세계에서는 시간이 지나면 적 지휘관이 배치된다 (결정성 포함)", () => {
    const run = () => {
      const w = createWorld(3, WAR_REGIONS, { war: { playerRegionId: 1, rivalRegionId: 2, ai: { mode: "scripted" } } });
      for (let i = 0; i < 120; i++) stepDay(w);
      return JSON.stringify(w.war!.commanders);
    };
    const a = run();
    expect(a).toBe(run());
    expect(JSON.parse(a).filter((c: { realm: string; zone: number | null }) => c.realm === "rival" && c.zone !== null).length).toBe(3);
    void COMMAND_ZONES;
  });
});

describe("지휘관: 플레이어 자동 배치(위임)", () => {
  it("instant면 이동 없이 바로 자리 잡고, 성향에 맞는 구간을 고른다 (우리가 앞선 구간 = 공세형, 밀리는 구간 = 수성형)", () => {
    const w = newWar();
    flat(w);
    const net = Array(FRONT_POINTS).fill(0);
    for (let i = 6; i <= 10; i++) net[i] = 20; // 중부에서 우리가 앞선다
    for (let i = 11; i <= 16; i++) net[i] = -20; // 남부에서 밀린다
    autoAssign(w, "player", net, true);
    const c = (id: number) => w.war!.commanders.find((x) => x.id === id)!;
    expect(c(SEO).zone).toBe(1);
    expect(c(HAN).zone).toBe(2);
    expect(c(DOHA).zone).toBe(0);
    expect(w.war!.commanders.filter((x) => x.realm === "player").every((x) => x.toZone === null)).toBe(true);
  });
  it("instant가 아니면 이동 시간이 든다", () => {
    const w = newWar();
    flat(w);
    autoAssign(w, "player", Array(FRONT_POINTS).fill(0));
    expect(w.war!.commanders.filter((x) => x.realm === "player").every((x) => x.zone === null && x.toZone !== null)).toBe(true);
  });
});
