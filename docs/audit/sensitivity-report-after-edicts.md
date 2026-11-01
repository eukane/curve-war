## 잡음 확인: 기준선(시드 1~6) vs 같은 설정 다른 시드(7~12)

시드 집합만 바꿔도 문턱을 넘는 지표: 총동원.area (0.58 vs 0.52), 총동원.pop (28227.06 vs 26493.18)
→ 이 지표들의 작은 변화는 잡음일 수 있다.

## 경제

| 변형 | 눈에 띄게 달라진 것 (정책.지표 변화량) | 영향 점수 |
|---|---|---|
| YIELD_KG_PER_HA ×0.5 | 영리.starv +6942; 단순공세.starv +6788; 방어개간.starv +6726; 방어.starv +6568 | 17.4 |
| GRAIN_KG_PER_PERSON_DAY ×2 | 영리.starv +6183; 총동원.starv +6181; 단순공세.starv +5802; 방어개간.starv +5717 | 15.5 |
| HA_PER_FARMER ×0.5 | 단순공세.starv +5317; 총동원.starv +5245; 영리.starv +4817; 총동원.pop -15612 | 13.3 |
| SEED_KG_PER_HA ×2 | 총동원.starv +5141; 영리.starv +4802; 단순공세.starv +4642; 방어개간.starv +3263 | 12.9 |
| GRAIN_KG_PER_PERSON_DAY ×0.5 | 총동원.starv -1004 | 2.5 |
| YIELD_KG_PER_HA ×2 | 총동원.starv -1004 | 2.5 |
| SEED_KG_PER_HA ×0.5 | 총동원.starv -1004 | 2.5 |
| HA_PER_FARMER ×2 | 총동원.starv -922 | 2.3 |
| HARVEST_DAY 210일 | 총동원.area -0.03 | 1.0 |
| STORAGE_LOSS_PER_YEAR ×0.5 | **없음 (변화 없음)** | 0.0 |
| STORAGE_LOSS_PER_YEAR ×2 | **없음 (변화 없음)** | 0.0 |
| SOWING_DAY 30일 | **없음 (변화 없음)** | 0.0 |
| SOWING_DAY 90일 | **없음 (변화 없음)** | 0.0 |
| HARVEST_DAY 269일 | **없음 (변화 없음)** | 0.0 |

## 인구

| 변형 | 눈에 띄게 달라진 것 (정책.지표 변화량) | 영향 점수 |
|---|---|---|
| BIRTHS_PER_1000_YEAR ×2 | 총동원.pop +5013; 영리.pop +4920; 방어개간.pop +3221; 방어.pop +3067 | 3.3 |
| STARVATION_DEATH_RATE_AT_FULL_DEFICIT ×2 | 총동원.starv +930 | 2.3 |
| DEATHS_PER_1000_YEAR ×2 | 영리.pop -3472; 총동원.pop -3340; 단순공세.pop -3177; 방어개간.pop -2786 | 2.3 |
| DEATHS_PER_1000_YEAR ×0.5 | 총동원.pop +2311; 영리.pop +2023; 단순공세.pop +1987 | 1.5 |
| BIRTHS_PER_1000_YEAR ×0.5 | 영리.pop -1965; 방어개간.pop -1509 | 1.3 |
| STARVATION_DEATH_RATE_AT_FULL_DEFICIT ×0.5 | 총동원.starv -490 | 1.2 |
| BIRTH_SUPPRESSION_PER_DEFICIT ×0.5 | **없음 (변화 없음)** | 0.0 |
| BIRTH_SUPPRESSION_PER_DEFICIT ×2 | **없음 (변화 없음)** | 0.0 |

## 기후

