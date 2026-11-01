/**
 * 법령과 제도 (로드맵 단계 2a). "규칙을 여는 것"이지 숫자만 올리는 버프가 아니다.
 *
 * - 법령은 연구에 EDICT_RESEARCH_DAYS(180일)가 걸리고, 동시에 EDICT_SLOTS(2)개까지만 시행할 수 있다.
 * - 법령마다 얻는 것과 치르는 것이 한 쌍으로 있다. (한쪽이 항상 이기는 법령은 만들지 않는다)
 * - 법령의 효과는 Rules(state.ts)를 바꾸고, 시뮬레이션 규칙이 Rules를 읽는다.
 *
 * 모든 수치는 임시다. 법령의 이름과 배경은 역사에 실제로 있던 제도(군대가 농사를 겸하는 제도, 직업 군인, 보급 체계)에서
 * 착상했으나, 수치는 확인한 값이 아니다.
 */
import { EDICT_RESEARCH_DAYS, EDICT_SLOTS } from "./constants";
import { defaultRules } from "./state";
import type { Realm, Rules, World } from "./state";

export interface EdictDef {
  id: string;
  name: string;
  blurb: string;
  /** 규칙에 효과를 쌓는다 */
  apply: (r: Rules) => void;
  gains: string[];
  costs: string[];
}

export const EDICTS: EdictDef[] = [
  {
    id: "fields",
    name: "둔전제",
    blurb: "병사가 농사를 겸한다.",
    apply(r) {
      r.soldierFieldLabor += 0.5;
      r.rationMult *= 0.7;
      r.seasonStrength[0] *= 0.85; // 봄
      r.seasonStrength[2] *= 0.85; // 가을
    },
    gains: ["훈련을 마친 병사의 절반이 파종·수확 일손으로 계산된다. 큰 군대를 두고도 수확을 거둘 수 있다.", "병사가 스스로 곡식을 일부 길러 병사의 식량 소비가 30% 줄어든다."],
    costs: ["봄과 가을에는 병사가 농사에 흩어져 전투력이 15% 줄어든다."],
  },
  {
    id: "standing",
    name: "상비군제",
    blurb: "직업 군인을 둔다.",
    apply(r) {
      r.trainingDays = Math.min(r.trainingDays, 30);
      r.inflictMult *= 1.15;
      r.rationMult *= 1.5;
      r.levyCap = Math.min(r.levyCap, 0.3);
      r.disbandReturn = Math.min(r.disbandReturn, 0.5);
      for (let i = 0; i < 4; i++) r.seasonStrength[i] = r.seasonStrength[i]! * 1.2;
    },
    gains: ["직업 군인은 같은 수로도 20% 강하다(전투력 +20%).", "징집병의 훈련이 30일로 줄어 동원이 빨라진다.", "적에게 입히는 사상이 15% 늘어난다."],
    costs: ["병사 한 명이 식량을 50% 더 먹는다.", "해산해도 절반만 농민으로 돌아간다(직업 군인이 되었기 때문). 수확 철에 병사를 돌려보내기 어렵다.", "징집 상한이 농민의 40%에서 30%로 줄어 아주 큰 군대는 둘 수 없다."],
  },
  {
    id: "logistics",
    name: "병참 개혁",
    blurb: "군량 수송 체계를 갖춘다.",
    apply(r) {
      r.supplyFalloffMult *= 1.3;
      r.fieldLaborMult *= 0.9;
      r.hungerPenaltyMult *= 0.5;
    },
    gains: ["수도에서 멀어져도 보급이 덜 끊긴다(보급 한계 거리 30% 증가). 깊은 공세가 가능해진다.", "군량을 병사에게 먼저 보내서, 식량이 부족해도 병사가 약해지는 정도가 절반으로 줄어든다."],
    costs: ["수송에 일손을 돌려 파종·수확 일손이 10% 줄어든다."],
  },
];

export const edictOf = (id: string): EdictDef => EDICTS.find((e) => e.id === id)!;

/** 시행 중인 법령들로 규칙을 만든다 */
export function rulesFor(enacted: string[]): Rules {
  const r = defaultRules();
  for (const id of enacted) edictOf(id)?.apply(r);
  return r;
}

type Result = { ok: true } | { ok: false; reason: string };

const regionIdOf = (w: World, realm: Realm): number => (realm === "player" ? w.war!.playerRegionId : w.war!.rivalRegionId);

