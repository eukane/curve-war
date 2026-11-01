/**
 * 지휘관 (로드맵 단계 2c).
 *
 * 전선은 세 지휘 구간(북부·중부·남부)으로 나뉜다. 지휘관을 구간에 배치하면 그 구간 점들의 병력 밀도(또는 보급)가 바뀐다.
 * - 공세형: 그 구간에서 명령선을 앞으로 내밀 때 밀도 +, 지키거나 물러설 때 −.
 * - 수성형: 지키거나 물러설 때 +, 앞으로 내밀 때 −.
 * - 군수형: 밀도는 그대로, 그 구간의 보급 한계 거리를 늘린다. 먼 구간에서 가치가 있다.
 * 근무 일수가 쌓이면 계급이 오른다(최대 3). 구간을 옮기면 30일 동안 아무 구간에도 효과가 없고, 계급(근무 일수)은 유지된다.
 * 배치하지 않은 구간은 기본 규칙(효과도 불이익도 없음)이다. 모든 수치는 임시다.
 *
 * 알려진 단순화: 지휘관은 전사하거나 늙지 않고 충성 문제도 없다(사회 구조는 단계 4에서 다룬다).
 */
import {
  COMMANDER_BASE_EFFECT,
  COMMANDER_DAYS_PER_LEVEL,
  COMMANDER_LEVEL_GAIN,
  COMMANDER_MAX_LEVEL,
  COMMANDER_MISFIT_PENALTY,
  COMMANDER_SUPPLY_BONUS,
  COMMANDER_TRAVEL_DAYS,
  COMMAND_ZONES,
  FRONT_POINTS,
} from "./constants";
import type { Commander, CommanderTrait, Realm, World } from "./state";

export const TRAIT_NAME: Record<CommanderTrait, string> = { aggressive: "공세형", defensive: "수성형", logistician: "군수형" };
export const ZONE_NAME = ["북부", "중부", "남부"] as const;

export const TRAIT_TEXT: Record<CommanderTrait, string> = {
  aggressive: "명령선을 앞으로 내미는 구간에서 병력 밀도가 오르고, 지키는 구간에서는 떨어진다.",
  defensive: "지키거나 물러서는 구간에서 병력 밀도가 오르고, 앞으로 내미는 구간에서는 떨어진다.",
  logistician: "구간의 보급이 수도에서 더 멀리까지 닿는다. 밀도에는 영향이 없다.",
};

/** 처음 가진 지휘관 (세력마다 셋, 성향이 하나씩). 이름은 이 세계의 가상 이름이다. */
export function startCommanders(): Commander[] {
  const mk = (id: number, realm: Realm, name: string, trait: CommanderTrait): Commander => ({ id, realm, name, trait, workDays: 0, zone: null, toZone: null, arriveDay: 0 });
  return [
    mk(1, "player", "서온", "aggressive"),
    mk(2, "player", "한율", "defensive"),
    mk(3, "player", "도하", "logistician"),
    mk(4, "rival", "카슬", "aggressive"),
    mk(5, "rival", "모란", "defensive"),
    mk(6, "rival", "이솔", "logistician"),
  ];
}

export const levelOf = (c: Commander) => Math.min(COMMANDER_MAX_LEVEL, Math.floor(c.workDays / COMMANDER_DAYS_PER_LEVEL));
export const effectOf = (c: Commander) => COMMANDER_BASE_EFFECT * (1 + COMMANDER_LEVEL_GAIN * levelOf(c));
export const zoneOfPoint = (i: number) => COMMAND_ZONES.findIndex(([a, b]) => i >= a && i <= b);

export function commandersOf(w: World, realm: Realm): Commander[] {
  return w.war!.commanders.filter((c) => c.realm === realm);
}

/** 이 구간에서 효과를 내고 있는 지휘관(이동 중이면 없음) */
export function commanderAt(w: World, realm: Realm, zone: number): Commander | undefined {
  return w.war!.commanders.find((c) => c.realm === realm && c.zone === zone && c.toZone === null);
}

/** 점 i에서 이 세력이 앞으로 내밀고 있는가 (명령선이 전선보다 3단위 넘게 앞) */
export function isAdvancing(w: World, realm: Realm, i: number): boolean {
  const war = w.war!;
  const o = war.orders[realm][i]!, x = war.front[i]!;
  return realm === "player" ? o > x + 3 : o < x - 3;
}

/** 점마다 지휘관이 주는 병력 밀도 배율 */
export function commanderDensityMultipliers(w: World): Record<Realm, number[]> {
  const out: Record<Realm, number[]> = { player: Array(FRONT_POINTS).fill(1), rival: Array(FRONT_POINTS).fill(1) };
  for (const c of w.war!.commanders) {
    if (c.zone === null || c.toZone !== null || c.trait === "logistician") continue;
    const e = effectOf(c);
    const [a, b] = COMMAND_ZONES[c.zone]!;
    for (let i = a; i <= b; i++) {
      const adv = isAdvancing(w, c.realm, i);
      const fit = (c.trait === "aggressive") === adv;
      out[c.realm][i]! *= fit ? 1 + e : 1 - COMMANDER_MISFIT_PENALTY;
    }
  }
  return out;
}