| 변형 | 눈에 띄게 달라진 것 (정책.지표 변화량) | 영향 점수 |
|---|---|---|
| WEATHER_SIGMA ×2 | 총동원.starv +1228; 단순공세.starv +626 | 3.1 |
| WEATHER_SIGMA ×0.5 | **없음 (변화 없음)** | 0.0 |
| WEATHER_MIN 0.2 | **없음 (변화 없음)** | 0.0 |
| WEATHER_MIN 0.7 | **없음 (변화 없음)** | 0.0 |
| WEATHER_MAX 1.1 | **없음 (변화 없음)** | 0.0 |
| WEATHER_MAX 1.6 | **없음 (변화 없음)** | 0.0 |

## 개간

| 변형 | 눈에 띄게 달라진 것 (정책.지표 변화량) | 영향 점수 |
|---|---|---|
| CLEARING_LABOR_DAYS_PER_HA ×0.5 | **없음 (변화 없음)** | 0.0 |
| CLEARING_LABOR_DAYS_PER_HA ×2 | **없음 (변화 없음)** | 0.0 |
| SOIL_OF_CLEARED_LAND ×0.5 | **없음 (변화 없음)** | 0.0 |
| SOIL_OF_CLEARED_LAND ×2 | **없음 (변화 없음)** | 0.0 |

## 전쟁

| 변형 | 눈에 띄게 달라진 것 (정책.지표 변화량) | 영향 점수 |
|---|---|---|
| MAX_LEVY_SHARE_OF_FARMERS ×0.5 | 총동원.area -0.19; 총동원.pop -6881; 총동원.starv -841 | 6.2 |
| SUPPLY_FALLOFF_UNITS ×0.5 | 방어.pop +8195; 방어개간.pop +8183; 방어.area +0.14; 방어개간.area +0.14 | 5.5 |
| UNIT_KM ×2 | 단순공세.pop +5777; 단순공세.area +0.11; 방어.pop +4944; 방어개간.pop +4901 | 3.9 |
| CASUALTY_RATE_PER_DAY ×2 | 단순공세.pop -5505; 단순공세.result -1.00; 단순공세.area -0.09; 총동원.pop -3555 | 3.7 |
| LEVY_TRAINING_DAYS ×2 | 방어개간.pop -5141; 방어.pop -5133; 영리.area -0.10; 영리.pop -4722 | 3.4 |
| SUPPLY_FALLOFF_UNITS ×2 | 영리.pop -4720; 영리.area -0.09; 방어.pop -4668; 방어개간.pop -4596 | 3.1 |
| V_MAX_KM_PER_DAY ×0.5 | 단순공세.pop +4332; 단순공세.area +0.08; 방치.pop +3734; 방치.area +0.07 | 2.9 |
| UNIT_KM ×0.5 | 단순공세.pop -3904; 단순공세.area -0.07; 방어개간.pop -3024; 방어.pop -3022 | 2.6 |
| PRESSURE_SCALE_PER_KM ×2 | 방치.pop +3399; 단순공세.pop +3058; 방치.area +0.06; 단순공세.area +0.06 | 2.3 |
| CASUALTY_RATE_PER_DAY ×0.5 | 단순공세.pop +3212; 총동원.pop +2494; 단순공세.area +0.04; 방어개간.pop +1737 | 2.1 |
| SUPPLY_MIN ×2 | 방어개간.pop -3062; 방어.pop -3016; 방어개간.area -0.06; 방어.area -0.05 | 2.0 |
| LEVY_TRAINING_DAYS ×0.5 | 방어개간.pop +2951; 방어.pop +2882; 방어개간.area +0.05; 방어.area +0.05 | 2.0 |
| FOCUS_REF_UNITS ×2 | 방치.pop +2742; 방치.area +0.05 | 1.8 |
| FOCUS_REF_UNITS ×0.5 | 단순공세.pop +2506; 단순공세.area +0.05 | 1.7 |
| V_MAX_KM_PER_DAY ×2 | 단순공세.pop -2439; 단순공세.area -0.04; 방어.pop -1818; 방어개간.pop -1773 | 1.6 |
| LUCK_SPREAD ×0.5 | 총동원.pop +2326; 총동원.area +0.04 | 1.6 |
| LUCK_SPREAD ×2 | 총동원.pop -1959; 총동원.area -0.04 | 1.3 |
| PRESSURE_SCALE_PER_KM ×0.5 | 단순공세.pop -1914; 단순공세.area -0.03 | 1.3 |
| V_RETREAT_UNITS ×0.5 | **없음 (변화 없음)** | 0.0 |
| V_RETREAT_UNITS ×2 | **없음 (변화 없음)** | 0.0 |
| FOCUS_MAX_BONUS ×0.5 | **없음 (변화 없음)** | 0.0 |
| FOCUS_MAX_BONUS ×2 | **없음 (변화 없음)** | 0.0 |
| MAX_LEVY_SHARE_OF_FARMERS ×2 | **없음 (변화 없음)** | 0.0 |
| SUPPLY_MIN ×0.5 | **없음 (변화 없음)** | 0.0 |

