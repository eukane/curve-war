import { describe, expect, it } from "vitest";
import { WAR_REGIONS } from "../data/start-regions";
import { AI_PROFILES, pickProfile, planAi, profileOf, scoreOutcome } from "./ai";
import type { Outcome } from "./ai";
import { FRONT_POINTS } from "./constants";
import { soldiersOf } from "./war";
import { cloneWorld, createWorld, levy, previewTurn, setOrder, step } from "./world";
import type { World } from "./world";

const mk = (seed: number, profile: string, mode: "search" | "scripted" = "search"): World =>
  createWorld(seed, WAR_REGIONS, { war: { playerRegionId: 1, rivalRegionId: 2, ai: { mode, profile } } });
const deps = { clone: cloneWorld, step };
const R = (w: World) => w.regions[1]!;

describe("적 지도자 성향", () => {
  it("성향은 시드로 정해지고 재현된다. 시드에 따라 서로 다른 성향이 나온다", () => {
    expect(pickProfile(42)).toBe(pickProfile(42));
    const seen = new Set(Array.from({ length: 40 }, (_, s) => pickProfile(s + 1)));
    expect(seen.size).toBe(AI_PROFILES.length);
    for (const id of seen) expect(profileOf(id).id).toBe(id);
  });

  it("모든 성향에 이름과 한 줄 설명이 있다 (화면에 보여 준다)", () => {
    for (const p of AI_PROFILES) {
      expect(p.name.length).toBeGreaterThan(1);
      expect(p.blurb.length).toBeGreaterThan(10);
    }
  });
});

describe("탐색형 적 AI", () => {
  it("같은 시드와 같은 입력이면 같은 결과다 (결정론)", () => {
    const a = mk(7, "opportunist");
    const b = mk(7, "opportunist");
    step(a, 360);
    step(b, 360);
    expect(a.war!.front).toEqual(b.war!.front);
    expect(soldiersOf(R(a))).toBe(soldiersOf(R(b)));
  });

  it("후보를 돌려 보는 동안 실제 세계는 바뀌지 않는다 (복제본만 변한다)", () => {
    const w = mk(3, "aggressor");
    levy(w, 1, 1000);
    step(w, 100);
    w.day = 180; // 턴 경계에서 계획
    const day = w.day;
    const playerFront = JSON.stringify(w.war!.front);
    const playerOrders = JSON.stringify(w.war!.orders.player);
    const log = w.log.length;
    planAi(w, deps);
    expect(w.day).toBe(day);
    expect(JSON.stringify(w.war!.front)).toBe(playerFront);
    expect(JSON.stringify(w.war!.orders.player)).toBe(playerOrders); // 적의 계획이 우리 명령선을 건드리지 않는다
    expect(w.log.length).toBe(log);
  });

  it("예측이 정직하다: 전황 변수를 평균으로 두면 탐색형 적의 반응까지 정확히 일치한다", () => {
    const w = mk(5, "cautious");
    w.weatherOverride = () => 1.0;
    levy(w, 1, 1200);
    step(w, 180);
    for (let i = 0; i < FRONT_POINTS; i++) setOrder(w, i, w.war!.front[i]! + (i === 8 ? 60 : 0));
    w.war!.expected = true;
    const pv = previewTurn(w)!;
    step(w, 90);
    pv.front.forEach((x, i) => expect(w.war!.front[i]!).toBeCloseTo(x, 6));
    expect(soldiersOf(R(w))).toBeCloseTo(pv.rivalSoldiers, 6);
  });

  it("우리가 병력을 몰아 둔 구간에 적도 병력을 몰아 맞선다 (방어 집중을 스스로 고른다)", () => {
    const w = mk(1, "cautious");
    w.day = 180;
    for (let i = 0; i < FRONT_POINTS; i++) setOrder(w, i, w.war!.front[i]! + (i === 8 ? 150 : 0));
    planAi(w, deps);
    expect(w.war!.orders.rival[8]!).toBeLessThan(w.war!.front[8]! - 60);
  });

  it("우리가 약하면 공세 시작일 뒤에 적이 앞으로 내민다 (정복형)", () => {
    const w = mk(2, "aggressor");
    w.day = 180;
    planAi(w, deps);
    const pushed = w.war!.orders.rival.filter((o, i) => o < w.war!.front[i]! - 30).length;
    expect(pushed).toBeGreaterThan(0);
  });

  it("같은 결과라도 성향에 따라 선호가 갈린다: 큰 이득·큰 피해는 정복형이, 작은 이득·작은 피해는 신중형이 고른다", () => {
    const risky: Outcome = { rivalGainPct: 4, ownCas: 400, enemyCas: 300, starve: 0, popGain: 0, kept: 1000, winner: null };
    const safe: Outcome = { rivalGainPct: 1, ownCas: 50, enemyCas: 50, starve: 0, popGain: 0, kept: 1500, winner: null };
    const aggr = profileOf("aggressor");
    const caut = profileOf("cautious");
    expect(scoreOutcome(aggr, risky)).toBeGreaterThan(scoreOutcome(aggr, safe));
    expect(scoreOutcome(caut, safe)).toBeGreaterThan(scoreOutcome(caut, risky));
  });

  it("수도 함락은 점수를 크게 바꾼다 (승패가 최우선)", () => {
    const base: Outcome = { rivalGainPct: 0, ownCas: 0, enemyCas: 0, starve: 0, popGain: 0, kept: 0, winner: null };
    for (const p of AI_PROFILES) {
      expect(scoreOutcome(p, { ...base, winner: "rival" })).toBeGreaterThan(scoreOutcome(p, base) + 50);
      expect(scoreOutcome(p, { ...base, winner: "player" })).toBeLessThan(scoreOutcome(p, base) - 50);
    }
  });

  it("계획에 걸리는 시간이 실사용 가능한 수준이다 (한 번에 3초 미만)", () => {
    const w = mk(4, "opportunist");
    step(w, 180);
    levy(w, 1, 1000);
    const t0 = performance.now();
    planAi(w, deps);
    expect(performance.now() - t0).toBeLessThan(3000);
  });

  it("고정 규칙 AI도 그대로 남아 있다 (비교와 회귀 시험용)", () => {
    const w = mk(1, "aggressor", "scripted");
    step(w, 200);
    expect(w.war!.ai.mode).toBe("scripted");
    expect(soldiersOf(R(w))).toBeGreaterThan(0);
  });
});
