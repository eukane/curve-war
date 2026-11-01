## 잡음 확인: 기준선(시드 1~6) vs 같은 설정 다른 시드(7~12)

시드 집합만 바꿔도 문턱을 넘는 지표: 총동원.area (0.64 vs 0.59), 총동원.pop (30697.77 vs 28792.52)
→ 이 지표들의 작은 변화는 잡음일 수 있다.

## 경제

| 변형 | 눈에 띄게 달라진 것 (정책.지표 변화량) | 영향 점수 |
|---|---|---|
| YIELD_KG_PER_HA ×0.5 | 영리.starv +9180; 총동원.starv +8218; 단순공세.starv +8048; 방어.starv +7984 | 22.9 |
| GRAIN_KG_PER_PERSON_DAY ×2 | 영리.starv +8398; 단순공세.starv +7978; 총동원.starv +7579; 방어개간.starv +6882 | 21.0 |
| HA_PER_FARMER ×0.5 | 총동원.starv +6772; 영리.starv +6715; 단순공세.starv +5654; 방어개간.starv +5314 | 16.9 |
| SEED_KG_PER_HA ×2 | 영리.starv +5768; 총동원.starv +5478; 단순공세.starv +4612; 방어개간.starv +3981 | 14.4 |
| GRAIN_KG_PER_PERSON_DAY ×0.5 | 총동원.starv -1844 | 4.6 |
| YIELD_KG_PER_HA ×2 | 총동원.starv -1844 | 4.6 |
| HA_PER_FARMER ×2 | 총동원.starv -1740 | 4.3 |
| SEED_KG_PER_HA ×0.5 | 총동원.starv -1441 | 3.6 |
| HARVEST_DAY 210일 | 총동원.starv +512 | 1.3 |
| STORAGE_LOSS_PER_YEAR ×0.5 | **없음 (변화 없음)** | 0.0 |
| STORAGE_LOSS_PER_YEAR ×2 | **없음 (변화 없음)** | 0.0 |
| SOWING_DAY 30일 | **없음 (변화 없음)** | 0.0 |
| SOWING_DAY 90일 | **없음 (변화 없음)** | 0.0 |
| HARVEST_DAY 269일 | **없음 (변화 없음)** | 0.0 |

## 인구

| 변형 | 눈에 띄게 달라진 것 (정책.지표 변화량) | 영향 점수 |
|---|---|---|
| STARVATION_DEATH_RATE_AT_FULL_DEFICIT ×2 | 총동원.starv +1922; 총동원.pop -1949 | 4.8 |
| BIRTHS_PER_1000_YEAR ×2 | 영리.pop +7017; 방어.pop +6356; 방어개간.pop +6246; 단순공세.pop +5285 | 4.7 |
| DEATHS_PER_1000_YEAR ×2 | 총동원.pop -5471; 영리.pop -5413; 방어개간.pop -5254; 방어.pop -5203 | 3.6 |
| DEATHS_PER_1000_YEAR ×0.5 | 총동원.pop +3620; 영리.pop +3082; 방어.pop +2970; 방어개간.pop +2964 | 2.4 |
| BIRTHS_PER_1000_YEAR ×0.5 | 영리.pop -3414; 단순공세.pop -3101; 방어개간.pop -2897; 방어.pop -2844 | 2.3 |
| STARVATION_DEATH_RATE_AT_FULL_DEFICIT ×0.5 | 총동원.starv -894 | 2.2 |
| BIRTH_SUPPRESSION_PER_DEFICIT ×0.5 | **없음 (변화 없음)** | 0.0 |
| BIRTH_SUPPRESSION_PER_DEFICIT ×2 | **없음 (변화 없음)** | 0.0 |

## 기후

