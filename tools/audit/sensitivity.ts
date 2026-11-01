/**
 * 동적 감사: 상수를 하나씩 바꿔(0.5배, 2배) 여러 정책 × 여러 시드로 돌려 보고,
 * 결과가 시드 잡음보다 크게 달라지는지 본다. 통째로 제거(ablation)와 짝(2×2) 검사도 한다.
 * 사용: npx tsx tools/audit/sensitivity.ts <작업 디렉터리> [병렬 수=4]
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const work = process.argv[2]!;
const par = Number(process.argv[3] ?? 4);
const SRC = join(process.cwd(), "src");

type Patch = { file: "constants" | "war" | "world" | "start-regions"; find: RegExp; replace: string | ((m: string, ...g: string[]) => string) };
interface Variant { id: string; group: string; label: string; patches: Patch[] }

/** 원본에서 시험 파일을 뺀 복제본을 만들고 패치를 적용한다 */
function build(v: Variant): string {
  const dir = join(work, "variants", v.id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "sim"), { recursive: true });
  mkdirSync(join(dir, "data"), { recursive: true });
  for (const f of readdirSync(join(SRC, "sim"))) if (f.endsWith(".ts") && !f.endsWith(".test.ts")) cpSync(join(SRC, "sim", f), join(dir, "sim", f));
  for (const f of readdirSync(join(SRC, "data"))) cpSync(join(SRC, "data", f), join(dir, "data", f));
  for (const p of v.patches) {
    const path = p.file === "start-regions" ? join(dir, "data", "start-regions.ts") : join(dir, "sim", `${p.file}.ts`);
    const t = readFileSync(path, "utf-8");
    if (!p.find.test(t)) throw new Error(`패치 대상 없음: ${v.id} ${p.file} ${p.find}`);
    writeFileSync(path, t.replace(p.find, p.replace as string));
  }
  return dir;
}

const scale = (name: string, f: number): Patch => ({ file: "constants", find: new RegExp(`(export const ${name} = )([^;]+);`), replace: (_m, a, b) => `${a}(${b}) * ${f};` });
const setConst = (name: string, v: number): Patch => ({ file: "constants", find: new RegExp(`(export const ${name} = )([^;]+);`), replace: (_m, a) => `${a}${v};` });

const variants: Variant[] = [];
const add = (id: string, group: string, label: string, patches: Patch[]) => variants.push({ id, group, label, patches });

const SCALED: [string, string][] = [
  ["경제", "GRAIN_KG_PER_PERSON_DAY"], ["경제", "YIELD_KG_PER_HA"], ["경제", "SEED_KG_PER_HA"], ["경제", "HA_PER_FARMER"], ["경제", "STORAGE_LOSS_PER_YEAR"],
  ["인구", "BIRTHS_PER_1000_YEAR"], ["인구", "DEATHS_PER_1000_YEAR"], ["인구", "STARVATION_DEATH_RATE_AT_FULL_DEFICIT"], ["인구", "BIRTH_SUPPRESSION_PER_DEFICIT"],
  ["기후", "WEATHER_SIGMA"], ["개간", "CLEARING_LABOR_DAYS_PER_HA"], ["개간", "SOIL_OF_CLEARED_LAND"],
  ["전쟁", "UNIT_KM"], ["전쟁", "V_MAX_KM_PER_DAY"], ["전쟁", "PRESSURE_SCALE_PER_KM"], ["전쟁", "V_RETREAT_UNITS"], ["전쟁", "FOCUS_REF_UNITS"], ["전쟁", "FOCUS_MAX_BONUS"],
  ["전쟁", "CASUALTY_RATE_PER_DAY"], ["전쟁", "MAX_LEVY_SHARE_OF_FARMERS"], ["전쟁", "SUPPLY_FALLOFF_UNITS"], ["전쟁", "SUPPLY_MIN"], ["전쟁", "LUCK_SPREAD"],
  ["전쟁", "LEVY_TRAINING_DAYS"], ["적 AI", "AI_MAX_LEVY_SHARE_PER_TURN"], ["적 AI", "AI_PUSH_DEPTH_UNITS"],
];
for (const [g, n] of SCALED) {
  add(`${n}_x0.5`, g, `${n} ×0.5`, [scale(n, 0.5)]);
  add(`${n}_x2`, g, `${n} ×2`, [scale(n, 2)]);
}
// 날짜와 범위 상수는 덧셈/직접 지정
add("SOWING_30", "경제", "SOWING_DAY 30일", [setConst("SOWING_DAY_OF_YEAR", 30)]);
add("SOWING_90", "경제", "SOWING_DAY 90일", [setConst("SOWING_DAY_OF_YEAR", 89)]);
add("HARVEST_210", "경제", "HARVEST_DAY 210일", [setConst("HARVEST_DAY_OF_YEAR", 210)]);
add("HARVEST_270", "경제", "HARVEST_DAY 269일", [setConst("HARVEST_DAY_OF_YEAR", 269)]);
add("WMIN_0.2", "기후", "WEATHER_MIN 0.2", [setConst("WEATHER_MIN", 0.2)]);
add("WMIN_0.7", "기후", "WEATHER_MIN 0.7", [setConst("WEATHER_MIN", 0.7)]);
add("WMAX_1.1", "기후", "WEATHER_MAX 1.1", [setConst("WEATHER_MAX", 1.1)]);
add("WMAX_1.6", "기후", "WEATHER_MAX 1.6", [setConst("WEATHER_MAX", 1.6)]);

