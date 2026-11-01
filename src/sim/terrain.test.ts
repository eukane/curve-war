import { describe, expect, it } from "vitest";
import { WAR_REGIONS } from "../data/start-regions";
import { FLAT_MOVE_DRY, FLAT_MOVE_WET, FRONT_POINTS, RIDGE_MOVE, TIDE_LEVEL_BY_SEASON } from "./constants";
import { TERRAIN, flatMoveMult, strengthAt, terrainAt, tideLevel } from "./terrain";
import { computePressure } from "./war";
import { createWorld, levy, setOrder, step } from "./world";
import type { World } from "./world";

const newWar = (seed = 1): World => createWorld(seed, WAR_REGIONS, { war: { playerRegionId: 1, rivalRegionId: 2, ai: { mode: "scripted", edicts: false } } });
const flat = (w: World, x = 500) => {
  w.war!.front = Array(FRONT_POINTS).fill(x);
  w.war!.orders.player = Array(FRONT_POINTS).fill(x);
  w.war!.orders.rival = Array(FRONT_POINTS).fill(x);
};
const SPRING = 10, SUMMER = 100, AUTUMN = 190, WINTER = 280;
const BAY = TERRAIN.find((f) => f.id === "bay")!;
const RIDGE = TERRAIN.find((f) => f.id === "ridge")!;

describe("지형: 기하", () => {
  it("요소 중심은 강도 1, 멀리 떨어진 곳은 0, 가장자리는 그 사이", () => {
    expect(strengthAt(BAY, BAY.cx, BAY.cy)).toBe(1);
    expect(strengthAt(BAY, 0, 0)).toBe(0);
    const edge = strengthAt(BAY, BAY.cx + BAY.rx * 1.1, BAY.cy);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
  });
  it("수도 근처와 전선 시작점(중앙 북부)은 지형이 없다", () => {
    expect(terrainAt(90, 320, 0).features.length).toBe(0);
    expect(terrainAt(910, 320, 0).features.length).toBe(0);
    expect(terrainAt(500, 40, 0).features.length).toBe(0);
  });
  it("남부 전선은 갯벌에 걸린다", () => {
    expect(terrainAt(500, 600, 0).features.map((f) => f.id)).toContain("bay");
  });
});

describe("조수", () => {
  it("계절 평균 수위: 여름이 가장 높고 겨울이 가장 낮다", () => {
    expect(tideLevel(SUMMER)).toBe(TIDE_LEVEL_BY_SEASON[1]);
    expect(tideLevel(WINTER)).toBe(TIDE_LEVEL_BY_SEASON[3]);
    expect(tideLevel(SUMMER)).toBeGreaterThan(tideLevel(SPRING));
    expect(tideLevel(SPRING)).toBeGreaterThan(tideLevel(AUTUMN));
    expect(tideLevel(AUTUMN)).toBeGreaterThan(tideLevel(WINTER));
  });
  it("갯벌의 이동 배율은 간조에서 FLAT_MOVE_DRY, 큰물에서 FLAT_MOVE_WET", () => {
    expect(flatMoveMult(0)).toBe(FLAT_MOVE_DRY);
    expect(flatMoveMult(1)).toBeCloseTo(FLAT_MOVE_WET, 9);
    expect(terrainAt(BAY.cx, BAY.cy, WINTER).moveMult).toBeCloseTo(FLAT_MOVE_DRY, 9);
    expect(terrainAt(BAY.cx, BAY.cy, SUMMER).moveMult).toBeCloseTo(FLAT_MOVE_WET, 9);
  });
});

describe("지형이 전선을 실제로 바꾼다", () => {
  /** 같은 힘 차이를 북부(지형 없음)와 남부(갯벌)에 주고, 남부의 하루 이동이 북부의 몇 배인지 본다 */
  const southToNorth = (day: number) => {
    const w = newWar();
    flat(w, 500);
    w.day = day;
    levy(w, 1, 4000);
    for (const t of w.regions[0]!.trainees) t.readyDay = 0; // 훈련이 끝난 병력
    const p = computePressure(w);
    expect(p.net[2]).toBeCloseTo(p.net[14]!, 6); // 두 점의 힘 차이는 같다
    return p.force[14]! / p.force[2]!; // 두 점의 net이 같으면 이동 배율 비가 지형 배율이다
  };
  it("같은 힘이면 큰물(여름)에는 갯벌 구간이 거의 움직이지 않고, 간조(겨울)에는 오히려 빠르다", () => {
    const summer = southToNorth(SUMMER);
    const winter = southToNorth(WINTER);
    expect(summer).toBeLessThan(0.3);
    expect(winter).toBeGreaterThan(1.1);
    expect(winter / summer).toBeGreaterThan(4);
  });
  it("90일 진행해 보면 여름 남부 전선은 북부보다 훨씬 적게 움직이고, 겨울에는 더 많이 움직인다", () => {
    const run = (startDay: number) => {
      const w = newWar();
      flat(w, 500);
      w.day = startDay;
      w.war!.ai.skipPlanOnce = true;
      levy(w, 1, 6000); // 우리 병력이 훨씬 많다
      for (let i = 0; i < FRONT_POINTS; i++) setOrder(w, i, 800);
      // 병력을 일찍 쓸 수 있게 훈련이 끝난 것으로 본다
      for (const t of w.regions[0]!.trainees) t.readyDay = startDay;
      const before = [...w.war!.front];
      step(w, 90);
      const after = w.war!.front;
      return { north: after[2]! - before[2]!, south: after[14]! - before[14]! };
    };
    const summer = run(SUMMER);
    const winter = run(WINTER);
    expect(summer.north).toBeGreaterThan(5);
    expect(summer.south / summer.north).toBeLessThan(0.5);
    expect(winter.south / winter.north).toBeGreaterThan(summer.south / summer.north * 2);
  });
});

describe("능선", () => {
  it("능선 안에서는 이동이 느려지고 적의 병력 밀도가 오르며, 우리 밀도는 그대로다", () => {
    const w = newWar();
    flat(w, RIDGE.cx); // 모든 점이 같은 x → 수도까지 거리(보급)가 같다. 점 3은 능선 안, 점 12는 능선 밖
    const p = computePressure(w);
    expect(terrainAt(RIDGE.cx, 120, 0).moveMult).toBeCloseTo(RIDGE_MOVE, 2);
    expect(terrainAt(RIDGE.cx, 480, 0).features.length).toBe(0);
    expect(p.rivalDensity[3]! / p.rivalDensity[12]!).toBeGreaterThan(1.15);
    expect(p.playerDensity[3]! / p.playerDensity[12]!).toBeCloseTo(1, 6);
  });
});
