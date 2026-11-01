/**
 * 건설 (로드맵 단계 2b): 요새와 도로. 플레이어가 지도에서 직접 짓는다.
 *
 * - 인부는 농민에서 나온다. 공사 중에는 농사에서 빠지므로, 파종(봄)과 수확(가을)이 낀 기간에는 수확이 줄고
 *   여름과 겨울에는 영향이 없다. (일손 모델이 계절 논리를 만든다. 별도 계절 규칙은 없다.)
 * - 요새: 자기 쪽 전선 앞에 짓는다. 근처 구간의 병력 밀도를 높인다. 전선이 요새를 넘으면 적이 차지해 효과가 적에게 간다.
 * - 도로: 수도에서 구간까지. 그 구간 주변의 보급 한계 거리를 늘린다.
 *
 * 알려진 단순화: 도로는 한번 지으면 영토를 잃어도 건설한 세력의 보급을 계속 돕는다(전선이 도로 끝을 넘는 경우를 따로 다루지 않는다).
 * 모든 수치는 임시다.
 */
import {
  FORT_DAYS,
  FORT_DENSITY_BONUS,
  FORT_OFFSET_UNITS,
  FORT_REACH_UNITS,
  FORT_SPREAD_POINTS,
  FORT_WORKERS,
  FRONT_POINTS,
  MAX_CONCURRENT_BUILDS,
  ROAD_DAYS,
  ROAD_FALLOFF_BONUS,
  ROAD_SPREAD_POINTS,
  ROAD_WORKERS,
} from "./constants";
import { popOf } from "./state";
import type { Realm, Structure, StructureKind, World } from "./state";

type Result = { ok: true; id: number } | { ok: false; reason: string };

export const KIND_NAME: Record<StructureKind, string> = { fort: "요새", road: "도로" };

const regionOf = (w: World, realm: Realm) => w.regions.find((r) => r.id === (realm === "player" ? w.war!.playerRegionId : w.war!.rivalRegionId))!;

export function buildInfo(kind: StructureKind): { workers: number; days: number } {
  return kind === "fort" ? { workers: FORT_WORKERS, days: FORT_DAYS } : { workers: ROAD_WORKERS, days: ROAD_DAYS };
}

function log(w: World, realm: Realm, text: string) {
  w.log.push({ day: w.day, regionId: regionOf(w, realm).id, kind: realm === "player" ? "player" : "system", text });
}

/** 같은 세력의 진행 중인 건설 수 */
export function activeBuilds(w: World, realm: Realm): Structure[] {
  return w.war!.structures.filter((s) => s.realm === realm && !s.done);
}

/** 이 구간에 건설을 시작할 수 있는가 (불가하면 이유) */
export function canBuild(w: World, realm: Realm, kind: StructureKind, sector: number): { ok: true } | { ok: false; reason: string } {
  const war = w.war!;
  if (!(sector >= 0 && sector < FRONT_POINTS)) return { ok: false, reason: "전선 밖입니다." };
  if (activeBuilds(w, realm).length >= MAX_CONCURRENT_BUILDS) return { ok: false, reason: `동시에 ${MAX_CONCURRENT_BUILDS}곳까지만 지을 수 있습니다.` };
  const { workers } = buildInfo(kind);
  const r = regionOf(w, realm);
  if (popOf(r, "farmer") - r.buildWorkers < workers + 2000) return { ok: false, reason: `인부 ${workers.toLocaleString("ko-KR")}명을 보낼 농민이 모자랍니다.` };
  const spread = kind === "fort" ? FORT_SPREAD_POINTS : ROAD_SPREAD_POINTS;
  const dup = war.structures.find((s) => s.realm === realm && s.kind === kind && Math.abs(s.sector - sector) < spread);
  if (dup) return { ok: false, reason: `근처에 이미 ${KIND_NAME[kind]}${dup.done ? "가 있습니다" : " 공사 중입니다"}.` };
  return { ok: true };
}

export function startBuild(w: World, realm: Realm, kind: StructureKind, sector: number): Result {
  const war = w.war;
  if (!war) return { ok: false, reason: "전쟁 상태가 아닙니다." };
  const can = canBuild(w, realm, kind, sector);
  if (!can.ok) return can;
  const { workers, days } = buildInfo(kind);
  const x = kind === "fort" ? war.front[sector]! + (realm === "player" ? -FORT_OFFSET_UNITS : FORT_OFFSET_UNITS) : 0;
  const s: Structure = { id: war.nextStructureId++, realm, kind, sector, x, totalDays: days, progressDays: 0, workers, done: false };
  war.structures.push(s);
  regionOf(w, realm).buildWorkers += workers;
  if (realm === "player") log(w, realm, `${KIND_NAME[kind]} 공사를 시작했다. (구간 ${sector + 1}, 인부 ${workers.toLocaleString("ko-KR")}명, ${days}일)`);
  return { ok: true, id: s.id };
}

