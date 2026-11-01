import { describe, expect, it } from "vitest";
import { WAR_REGIONS } from "../data/start-regions";
import { EDICT_RESEARCH_DAYS, EDICT_SLOTS, SEASON_MOVE_MULT, SUPPLY_FALLOFF_UNITS } from "./constants";
import { EDICTS, cancelEdictResearch, recomputeRules, repealEdict, rulesFor, startEdict } from "./edicts";
import { dailyNeedKg, fieldFarmersAt } from "./state";
import { computePressure, effectiveSoldiers, readySoldiers, supplyMultipliers } from "./war";
import { createWorld, levy, popOf, previewTurn, setOrder, step } from "./world";
import type { World } from "./world";

const mk = (seed = 1, profile = "cautious"): World =>
  createWorld(seed, WAR_REGIONS, { war: { playerRegionId: 1, rivalRegionId: 2, ai: { mode: "scripted", profile } } });
const P = (w: World) => w.regions[0]!;
const give = (w: World, ids: string[]) => {
  w.war!.edicts.player.enacted = [...ids];
  recomputeRules(w);
};

describe("법령 규칙", () => {
  it("법령이 없으면 기본 규칙이다", () => {
    const r = rulesFor([]);
    expect(r).toMatchObject({ trainingDays: 60, levyCap: 0.4, rationMult: 1, soldierFieldLabor: 0, fieldLaborMult: 1, supplyFalloffMult: 1, inflictMult: 1 });
    expect(r.seasonStrength).toEqual([1, 1, 1, 1]);
  });

  it("법령마다 얻는 것과 치르는 것이 한 쌍으로 있다 (한쪽만 있는 법령은 없다)", () => {
    for (const e of EDICTS) {
      expect(e.gains.length).toBeGreaterThan(0);
      expect(e.costs.length).toBeGreaterThan(0);
    }
  });

  it("둔전제: 병사가 일손이 되고, 봄·가을에 전투력이 줄어든다", () => {
    const r = rulesFor(["fields"]);
    expect(r.soldierFieldLabor).toBe(0.5);
    expect(r.rationMult).toBeCloseTo(0.7, 9);
    expect(r.seasonStrength).toEqual([0.85, 1, 0.85, 1]);
  });

  it("상비군제: 훈련 30일, 전투력 +20%, 사상 +15%, 식량 +50%, 징집 상한 30%, 해산 복귀 50%", () => {
    const r = rulesFor(["standing"]);
    expect(r).toMatchObject({ trainingDays: 30, inflictMult: 1.15, rationMult: 1.5, levyCap: 0.3, disbandReturn: 0.5 });
    expect(r.seasonStrength).toEqual([1.2, 1.2, 1.2, 1.2]);
  });

  it("병참 개혁: 보급 한계 +30%, 일손 −10%, 굶주림에 병사가 덜 약해진다", () => {
    const r = rulesFor(["logistics"]);
    expect(r.hungerPenaltyMult).toBe(0.5);
    expect(r.supplyFalloffMult).toBeCloseTo(1.3, 9);
    expect(r.fieldLaborMult).toBeCloseTo(0.9, 9);
  });
});

