/**
 * 적 AI 비교: 고정 규칙 AI와 탐색형 AI(세 성향)를 같은 정책 6개로 돌려 표로 낸다.
 * 사용: npx tsx tools/audit/ai-compare.ts [시드 수=6] [턴 수=24]   (탐색형은 느리다: 기본값에서 약 4분, 병렬)
 */
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const nSeeds = process.argv[2] ?? "6";
const turns = process.argv[3] ?? "24";
const dir = join(process.cwd(), ".audit-work", "ai-compare");
rmSync(dir, { recursive: true, force: true });
mkdirSync(join(dir, "sim"), { recursive: true });
mkdirSync(join(dir, "data"), { recursive: true });
for (const f of readdirSync("src/sim")) if (f.endsWith(".ts") && !f.endsWith(".test.ts")) cpSync(join("src/sim", f), join(dir, "sim", f));
for (const f of readdirSync("src/data")) cpSync(join("src/data", f), join(dir, "data", f));

type Res = Record<string, Record<string, number[]>>;
const configs: [string, Record<string, string>][] = [
  ["고정 규칙", { AI_MODE: "scripted" }],
  ["탐색형·정복형", { AI_MODE: "search", AI_PROFILE: "aggressor" }],
  ["탐색형·신중형", { AI_MODE: "search", AI_PROFILE: "cautious" }],
  ["탐색형·기회주의형", { AI_MODE: "search", AI_PROFILE: "opportunist" }],
];
const run = (env: Record<string, string>) =>
  new Promise<Res>((res, rej) => {
    const p = spawn("npx", ["tsx", "tools/audit/run-variant.ts", dir, "1", nSeeds, turns], { env: { ...process.env, ...env } });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (c) => (c === 0 ? res(JSON.parse(out)) : rej(new Error(err))));
  });
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

Promise.all(configs.map(([, env]) => run(env))).then((results) => {
  const pols = Object.keys(results[0]!);
  console.log(`| 정책 | ${configs.map(([n]) => n).join(" | ")} |`);
  console.log(`|---|${configs.map(() => "---").join("|")}|`);
  for (const p of pols) {
    const cells = results.map((r) => {
      const x = r[p]!;
      const w = x.result!.filter((v) => v === 1).length, l = x.result!.filter((v) => v === -1).length;
      return `승${w}/패${l} · ${mean(x.turns!).toFixed(0)}턴 · 영토${(mean(x.area!) * 100).toFixed(0)}% · 기아${mean(x.starv!).toFixed(0)} · 정체${(mean(x.stagnant!) * 100).toFixed(0)}%`;
    });
    console.log(`| ${p} | ${cells.join(" | ")} |`);
  }
});
