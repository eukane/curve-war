import { describe, expect, it } from "vitest";
import { WAR_REGIONS } from "../data/start-regions";
import { DAYS_PER_YEAR, dateOf } from "./calendar";
import {
  CASUALTY_RATE_PER_DAY,
  FRONT_POINTS,
  HA_PER_UNIT2,
  HARVEST_DAY_OF_YEAR,
  MAP_H,
  MAP_W,
  UNIT_KM,
} from "./constants";
import {
  readySoldiers,
  trainingCount,
  VILLAGES,
  aiPlan,
  computePressure,
  dailyMoves,
  disbandTroops,
  effectiveSoldiers,
  frontLengthKm,
  frontageKm,
  frontXAt,
  initialFront,
  levyTroops,
  playerAreaHa,
  playerVillageCount,
  soldiersOf,
  totalAreaHa,
  transferLand,
} from "./war";
import { createWorld, disband, levy, popOf, previewTurn, setOrder, step, stepDay, totalPop } from "./world";
import type { World } from "./world";

/** 고정 규칙 AI(비교·회귀용, 법령 없음). 탐색형은 ai.test.ts, 법령은 edicts.test.ts에서 따로 시험한다 */
const newWar = (seed = 1): World => createWorld(seed, WAR_REGIONS, { war: { playerRegionId: 1, rivalRegionId: 2, ai: { mode: "scripted", edicts: false } } });
const P = (w: World) => w.regions[0]!;
const R = (w: World) => w.regions[1]!;
const flat = (w: World, x = 500) => {
  w.war!.front = Array(FRONT_POINTS).fill(x);
  w.war!.orders.player = Array(FRONT_POINTS).fill(x);
  w.war!.orders.rival = Array(FRONT_POINTS).fill(x);
};

describe("전선 기하", () => {
  it("시작 전선은 양쪽 면적이 거의 같다 (±2%)", () => {
    const a = playerAreaHa(initialFront());
    expect(Math.abs(a / totalAreaHa() - 0.5)).toBeLessThan(0.02);
  });

  it("곧은 선의 넓이는 x × 높이와 같고, 길이는 지도 높이와 같다", () => {
    const f = Array(FRONT_POINTS).fill(300);
    expect(playerAreaHa(f)).toBeCloseTo(300 * MAP_H * HA_PER_UNIT2, 3);
    expect(frontLengthKm(f)).toBeCloseTo(MAP_H * UNIT_KM, 6);
  });

  it("전선 전체를 오른쪽으로 d만큼 밀면 넓이가 d × 높이만큼 늘어난다", () => {
    const f = initialFront();
    const g = f.map((x) => x + 40);
    expect(playerAreaHa(g) - playerAreaHa(f)).toBeCloseTo(40 * MAP_H * HA_PER_UNIT2, 3);
  });

  it("돌출부를 만들면 전선이 길어진다 (밀도가 떨어지는 이유)", () => {
    const f = Array(FRONT_POINTS).fill(500);
    const g = f.map((x, i) => x + 150 * Math.exp(-(((i - 8) / 2) ** 2)));
    expect(frontLengthKm(g)).toBeGreaterThan(frontLengthKm(f) * 1.15);
  });

  it("점별 전선 길이의 합이 전체 길이와 같다", () => {
    const f = initialFront();
    expect(frontageKm(f).reduce((a, b) => a + b, 0)).toBeCloseTo(frontLengthKm(f), 6);
  });

  it("전선은 y의 함수다: 어떤 y에서도 x가 하나뿐이고 지도 안에 있다", () => {
    const f = initialFront().map((x, i) => x + 400 * Math.exp(-(((i - 8) / 1.5) ** 2)));
    for (let y = 0; y <= MAP_H; y += 20) {
      const x = frontXAt(f, y);
      expect(Number.isFinite(x)).toBe(true);
    }
  });

  it("마을은 시작 시 양쪽에 거의 반반이고, 전선이 밀리면 이동한다", () => {
    const n = VILLAGES.length;
    const f = initialFront();
    expect(Math.abs(playerVillageCount(f) / n - 0.5)).toBeLessThan(0.1);
    expect(playerVillageCount(f.map((x) => x + 150))).toBeGreaterThan(playerVillageCount(f) + 10);
  });
});