| 변형 | 눈에 띄게 달라진 것 (정책.지표 변화량) | 영향 점수 |
|---|---|---|
| WEATHER_SIGMA ×2 | 단순공세.starv +902; 총동원.starv +752; 방어개간.starv +507 | 2.3 |
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
| MAX_LEVY_SHARE_OF_FARMERS ×2 | 총동원.starv +3776; 총동원.pop -12409; 총동원.area -0.15 | 9.4 |
| MAX_LEVY_SHARE_OF_FARMERS ×0.5 | 총동원.pop +10406; 총동원.starv -1479; 영리.pop +1535 | 6.9 |
| CASUALTY_RATE_PER_DAY ×2 | 단순공세.pop -7571; 단순공세.area -0.12; 방어개간.pop -2710; 방어.pop -2683 | 5.0 |
| SUPPLY_FALLOFF_UNITS ×2 | 단순공세.turns -8.50; 방어.pop -4957; 방어개간.pop -4939; 단순공세.result +1.00 | 4.3 |
| UNIT_KM ×2 | 방치.turns +7.67; 영리.stagnant +0.18 | 3.8 |
| SUPPLY_FALLOFF_UNITS ×0.5 | 총동원.area -0.11; 총동원.pop -5086; 방치.turns +3.00 | 3.7 |
| SUPPLY_MIN ×2 | 단순공세.turns -5.50; 총동원.pop +3726; 총동원.turns -4.00; 단순공세.result +0.67 | 2.8 |
| UNIT_KM ×0.5 | 방어개간.pop -3584; 방어.pop -3545; 방어개간.area -0.06; 방어.area -0.06 | 2.4 |
| V_MAX_KM_PER_DAY ×2 | 방어.pop -2780; 방어개간.pop -2588; 방어.area -0.05; 방어개간.area -0.04 | 1.9 |
| LEVY_TRAINING_DAYS ×2 | 방치.turns +3.50; 단순공세.pop +2529; 단순공세.area +0.05; 총동원.starv +623 | 1.8 |
| CASUALTY_RATE_PER_DAY ×0.5 | 총동원.pop +2465; 방치.turns +2.33 | 1.6 |
| PRESSURE_SCALE_PER_KM ×0.5 | 방어.pop -2448; 방어개간.pop -2194; 방어.area -0.04; 방어개간.area -0.04 | 1.6 |
| V_MAX_KM_PER_DAY ×0.5 | 방치.turns +2.83; 영리.pop +1673; 영리.area +0.03 | 1.4 |
| PRESSURE_SCALE_PER_KM ×2 | 영리.pop +2056; 영리.area +0.04 | 1.4 |
| LEVY_TRAINING_DAYS ×0.5 | 단순공세.pop -1637; 영리.pop -1544; 단순공세.area -0.03 | 1.1 |
| FOCUS_MAX_BONUS ×0.5 | 방치.pop +1533 | 1.0 |
| V_RETREAT_UNITS ×0.5 | **없음 (변화 없음)** | 0.0 |
| V_RETREAT_UNITS ×2 | **없음 (변화 없음)** | 0.0 |
| FOCUS_REF_UNITS ×0.5 | **없음 (변화 없음)** | 0.0 |
| FOCUS_REF_UNITS ×2 | **없음 (변화 없음)** | 0.0 |
| FOCUS_MAX_BONUS ×2 | **없음 (변화 없음)** | 0.0 |
| SUPPLY_MIN ×0.5 | **없음 (변화 없음)** | 0.0 |
| LUCK_SPREAD ×0.5 | **없음 (변화 없음)** | 0.0 |
| LUCK_SPREAD ×2 | **없음 (변화 없음)** | 0.0 |

## 적 AI

| 변형 | 눈에 띄게 달라진 것 (정책.지표 변화량) | 영향 점수 |
|---|---|---|
| 병력 따라가기 1.5배 | 영리.pop -15182; 방어개간.pop -12151; 방어.pop -12104; 영리.area -0.22 | 10.1 |
| 병력 따라가기 0.5배 | 단순공세.turns -19; 총동원.pop +12585; 단순공세.pop +7910; 총동원.starv -1582 | 9.4 |
| 적 방어 집중 제거 | 단순공세.turns -13; 방치.turns +11; 단순공세.result +1.00; 방어개간.pop -2716 | 6.7 |
| 수확 턴 따라가기 1.05배(수확 약점 제거) | 영리.pop -8508; 총동원.pop -5510; 단순공세.pop -4224; 단순공세.area -0.07 | 5.7 |
| 기본 징집 10% | 단순공세.pop -8418; 단순공세.area -0.15; 영리.pop -4774; 방어개간.pop -3696 | 5.6 |
| 기본 징집 2.5% | 방치.turns +9.50; 방치.pop -2106; 방치.area -0.03 | 4.8 |
| 수확 턴 기본 징집 6% | 단순공세.pop -4265; 단순공세.area -0.08; 영리.pop -3450; 방치.turns -4.17 | 2.8 |
| AI_PUSH_DEPTH_UNITS ×0.5 | 방어개간.pop -3667; 방어.pop -3535; 방어개간.area -0.06; 방어.area -0.06 | 2.4 |
| 수확 턴 따라가기 0.2배 | 총동원.starv -807; 단순공세.pop +2457; 영리.area -0.05; 영리.pop -2143 | 2.0 |
| 공격성 0.3 | 방어개간.pop -2985; 방어.pop -2851; 방어개간.area -0.05; 방어.area -0.05 | 2.0 |
| AI_PUSH_DEPTH_UNITS ×2 | 영리.pop +2566; 영리.area +0.05 | 1.7 |
| 공세 시작일 0 | 방치.pop -2062; 방치.area -0.03 | 1.4 |
| 수확 턴 기본 징집 0% | 방치.turns +2.33 | 1.2 |
| 공세 시작일 270 | 방치.stagnant +0.16 | 1.0 |
| AI_MAX_LEVY_SHARE_PER_TURN ×0.5 | **없음 (변화 없음)** | 0.0 |
| AI_MAX_LEVY_SHARE_PER_TURN ×2 | **없음 (변화 없음)** | 0.0 |
| 공격성 1.0 | **없음 (변화 없음)** | 0.0 |

