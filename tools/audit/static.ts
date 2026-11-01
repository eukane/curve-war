/**
 * 정적 감사: "읽는 곳 지도". 상수와 주요 상태 값을 누가 읽는지 센다.
 * 아무도 안 읽거나 화면에만 쓰이는 값은 빈껍데기 후보다.
 * 사용: npx tsx tools/audit/static.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
function walk(d: string, out: string[] = []): string[] {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}
const files = walk(join(root, "src"));
const kind = (p: string) => (p.endsWith(".test.ts") ? "test" : p.includes("/fixtures/") ? "fixture" : p.includes("/ui/") || p.endsWith("/main.ts") ? "ui" : "sim");
const text = new Map(files.map((p) => [p, readFileSync(p, "utf-8")]));

const constText = text.get(join(root, "src/sim/constants.ts"))!;
const names = [...constText.matchAll(/export const ([A-Z0-9_]+) =/g)].map((m) => m[1]!);

interface Row { name: string; sim: string[]; ui: string[]; fixture: string[]; test: string[] }
const rows: Row[] = names.map((name) => {
  const re = new RegExp(`\\b${name}\\b`);
  const r: Row = { name, sim: [], ui: [], fixture: [], test: [] };
  for (const [p, t] of text) {
    if (p.endsWith("sim/constants.ts")) {
      // 같은 파일 안에서 다른 상수가 읽는 경우는 파생 상수로 센다
      const others = t.split("\n").filter((l) => !l.includes(`export const ${name} =`) && re.test(l) && !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*"));
      if (others.length) r.sim.push("constants.ts(파생)");
      continue;
    }
    if (re.test(t)) r[kind(p) as "sim" | "ui" | "fixture" | "test"].push(relative(root, p).replace("src/", ""));
  }
  return r;
});

const fmt = (a: string[]) => (a.length ? a.join(", ") : "—");
console.log("## 상수 읽는 곳 지도\n");
console.log("| 상수 | 시뮬레이션이 읽음 | 화면이 읽음 | 시험·고정물만 | 분류 |");
console.log("|---|---|---|---|---|");
for (const r of rows) {
  let cls = "역할 있음";
  if (r.sim.length === 0 && r.ui.length === 0) cls = r.fixture.length ? "**고정물에서만 쓰임 (폐기 이벤트용)**" : r.test.length ? "**시험에서만 쓰임**" : "**아무도 안 읽음**";
  else if (r.sim.length === 0) cls = "**화면 전용**";
  else if (r.sim.every((s) => s.includes("파생"))) cls = "파생 상수의 재료";
  console.log(`| \`${r.name}\` | ${fmt(r.sim)} | ${fmt(r.ui)} | ${fmt([...r.fixture, ...r.test].map((x) => x))} | ${cls} |`);
}

/* 주요 상태 값 / 계층 */
const probes: [string, RegExp][] = [
  ['계층 "artisan"(장인·상인)', /"artisan"/],
  ['계층 "elite"(지배층)', /"elite"/],
  ["VILLAGES(마을 점)", /VILLAGES|villagesDelta|playerVillageCount/],
  ["soil(지력)", /\.soil\b/],
  ["clearableHa(개간 가능 토지)", /clearableHa/],
  ["lastDeficitBy / starvationDeathsBy", /lastDeficitBy|starvationDeathsBy/],
  ["monthNeedKg/monthEatenKg", /monthNeedKg|monthEatenKg/],
  ["decisions(결정 기록)", /\.decisions\b/],
  ["firedKeys", /firedKeys/],
  ["EVENTS(출시 이벤트 배열)", /\bEVENTS\b/],
  ["scenario bad(흉년 시나리오)", /BAD_WEATHER|"bad"/],
  ["sectorName", /sectorName/],
];
console.log("\n## 주요 값을 읽는 곳\n");
console.log("| 대상 | 시뮬레이션 규칙(비시험·비화면) | 화면 | 시험·고정물 |");
console.log("|---|---|---|---|");
for (const [label, re] of probes) {
  const sim = new Set<string>(), ui = new Set<string>(), tst = new Set<string>();
  for (const [p, t] of text) {
    if (!re.test(t)) continue;
    const k = kind(p);
    (k === "sim" ? sim : k === "ui" ? ui : tst).add(relative(root, p).replace("src/", ""));
  }
  console.log(`| ${label} | ${fmt([...sim])} | ${fmt([...ui])} | ${fmt([...tst])} |`);
}