## 적 AI

| 변형 | 눈에 띄게 달라진 것 (정책.지표 변화량) | 영향 점수 |
|---|---|---|
| 병력 따라가기 0.5배 | 단순공세.pop +15787; 단순공세.area +0.27; 단순공세.turns -16; 총동원.pop +6487 | 10.5 |
| 적 방어 집중 제거 | 방치.turns +12; 단순공세.pop +6983; 단순공세.turns -8.67; 단순공세.area +0.12 | 5.8 |
| AI_PUSH_DEPTH_UNITS ×2 | 방치.pop +7826; 방치.area +0.13; 방어개간.pop +2832; 방어.pop +2822 | 5.2 |
| 수확 턴 따라가기 1.05배(수확 약점 제거) | 총동원.pop -7610; 총동원.area -0.13; 단순공세.pop -4782; 단순공세.area -0.09 | 5.1 |
| 병력 따라가기 1.5배 | 단순공세.pop -7196; 단순공세.area -0.13; 방어개간.pop -4377; 방어.pop -3995 | 4.8 |
| 수확 턴 기본 징집 6% | 단순공세.pop -6439; 단순공세.area -0.12; 방치.turns -3.83; 방어.area +0.05 | 4.3 |
| 수확 턴 따라가기 0.2배 | 영리.pop -5450; 영리.area -0.10; 단순공세.pop +2550; 단순공세.area +0.04 | 3.6 |
| 기본 징집 10% | 단순공세.turns -7.17; 단순공세.result -1.00; 단순공세.pop -4352; 단순공세.area -0.08 | 3.6 |
| 공격성 1.0 | 방치.pop +5214; 방치.area +0.09 | 3.5 |
| 기본 징집 2.5% | 방치.turns +5.50; 방어개간.pop +3651; 방어.pop +3640; 단순공세.pop +2899 | 2.8 |
| 공격성 0.3 | 단순공세.pop +2650; 단순공세.area +0.05 | 1.8 |
| 공세 시작일 270 | 방치.stagnant +0.17 | 1.1 |
| AI_PUSH_DEPTH_UNITS ×0.5 | 단순공세.pop +1625; 단순공세.area +0.03 | 1.1 |
| AI_MAX_LEVY_SHARE_PER_TURN ×0.5 | **없음 (변화 없음)** | 0.0 |
| AI_MAX_LEVY_SHARE_PER_TURN ×2 | **없음 (변화 없음)** | 0.0 |
| 공세 시작일 0 | **없음 (변화 없음)** | 0.0 |
| 수확 턴 기본 징집 0% | **없음 (변화 없음)** | 0.0 |

## 시작

| 변형 | 눈에 띄게 달라진 것 (정책.지표 변화량) | 영향 점수 |
|---|---|---|
| 시작 곡창 ×0.5 | 총동원.starv +1372; 방어.starv +1248; 영리.starv +1244; 방치.starv +1224 | 3.4 |
| 시작 병력 2,000 | 방치.turns +5.50; 단순공세.pop +2431; 단순공세.area +0.04 | 2.8 |
| 시작 곡창 ×2 | 총동원.starv -973 | 2.4 |
| 시작 병력 500 | 방치.pop +3477; 방치.area +0.06; 방치.turns -3.00; 단순공세.pop -1646 | 2.3 |
| 경작지 ×0.7 (양쪽) | 총동원.starv +506; 영리.pop -1778 | 1.3 |
| 경작지 ×1.3 (양쪽) | **없음 (변화 없음)** | 0.0 |