/** 점마다 지휘관(군수형)이 주는 보급 한계 거리 배율 */
export function commanderSupplyMultipliers(w: World): Record<Realm, number[]> {
  const out: Record<Realm, number[]> = { player: Array(FRONT_POINTS).fill(1), rival: Array(FRONT_POINTS).fill(1) };
  for (const c of w.war!.commanders) {
    if (c.zone === null || c.toZone !== null || c.trait !== "logistician") continue;
    const [a, b] = COMMAND_ZONES[c.zone]!;
    const m = 1 + COMMANDER_SUPPLY_BONUS * (1 + COMMANDER_LEVEL_GAIN * levelOf(c));
    for (let i = a; i <= b; i++) out[c.realm][i]! *= m;
  }
  return out;
}

type Result = { ok: true } | { ok: false; reason: string };

/** 지휘관을 구간에 배치한다 (또는 null로 대기시킨다). 옮기면 도착까지 효과가 없다. 같은 구간에 이미 다른 지휘관이 있으면 그 지휘관과 자리를 바꾸지 않고 거부한다. */
export function assignCommander(w: World, realm: Realm, id: number, zone: number | null): Result {
  const war = w.war;
  const c = war?.commanders.find((x) => x.id === id && x.realm === realm);
  if (!war || !c) return { ok: false, reason: "그런 지휘관이 없습니다." };
  if (zone !== null && !(zone >= 0 && zone < COMMAND_ZONES.length)) return { ok: false, reason: "그런 구간이 없습니다." };
  if ((c.toZone ?? c.zone) === zone) return { ok: false, reason: "이미 그 구간입니다." };
  if (zone !== null) {
    const other = war.commanders.find((x) => x.realm === realm && x.id !== id && (x.toZone ?? x.zone) === zone);
    if (other) return { ok: false, reason: `${ZONE_NAME[zone]}에는 이미 ${other.name}이(가) 있습니다.` };
  }
  if (zone === null) {
    c.zone = null;
    c.toZone = null;
  } else if (c.zone === null && c.toZone === null) {
    c.toZone = zone;
    c.arriveDay = w.day + COMMANDER_TRAVEL_DAYS;
  } else {
    c.zone = null; // 떠나는 순간부터 효과가 없다
    c.toZone = zone;
    c.arriveDay = w.day + COMMANDER_TRAVEL_DAYS;
  }
  if (realm === "player") w.log.push({ day: w.day, regionId: war.playerRegionId, kind: "player", text: zone === null ? `${c.name}을(를) 대기시켰다.` : `${c.name}이(가) ${ZONE_NAME[zone]}으로 떠났다. (${COMMANDER_TRAVEL_DAYS}일)` });
  return { ok: true };
}

/** 하루 진행: 도착 처리와 근무 일수 누적 */
export function tickCommanders(w: World): void {
  if (!w.war) return;
  for (const c of w.war.commanders) {
    if (c.toZone !== null) {
      if (w.day >= c.arriveDay) {
        c.zone = c.toZone;
        c.toZone = null;
      }
    } else if (c.zone !== null) c.workDays += 1;
  }
}

/**
 * 적의 배치 (규칙 기반, 턴 초): 놀고 있는 지휘관이 있으면 성향에 맞는 구간에 보낸다.
 * 공세형 = 적이 가장 앞선 구간(밀도 차가 적에게 가장 유리한 곳), 수성형 = 가장 밀리는 구간, 군수형 = 수도에서 가장 먼 구간.
 * 이미 배치된 지휘관은 옮기지 않는다 (경험을 쌓게 하는 단순한 규칙).
 */
export function aiCommanders(w: World, net: number[]): void {
  const war = w.war!;
  const zoneNet = COMMAND_ZONES.map(([a, b]) => net.slice(a, b + 1).reduce((s, v) => s + v, 0) / (b - a + 1));
  for (const c of war.commanders) {
    if (c.realm !== "rival" || c.zone !== null || c.toZone !== null) continue;
    const free = COMMAND_ZONES.map((_, z) => z).filter((z) => !war.commanders.some((x) => x.realm === "rival" && (x.toZone ?? x.zone) === z));
    if (free.length === 0) continue;
    const key = (z: number): number => {
      // 가장 작은 키의 구간을 고른다. net은 플레이어 우세가 +이므로 적이 가장 앞선 곳 = 가장 작은 net
      if (c.trait === "aggressive") return zoneNet[z]!;
      if (c.trait === "defensive") return -zoneNet[z]!; // 적이 가장 밀리는 곳
      const [a, b] = COMMAND_ZONES[z]!;
      let d = 0;
      for (let i = a; i <= b; i++) d += war.capitals.rival.x - war.front[i]!;
      return -d / (b - a + 1); // 수도에서 먼 구간일수록 키가 작다
    };
    const best = free.sort((p, q) => key(p) - key(q))[0]!;
    assignCommander(w, "rival", c.id, best);
  }
}