// 적 AI 매개변수 (war.ts 안에 박혀 있는 값)
const ai = (id: string, label: string, find: RegExp, rep: string) => add(id, "적 AI", label, [{ file: "war", find, replace: rep }]);
ai("AI_aggr_0.3", "공격성 0.3", /aggression: 0\.6/, "aggression: 0.3");
ai("AI_aggr_1.0", "공격성 1.0", /aggression: 0\.6/, "aggression: 1.0");
ai("AI_start_0", "공세 시작일 0", /startDay: 90/, "startDay: 0");
ai("AI_start_270", "공세 시작일 270", /startDay: 90/, "startDay: 270");
ai("AI_levy_0.025", "기본 징집 2.5%", /levyShare: 0\.05/, "levyShare: 0.025");
ai("AI_levy_0.10", "기본 징집 10%", /levyShare: 0\.05/, "levyShare: 0.10");
ai("AI_harv_0", "수확 턴 기본 징집 0%", /harvestLevyShare: 0\.02/, "harvestLevyShare: 0");
ai("AI_harv_0.06", "수확 턴 기본 징집 6%", /harvestLevyShare: 0\.02/, "harvestLevyShare: 0.06");
ai("AI_mirror_0.5", "병력 따라가기 0.5배", /\(harvestTurn \? 0\.6 : 1\.05\)/, "(harvestTurn ? 0.6 : 0.5)");
ai("AI_mirror_1.5", "병력 따라가기 1.5배", /\(harvestTurn \? 0\.6 : 1\.05\)/, "(harvestTurn ? 0.6 : 1.5)");
ai("AI_mirrorH_0.2", "수확 턴 따라가기 0.2배", /\(harvestTurn \? 0\.6 : 1\.05\)/, "(harvestTurn ? 0.2 : 1.05)");
ai("AI_mirrorH_1.05", "수확 턴 따라가기 1.05배(수확 약점 제거)", /\(harvestTurn \? 0\.6 : 1\.05\)/, "(harvestTurn ? 1.05 : 1.05)");
ai("AI_nodefense", "적 방어 집중 제거", /Math\.min\(AI_PUSH_DEPTH_UNITS, Math\.max\(0, war\.orders\.player\[i\]! - xi\)\)/, "0");

// 시작 데이터와 통째로 제거(ablation)
const data = (id: string, group: string, label: string, find: RegExp, rep: string) => add(id, group, label, [{ file: "start-regions", find, replace: rep }]);
data("S_soldier_500", "시작", "시작 병력 500", /stratum: "soldier", pop: 1_000/, 'stratum: "soldier", pop: 500');
data("S_soldier_2000", "시작", "시작 병력 2,000", /stratum: "soldier", pop: 1_000/, 'stratum: "soldier", pop: 2_000');
// 주의: START_REGIONS(경제 시험용)가 같은 값을 먼저 갖고 있으므로 반드시 sideRegion 안쪽만 패치한다
const SIDE = (field: string) => new RegExp(`(const sideRegion[\\s\\S]*?${field}: )([0-9_]+)`);
const sideData = (id: string, group: string, label: string, field: string, val: string) =>
  add(id, group, label, [{ file: "start-regions", find: SIDE(field), replace: (_m, a) => `${a}${val}` }]);