## 시작

| 변형 | 눈에 띄게 달라진 것 (정책.지표 변화량) | 영향 점수 |
|---|---|---|
| 시작 병력 2,000 | 방치.turns +11; 방치.result +0.83; 영리.pop -2608 | 5.7 |
| 시작 곡창 ×2 | 총동원.starv -1477 | 3.7 |
| 경작지 ×0.7 (양쪽) | 영리.pop -5352; 영리.starv +1375; 총동원.starv +965; 총동원.pop -3606 | 3.6 |
| 시작 곡창 ×0.5 | 영리.starv +1346; 방어.starv +1272; 단순공세.starv +1269; 총동원.starv +1254 | 3.4 |
| 시작 병력 500 | 방치.turns -3.83; 방치.pop +1926; 방치.area +0.04 | 1.9 |
| 경작지 ×1.3 (양쪽) | **없음 (변화 없음)** | 0.0 |

## 제거

| 변형 | 눈에 띄게 달라진 것 (정책.지표 변화량) | 영향 점수 |
|---|---|---|
| 보급 배율 제거(SUPPLY_MIN=1) | 방어개간.pop -15854; 방어.pop -15757; 방어개간.area -0.28; 방어.area -0.28 | 10.6 |
| 장인·상인 제거(8,000→0) | 단순공세.pop -8013; 영리.pop -8002; 방어개간.pop -7609; 방어.pop -7574 | 5.3 |
| 기아 사망 제거(비율 0) | 총동원.starv -1844; 총동원.pop +1795 | 4.6 |
| 장인·상인을 농민으로(일손 +8,000) | 총동원.starv -1740 | 4.3 |
| 지배층을 농민으로(일손 +3,000) | 총동원.starv -1313 | 3.3 |
| 지배층 제거(3,000→0) | 총동원.starv -1300; 단순공세.pop -3014; 영리.pop -2840; 방어개간.pop -2656 | 3.2 |
| 훈련 기간 제거(0일) | 단순공세.pop -3426; 단순공세.area -0.06; 방어개간.pop -3058; 방어.pop -2999 | 2.3 |
| 집중 제거(FOCUS_MAX_BONUS=0) | 방어개간.pop -2394; 방어.pop -2336; 방어개간.area -0.04; 방어.area -0.04 | 1.6 |
| 굶는 군대 약화 제거 | 총동원.starv +525 | 1.3 |
| 전황 변수 제거(LUCK_SPREAD=0) | **없음 (변화 없음)** | 0.0 |
| 기상 변동 제거(WEATHER_SIGMA=0) | **없음 (변화 없음)** | 0.0 |
| 자발적 후퇴 제거 | **없음 (변화 없음)** | 0.0 |
| 마을 점 제거(보고만 영향) | **없음 (변화 없음)** | 0.0 |

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
- FOCUS_REF_UNITS ×0.5
- FOCUS_REF_UNITS ×2
- FOCUS_MAX_BONUS ×2
- SUPPLY_MIN ×0.5
- LUCK_SPREAD ×0.5
- LUCK_SPREAD ×2
- AI_MAX_LEVY_SHARE_PER_TURN ×0.5
- AI_MAX_LEVY_SHARE_PER_TURN ×2
- 공격성 1.0
- 경작지 ×1.3 (양쪽)
- 전황 변수 제거(LUCK_SPREAD=0)
- 기상 변동 제거(WEATHER_SIGMA=0)
- 자발적 후퇴 제거
- 마을 점 제거(보고만 영향)

