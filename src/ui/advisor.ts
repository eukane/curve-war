/**
 * 참모의 보고: 지금 플레이어가 신경 써야 할 것을 우선순위로 정리한다.
 * "언제나 할 일이 있다"는 원칙(CLAUDE.md 원칙 0-2)을 위한 것이다. 모든 문장은 현재 상태에서 계산한다.
 */
import { TURN_DAYS, dateOf, turnOf } from "../sim/calendar";
import { COMMANDER_TRAVEL_DAYS, FORT_DAYS, HARVEST_DAY_OF_YEAR, HA_PER_FARMER, SOWING_DAY_OF_YEAR, UNIT_KM } from "../sim/constants";
import { computePressure, frontXAt, sectorName, soldiersOf, totalAreaHa, trainingCount } from "../sim/war";
import { dailyNeedKg, fieldFarmersAt } from "../sim/world";
import type { TurnPreview, World } from "../sim/world";

export interface Advice {
  level: "danger" | "warn" | "chance" | "info";
  title: string;
  text: string;
}

const fmt = (v: number, d = 0) => v.toLocaleString("ko-KR", { maximumFractionDigits: d, minimumFractionDigits: d });

export function advise(w: World, preview: TurnPreview | null = null): Advice[] {
  const war = w.war!;
  const P = w.regions.find((r) => r.id === war.playerRegionId)!;
  const R = w.regions.find((r) => r.id === war.rivalRegionId)!;
  const out: Advice[] = [];
  const { dayOfYear } = dateOf(w.day);
  void TURN_DAYS;
  const pr = computePressure(w);

  // 지휘관: 놀고 있는 지휘관이 있으면 먼저 알린다 (적은 처음부터 배치한다)
  {
    const idle = war.commanders.filter((c) => c.realm === "player" && c.zone === null && c.toZone === null);
    if (idle.length > 0) {
      out.push({ level: "warn", title: "지휘관이 놀고 있다", text: `${idle.map((c) => c.name).join(", ")}을(를) 구간에 배치하세요. 배치하면 ${COMMANDER_TRAVEL_DAYS}일 뒤부터 효과가 나고, 오래 둘수록 계급이 오릅니다. 공세형은 앞으로 내미는 구간에, 수성형은 지키는 구간에 두는 것이 맞습니다.` });
    }
  }

  // 건설 권유: 여름·겨울(농사와 겹치지 않는 때)에 공사가 비어 있고 밀리는 구간이 있으면
  {
    const season = turnOf(w.day).season;
    const building = war.structures.filter((x) => x.realm === "player" && !x.done).length;
    const pr0 = computePressure(w);
    const worstNet0 = Math.min(...pr0.net);
    if ((season === "여름" || season === "겨울") && building === 0 && worstNet0 < -8) {
      const i = pr0.net.indexOf(worstNet0);
      out.push({ level: "info", title: "지금이 건설하기 좋은 때", text: `${season}에는 농사 일손과 겹치지 않습니다. 밀리는 ${sectorName(i)}에 요새(${FORT_DAYS}일)를 지어 두면 다음 계절에 버틸 수 있습니다. 지도에서 그 점을 누르세요.` });
    }
  }

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

  // 1-2) 이번 계절 예상: 영토를 크게 잃거나 얻는 경우
  if (preview) {
    const pct = (preview.playerAreaHaDelta / totalAreaHa()) * 100;
    if (pct < -0.6) {
      out.push({
        level: pct < -2 ? "danger" : "warn",
        title: `이번 계절에 영토 ${fmt(-pct, 1)}%p를 잃는다`,
        text: `지금 명령으로 ${turnOf(w.day).season}을 보내면 영토 ${fmt(-preview.playerAreaHaDelta)}ha와 그 땅의 주민·경지를 잃습니다(적의 반응 포함 예상). 밀리는 구간에 명령선을 내밀어 병력을 몰거나 병력을 늘리세요.`,
      });
    } else if (pct > 0.6) {
      out.push({ level: "chance", title: `이번 계절에 영토 ${fmt(pct, 1)}%p를 얻는다`, text: `지금 명령대로면 영토 ${fmt(preview.playerAreaHaDelta)}ha를 얻습니다(예상). 수확 일손과 식량을 함께 확인하세요.` });
    }
  }

  // 2) 수확과 병력: 한 턴 안에서는 명령을 바꿀 수 없으므로, 수확이 있는 턴의 시작에 미리 알려야 한다
  const turn = turnOf(w.day);
  const harvestDay = turn.year * 360 + HARVEST_DAY_OF_YEAR;
  const harvestInTurn = harvestDay >= w.day && harvestDay < turn.endDay;
  const needFarmers = (P.sownHa > 0 ? P.sownHa : P.arableHa) / HA_PER_FARMER;
  const field = fieldFarmersAt(P, harvestDay);
  if (harvestInTurn && field < needFarmers) {
    const short = needFarmers - field;
    out.push({
      level: "warn",
      title: "이번 계절 수확에 일손이 모자란다",
      text: `수확은 ${harvestDay - w.day}일 뒤입니다. 들에 나갈 농민이 ${fmt(field)}명으로 필요한 ${fmt(needFarmers)}명보다 ${fmt(short)}명 적어 곡식의 ${fmt((1 - field / needFarmers) * 100, 0)}%를 거두지 못합니다. 이번 계절 중에는 명령을 바꿀 수 없으니, 지금 병사 ${fmt(short)}명을 해산해야 합니다(그만큼 전선이 약해집니다).`,
    });
  }
  const sowDay = turn.year * 360 + SOWING_DAY_OF_YEAR;
  if (sowDay >= w.day && sowDay < turn.endDay) {
    const sowCap = fieldFarmersAt(P, sowDay) * HA_PER_FARMER;
    if (sowCap < P.arableHa - 1) {
      out.push({
        level: "warn",
        title: "이번 봄 파종에 일손이 모자란다",
        text: `파종은 ${sowDay - w.day}일 뒤입니다. 들에 나갈 일손으로는 ${fmt(sowCap)}ha만 심을 수 있어 경작지 ${fmt(P.arableHa)}ha 중 ${fmt(P.arableHa - sowCap)}ha를 놀리게 됩니다. 올가을 수확이 그만큼 줄어듭니다.`,
      });
    }
  }

  // 3) 식량
  const stockDays = P.granaryKg / dailyNeedKg(P);
  const dh = HARVEST_DAY_OF_YEAR - dayOfYear;
  const toHarvest = dh >= 0 ? dh : 360 + dh;
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
  const rivalHarvest = harvestInTurn;
  if (preview && preview.rivalSoldiers < rs * 0.8) {
    out.push({
      level: "chance",
      title: "기회: 적이 병력을 줄인다",
      text: `적은 수확 일손을 대려고 이번 계절 병력을 ${fmt(rs)}명에서 약 ${fmt(preview.rivalSoldiers)}명으로 줄일 전망입니다(우리 ${fmt(ps)}명). 이번 계절에 명령선을 앞으로 내밀면 유리합니다.`,
    });
  } else if (rivalHarvest && ps > rs * 1.15) {
    out.push({ level: "chance", title: "기회: 적이 수확 철이다", text: `적도 수확 철이라 병력이 줄어 있습니다(적 ${fmt(rs)}명, 우리 ${fmt(ps)}명). 지금 공세를 걸면 유리합니다.` });
  }
  if (ps < rs * 0.85) {
    out.push({ level: "warn", title: "병력이 적보다 적다", text: `우리 ${fmt(ps)}명, 적 ${fmt(rs)}명. 적은 우리 병력을 보고 따라 징집합니다.` });
  }

  // 훈련 중인 병사
  const training = trainingCount(P, w.day);
  if (training > 0) {
    const nextReady = Math.min(...P.trainees.filter((t) => t.readyDay > w.day).map((t) => t.readyDay));
    out.push({
      level: "info",
      title: `병사 ${fmt(training)}명이 훈련 중`,
      text: `${nextReady - w.day}일 뒤에 전력이 됩니다. 그때까지는 곡식을 먹고 농사도 못 짓지만 싸우지는 못합니다. 이번 계절 안에 전력이 ${nextReady < turn.endDay ? "됩니다(턴 도중이라 명령을 바꿀 수는 없습니다)." : "되지 않고 다음 계절에 됩니다."}`,
    });
  }

  // 법령 슬롯이 비어 있는데 연구도 안 하고 있다
  const ed = war.edicts.player;
  if (!ed.researching && ed.enacted.length < 2) {
    out.push({ level: "info", title: "법령 슬롯이 비어 있다", text: `법령은 시행까지 180일(2턴)이 걸립니다. 오른쪽 '법령' 카드에서 연구를 시작할 수 있습니다. 적은 이미 자기 법령을 정하고 있습니다.` });
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
