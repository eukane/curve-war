/**
 * "진행 중인 것": 이번 턴(계절)에 일어날 일과 앞으로 다가오는 일을 한곳에 모은다.
 * 원칙 0-3: 시간이 가시화되어야 한다. 모든 항목은 시뮬레이션 상태에서 계산한다.
 */
import { TURN_DAYS, turnOf } from "../sim/calendar";
import { HARVEST_DAY_OF_YEAR, HA_PER_FARMER, SEED_KG_PER_HA, SOWING_DAY_OF_YEAR } from "../sim/constants";
import { soldiersOf, trainingCount } from "../sim/war";
import { edictOf } from "../sim/edicts";
import { ZONE_NAME as ZONE_NAMES, levelOf } from "../sim/commanders";
import { COMMANDER_DAYS_PER_LEVEL, COMMANDER_MAX_LEVEL } from "../sim/constants";
import { KIND_NAME } from "../sim/structures";
import { fieldFarmersAt } from "../sim/world";
import type { TurnPreview, World } from "../sim/world";

export interface Timer {
  kind: "sow" | "harvest" | "train" | "rival" | "edict" | "build" | "cmd";
  /** 절대 일수 */
  day: number;
  title: string;
  detail: string;
  /** 경고 수준 */
  level?: "warn" | "good";
}

const fmt = (v: number, d = 0) => v.toLocaleString("ko-KR", { maximumFractionDigits: d, minimumFractionDigits: d });

export function timersOf(w: World, preview: TurnPreview | null, horizonTurns = 2): Timer[] {
  const war = w.war!;
  const P = w.regions.find((r) => r.id === war.playerRegionId)!;
  const turn = turnOf(w.day);
  const end = turn.startDay + TURN_DAYS * horizonTurns;
  const out: Timer[] = [];

  // 파종과 수확: 올해와 내년 것 중 범위 안에 있는 것
  for (let y = turn.year; y <= turn.year + 1; y++) {
    const sow = y * 360 + SOWING_DAY_OF_YEAR;
    const harvest = y * 360 + HARVEST_DAY_OF_YEAR;
    if (sow >= w.day && sow < end) {
      const field = fieldFarmersAt(P, sow);
      const cap = field * HA_PER_FARMER;
      const seedHa = P.seedKg / SEED_KG_PER_HA;
      const sown = Math.min(P.arableHa, cap, seedHa);
      out.push({
        kind: "sow",
        day: sow,
        title: "파종",
        detail: `들에 나갈 농민 ${fmt(field)}명 → ${fmt(sown)}ha 파종 (경작지 ${fmt(P.arableHa)}ha). ${sown < P.arableHa - 1 ? `일손이나 종자가 모자라 ${fmt(P.arableHa - sown)}ha는 놀립니다.` : "경작지를 전부 심을 수 있습니다."}`,
        level: sown < P.arableHa - 1 ? "warn" : "good",
      });
    }
    if (harvest >= w.day && harvest < end && (y > turn.year || P.sownHa > 0 || harvest >= w.day)) {
      const sownNow = P.sownHa > 0 ? P.sownHa : P.arableHa;
      const field = fieldFarmersAt(P, harvest);
      const need = sownNow / HA_PER_FARMER;
      const frac = Math.min(1, field / need);
      out.push({
        kind: "harvest",
        day: harvest,
        title: "수확",
        detail:
          frac < 0.999
            ? `일손 ${fmt(field)}명으로는 필요한 ${fmt(need)}명에 모자라 곡식의 ${fmt((1 - frac) * 100, 0)}%를 거두지 못합니다.`
            : `일손이 충분해 파종한 곡식을 전부 거둡니다. (기상에 따라 양은 달라집니다)`,
        level: frac < 0.999 ? "warn" : "good",
      });
    }
  }

  // 훈련 중인 병사
  const trainingNow = trainingCount(P, w.day);
  if (trainingNow > 0) {
    const groups = P.trainees.filter((t) => t.readyDay > w.day).sort((a, b) => a.readyDay - b.readyDay);
    for (const g of groups) {
      out.push({ kind: "train", day: g.readyDay, title: "훈련 마침", detail: `병사 ${fmt(g.n)}명이 전력이 됩니다. (그때까지는 곡식만 먹고 싸우지 못합니다)`, level: "good" });
    }
  }

  // 법령
  const mine = war.edicts.player.researching;
  if (mine) out.push({ kind: "edict", day: w.day + mine.remaining, title: `법령 시행: ${edictOf(mine.id).name}`, detail: "연구가 끝나면 규칙이 바뀝니다.", level: "good" });
  const theirs = war.edicts.rival.researching;
  if (theirs) out.push({ kind: "edict", day: w.day + theirs.remaining, title: `적이 법령을 연구 중: ${edictOf(theirs.id).name}`, detail: "시행되면 적의 규칙이 바뀝니다." });

  // 건설
  for (const b of war.structures.filter((x) => !x.done)) {
    const left = b.totalDays - b.progressDays;
    if (b.realm === "player") {
      out.push({ kind: "build", day: w.day + left, title: `${KIND_NAME[b.kind]} 완공 (구간 ${b.sector + 1})`, detail: `인부 ${fmt(b.workers)}명이 돌아옵니다. (${b.progressDays}/${b.totalDays}일)`, level: "good" });
    } else {
      out.push({ kind: "build", day: w.day + left, title: `적이 ${KIND_NAME[b.kind]}를 짓는 중 (구간 ${b.sector + 1})`, detail: "완공되면 그 구간의 적 병력 밀도가 올라갑니다." });
    }
  }

  // 지휘관 도착과 승급
  for (const c of war.commanders.filter((x) => x.realm === "player")) {
    if (c.toZone !== null) out.push({ kind: "cmd", day: c.arriveDay, title: `${c.name} 도착 (${ZONE_NAMES[c.toZone]})`, detail: "도착하면 그 구간에서 효과가 납니다.", level: "good" });
    else if (c.zone !== null && levelOf(c) < COMMANDER_MAX_LEVEL) {
      const left = COMMANDER_DAYS_PER_LEVEL - (c.workDays % COMMANDER_DAYS_PER_LEVEL);
      out.push({ kind: "cmd", day: w.day + left, title: `${c.name} 승급 (${levelOf(c) + 1}급)`, detail: "효과가 커집니다.", level: "good" });
    }
  }

  // 적: 이번 턴 예상 병력 변화
  if (preview) {
    const rs = soldiersOf(w.regions.find((r) => r.id === war.rivalRegionId)!);
    if (preview.rivalSoldiers < rs * 0.85) {
      out.push({ kind: "rival", day: turn.startDay, title: "적이 병력을 줄인다", detail: `수확 철이라 적 병력이 ${fmt(rs)}명에서 약 ${fmt(preview.rivalSoldiers)}명으로 줄 전망입니다.`, level: "good" });
    }
  }
  return out.sort((a, b) => a.day - b.day);
}
