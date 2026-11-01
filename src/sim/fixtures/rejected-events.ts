/**
 * 출시하지 않기로 한 이벤트 두 개. 시험 고정물(fixture)로만 쓴다.
 *
 * 이 둘은 선택지가 가짜라서 폐기했다(자세한 근거는 docs/MODEL.md "폐기한 이벤트").
 * 품질 검사(quality.ts)가 이런 이벤트를 실제로 걸러내는지 확인하는 데 쓴다.
 *
 * 원래 설명: 이벤트 정의. 원칙 0: 개수가 아니라 깊이.
 *
 * - 이벤트는 시뮬레이션 상태가 조건을 넘을 때만 발생한다 (달력에 박힌 사건이 아니다).
 * - 선택지는 모델의 값을 실제로 바꾼다. 각 선택지의 결과는 world.ts가 모델을 복제해 돌려 계산한다.
 * - 본문의 숫자는 모두 그 순간의 상태에서 계산한다.
 */
import {
  HARVEST_DAY_OF_YEAR,
  HA_PER_FARMER,
  SEED_KG_PER_HA,
} from "../constants";
import { dateOf } from "../calendar";
import { clearingWorkersAt, dailyNeedKg, fieldFarmersAt } from "../state";
import type { EventDef, EventOption } from "../events";
import type { Region, World } from "../state";


/** 폐기한 이벤트 전용 점검일 (출시 게임에서는 쓰지 않으므로 상수 파일에서 이곳으로 옮겼다) */
const SPRING_CHECK_DAY_OF_YEAR = 45;
const HARVEST_ALERT_DAY_OF_YEAR = HARVEST_DAY_OF_YEAR - 15;

const fmt = (v: number, d = 0) => v.toLocaleString("ko-KR", { maximumFractionDigits: d, minimumFractionDigits: d });
const tons = (kg: number) => `${fmt(kg / 1000)}t`;

/** 올해 수확까지 남은 일수 (수확일 당일 포함하지 않음) */
function daysToHarvest(w: World): number {
  return HARVEST_DAY_OF_YEAR - dateOf(w.day).dayOfYear;
}

/* ------------------------------------------------------------------ */
/* 1. 파종 전 식량 위기: 종자를 먹을 것인가                              */
/* ------------------------------------------------------------------ */
const seedDilemma: EventDef = {
  id: "spring-seed-dilemma",
  title: "봄 식량 위기 — 종자를 먹을 것인가",
  // 수확은 195일 뒤. 단기 이득(올해 굶는 사람이 준다)과 장기 대가(가을 수확이 줄어 다음 겨울에 곡창이 빈다)를
  // 함께 보려면 두 번째 겨울을 지나 다음 해 여름까지 봐야 한다.
  checkpoints: [
    { days: 196, label: "올가을 수확 직후" },
    { days: 360, label: "1년 뒤" },
    { days: 600, label: "다음 해 가을 (두 번째 겨울을 지난 뒤)" },
  ],
  check(w, r) {
    if (dateOf(w.day).dayOfYear !== SPRING_CHECK_DAY_OF_YEAR) return false;
    if (r.seedKg <= 0) return false;
    // 수확까지 지금 재고로 버티지 못할 때만 발생한다
    return r.granaryKg < dailyNeedKg(r) * daysToHarvest(w);
  },
  text(w, r) {
    const need = dailyNeedKg(r);
    const days = daysToHarvest(w);
    const gap = need * days - r.granaryKg;
    return (
      `곡창에는 ${fmt(r.granaryKg / need)}일치(${tons(r.granaryKg)})가 남았는데 수확까지 ${days}일이 남았습니다. ` +
      `이대로면 ${tons(gap)}이 모자랍니다. ` +
      `창고에는 올해 파종용 종자 ${tons(r.seedKg)}이 따로 있고, 이는 ${fmt(r.seedKg / SEED_KG_PER_HA)}ha를 심을 분량입니다. ` +
      `종자를 먹으면 당장 굶는 사람은 줄지만, 그만큼 덜 심게 되어 가을 수확이 줄어듭니다.`
    );
  },
  options(w, r) {
    const mk = (id: string, label: string, frac: number): EventOption => ({
      id,
      label,
      apply(_w, rr) {
        const eat = rr.seedKg * frac;
        rr.seedKg -= eat;
        rr.granaryKg += eat;
      },
      logText: (_w, rr) =>
        frac === 0
          ? `종자 ${tons(rr.seedKg)}을 그대로 두고 파종을 준비했다.`
          : `종자의 ${Math.round(frac * 100)}%(${tons(rr.seedKg * frac)})를 풀어 곡창에 보탰다.`,
    });
    return [
      mk("keep", "종자를 건드리지 않는다", 0),
      mk("quarter", "종자의 1/4을 먹는다", 0.25),
      mk("half", "종자의 1/2을 먹는다", 0.5),
    ];
  },
};

