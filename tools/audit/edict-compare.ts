/**
 * 법령 비교: 플레이어가 처음부터 시행 중인 법령 조합별로 정책 6개를 돌려 표로 낸다.
 * 어떤 조합이 다른 조합을 모든 정책에서 압도하면 법령의 선택이 가짜라는 뜻이다.
 * 사용: npx tsx tools/audit/edict-compare.ts [시드 수=6] [턴 수=24]  (적 AI는 고정 규칙: AI_MODE=search로 바꿀 수 있다)
 */
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const nSeeds = process.argv[2] ?? "6";
const turns = process.argv[3] ?? "24";
const aiMode = process.env.AI_MODE ?? "scripted";
const dir = join(process.cwd(), ".audit-work", `edict-compare-${aiMode}`);
rmSync(dir, { recursive: true, force: true });
mkdirSync(join(dir, "sim"), { recursive: true });
mkdirSync(join(dir, "data"), { recursive: true });
for (const f of readdirSync("src/sim")) if (f.endsWith(".ts") && !f.endsWith(".test.ts")) cpSync(join("src/sim", f), join(dir, "sim", f));
for (const f of readdirSync("src/data")) cpSync(join("src/data", f), join(dir, "data", f));

type Res = Record<string, Record<string, number[]>>;
const configs: [string, string][] = [
  ["없음", ""],
  ["둔전", "fields"],
  ["상비군", "standing"],
  ["병참", "logistics"],
  ["둔전+상비군", "fields,standing"],
  ["둔전+병참", "fields,logistics"],
  ["상비군+병참", "standing,logistics"],
];
/** ONLY=없음,둔전,... 로 비교할 조합을 줄일 수 있다 (탐색형 AI는 느리므로 조정할 때 유용) */
const only = (process.env.ONLY ?? "").split(",").filter(Boolean);
const active = only.length ? configs.filter(([n]) => only.includes(n)) : configs;
const run = (edicts: string) =>
  new Promise<Res>((res, rej) => {
    const p = spawn("npx", ["tsx", "tools/audit/run-variant.ts", dir, "1", nSeeds, turns], { env: { ...process.env, AI_MODE: aiMode, PLAYER_EDICTS: edicts } });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (c) => (c === 0 ? res(JSON.parse(out)) : rej(new Error(err))));
  });
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

(async () => {
  const results: Res[] = [];
  for (let i = 0; i < active.length; i += 4) results.push(...(await Promise.all(active.slice(i, i + 4).map(([, e]) => run(e)))));
  const pols = Object.keys(results[0]!);
  console.log(`적 AI: ${aiMode}, 시드 ${nSeeds}개, ${turns}턴\n`);
  console.log(`| 정책 | ${active.map(([n]) => n).join(" | ")} |`);
  console.log(`|---|${active.map(() => "---").join("|")}|`);
  for (const p of pols) {
    const cells = results.map((r) => {
      const x = r[p]!;
      const w = x.result!.filter((v) => v === 1).length, l = x.result!.filter((v) => v === -1).length;
      return `승${w}/패${l} ${(mean(x.area!) * 100).toFixed(0)}% 기아${mean(x.starv!).toFixed(0)}`;
    });
    console.log(`| ${p} | ${cells.join(" | ")} |`);
  }
})();