## 제거

| 변형 | 눈에 띄게 달라진 것 (정책.지표 변화량) | 영향 점수 |
|---|---|---|
| 장인·상인 제거(8,000→0) | 총동원.pop -8870; 영리.pop -4880; 방어.pop -3881; 방어개간.pop -3873 | 5.9 |
| 보급 배율 제거(SUPPLY_MIN=1) | 영리.turns -9.17; 영리.result -1.00; 방어개간.pop -3843; 방치.pop -3830 | 4.6 |
| 전황 변수 제거(LUCK_SPREAD=0) | 방치.pop +3958; 방치.area +0.07; 총동원.pop +3023; 총동원.area +0.06 | 2.6 |
| 기아 사망 제거(비율 0) | 총동원.starv -1004 | 2.5 |
| 지배층 제거(3,000→0) | 총동원.starv -963; 영리.pop -1693 | 2.4 |
| 지배층을 농민으로(일손 +3,000) | 총동원.starv -941 | 2.4 |
| 장인·상인을 농민으로(일손 +8,000) | 총동원.starv -923 | 2.3 |
| 훈련 기간 제거(0일) | 단순공세.pop -3196; 단순공세.area -0.06; 총동원.area +0.05; 방어.area +0.03 | 2.1 |
| 집중 제거(FOCUS_MAX_BONUS=0) | 단순공세.pop +1953; 단순공세.area +0.04 | 1.3 |
| 기상 변동 제거(WEATHER_SIGMA=0) | **없음 (변화 없음)** | 0.0 |
| 자발적 후퇴 제거 | **없음 (변화 없음)** | 0.0 |
| 마을 점 제거(보고만 영향) | **없음 (변화 없음)** | 0.0 |
| 굶는 군대 약화 제거 | (실행 실패) | — |

## 변화 없는 변형 목록 (빈껍데기 후보, 단 사용한 정책이 그 기능을 안 썼을 수 있음)

- STORAGE_LOSS_PER_YEAR ×0.5
- STORAGE_LOSS_PER_YEAR ×2
- SOWING_DAY 30일
- SOWING_DAY 90일
- HARVEST_DAY 269일
- BIRTH_SUPPRESSION_PER_DEFICIT ×0.5
- BIRTH_SUPPRESSION_PER_DEFICIT ×2
- WEATHER_SIGMA ×0.5
- WEATHER_MIN 0.2
- WEATHER_MIN 0.7
- WEATHER_MAX 1.1
- WEATHER_MAX 1.6
- CLEARING_LABOR_DAYS_PER_HA ×0.5
- CLEARING_LABOR_DAYS_PER_HA ×2
- SOIL_OF_CLEARED_LAND ×0.5
- SOIL_OF_CLEARED_LAND ×2
- V_RETREAT_UNITS ×0.5
- V_RETREAT_UNITS ×2
- FOCUS_MAX_BONUS ×0.5
- FOCUS_MAX_BONUS ×2
- MAX_LEVY_SHARE_OF_FARMERS ×2
- SUPPLY_MIN ×0.5
- AI_MAX_LEVY_SHARE_PER_TURN ×0.5
- AI_MAX_LEVY_SHARE_PER_TURN ×2
- 공세 시작일 0
- 수확 턴 기본 징집 0%
- 경작지 ×1.3 (양쪽)
- 기상 변동 제거(WEATHER_SIGMA=0)
- 자발적 후퇴 제거
- 마을 점 제거(보고만 영향)

## 짝(2×2) 상호작용