describe("연구와 슬롯", () => {
  it("연구를 시작하면 180일 뒤 시행되고 규칙이 바뀐다", () => {
    const w = mk();
    expect(startEdict(w, "player", "standing")).toEqual({ ok: true });
    expect(w.war!.edicts.player.researching).toEqual({ id: "standing", remaining: EDICT_RESEARCH_DAYS });
    step(w, EDICT_RESEARCH_DAYS - 1);
    expect(P(w).rules.trainingDays).toBe(60); // 아직
    step(w, 1);
    expect(w.war!.edicts.player.enacted).toEqual(["standing"]);
    expect(w.war!.edicts.player.researching).toBeNull();
    expect(P(w).rules.trainingDays).toBe(30);
    expect(w.log.some((l) => l.text.includes("상비군제") && l.text.includes("시행"))).toBe(true);
  });

  it("한 번에 하나만 연구하고, 슬롯이 가득 차면 새 연구를 못 한다", () => {
    const w = mk();
    startEdict(w, "player", "fields");
    expect(startEdict(w, "player", "standing")).toMatchObject({ ok: false });
    give(w, ["fields", "standing"]);
    w.war!.edicts.player.researching = null;
    expect(EDICT_SLOTS).toBe(2);
    expect(startEdict(w, "player", "logistics")).toMatchObject({ ok: false });
    expect(repealEdict(w, "player", "fields")).toEqual({ ok: true });
    expect(startEdict(w, "player", "logistics")).toEqual({ ok: true });
  });

  it("이미 시행 중이거나 없는 법령은 거절된다", () => {
    const w = mk();
    give(w, ["fields"]);
    expect(startEdict(w, "player", "fields")).toMatchObject({ ok: false });
    expect(startEdict(w, "player", "nothing")).toMatchObject({ ok: false });
    expect(repealEdict(w, "player", "standing")).toMatchObject({ ok: false });
  });

  it("상비군제: 해산하면 절반만 농민으로 돌아가고 나머지는 비농업 인구가 된다 (총 인구는 보존)", async () => {
    const { disband } = await import("./world");
    const w = mk();
    give(w, ["standing"]);
    const pop0 = popOf(P(w), "farmer") + popOf(P(w), "artisan") + popOf(P(w), "soldier");
    const f0 = popOf(P(w), "farmer");
    const a0 = popOf(P(w), "artisan");
    disband(w, 1, 1000);
    expect(popOf(P(w), "farmer")).toBeCloseTo(f0 + 500, 6);
    expect(popOf(P(w), "artisan")).toBeCloseTo(a0 + 500, 6);
    expect(popOf(P(w), "farmer") + popOf(P(w), "artisan") + popOf(P(w), "soldier")).toBeCloseTo(pop0, 6);
  });

  it("폐지하면 규칙이 즉시 돌아오고, 연구를 취소하면 쌓인 연구가 사라진다", () => {
    const w = mk();
    give(w, ["standing"]);
    expect(P(w).rules.levyCap).toBe(0.3);
    repealEdict(w, "player", "standing");
    expect(P(w).rules.levyCap).toBe(0.4);
    startEdict(w, "player", "fields");
    step(w, 50);
    expect(cancelEdictResearch(w, "player")).toEqual({ ok: true });
    startEdict(w, "player", "fields");
    expect(w.war!.edicts.player.researching!.remaining).toBe(EDICT_RESEARCH_DAYS);
  });
});

describe("법령의 실제 효과 (시뮬레이션이 규칙을 읽는다)", () => {
  it("둔전제: 큰 군대를 두고도 수확 일손이 늘어난다", () => {
    const a = mk();
    const b = mk();
    levy(a, 1, 4000);
    levy(b, 1, 4000);
    for (const w of [a, b]) P(w).trainees = []; // 훈련을 마친 병사
    give(b, ["fields"]);
    expect(fieldFarmersAt(P(b), 0)).toBeGreaterThan(fieldFarmersAt(P(a), 0) + 2000);
    expect(fieldFarmersAt(P(b), 0) - fieldFarmersAt(P(a), 0)).toBeCloseTo(readySoldiers(P(b), 0) * 0.5, 6);
  });

  it("둔전제: 봄과 가을에는 유효 병력이 줄고 여름에는 줄지 않는다", () => {
    const w = mk();
    give(w, ["fields"]);
    const spring = effectiveSoldiers(P(w), 10);
    const summer = effectiveSoldiers(P(w), 100);
    const autumn = effectiveSoldiers(P(w), 200);
    const winter = effectiveSoldiers(P(w), 300);
    expect(spring).toBeCloseTo(summer * 0.85, 9);
    expect(autumn).toBeCloseTo(summer * 0.85, 9);
    expect(winter).toBeCloseTo(summer, 9);
  });

  it("상비군제: 병사 식량 소비가 늘고 징집 상한이 줄며 훈련이 짧아진다", () => {
    const a = mk();
    const b = mk();
    give(b, ["standing"]);
    expect(dailyNeedKg(P(b))).toBeGreaterThan(dailyNeedKg(P(a)));
    expect(dailyNeedKg(P(b)) - dailyNeedKg(P(a))).toBeCloseTo(popOf(P(b), "soldier") * 0.5 * 0.5, 6);
    levy(b, 1, 1_000_000);
    expect(popOf(P(b), "soldier")).toBeLessThanOrEqual((popOf(P(b), "farmer") + popOf(P(b), "soldier")) * 0.3 + 1e-6);
    levy(a, 1, 500);
    const m = mk();
    give(m, ["standing"]);
    levy(m, 1, 500);
    expect(m.regions[0]!.trainees[0]!.readyDay).toBe(30);
    expect(a.regions[0]!.trainees[0]!.readyDay).toBe(60);
  });

  it("병참 개혁: 같은 위치에서 보급 배율이 높다", () => {
    const front = Array(17).fill(700);
    const base = supplyMultipliers(front, 90, 1)[8]!;
    const logi = supplyMultipliers(front, 90, 1.3)[8]!;
    expect(logi).toBeGreaterThan(base);
    expect(1 - base).toBeCloseTo(610 / SUPPLY_FALLOFF_UNITS, 9);
  });

  it("병참 개혁: 일손이 줄어 파종·수확 면적이 준다", () => {
    const a = mk();
    const b = mk();
    give(b, ["logistics"]);
    expect(fieldFarmersAt(P(b), 0)).toBeCloseTo(fieldFarmersAt(P(a), 0) * 0.9, 6);
  });

  it("법령은 병력 밀도에 반영된다 (병참 개혁이 있으면 깊은 곳에서 우리 밀도가 높다)", () => {
    const a = mk();
    const b = mk();
    for (const w of [a, b]) {
      w.war!.front = Array(17).fill(750);
      w.war!.orders.player = Array(17).fill(750);
      w.war!.orders.rival = Array(17).fill(750);
    }
    give(b, ["logistics"]);
    expect(computePressure(b).playerDensity[8]!).toBeGreaterThan(computePressure(a).playerDensity[8]!);
  });
});

