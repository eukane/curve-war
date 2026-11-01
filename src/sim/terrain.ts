/**
 * 지형과 조수 (로드맵 단계 3). 세계 설정은 docs/WORLD.md.
 *
 * 지형 요소는 지도 위의 타원이다. 전선의 점이 그 안에 있으면(가장자리는 서서히 약해진다) 그 점의 이동과 밀도가 달라진다.
 * - 갯벌(내해의 만): 이동 배율이 계절 수위에 따라 바뀐다. 큰물(여름)에는 거의 건널 수 없고, 간조(겨울)에는 평지보다 빠르다.
 * - 능선(동쪽 고원의 서쪽 끝): 이동이 느려지고, 고향으로 가진 쪽(적)이 병력 밀도를 더 얻는다.
 *
 * 알려진 단순화: 땅의 이전은 면적에 비례(갯벌도 같은 값의 땅으로 센다). 능선의 고향은 고정(적). 모든 수치는 임시.
 */
import { FLAT_MOVE_DRY, FLAT_MOVE_WET, FRONT_POINTS, MAP_H, RIDGE_HOME_DENSITY_BONUS, RIDGE_MOVE, TIDE_LEVEL_BY_SEASON } from "./constants";
import type { World } from "./state";
import { seasonIndexOf } from "./state";

export type TerrainKind = "tidalflat" | "ridge";

export interface TerrainFeature {
  id: string;
  kind: TerrainKind;
  name: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** 지도 단위(1000×640)의 타원. 갯벌은 남쪽 내해에서 올라온 만, 능선은 북동쪽. */
export const TERRAIN: readonly TerrainFeature[] = [
  { id: "bay", kind: "tidalflat", name: "소금갯벌", cx: 470, cy: 600, rx: 190, ry: 130 },
  { id: "ridge", kind: "ridge", name: "서쪽 능선", cx: 690, cy: 130, rx: 150, ry: 190 },
];

export const TIDE_NAME = ["중간 물때", "큰물(만조)", "낮은 물때", "간조"] as const;

/** 이 계절의 평균 수위(0~1) */
export const tideLevel = (day: number): number => TIDE_LEVEL_BY_SEASON[seasonIndexOf(day)]!;

/** 갯벌의 이동 배율 (수위에 따라) */
export const flatMoveMult = (level: number): number => FLAT_MOVE_DRY + (FLAT_MOVE_WET - FLAT_MOVE_DRY) * level;

/** 점 (x, y)가 요소 안에 얼마나 들어 있는가: 중심 안쪽 1, 가장자리 바깥으로 갈수록 0 (타원 거리 1~1.25 사이에서 줄어든다) */
export function strengthAt(f: TerrainFeature, x: number, y: number): number {
  const d = Math.hypot((x - f.cx) / f.rx, (y - f.cy) / f.ry);
  return Math.max(0, Math.min(1, (1.25 - d) / 0.25));
}

export interface TerrainAt {
  moveMult: number;
  /** 적(능선의 고향)이 얻는 병력 밀도 배율 */
  rivalDensityMult: number;
  features: { id: string; name: string; kind: TerrainKind; strength: number }[];
}

export function terrainAt(x: number, y: number, day: number): TerrainAt {
  let moveMult = 1;
  let rivalDensityMult = 1;
  const features: TerrainAt["features"] = [];
  for (const f of TERRAIN) {
    const s = strengthAt(f, x, y);
    if (s <= 0) continue;
    features.push({ id: f.id, name: f.name, kind: f.kind, strength: s });
    if (f.kind === "tidalflat") moveMult *= 1 + s * (flatMoveMult(tideLevel(day)) - 1);
    else {
      moveMult *= 1 + s * (RIDGE_MOVE - 1);
      rivalDensityMult *= 1 + s * RIDGE_HOME_DENSITY_BONUS;
    }
  }
  return { moveMult, rivalDensityMult, features };
}

const frontY = (i: number): number => (i * MAP_H) / (FRONT_POINTS - 1);

/** 전선의 점마다 지형 효과 */
export function terrainMultipliers(w: World): { move: number[]; rivalDensity: number[]; at: TerrainAt[] } {
  const front = w.war!.front;
  const at = Array.from({ length: FRONT_POINTS }, (_, i) => terrainAt(front[i]!, frontY(i), w.day));
  return { move: at.map((a) => a.moveMult), rivalDensity: at.map((a) => a.rivalDensityMult), at };
}