| 짝 | 정책.지표 | 주효과 A | 주효과 B | 상호작용 | 판정 |
|---|---|---|---|---|---|
| SUPPLY_FALLOFF_UNITS × FOCUS_MAX_BONUS | (문턱을 넘는 상호작용 없음) | | | | 독립적 |
| LEVY_TRAINING_DAYS × AI_MAX_LEVY_SHARE_PER_TURN | (문턱을 넘는 상호작용 없음) | | | | 독립적 |
| CASUALTY_RATE_PER_DAY × V_MAX_KM_PER_DAY | 방치.pop | -1897.45 | -2081.91 | -2819.82 | **상호작용이 주효과보다 큼 (한쪽 역할이 다른 쪽에 좌우됨)** |
| CASUALTY_RATE_PER_DAY × V_MAX_KM_PER_DAY | 방치.area | -0.02 | -0.04 | -0.05 | **상호작용이 주효과보다 큼 (한쪽 역할이 다른 쪽에 좌우됨)** |
| CASUALTY_RATE_PER_DAY × V_MAX_KM_PER_DAY | 단순공세.turns | -4.08 | -2.75 | -2.75 | 상호작용 큼 |
| HA_PER_FARMER × MAX_LEVY_SHARE_OF_FARMERS | (문턱을 넘는 상호작용 없음) | | | | 독립적 |
| PRESSURE_SCALE_PER_KM × LUCK_SPREAD | (문턱을 넘는 상호작용 없음) | | | | 독립적 |
| GRAIN_KG_PER_PERSON_DAY × YIELD_KG_PER_HA | 방어개간.starv | 5939.38 | -4727.58 | -4727.58 | 상호작용 큼 |
| GRAIN_KG_PER_PERSON_DAY × YIELD_KG_PER_HA | 방어.starv | 5815.35 | -4573.61 | -4573.61 | 상호작용 큼 |
| GRAIN_KG_PER_PERSON_DAY × YIELD_KG_PER_HA | 영리.starv | 5386.47 | -4366.76 | -4137.09 | 상호작용 큼 |
| GRAIN_KG_PER_PERSON_DAY × YIELD_KG_PER_HA | 총동원.starv | 5006.00 | -5916.05 | -3631.55 | 상호작용 큼 |

## 분산 효과 (평균 비교로는 못 잡는 변수)

정책별 시드 6개 결과의 표준편차를 기준선과 비교한다. 비율 > 1이면 결과가 더 흔들린다. 같은 설정에서 시드만 바꾼 기준선(BASE2)과의 비율이 잡음 수준이다.

잡음 수준(BASE2/BASE): ×0.41

| 변형 | 결과 흔들림 비율 |
|---|---|
| 장인·상인 제거(8,000→0) | ×0.28 |
| YIELD_KG_PER_HA ×0.5 | ×2.98 |
| 기아 사망 제거(비율 0) | ×0.34 |
| SEED_KG_PER_HA ×0.5 | ×0.35 |
| GRAIN_KG_PER_PERSON_DAY ×0.5 | ×0.36 |
| YIELD_KG_PER_HA ×2 | ×0.36 |
| GRAIN_KG_PER_PERSON_DAY ×2 | ×2.75 |
| 지배층 제거(3,000→0) | ×0.39 |
| 시작 곡창 ×2 | ×0.40 |
| 기상 변동 제거(WEATHER_SIGMA=0) | ×0.41 |
| WEATHER_SIGMA ×0.5 | ×0.41 |
| AI_PUSH_DEPTH_UNITS ×0.5 | ×0.55 |
| WEATHER_SIGMA ×2 | ×1.64 |
| HA_PER_FARMER ×0.5 | ×1.63 |

## 레버 직접 비교: 방어 vs 방어+개간 (기준선)

- area: 방어 0.28 → 방어+개간 0.28 (차이 0.00)
- pop: 방어 16453.52 → 방어+개간 16445.07 (차이 -8.44)
- starv: 방어 78.91 → 방어+개간 115.87 (차이 36.96)
- result: 방어 0.00 → 방어+개간 0.00 (차이 0.00)
- harvestT: 방어 2901.12 → 방어+개간 2750.84 (차이 -150.28)