## 짝(2×2) 상호작용

| 짝 | 정책.지표 | 주효과 A | 주효과 B | 상호작용 | 판정 |
|---|---|---|---|---|---|
| SUPPLY_FALLOFF_UNITS × FOCUS_MAX_BONUS | (문턱을 넘는 상호작용 없음) | | | | 독립적 |
| LEVY_TRAINING_DAYS × AI_MAX_LEVY_SHARE_PER_TURN | 총동원.starv | 411.57 | 342.15 | 598.28 | **상호작용이 주효과보다 큼 (한쪽 역할이 다른 쪽에 좌우됨)** |
| CASUALTY_RATE_PER_DAY × V_MAX_KM_PER_DAY | 단순공세.area | -0.11 | -0.09 | -0.06 | 상호작용 큼 |
| CASUALTY_RATE_PER_DAY × V_MAX_KM_PER_DAY | 방치.pop | -10.61 | -856.28 | -2523.60 | **상호작용이 주효과보다 큼 (한쪽 역할이 다른 쪽에 좌우됨)** |
| CASUALTY_RATE_PER_DAY × V_MAX_KM_PER_DAY | 방치.area | 0.01 | -0.02 | -0.04 | **상호작용이 주효과보다 큼 (한쪽 역할이 다른 쪽에 좌우됨)** |
| HA_PER_FARMER × MAX_LEVY_SHARE_OF_FARMERS | (문턱을 넘는 상호작용 없음) | | | | 독립적 |
| PRESSURE_SCALE_PER_KM × LUCK_SPREAD | (문턱을 넘는 상호작용 없음) | | | | 독립적 |
| GRAIN_KG_PER_PERSON_DAY × YIELD_KG_PER_HA | 방어개간.starv | 7086.93 | -5959.35 | -5855.73 | 상호작용 큼 |
| GRAIN_KG_PER_PERSON_DAY × YIELD_KG_PER_HA | 방어.starv | 7044.42 | -5802.06 | -5783.02 | 상호작용 큼 |
| GRAIN_KG_PER_PERSON_DAY × YIELD_KG_PER_HA | 단순공세.starv | 6797.25 | -6169.34 | -5547.04 | 상호작용 큼 |
| GRAIN_KG_PER_PERSON_DAY × YIELD_KG_PER_HA | 영리.starv | 6829.26 | -6335.18 | -5531.40 | 상호작용 큼 |

## 분산 효과 (평균 비교로는 못 잡는 변수)

정책별 시드 6개 결과의 표준편차를 기준선과 비교한다. 비율 > 1이면 결과가 더 흔들린다. 같은 설정에서 시드만 바꾼 기준선(BASE2)과의 비율이 잡음 수준이다.

잡음 수준(BASE2/BASE): ×0.78

| 변형 | 결과 흔들림 비율 |
|---|---|
| 장인·상인 제거(8,000→0) | ×0.21 |
| GRAIN_KG_PER_PERSON_DAY ×0.5 | ×0.24 |
| YIELD_KG_PER_HA ×2 | ×0.24 |
| SEED_KG_PER_HA ×0.5 | ×0.30 |
| 기상 변동 제거(WEATHER_SIGMA=0) | ×0.31 |
| 시작 곡창 ×2 | ×0.31 |
| 기아 사망 제거(비율 0) | ×0.33 |
| WEATHER_SIGMA ×0.5 | ×0.34 |
| 지배층 제거(3,000→0) | ×0.37 |
| 전황 변수 제거(LUCK_SPREAD=0) | ×0.39 |
| YIELD_KG_PER_HA ×0.5 | ×2.33 |
| WEATHER_SIGMA ×2 | ×2.28 |
| 병력 따라가기 0.5배 | ×0.47 |
| SEED_KG_PER_HA ×2 | ×1.95 |

## 레버 직접 비교: 방어 vs 방어+개간 (기준선)

- area: 방어 0.49 → 방어+개간 0.50 (차이 0.00)
- pop: 방어 28922.46 → 방어+개간 28957.48 (차이 35.02)
- starv: 방어 71.73 → 방어+개간 108.59 (차이 36.86)
- result: 방어 0.00 → 방어+개간 0.00 (차이 0.00)
- harvestT: 방어 5892.86 → 방어+개간 5693.00 (차이 -199.86)
