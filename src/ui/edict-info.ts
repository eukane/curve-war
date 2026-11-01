/**
 * 법령 카드에 보여 줄 "지금 상태에서의 실제 숫자". 정적인 문구만으로는 얼마나 이득이고 얼마나 손해인지 알 수 없다.
 */
import { UNIT_KM, SUPPLY_FALLOFF_UNITS } from "../sim/constants";
import { dailyNeedKg, fieldFarmersAt, popOf } from "../sim/state";
import type { World } from "../sim/state";
import { readySoldiers } from "../sim/war";

const fmt = (v: number, d = 0) => v.toLocaleString("ko-KR", { maximumFractionDigits: d, minimumFractionDigits: d });

/** 법령별로 지금 우리 상태에서의 구체적인 효과 문장 */
export function edictNumbers(w: World, id: string): { gain: string; cost: string } {
  const war = w.war!;
  const P = w.regions.find((r) => r.id === war.playerRegionId)!;
  const soldiers = popOf(P, "soldier");
  const ready = readySoldiers(P, w.day);
  const farmers = popOf(P, "farmer");
  if (id === "fields") {
    return {
      gain: `지금 병사 ${fmt(ready)}명이면 파종·수확 일손이 ${fmt(ready * 0.5)}명 늘어난 셈이고, 병사 식량이 하루 ${fmt((soldiers * 0.3 * 0.5) / 1000, 1)}t 줄어듭니다.`,
      cost: `봄과 가을에 유효 병력 ${fmt(ready)}명 → 약 ${fmt(ready * 0.85)}명.`,
    };
  }
  if (id === "standing") {
    const extra = soldiers * 0.5 * 0.5; // 하루 추가 소비 (kg) = 병사 × 50% × 1인 소비량
    return {
      gain: `유효 병력 ${fmt(ready)}명 → 약 ${fmt(ready * 1.2)}명. 새로 징집한 병사는 30일 만에 전력이 됩니다(지금은 ${fmt(P.rules.trainingDays)}일).`,
      cost: `병사 ${fmt(soldiers)}명 기준 식량이 하루 ${fmt(extra / 1000, 1)}t 더 듭니다. 해산해도 절반만 농민이 됩니다. 징집 상한: ${fmt((farmers + soldiers) * 0.3)}명 (지금 ${fmt((farmers + soldiers) * P.rules.levyCap)}명).`,
    };
  }
  if (id === "logistics") {
    const before = (SUPPLY_FALLOFF_UNITS * P.rules.supplyFalloffMult * UNIT_KM);
    const after = before * 1.3 / P.rules.supplyFalloffMult;
    const labor = fieldFarmersAt(P, w.day);
    return {
      gain: `보급 한계 거리 ${fmt(before)}km → ${fmt(after)}km.`,
      cost: `들일 일손 ${fmt(labor)}명 → ${fmt(labor * 0.9)}명 (약 ${fmt(labor * 0.1)}명 감소).`,
    };
  }
  void dailyNeedKg;
  return { gain: "", cost: "" };
}