describe("땅과 사람의 이전", () => {
  it("땅이 넘어가도 주민, 경지, 개간지, 파종지의 합이 보존된다", () => {
    const w = newWar();
    P(w).sownHa = 12_000;
    R(w).sownHa = 12_000;
    const sum = () => ({
      civ: totalPop(P(w)) - soldiersOf(P(w)) + totalPop(R(w)) - soldiersOf(R(w)),
      arable: P(w).arableHa + R(w).arableHa,
      clear: P(w).clearableHa + R(w).clearableHa,
      sown: P(w).sownHa + R(w).sownHa,
    });
    const before = sum();
    transferLand(R(w), P(w), 0.1);
    const after = sum();
    expect(after.civ).toBeCloseTo(before.civ, 6);
    expect(after.arable).toBeCloseTo(before.arable, 6);
    expect(after.clear).toBeCloseTo(before.clear, 6);
    expect(after.sown).toBeCloseTo(before.sown, 6);
    expect(P(w).arableHa).toBeCloseTo(12_600 * 1.1, 6);
  });

  it("병사는 땅과 함께 넘어가지 않는다", () => {
    const w = newWar();
    const s0 = soldiersOf(R(w));
    transferLand(R(w), P(w), 0.5);
    expect(soldiersOf(R(w))).toBe(s0);
  });
});

describe("징집과 병력", () => {
  it("징집은 농민을 병사로 바꾸고 총 인구는 그대로다", () => {
    const w = newWar();
    const pop0 = totalPop(P(w));
    const f0 = popOf(P(w), "farmer");
    expect(levy(w, 1, 1000)).toEqual({ ok: true });
    expect(popOf(P(w), "farmer")).toBe(f0 - 1000);
    expect(soldiersOf(P(w))).toBe(2000);
    expect(totalPop(P(w))).toBeCloseTo(pop0, 9);
    disband(w, 1, 500);
    expect(soldiersOf(P(w))).toBe(1500);
    expect(popOf(P(w), "farmer")).toBe(f0 - 500);
  });

  it("징집에는 상한(농민+병사의 40%)이 있다", () => {
    const w = newWar();
    const took = levyTroops(P(w), 1_000_000, 0);
    expect(soldiersOf(P(w))).toBeLessThanOrEqual((18_000 + 1_000) * 0.4 + 1e-6);
    expect(took).toBeGreaterThan(0);
    expect(levy(w, 1, 100)).toMatchObject({ ok: false });
  });

  it("해산할 병사보다 많이 해산할 수 없다", () => {
    const w = newWar();
    expect(disbandTroops(P(w), 99_999, 0)).toBe(1000);
    expect(soldiersOf(P(w))).toBe(0);
  });

  it("병사는 아이를 낳지 않는다: 병사 비중이 커지면 한 달 출생이 줄어든다", () => {
    const a = newWar();
    const b = newWar();
    levy(b, 1, 5000);
    step(a, 30);
    step(b, 30);
    const birthsA = P(a).lastDemography!.births.value;
    const birthsB = P(b).lastDemography!.births.value;
    expect(birthsB).toBeLessThan(birthsA * 0.9);
  });

  it("굶는 군대는 약하다: 유효 병력 = 병력 × (1 − 식량 부족률)", () => {
    const w = newWar();
    P(w).lastDeficit = 0.4;
    expect(effectiveSoldiers(P(w), 0)).toBeCloseTo(600, 9);
    expect(effectiveSoldiers(P(w), 0, 1.1)).toBeCloseTo(660, 9);
  });
});