/* ------------------------------------------------------------------ */
/* 2. 수확 노동력 충돌: 개간 인부냐 수확이냐                              */
/* ------------------------------------------------------------------ */
function harvestShortfall(w: World, r: Region) {
  const field = fieldFarmersAt(r, w.day + daysToHarvest(w));
  const capacityHa = field * HA_PER_FARMER;
  const fraction = r.sownHa > 0 ? Math.min(1, capacityHa / r.sownHa) : 1;
  return { field, capacityHa, fraction };
}

const harvestLabor: EventDef = {
  id: "harvest-labor-conflict",
  title: "수확 직전 — 개간 인부를 들로 보낼 것인가",
  checkpoints: [
    { days: 16, label: "수확 직후" },
    { days: 150, label: "첫 겨울 중반" },
    { days: 300, label: "다음 해 봄" },
  ],
  check(w, r) {
    if (dateOf(w.day).dayOfYear !== HARVEST_ALERT_DAY_OF_YEAR) return false;
    if (!r.clearing || r.sownHa <= 0) return false;
    return harvestShortfall(w, r).fraction < 1;
  },
  text(w, r) {
    const { field, capacityHa, fraction } = harvestShortfall(w, r);
    const workers = clearingWorkersAt(r, w.day);
    return (
      `수확이 ${daysToHarvest(w)}일 뒤입니다. 개간 현장에 인부 ${fmt(workers)}명이 나가 있어서 ` +
      `들에 남은 일손은 ${fmt(field)}명이고, 이 일손이 거둘 수 있는 면적은 ${fmt(capacityHa)}ha입니다. ` +
      `올해 파종한 면적은 ${fmt(r.sownHa)}ha입니다. 이대로면 곡식의 ${fmt((1 - fraction) * 100, 1)}%를 거두지 못하고 들에 썩힙니다. ` +
      `인부를 돌려보내면 개간이 그만큼 늦어집니다.`
    );
  },
  options(w, r) {
    const workers = clearingWorkersAt(r, w.day);
    const harvestDay = w.day + daysToHarvest(w);
    // 수확 완료율을 1로 만드는 데 필요한 최소 인원
    const neededFieldFarmers = r.sownHa / HA_PER_FARMER;
    const currentField = fieldFarmersAt(r, harvestDay);
    const needed = Math.min(workers, Math.max(0, Math.ceil(neededFieldFarmers - currentField)));

    const mk = (id: string, label: string, reserve: number, log: string): EventOption => ({
      id,
      label,
      apply(ww, rr) {
        if (!rr.clearing) return;
        rr.clearing.reservedForHarvest = reserve;
        rr.clearing.reservedUntilDay = ww.day + daysToHarvest(ww) + 1;
      },
      logText: () => log,
    });
    const opts: EventOption[] = [mk("continue", "개간을 계속한다", 0, `인부 ${fmt(workers)}명을 현장에 그대로 두었다.`)];
    // 필요 인원이 전체와 같으면 "전원"과 같은 선택이므로 중복해서 보여주지 않는다
    if (needed < workers) {
      opts.push(
        mk(
          "minimum",
          `수확에 필요한 ${fmt(needed)}명만 돌려보낸다`,
          needed,
          `인부 중 ${fmt(needed)}명을 수확에 돌려보냈다. 나머지 ${fmt(workers - needed)}명은 개간을 계속한다.`,
        ),
      );
    }
    opts.push(
      mk("all", "인부 전원을 수확에 돌려보낸다", workers, `인부 ${fmt(workers)}명 전원을 수확에 돌려보냈다. 개간은 수확이 끝날 때까지 멈춘다.`),
    );
    return opts;
  },
};

export const REJECTED_EVENTS: EventDef[] = [seedDilemma, harvestLabor];