describe("계절", () => {
  it("전진 속도는 계절 배율을 따른다 (봄 0.8, 여름 1.0, 가을 0.9, 겨울 0.6)", () => {
    const w = mk();
    w.war!.front = Array(17).fill(500);
    w.war!.orders.player = Array(17).fill(500);
    w.war!.orders.rival = Array(17).fill(500);
    levy(w, 1, 2000);
    P(w).trainees = [];
    const force = (day: number) => {
      w.day = day;
      return computePressure(w).force[8]!;
    };
    const f = [force(10), force(100), force(190), force(280)];
    expect(f[1]).toBeGreaterThan(0);
    SEASON_MOVE_MULT.forEach((m, i) => expect(f[i]! / f[1]!).toBeCloseTo(m, 6));
  });
});

describe("적의 법령", () => {
  it("적 지도자는 성향에 따라 법령 연구를 시작하고, 슬롯은 넘지 않는다", () => {
    const w = mk(1, "aggressor");
    step(w, 1);
    expect(w.war!.edicts.rival.researching?.id).toBe("logistics"); // 정복형의 첫 선택
    step(w, 600);
    expect(w.war!.edicts.rival.enacted.length).toBeLessThanOrEqual(EDICT_SLOTS);
    expect(w.war!.edicts.rival.enacted).toEqual(["logistics", "standing"]);
    expect(w.regions[1]!.rules.supplyFalloffMult).toBeCloseTo(1.3, 9);
  });

  it("성향마다 첫 법령이 다르다", () => {
    const firsts = ["aggressor", "cautious", "opportunist"].map((p) => {
      const w = mk(1, p);
      step(w, 1);
      return w.war!.edicts.rival.researching!.id;
    });
    expect(new Set(firsts).size).toBe(3);
  });

  it("예측이 정직하다: 연구 진행과 적의 법령까지 포함해서 일치한다", () => {
    const w = mk(3, "opportunist");
    w.weatherOverride = () => 1;
    startEdict(w, "player", "standing");
    step(w, 100);
    for (let i = 0; i < 17; i++) setOrder(w, i, w.war!.front[i]! + (i === 8 ? 50 : 0));
    w.war!.expected = true;
    const pv = previewTurn(w)!;
    step(w, 90 - (w.day % 90));
    pv.front.forEach((x, i) => expect(w.war!.front[i]!).toBeCloseTo(x, 6));
  });
});