describe("훈련", () => {
  it("징집한 병사는 60일 동안 싸우지 못하고, 그 뒤에 전력이 된다", () => {
    const w = newWar();
    levy(w, 1, 1000);
    expect(soldiersOf(P(w))).toBe(2000);
    expect(readySoldiers(P(w), w.day)).toBe(1000);
    expect(trainingCount(P(w), w.day)).toBe(1000);
    expect(readySoldiers(P(w), 59)).toBe(1000);
    expect(readySoldiers(P(w), 60)).toBe(2000);
  });

  it("훈련 중인 병사는 곡식을 먹고 농사를 짓지 못하며, 유효 병력에 들어가지 않는다", () => {
    const w = newWar();
    const f0 = popOf(P(w), "farmer");
    levy(w, 1, 1000);
    expect(popOf(P(w), "farmer")).toBe(f0 - 1000);
    expect(effectiveSoldiers(P(w), 0)).toBe(1000); // 훈련 중 1,000명은 제외
    expect(totalPop(P(w))).toBeCloseTo(30_000, 6); // 곡식은 모두 먹는다(총 인구 불변)
  });

  it("훈련 중에는 사상자가 나오지 않는다 (싸우는 병사만 죽는다)", () => {
    const w = newWar();
    flat(w);
    w.day = 1;
    w.war!.expected = true;
    levy(w, 1, 1000);
    P(w).trainees = [{ readyDay: 61, n: 1000 }];
    const total0 = soldiersOf(P(w));
    stepDay(w);
    // 전사는 훈련을 마친 1,000명 중에서만 나온다: 하루 0.0005 × 적 유효 병력
    expect(total0 - soldiersOf(P(w))).toBeCloseTo(CASUALTY_RATE_PER_DAY * 1000, 6);
    expect(trainingCount(P(w), w.day)).toBe(1000);
  });

  it("해산은 훈련 중인 병사(가장 최근 징집분)부터 취소한다", () => {
    const w = newWar();
    levy(w, 1, 1000); // 훈련 중 1,000
    const f1 = popOf(P(w), "farmer");
    disband(w, 1, 400);
    expect(trainingCount(P(w), w.day)).toBe(600);
    expect(soldiersOf(P(w))).toBe(1600);
    expect(popOf(P(w), "farmer")).toBe(f1 + 400);
    disband(w, 1, 1000); // 남은 훈련병 600 + 기존 병사 400
    expect(trainingCount(P(w), w.day)).toBe(0);
    expect(soldiersOf(P(w))).toBe(600);
  });
});

describe("턴(계절)", () => {
  it("한 턴은 90일이고 봄·여름·가을·겨울 순서다", async () => {
    const { turnOf, TURN_DAYS } = await import("./calendar");
    expect(TURN_DAYS).toBe(90);
    expect(turnOf(0)).toMatchObject({ index: 0, year: 0, season: "봄", startDay: 0, endDay: 90 });
    expect(turnOf(89).season).toBe("봄");
    expect(turnOf(90)).toMatchObject({ index: 1, season: "여름", dayInTurn: 0 });
    expect(turnOf(240).season).toBe("가을"); // 수확일
    expect(turnOf(60).season).toBe("봄"); // 파종일
    expect(turnOf(360)).toMatchObject({ index: 4, year: 1, season: "봄" });
  });

  it("적도 플레이어와 같은 주기(턴 경계)에만 계획을 바꾼다", () => {
    const w = newWar();
    levy(w, 1, 3000);
    step(w, 1); // 0일: 적이 계획
    const afterFirst = soldiersOf(R(w));
    step(w, 80); // 턴 중간에는 적이 징집·해산을 하지 않는다: 줄어든다면 전사 때문이다
    expect(soldiersOf(R(w))).toBeLessThanOrEqual(afterFirst + 1e-9);
    expect(soldiersOf(R(w))).toBeGreaterThan(afterFirst - 200);
  });

  it("전황 변수는 이동에도 영향을 준다 (화면용 압력은 변수를 모른다)", () => {
    const w = newWar();
    flat(w);
    levy(w, 1, 1000);
    P(w).trainees = [];
    const shown = computePressure(w); // 화면에 보이는 값: 변수 없음
    const real = computePressure(w, true);
    expect(real.net[8]).not.toBe(shown.net[8]);
    w.war!.expected = true;
    expect(computePressure(w, true).net[8]).toBeCloseTo(shown.net[8]!, 9);
  });
});