/** 두 세력의 규칙을 법령에서 다시 계산해 지역에 반영한다 */
export function recomputeRules(w: World): void {
  const war = w.war;
  if (!war) return;
  for (const realm of ["player", "rival"] as Realm[]) {
    const reg = w.regions.find((r) => r.id === regionIdOf(w, realm))!;
    reg.rules = rulesFor(war.edicts[realm].enacted);
  }
}

function log(w: World, realm: Realm, text: string) {
  w.log.push({ day: w.day, regionId: regionIdOf(w, realm), kind: realm === "player" ? "player" : "system", text });
}

export function slotsUsed(w: World, realm: Realm): number {
  const e = w.war!.edicts[realm];
  return e.enacted.length + (e.researching ? 1 : 0);
}

/** 법령 연구를 시작한다 */
export function startEdict(w: World, realm: Realm, id: string): Result {
  const war = w.war;
  if (!war) return { ok: false, reason: "전쟁 상태가 아닙니다." };
  const def = EDICTS.find((e) => e.id === id);
  if (!def) return { ok: false, reason: "없는 법령입니다." };
  const e = war.edicts[realm];
  if (e.enacted.includes(id)) return { ok: false, reason: "이미 시행 중입니다." };
  if (e.researching) return { ok: false, reason: "다른 법령을 연구하는 중입니다." };
  if (e.enacted.length >= EDICT_SLOTS) return { ok: false, reason: `법령은 ${EDICT_SLOTS}개까지 시행할 수 있습니다. 하나를 폐지해야 합니다.` };
  e.researching = { id, remaining: EDICT_RESEARCH_DAYS };
  if (realm === "player") log(w, realm, `법령 '${def.name}' 연구를 시작했다. (${EDICT_RESEARCH_DAYS}일)`);
  return { ok: true };
}

/** 연구 중인 법령을 취소한다. 쌓인 연구는 사라진다. */
export function cancelEdictResearch(w: World, realm: Realm): Result {
  const e = w.war?.edicts[realm];
  if (!e?.researching) return { ok: false, reason: "연구 중인 법령이 없습니다." };
  if (realm === "player") log(w, realm, `법령 '${edictOf(e.researching.id).name}' 연구를 취소했다.`);
  e.researching = null;
  return { ok: true };
}

/** 시행 중인 법령을 폐지한다. 되돌리려면 다시 연구해야 한다. */
export function repealEdict(w: World, realm: Realm, id: string): Result {
  const e = w.war?.edicts[realm];
  if (!e || !e.enacted.includes(id)) return { ok: false, reason: "시행 중인 법령이 아닙니다." };
  e.enacted = e.enacted.filter((x) => x !== id);
  recomputeRules(w);
  if (realm === "player") log(w, realm, `법령 '${edictOf(id).name}'을 폐지했다.`);
  return { ok: true };
}

/** 하루 진행: 연구 중인 법령이 완료되면 시행한다 */
export function tickEdicts(w: World): void {
  const war = w.war;
  if (!war) return;
  for (const realm of ["player", "rival"] as Realm[]) {
    const e = war.edicts[realm];
    if (!e.researching) continue;
    e.researching.remaining -= 1;
    if (e.researching.remaining <= 0) {
      const def = edictOf(e.researching.id);
      e.enacted.push(def.id);
      e.researching = null;
      recomputeRules(w);
      log(w, realm, realm === "player" ? `법령 '${def.name}'이 시행되었다.` : `적이 법령 '${def.name}'을 시행했다.`);
    }
  }
}

/** 적 지도자의 성향에 따른 법령 선호 순서 */
const AI_PREFERENCE: Record<string, string[]> = {
  aggressor: ["logistics", "standing", "fields"],
  cautious: ["fields", "standing", "logistics"],
  opportunist: ["standing", "logistics", "fields"],
};

/** 턴 시작에 적이 빈 슬롯이 있으면 선호 순서대로 법령 연구를 시작한다 */
export function aiEdicts(w: World): void {
  const war = w.war!;
  if (war.ai.edicts === false) return;
  const e = war.edicts.rival;
  if (e.researching || e.enacted.length >= EDICT_SLOTS) return;
  const prefs = AI_PREFERENCE[war.ai.profile] ?? AI_PREFERENCE.aggressor!;
  const next = prefs.find((id) => !e.enacted.includes(id));
  if (next) startEdict(w, "rival", next);
}
