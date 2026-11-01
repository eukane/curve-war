/**
 * 참모의 보고: 지금 플레이어가 신경 써야 할 것을 우선순위로 정리한다.
 * "언제나 할 일이 있다"는 원칙(CLAUDE.md 원칙 0-2)을 위한 것이다. 모든 문장은 현재 상태에서 계산한다.
 */
import { dateOf } from "../sim/calendar";
import { HARVEST_DAY_OF_YEAR, HA_PER_FARMER, UNIT_KM } from "../sim/constants";
import { computePressure, frontXAt, sectorName, soldiersOf } from "../sim/war";
import { dailyNeedKg, fieldFarmersAt } from "../sim/world";
import type { MonthPreview, World } from "../sim/world";

export interface Advice {
  level: "danger" | "warn" | "chance" | "info";
  title: string;
  text: string;
}

const fmt = (v: number, d = 0) => v.toLocaleString("ko-KR", { maximumFractionDigits: d, minimumFractionDigits: d });

export function advise(w: World, preview: MonthPreview | null = null): Advice[] {
  const war = w.war!;
  const P = w.regions.find((r) => r.id === war.playerRegionId)!;
  const R = w.regions.find((r) => r.id === war.rivalRegionId)!;
  const out: Advice[] = [];
  const { dayOfYear } = dateOf(w.day);
  const pr = computePressure(w);

  // 1) 수도까지의 거리와 가장 위험한 구간
  const capP = war.capitals.player;
  const capR = war.capitals.rival;
  const distToOurCapital = (frontXAt(war.front, capP.y) - capP.x) * UNIT_KM;
  const distToTheirs = (capR.x - frontXAt(war.front, capR.y)) * UNIT_KM;
  let worst = 0;
  pr.net.forEach((n, i) => {
    if (n < pr.net[worst]!) worst = i;
  });
  const worstNet = pr.net[worst]!;
  if (worstNet < -8) {
    out.push({
      level: worstNet < -20 ? "danger" : "warn",
      title: `${sectorName(worst)} 구간이 밀리고 있다`,
      text: `이 구간은 적 밀도가 우리보다 ${fmt(-worstNet, 0)}명/km 높습니다. 아군 병력을 더 몰아 두거나(명령선을 앞으로 내밀기) 병력을 늘리세요.`,
    });
  }
  if (distToOurCapital < 12) {
    out.push({ level: "danger", title: "수도가 위험하다", text: `전선이 우리 수도에서 ${fmt(distToOurCapital, 1)}km까지 다가왔습니다. 수도가 함락되면 패배합니다.` });
  }

  // 2) 수확과 병력
  const daysToHarvest = HARVEST_DAY_OF_YEAR - dayOfYear;
  const needFarmers = P.sownHa / HA_PER_FARMER;
  const field = fieldFarmersAt(P, w.day + Math.max(0, daysToHarvest));
  if (P.sownHa > 0 && daysToHarvest >= 0 && daysToHarvest <= 40 && field < needFarmers) {
    const short = needFarmers - field;
    out.push({
      level: "warn",
      title: "수확 일손이 모자란다",
      text: `수확까지 ${daysToHarvest}일. 들에 나갈 농민이 ${fmt(field)}명으로 필요한 ${fmt(needFarmers)}명보다 ${fmt(short)}명 적어 곡식의 ${fmt((1 - field / needFarmers) * 100, 0)}%를 거두지 못합니다. 병사 ${fmt(short)}명을 해산하면 해결되지만 그만큼 전선이 약해집니다.`,
    });
  }

  // 3) 식량
  const stockDays = P.granaryKg / dailyNeedKg(P);
  const toHarvest = daysToHarvest >= 0 ? daysToHarvest : 360 + daysToHarvest;
  if (stockDays < toHarvest) {
    out.push({
      level: stockDays < toHarvest * 0.5 ? "danger" : "warn",
      title: "수확까지 곡식이 모자란다",
      text: `곡창에 ${fmt(stockDays)}일치가 있는데 다음 수확까지 ${fmt(toHarvest)}일입니다. 부족하면 병사도 굶어 전투력이 줄어듭니다(지금 부족률 ${fmt(P.lastDeficit * 100, 0)}%). 병력을 줄이면 소비가 줄지만 농민이 늘어도 당장은 곡식이 늘지 않습니다.`,
    });
  }

  // 4) 기회: 적이 수확 철이라 병력을 줄였을 때
  const rs = soldiersOf(R);
  const ps = soldiersOf(P);
  const rivalHarvest = dayOfYear >= HARVEST_DAY_OF_YEAR - 25 && dayOfYear <= HARVEST_DAY_OF_YEAR + 5;
  if (preview && preview.rivalSoldiers < rs * 0.8) {
    out.push({
      level: "chance",
      title: "기회: 적이 병력을 줄인다",
      text: `적은 수확 일손을 대려고 이번 달 병력을 ${fmt(rs)}명에서 약 ${fmt(preview.rivalSoldiers)}명으로 줄일 전망입니다(우리 ${fmt(ps)}명). 이 달에 명령선을 앞으로 내밀면 유리합니다.`,
    });
  } else if (rivalHarvest && ps > rs * 1.15) {
    out.push({ level: "chance", title: "기회: 적이 수확 중이다", text: `적도 수확 철이라 병력이 줄어 있습니다(적 ${fmt(rs)}명, 우리 ${fmt(ps)}명). 지금 공세를 걸면 유리합니다.` });
  }
  if (ps < rs * 0.85) {
    out.push({ level: "warn", title: "병력이 적보다 적다", text: `우리 ${fmt(ps)}명, 적 ${fmt(rs)}명. 적은 우리 병력을 보고 따라 징집합니다.` });
  }

  // 5) 목표
  out.push({
    level: "info",
    title: "목표",
    text: `적 수도를 함락하면 승리합니다. 전선은 적 수도에서 ${fmt(distToTheirs, 1)}km 떨어져 있습니다. 수도에서 멀어질수록 보급이 길어져 전투력이 떨어집니다.`,
  });
  const order = { danger: 0, warn: 1, chance: 2, info: 3 } as const;
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