describe("압력과 전선 이동", () => {
  it("같은 병력, 같은 보급이면 밀도 차이가 없어 움직이지 않는다", () => {
    const w = newWar();
    flat(w);
    const pr = computePressure(w);
    pr.net.forEach((n) => expect(Math.abs(n)).toBeLessThan(1e-9));
    dailyMoves(w, pr).forEach((m) => expect(m).toBe(0));
  });

  it("병력이 많은 쪽이 밀지만, 명령선이 현재 전선이면 전진하지 않는다", () => {
    const w = newWar();
    flat(w);
    levy(w, 1, 2000);
    P(w).trainees = []; // 훈련을 마친 상태
    const pr = computePressure(w);
    expect(pr.net.every((n) => n > 0)).toBe(true);
    expect(pr.force.every((f) => f > 0)).toBe(true);
    dailyMoves(w, pr).forEach((m) => expect(m).toBe(0)); // 명령선 = 전선이라 나아가지 않음
  });

  it("명령선 너머로는 전진하지 못하고, 명령선까지는 전진한다", () => {
    const w = newWar();
    w.weatherOverride = () => 1;
    flat(w);
    levy(w, 1, 2000);
    P(w).trainees = []; // 훈련을 마친 상태
    w.war!.orders.player[8] = 530; // 점 8만 30단위 앞으로
    step(w, 60);
    expect(w.war!.front[8]!).toBeGreaterThan(505); // 실제로 전진했다 (적도 이 구간에 병력을 몰아 맞서므로 느리다)
    expect(w.war!.front[8]!).toBeLessThanOrEqual(530 + 1e-9); // 명령선을 넘지 않는다
  });

  it("집중: 명령선을 앞으로 내민 구간에 병력이 더 몰린다 (밀도가 높다)", () => {
    const w = newWar();
    flat(w);
    const base = computePressure(w).playerDensity[8]!;
    w.war!.orders.player[8] = 580;
    const focused = computePressure(w).playerDensity[8]!;
    expect(focused).toBeGreaterThan(base * 1.5);
    // 대신 다른 구간은 얇아진다
    expect(computePressure(w).playerDensity[2]!).toBeLessThan(base);
  });

  it("보급: 자기 수도에서 멀수록 같은 병력도 약하다", () => {
    const w = newWar();
    flat(w, 500);
    const near = computePressure(w);
    flat(w, 800); // 전선이 우리 수도에서 멀어지고 적 수도에는 가까워짐
    const far = computePressure(w);
    expect(far.playerDensity[8]!).toBeLessThan(near.playerDensity[8]!);
    expect(far.rivalDensity[8]!).toBeGreaterThan(near.rivalDensity[8]!);
  });

  it("전선이 길어지면 같은 병력의 밀도가 낮아진다", () => {
    const w = newWar();
    flat(w);
    const flatDensity = computePressure(w).playerDensity.reduce((a, b) => a + b, 0) / FRONT_POINTS;
    w.war!.front = w.war!.front.map((x, i) => x + 150 * Math.exp(-(((i - 8) / 2) ** 2)));
    w.war!.orders.player = [...w.war!.front];
    const bumpy = computePressure(w).playerDensity.reduce((a, b) => a + b, 0) / FRONT_POINTS;
    expect(bumpy).toBeLessThan(flatDensity);
  });

  it("자발적 후퇴: 명령선을 뒤로 물리면 전선이 그쪽으로 물러난다", () => {
    const w = newWar();
    flat(w);
    w.war!.orders.player[8] = 440;
    step(w, 20);
    expect(w.war!.front[8]!).toBeLessThan(500);
    expect(w.war!.front[8]!).toBeGreaterThanOrEqual(440 - 1e-9);
  });
});

describe("사상", () => {
  it("하루 사상 = 상대 유효 병력 × 사상률, 병력은 음수가 되지 않는다", () => {
    const w = newWar();
    flat(w);
    w.war!.expected = true;
    w.day = 1; // 매달 초가 아니라서 적이 병력을 조정하지 않는다
    const sp = soldiersOf(P(w)), sr = soldiersOf(R(w));
    stepDay(w);
    expect(sp - soldiersOf(P(w))).toBeCloseTo(CASUALTY_RATE_PER_DAY * sr, 6);
    expect(sr - soldiersOf(R(w))).toBeCloseTo(CASUALTY_RATE_PER_DAY * sp, 6);
    step(w, 360 * 30);
    expect(soldiersOf(P(w))).toBeGreaterThanOrEqual(0);
  });
});

describe("승패", () => {
  it("전선이 적 수도를 넘으면 승리하고 진행이 멈춘다", () => {
    const w = newWar();
    flat(w, 915);
    stepDay(w);
    expect(w.war!.result).toBe("win");
    expect(stepDay(w)).toBe(false);
  });
  it("전선이 우리 수도를 넘으면 패배한다", () => {
    const w = newWar();
    flat(w, 85);
    stepDay(w);
    expect(w.war!.result).toBe("loss");
  });
});

