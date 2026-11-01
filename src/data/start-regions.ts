import type { RegionSeed } from "../sim/world";

/**
 * 시작 지역 (임시 시험용). 균형 근거는 docs/MODEL.md 참조.
 * 인구 30,000: 농민 60% / 장인·상인 30% / 지배층 10%.
 * 농민 18,000명 × 0.7ha = 12,600ha 경작 → 평년 순수확 약 6,615t, 연 소비 약 6,480t.
 */
export const START_REGIONS: RegionSeed[] = [
  {
    id: 1,
    name: "소금평야 (시험 지역)",
    arableHa: 12_600,
    soil: 1.0,
    granaryKg: 4_800_000,
    cohorts: [
      { stratum: "farmer", pop: 18_000 },
      { stratum: "artisan", pop: 9_000 },
      { stratum: "elite", pop: 3_000 },
    ],
  },
];