sideData("S_granary_x0.5", "시작", "시작 곡창 ×0.5", "granaryKg", "2_100_000");
sideData("S_granary_x2", "시작", "시작 곡창 ×2", "granaryKg", "8_400_000");
sideData("S_arable_x0.7", "시작", "경작지 ×0.7 (양쪽)", "arableHa", "8_820");
sideData("S_arable_x1.3", "시작", "경작지 ×1.3 (양쪽)", "arableHa", "16_380");
data("ABL_artisan_0", "제거", "장인·상인 제거(8,000→0)", /stratum: "artisan", pop: 8_000/, 'stratum: "artisan", pop: 0');
data("ABL_artisan_farm", "제거", "장인·상인을 농민으로(일손 +8,000)", /\{ stratum: "farmer", pop: 18_000 \},\n    \{ stratum: "artisan", pop: 8_000 \}/, '{ stratum: "farmer", pop: 26_000 },\n    { stratum: "artisan", pop: 0 }');
add("ABL_elite_0", "제거", "지배층 제거(3,000→0)", [{ file: "start-regions", find: /(const sideRegion[\s\S]*?stratum: "elite", pop: )3_000/, replace: (_m, a) => `${a}0` }]);
data("ABL_elite_farm", "제거", "지배층을 농민으로(일손 +3,000)", /\{ stratum: "farmer", pop: 18_000 \},\n    \{ stratum: "artisan", pop: 8_000 \},\n    \{ stratum: "elite", pop: 3_000 \}/, '{ stratum: "farmer", pop: 21_000 },\n    { stratum: "artisan", pop: 8_000 },\n    { stratum: "elite", pop: 0 }');
add("ABL_luck_0", "제거", "전황 변수 제거(LUCK_SPREAD=0)", [setConst("LUCK_SPREAD", 0)]);
add("ABL_training_0", "제거", "훈련 기간 제거(0일)", [setConst("LEVY_TRAINING_DAYS", 0)]);
add("ABL_supply_off", "제거", "보급 배율 제거(SUPPLY_MIN=1)", [setConst("SUPPLY_MIN", 1)]);
add("ABL_focus_off", "제거", "집중 제거(FOCUS_MAX_BONUS=0)", [setConst("FOCUS_MAX_BONUS", 0)]);
add("ABL_weather_off", "제거", "기상 변동 제거(WEATHER_SIGMA=0)", [setConst("WEATHER_SIGMA", 0)]);
add("ABL_starve_off", "제거", "기아 사망 제거(비율 0)", [setConst("STARVATION_DEATH_RATE_AT_FULL_DEFICIT", 0)]);
add("ABL_hunger_army_off", "제거", "굶는 군대 약화 제거", [{ file: "war", find: /readySoldiers\(r, day\) \* \(1 - Math\.min\(1, Math\.max\(0, r\.lastDeficit\)\)\) \* luck/, replace: "readySoldiers(r, day) * luck" }]);
add("ABL_retreat_off", "제거", "자발적 후퇴 제거", [{ file: "war", find: /if \(oP < x - 0\.5\) move = Math\.min\(move, -Math\.min\(V_RETREAT_UNITS, x - oP\)\);/, replace: "" }]);
add("ABL_villages", "제거", "마을 점 제거(보고만 영향)", [{ file: "war", find: /villagesDelta: playerVillageCount\(war\.front\) - ms\.playerVillages,/, replace: "villagesDelta: 0," }]);

// 짝(2×2) 검사: 0.5/2 네 모서리
const PAIRS: [string, string][] = [
  ["SUPPLY_FALLOFF_UNITS", "FOCUS_MAX_BONUS"],
  ["LEVY_TRAINING_DAYS", "AI_MAX_LEVY_SHARE_PER_TURN"],
  ["CASUALTY_RATE_PER_DAY", "V_MAX_KM_PER_DAY"],
  ["HA_PER_FARMER", "MAX_LEVY_SHARE_OF_FARMERS"],
  ["PRESSURE_SCALE_PER_KM", "LUCK_SPREAD"],
  ["GRAIN_KG_PER_PERSON_DAY", "YIELD_KG_PER_HA"],
];
for (const [a, b] of PAIRS) for (const fa of [0.5, 2]) for (const fb of [0.5, 2]) add(`P_${a}_${fa}__${b}_${fb}`, "짝", `${a}×${fa} · ${b}×${fb}`, [scale(a, fa), scale(b, fb)]);

/* 실행 */
function run(dir: string, seed0 = 1): Promise<Record<string, Record<string, number[]>>> {
  return new Promise((res, rej) => {
    const p = spawn("npx", ["tsx", "tools/audit/run-variant.ts", dir, String(seed0), "6", "24"], { cwd: process.cwd() });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (c) => (c === 0 ? res(JSON.parse(out)) : rej(new Error(err))));
  });
}

async function main() {
  mkdirSync(work, { recursive: true });
  const only = process.argv[4] ? process.argv[4].split(",") : null;
  let results: Record<string, Record<string, Record<string, number[]>>> = {};
  if (only && existsSync(join(work, "results.json"))) results = JSON.parse(readFileSync(join(work, "results.json"), "utf-8")).results;
  if (only) {
    const todo = variants.filter((v) => only.includes(v.id));
    let k = 0;
    const w2 = async () => {
      while (k < todo.length) {
        const v = todo[k++]!;
        results[v.id] = await run(build(v), 1);
      }
    };
    await Promise.all(Array.from({ length: par }, w2));
    writeFileSync(join(work, "results.json"), JSON.stringify({ variants, results }));
    console.error("재실행 완료");
    return;
  }
  // 기준선: 시드 1~6, 그리고 잡음 확인용으로 시드 7~12
  const baseDir = join(work, "variants", "BASE");
  build({ id: "BASE", group: "기준", label: "기준", patches: [] });
  const [b1, b2] = await Promise.all([run(baseDir, 1), run(baseDir, 7)]);
  results["BASE"] = b1;
  results["BASE2"] = b2;
  let i = 0, done = 0;
  const worker = async () => {
    while (i < variants.length) {
      const v = variants[i++]!;
      try {
        const dir = build(v);
        results[v.id] = await run(dir, 1);
      } catch (e) {
        console.error("실패", v.id, String(e).slice(0, 200));
      }
      done++;
      if (done % 10 === 0) console.error(`${done}/${variants.length}`);
    }
  };
  await Promise.all(Array.from({ length: par }, worker));
  writeFileSync(join(work, "results.json"), JSON.stringify({ variants, results }));
  console.error("완료");
}
main();