describe("월간 보고와 예측", () => {
  it("90일(한 계절)마다 보고서가 하나 생기고, 계절과 사상자가 맞다", () => {
    const w = newWar();
    step(w, 180);
    expect(w.war!.reports.length).toBe(2);
    const r = w.war!.reports[0]!;
    expect(r.season).toBe("봄");
    expect(w.war!.reports[1]!.season).toBe("여름");
    expect(r.playerCasualties).toBeGreaterThan(0);
    expect(r.playerSoldiersStart - r.playerSoldiersEnd).toBeGreaterThan(0);
  });

  it("봄 보고에는 파종 결과가, 가을 보고에는 수확 결과가 있고 나머지 계절에는 없다", () => {
    const w = newWar(2);
    w.weatherOverride = () => 1.0;
    step(w, 360);
    const [spring, summer, autumn, winter] = w.war!.reports;
    expect(spring!.sowing!.sownHa).toBeGreaterThan(10_000);
    expect(spring!.harvest).toBeNull();
    expect(summer!.sowing).toBeNull();
    expect(summer!.harvest).toBeNull();
    expect(autumn!.harvest!.netKg).toBeGreaterThan(3_000_000);
    expect(autumn!.harvest!.weather).toBeCloseTo(1, 9);
    expect(winter!.sowing).toBeNull();
    expect(winter!.harvest).toBeNull();
    expect(winter!.popEnd).toBeGreaterThan(0);
  });

  it("전황 변수를 평균으로 두면 예측이 실제와 정확히 일치한다 (예측이 정직하다)", () => {
    const w = newWar(3);
    w.weatherOverride = () => 1.0;
    levy(w, 1, 1500);
    for (let i = 0; i < 8; i++) setOrder(w, i + 4, w.war!.front[i + 4]! + 40);
    step(w, 180); // 공세 시작일(90일)을 지나 AI가 움직이는 상태
    for (let i = 0; i < FRONT_POINTS; i++) setOrder(w, i, w.war!.front[i]! + (i === 8 ? 50 : 0));
    w.war!.expected = true;
    const pv = previewTurn(w)!;
    step(w, 90);
    pv.front.forEach((x, i) => expect(w.war!.front[i]!).toBeCloseTo(x, 6));
    expect(soldiersOf(P(w))).toBeCloseTo(pv.playerSoldiers, 6);
    expect(soldiersOf(R(w))).toBeCloseTo(pv.rivalSoldiers, 6);
  });

  it("예측용 복제는 원본을 바꾸지 않는다", () => {
    const w = newWar();
    const before = JSON.stringify({ d: w.day, f: w.war!.front, p: totalPop(P(w)), r: w.war!.reports.length });
    previewTurn(w);
    expect(JSON.stringify({ d: w.day, f: w.war!.front, p: totalPop(P(w)), r: w.war!.reports.length })).toBe(before);
  });

  it("전황 변수는 재현되고 ±12% 안에 있다", async () => {
    const { turnLuck } = await import("./war");
    const w = newWar(5);
    for (let m = 0; m < 200; m++) {
      w.day = m * 90;
      const a = turnLuck(w, "player");
      expect(a).toBe(turnLuck(w, "player"));
      expect(a).toBeGreaterThanOrEqual(0.88 - 1e-9);
      expect(a).toBeLessThanOrEqual(1.12 + 1e-9);
    }
  });
});

describe("적 AI", () => {
  it("같은 시드와 같은 입력이면 같은 결과다 (결정론)", () => {
    const a = newWar(7), b = newWar(7);
    step(a, 360);
    step(b, 360);
    expect(a.war!.front).toEqual(b.war!.front);
    expect(soldiersOf(R(a))).toBe(soldiersOf(R(b)));
  });

  it("우리 병력을 보고 따라 징집한다 (평시 105%, 훈련 기간은 우리와 같다)", () => {
    const w = newWar();
    levy(w, 1, 3000); // 우리 4,000
    step(w, 1); // 0일째에 AI가 계획한다
    expect(soldiersOf(R(w))).toBeGreaterThan(3500);
    expect(trainingCount(R(w), w.day)).toBeGreaterThan(1500); // 징집한 병사는 곧바로 전력이 아니다
    step(w, 70);
    expect(trainingCount(R(w), w.day)).toBe(0); // 60일 뒤에는 전력이 된다
  });

  it("수확이 있는 턴(가을)이 시작되면 병력을 줄여 일손을 돌려보낸다", () => {
    const w = newWar();
    levy(w, 1, 2000);
    step(w, 175);
    const before = soldiersOf(R(w));
    step(w, 10); // 180일: 가을 턴 시작
    expect(dateOf(w.day).dayOfYear).toBeGreaterThan(HARVEST_DAY_OF_YEAR - 70);
    expect(soldiersOf(R(w))).toBeLessThan(before * 0.75);
  });

  it("우리가 명령선을 내민 곳에 적도 병력을 몰아 맞선다 (방어 집중)", () => {
    const w = newWar();
    flat(w);
    w.day = 30;
    w.war!.orders.player[8] = 590;
    aiPlan(w);
    expect(w.war!.orders.rival[8]!).toBeLessThan(w.war!.front[8]! - 70);
    expect(w.war!.orders.rival[0]!).toBeCloseTo(w.war!.front[0]!, 6);
  });

  it("공세 시작일 뒤에는 국지 우위가 큰 곳을 중심으로 명령선을 내민다", () => {
    const w = newWar();
    flat(w);
    w.day = 120;
    aiPlan(w);
    const pushed = w.war!.orders.rival.filter((o, i) => o < w.war!.front[i]! - 5).length;
    expect(pushed).toBeGreaterThan(0);
    expect(pushed).toBeLessThan(FRONT_POINTS); // 전선 전체가 아니라 일부만
  });
});

