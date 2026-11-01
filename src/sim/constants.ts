/**
 * 시뮬레이션 상수. 제1원칙에 따라 모든 상수에 단위, 근거, 확신도를 적는다.
 * 확신도: "근사" = 현실 범위를 참고한 값, "임시" = 근거 없이 균형을 위해 둔 가정.
 * 같은 내용이 docs/MODEL.md에도 있어야 한다. 바꾸면 양쪽을 같이 고친다.
 */
import { DAYS_PER_YEAR } from "./calendar";

/** 1인 1일 곡물 소비량. 단위: kg/인/일. 근사.
 *  성인 하루 열량 필요를 2,200~2,500kcal, 곡물 열량을 kg당 약 3,300~3,500kcal로 보면
 *  성인은 0.65~0.75kg. 아이와 노인을 섞은 인구 평균으로 0.6을 쓴다. */
export const GRAIN_KG_PER_PERSON_DAY = 0.6;

/** 헥타르당 총수확량(평년). 단위: kg/ha. 임시.
 *  이 세계의 기술 수준(축력 쟁기, 휴경 윤작, 비료는 가축분뇨 정도)을 가정한 값이다.
 *  전근대 곡물 수확량이 대략 이 규모라는 점만 참고했고, 정확한 출처는 확인하지 않았다. */
export const YIELD_KG_PER_HA = 700;

/** 수확량 중 다음 해 종자로 떼어 두는 비율. 단위: 무차원. 근사.
 *  종자 1에 수확 4(파종 대비 수확비 4:1) 정도를 가정하면 1/4을 종자로 남긴다. */
export const SEED_FRACTION = 0.25;

/** 농민 1명이 경작할 수 있는 면적. 단위: ha/인. 임시.
 *  5명 가구에서 노동력이 되는 사람을 1.5~2명으로 보고, 가구가 쟁기질·파종·수확·타작을
 *  감당할 수 있는 면적을 3.5ha 정도로 둔 값(3.5ha / 5인 = 0.7ha/인). */
export const HA_PER_FARMER = 0.7;

/** 곡창 연간 손실률(쥐, 습기, 벌레). 단위: 1/년. 임시. */
export const STORAGE_LOSS_PER_YEAR = 0.05;
export const STORAGE_LOSS_PER_DAY = 1 - Math.pow(1 - STORAGE_LOSS_PER_YEAR, 1 / DAYS_PER_YEAR);

/** 수확일. 단위: 연중 일차(0~359). 임시. 가을(180~269일) 후반인 240일차로 둔다. */
export const HARVEST_DAY_OF_YEAR = 240;

/** 평시 출생률. 단위: 명/천 명/년. 근사. 전근대 사회의 조출생률 범위(대략 30~50) 안쪽. */
export const BIRTHS_PER_1000_YEAR = 40;

/** 평시 사망률. 단위: 명/천 명/년. 근사. 전근대 사회의 조사망률 범위(대략 25~45) 안쪽.
 *  출생 40, 사망 36이면 자연증가는 연 0.4%로 매우 느리다. */
export const DEATHS_PER_1000_YEAR = 36;

/** 식량 부족률 1.0(전혀 못 먹음)일 때 추가되는 연간 사망률. 단위: 1/년. 임시.
 *  부족률이 낮으면 면역력 저하와 질병으로, 높으면 직접 아사로 이어진다고 본다.
 *  선형으로 단순화했다(알려진 단순화 참조). */
export const STARVATION_DEATH_RATE_AT_FULL_DEFICIT = 0.35;

/** 식량 부족률 1.0일 때 출생이 줄어드는 비율의 기울기. 단위: 무차원. 임시.
 *  부족률 0.67 이상이면 출생이 0이 된다. */
export const BIRTH_SUPPRESSION_PER_DEFICIT = 1.5;

/** 평년 대비 기상 계수의 분산(로그정규 sigma). 단위: 무차원. 임시. 평균은 1이 되도록 보정한다. */
export const WEATHER_SIGMA = 0.18;
export const WEATHER_MIN = 0.45;
export const WEATHER_MAX = 1.35;
