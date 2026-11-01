import type { RegionSeed } from "../sim/world";

/**
 * 시작 지역 (임시 시험용). 균형 근거는 docs/MODEL.md 참조.
 * 인구 30,000: 농민 60% / 장인·상인 30% / 지배층 10%.
 * 농민 18,000명 × 0.7ha = 12,600ha 파종 → 평년 순수확 약 6,930t(종자 1,890t 제외), 연 소비 30,000 × 0.5kg × 360일 = 5,400t.
 * 평년 여유 약 28%. 토지가 한계이므로 지속 가능 인구(수용력)는 38,500명(docs/MODEL.md 참조).
 * 농민 60%는 임시값이다. 시작 재고는 수확 전 240일치 소비(3,600t)에 여유를 더한 값. 종자 1,890t = 12,600ha × 150kg/ha.
 * 개간 가능 토지 4,000ha는 세계 설정이며 근거 없는 임시값(경작지의 약 1/3).
 */
export const START_REGIONS: RegionSeed[] = [
  {
    id: 1,
    name: "소금평야 (시험 지역)",
    arableHa: 12_600,
    clearableHa: 4_000,
    soil: 1.0,
    granaryKg: 4_200_000,
    seedKg: 1_890_000,
    cohorts: [
      { stratum: "farmer", pop: 18_000 },
      { stratum: "artisan", pop: 9_000 },
      { stratum: "elite", pop: 3_000 },
    ],
  },
];
