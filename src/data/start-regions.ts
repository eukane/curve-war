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

/**
 * 전쟁 시나리오: 같은 조건의 두 지역(플레이어 id 1, 적 id 2)이 전선을 맞대고 있다.
 * 시작 병력은 양쪽 1,000명(전체 인구의 약 3.3%). 병력은 장인·상인 인구에서 떼어 총 인구를 30,000으로 맞췄다. (임시)
 * 두 지역의 땅은 각각 지도의 절반(약 115,200ha)이고 경지 12,600ha가 그 안에 있다(경지율 약 10.9%, 임시).
 */
const sideRegion = (id: number, name: string): RegionSeed => ({
  id,
  name,
  arableHa: 12_600,
  clearableHa: 4_000,
  soil: 1.0,
  granaryKg: 4_200_000,
  seedKg: 1_890_000,
  cohorts: [
    { stratum: "farmer", pop: 18_000 },
    { stratum: "artisan", pop: 8_000 },
    { stratum: "elite", pop: 3_000 },
    { stratum: "soldier", pop: 1_000 },
  ],
});

export const WAR_REGIONS: RegionSeed[] = [sideRegion(1, "소금평야 (우리)"), sideRegion(2, "동쪽 고원 (적)")];
