## 상수 읽는 곳 지도

| 상수 | 시뮬레이션이 읽음 | 화면이 읽음 | 시험·고정물만 | 분류 |
|---|---|---|---|---|
| `GRAIN_KG_PER_PERSON_DAY` | sim/state.ts, sim/world.ts | — | sim/world.test.ts | 역할 있음 |
| `YIELD_KG_PER_HA` | sim/world.ts | — | sim/world.test.ts | 역할 있음 |
| `SEED_KG_PER_HA` | sim/world.ts | ui/timers.ts | sim/fixtures/rejected-events.ts, sim/world.test.ts | 역할 있음 |
| `HA_PER_FARMER` | sim/world.ts | main.ts, ui/advisor.ts, ui/economy-panel.ts, ui/timers.ts | sim/fixtures/rejected-events.ts, sim/world.test.ts | 역할 있음 |
| `STORAGE_LOSS_PER_YEAR` | constants.ts(파생) | — | — | 파생 상수의 재료 |
| `STORAGE_LOSS_PER_DAY` | sim/world.ts | — | — | 역할 있음 |
| `HARVEST_DAY_OF_YEAR` | sim/war.ts, sim/world.ts | main.ts, ui/advisor.ts, ui/timers.ts | sim/fixtures/rejected-events.ts, sim/war.test.ts, sim/world.test.ts | 역할 있음 |
| `BIRTHS_PER_1000_YEAR` | sim/world.ts | — | — | 역할 있음 |
| `DEATHS_PER_1000_YEAR` | sim/world.ts | — | — | 역할 있음 |
| `STARVATION_DEATH_RATE_AT_FULL_DEFICIT` | sim/world.ts | — | — | 역할 있음 |
| `BIRTH_SUPPRESSION_PER_DEFICIT` | sim/world.ts | — | — | 역할 있음 |
| `WEATHER_SIGMA` | sim/world.ts | — | — | 역할 있음 |
| `WEATHER_MIN` | sim/world.ts | — | — | 역할 있음 |
| `WEATHER_MAX` | sim/world.ts | — | — | 역할 있음 |
| `SOWING_DAY_OF_YEAR` | sim/war.ts, sim/world.ts | main.ts, ui/advisor.ts, ui/timers.ts | sim/world.test.ts | 역할 있음 |
| `CLEARING_LABOR_DAYS_PER_HA` | sim/world.ts | — | sim/world.test.ts | 역할 있음 |
| `SOIL_OF_CLEARED_LAND` | sim/world.ts | — | sim/world.test.ts | 역할 있음 |
| `BAD_WEATHER` | sim/world.ts | — | sim/world.test.ts | 역할 있음 |
| `MAP_W` | sim/war.ts, sim/world.ts | ui/map.ts | sim/war.test.ts | 역할 있음 |
| `MAP_H` | sim/war.ts | ui/map.ts | sim/war.test.ts | 역할 있음 |
| `UNIT_KM` | constants.ts(파생), sim/war.ts | main.ts, ui/advisor.ts, ui/map.ts | sim/war.test.ts | 역할 있음 |
| `HA_PER_UNIT2` | sim/war.ts | — | sim/war.test.ts | 역할 있음 |
| `FRONT_POINTS` | sim/war.ts | — | sim/war.test.ts | 역할 있음 |
| `V_MAX_KM_PER_DAY` | sim/war.ts | — | — | 역할 있음 |
| `PRESSURE_SCALE_PER_KM` | sim/war.ts | — | — | 역할 있음 |
| `V_RETREAT_UNITS` | sim/war.ts | — | — | 역할 있음 |
| `FOCUS_REF_UNITS` | sim/war.ts | — | — | 역할 있음 |
| `FOCUS_MAX_BONUS` | sim/war.ts | — | — | 역할 있음 |
| `CASUALTY_RATE_PER_DAY` | sim/war.ts | — | sim/war.test.ts | 역할 있음 |
| `MAX_LEVY_SHARE_OF_FARMERS` | sim/war.ts | — | — | 역할 있음 |
| `LUCK_SPREAD` | sim/war.ts | — | — | 역할 있음 |
| `SUPPLY_FALLOFF_UNITS` | sim/war.ts | — | — | 역할 있음 |
| `SUPPLY_MIN` | sim/war.ts | — | — | 역할 있음 |
| `LEVY_TRAINING_DAYS` | sim/war.ts, sim/world.ts | — | — | 역할 있음 |
| `AI_MAX_LEVY_SHARE_PER_TURN` | sim/war.ts | — | — | 역할 있음 |
| `AI_PUSH_DEPTH_UNITS` | sim/war.ts | — | — | 역할 있음 |

## 주요 값을 읽는 곳

| 대상 | 시뮬레이션 규칙(비시험·비화면) | 화면 | 시험·고정물 |
|---|---|---|---|
| 계층 "artisan"(장인·상인) | data/start-regions.ts, sim/state.ts | ui/economy-panel.ts | sim/world.test.ts |
| 계층 "elite"(지배층) | data/start-regions.ts, sim/state.ts | ui/economy-panel.ts | sim/world.test.ts |
| VILLAGES(마을 점) | sim/state.ts, sim/war.ts | main.ts, ui/map.ts | sim/war.test.ts |
| soil(지력) | sim/war.ts, sim/world.ts | — | sim/world.test.ts |
| clearableHa(개간 가능 토지) | data/start-regions.ts, sim/state.ts, sim/war.ts, sim/world.ts | — | sim/war.test.ts, sim/world.test.ts |
| lastDeficitBy / starvationDeathsBy | — | — | — |
| monthNeedKg/monthEatenKg | sim/state.ts, sim/world.ts | — | — |
| decisions(결정 기록) | sim/world.ts | — | sim/world.test.ts |
| firedKeys | sim/state.ts, sim/world.ts | — | — |
| EVENTS(출시 이벤트 배열) | sim/events.ts, sim/world.ts | main.ts | sim/world.test.ts |
| scenario bad(흉년 시나리오) | sim/constants.ts, sim/state.ts, sim/world.ts | main.ts, ui/economy-panel.ts | sim/world.test.ts |
| sectorName | sim/war.ts | main.ts, ui/advisor.ts | — |