describe("균형 점검 (측정으로 고정한 동작, 사람이 해 보기 전의 근사)", () => {
  it("아무것도 안 하면 진다 (측정: 12~14턴, 3~3.5년)", () => {
    for (const seed of [1, 2, 3]) {
      const w = newWar(seed);
      let turns = 0;
      while (!w.war!.result && turns < 24) {
        step(w, 90);
        turns++;
      }
      expect(w.war!.result).toBe("loss");
      expect(turns).toBeGreaterThan(6);
    }
  });

  it("적 병력을 보고 병력을 맞추고 적의 집중 지점에 맞대응하면 10년 동안 지지 않는다 (측정: 영토 33~46%)", () => {
    for (const seed of [1, 2]) {
      const w = newWar(seed);
      for (let t = 0; t < 40 && !w.war!.result; t++) {
        const rs = soldiersOf(R(w)), ps = soldiersOf(P(w));
        const want = Math.round(rs * (dateOf(w.day).season === "가을" ? 0.8 : 1.1));
        if (want > ps) levy(w, 1, want - ps);
        else if (want < ps) disband(w, 1, ps - want);
        const f = w.war!.front, oR = w.war!.orders.rival;
        for (let i = 0; i < f.length; i++) setOrder(w, i, f[i]! + Math.max(0, f[i]! - oR[i]!));
        step(w, 90);
      }
      expect(w.war!.result).not.toBe("loss");
      expect(playerAreaHa(w.war!.front) / totalAreaHa()).toBeGreaterThan(0.28);
    }
  });

  it("이기는 길이 있다: 적의 1.8배까지 병력을 모으고 중앙을 치면 48턴 안에 이기는 시드가 있다 (대가: 기아). 지형(단계 3) 도입 뒤 시드 1~6 중 1개만 이긴다 — 균형은 단계 7.5에서", () => {
    let wins = 0;
    let starved = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = newWar(seed);
      for (let t = 0; t < 48 && !w.war!.result; t++) {
        const rs = soldiersOf(R(w)), ps = soldiersOf(P(w));
        const want = Math.round(rs * (dateOf(w.day).season === "가을" ? 0.9 : 1.8));
        if (want > ps) levy(w, 1, want - ps);
        else if (want < ps) disband(w, 1, ps - want);
        const f = w.war!.front, oR = w.war!.orders.rival;
        const strike = readySoldiers(P(w), w.day) > 1.1 * rs;
        for (let i = 0; i < f.length; i++) {
          const g = Math.exp(-(((i - 8) / 2.2) ** 2));
          setOrder(w, i, f[i]! + Math.max(Math.max(0, f[i]! - oR[i]!), strike ? 80 * g : 0));
        }
        step(w, 90);
      }
      if (w.war!.result === "win") wins++;
      starved += P(w).starvationDeathsTotal;
    }
    expect(wins).toBeGreaterThanOrEqual(1);
    expect(starved).toBeGreaterThan(5000); // 이기는 대가가 있다 (6개 시드 합)
  });

  it("병력을 크게 늘리면 농사 일손이 줄어 수확이 25% 넘게 준다 (총동원의 대가)", () => {
    const base = newWar(1);
    const big = newWar(1);
    levy(big, 1, 6000);
    base.weatherOverride = () => 1;
    big.weatherOverride = () => 1;
    step(base, 250);
    step(big, 250);
    // 수확은 240일차. 파종은 60일차에 일손으로 정해졌다.
    expect(P(big).lastHarvest!.value).toBeLessThan(P(base).lastHarvest!.value * 0.75);
    expect(P(big).lastHarvestFraction).toBeLessThanOrEqual(1);
  });

  it("기본 시나리오 하루 연산은 충분히 빠르다 (1년 시뮬레이션 < 500ms)", () => {
    const w = newWar();
    const t0 = performance.now();
    step(w, DAYS_PER_YEAR);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

void MAP_W;