/** 공사를 취소한다. 진행은 사라지고 인부는 농사로 돌아간다. */
export function cancelBuild(w: World, realm: Realm, id: number): { ok: true } | { ok: false; reason: string } {
  const war = w.war;
  const s = war?.structures.find((x) => x.id === id && x.realm === realm);
  if (!war || !s || s.done) return { ok: false, reason: "취소할 공사가 없습니다." };
  war.structures = war.structures.filter((x) => x.id !== id);
  regionOf(w, realm).buildWorkers -= s.workers;
  if (realm === "player") log(w, realm, `${KIND_NAME[s.kind]} 공사를 취소했다. (${s.progressDays}일 분량의 공사가 사라진다)`);
  return { ok: true };
}

/** 하루 진행: 공사가 끝나면 완공한다 */
export function tickBuilds(w: World): void {
  const war = w.war;
  if (!war) return;
  for (const s of war.structures) {
    if (s.done) continue;
    s.progressDays += 1;
    if (s.progressDays >= s.totalDays) {
      s.done = true;
      regionOf(w, s.realm).buildWorkers -= s.workers;
      log(w, s.realm, s.realm === "player" ? `${KIND_NAME[s.kind]}가 완공되었다. (구간 ${s.sector + 1})` : `적이 ${KIND_NAME[s.kind]}를 완공했다. (구간 ${s.sector + 1})`);
    }
  }
}

/** 요새를 지금 누가 차지하고 있는가: 전선이 요새를 넘으면 적이 차지한다 */
export function fortController(w: World, s: Structure): Realm {
  const frontX = w.war!.front[s.sector]!;
  if (s.realm === "player") return frontX >= s.x ? "player" : "rival";
  return frontX <= s.x ? "rival" : "player";
}

const fade = (d: number, span: number) => Math.max(0, 1 - d / span);

/** 점마다 요새가 주는 병력 밀도 배율 (세력별). 완공된 요새만 센다. */
export function fortMultipliers(w: World): Record<Realm, number[]> {
  const war = w.war!;
  const out: Record<Realm, number[]> = { player: Array(FRONT_POINTS).fill(1), rival: Array(FRONT_POINTS).fill(1) };
  for (const s of war.structures) {
    if (!s.done || s.kind !== "fort") continue;
    const owner = fortController(w, s);
    for (let i = 0; i < FRONT_POINTS; i++) {
      const e = FORT_DENSITY_BONUS * fade(Math.abs(i - s.sector), FORT_SPREAD_POINTS) * fade(Math.abs(war.front[i]! - s.x), FORT_REACH_UNITS);
      out[owner][i]! *= 1 + e;
    }
  }
  return out;
}

/** 점마다 도로가 주는 보급 한계 거리 배율 (세력별). 완공된 도로만 센다. */
export function roadFalloffMultipliers(w: World): Record<Realm, number[]> {
  const out: Record<Realm, number[]> = { player: Array(FRONT_POINTS).fill(1), rival: Array(FRONT_POINTS).fill(1) };
  for (const s of w.war!.structures) {
    if (!s.done || s.kind !== "road") continue;
    for (let i = 0; i < FRONT_POINTS; i++) out[s.realm][i]! *= 1 + ROAD_FALLOFF_BONUS * fade(Math.abs(i - s.sector), ROAD_SPREAD_POINTS);
  }
  return out;
}

/**
 * 적의 건설 (규칙 기반): 여름이나 겨울에만(농사와 겹치지 않을 때) 짓는다. 우리 밀도가 가장 높게 앞선 구간에 요새를 하나 짓는다.
 * 도로는 짓지 않는다 (알려진 단순화).
 */
export function aiBuild(w: World, pressureNet: number[]): void {
  const war = w.war!;
  const season = Math.floor(((w.day % 360) / 90));
  if (season === 0 || season === 2) return; // 봄·가을은 파종·수확 철
  const forts = war.structures.filter((s) => s.realm === "rival" && s.kind === "fort");
  if (forts.length >= 2) return;
  // 우리(플레이어)가 가장 앞서는 구간 = net이 가장 큰 곳 (적 입장에서 가장 위험한 곳). 이미 요새가 가까우면 다음 후보로 넘어간다.
  const candidates = pressureNet
    .map((n, i) => ({ n, i }))
    .filter(({ n, i }) => i >= 2 && i < FRONT_POINTS - 2 && n > 8)
    .sort((a, b) => b.n - a.n);
  for (const c of candidates) {
    if (startBuild(w, "rival", "fort", c.i).ok) return;
  }
}
