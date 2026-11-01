/**
 * 건설 비교: 플레이어의 건설 정책(없음/요새/도로/둘 다)별로 정책 6개를 돌려 표로 낸다.
 * 사용: npx tsx tools/audit/build-compare.ts [시드 수=6] [턴 수=24]  (AI_MODE로 적 AI 변경)
 */
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const nSeeds = process.argv[2] ?? "6";
const turns = process.argv[3] ?? "24";
const aiMode = process.env.AI_MODE ?? "scripted";
const dir = join(process.cwd(), ".audit-work", `build-compare-${aiMode}`);
rmSync(dir, { recursive: true, force: true });
mkdirSync(join(dir, "sim"), { recursive: true });
mkdirSync(join(dir, "data"), { recursive: true });
for (const f of readdirSync("src/sim")) if (f.endsWith(".ts") && !f.endsWith(".test.ts")) cpSync(join("src/sim", f), join(dir, "sim", f));
for (const f of readdirSync("src/data")) cpSync(join("src/data", f), join(dir, "data", f));

type Res = Record<string, Record<string, number[]>>;
const configs: [string, string][] = [["없음", ""], ["요새", "fort"], ["도로", "road"], ["요새+도로", "fort,road"]];
const run = (build: string) =>
  new Promise<Res>((res, rej) => {
    const p = spawn("npx", ["tsx", "tools/audit/run-variant.ts", dir, "1", nSeeds, turns], { env: { ...process.env, AI_MODE: aiMode, BUILD: build } });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (c) => (c === 0 ? res(JSON.parse(out)) : rej(new Error(err))));
  });
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
(async () => {
  const results = await Promise.all(configs.map(([, b]) => run(b)));
  console.log(`적 AI: ${aiMode}, 시드 ${nSeeds}개, ${turns}턴\n`);
  console.log(`| 정책 | ${configs.map(([n]) => n).join(" | ")} |`);
  console.log(`|---|${configs.map(() => "---").join("|")}|`);
  for (const p of Object.keys(results[0]!)) {
    const cells = results.map((r) => {
      const x = r[p]!;
      const w = x.result!.filter((v) => v === 1).length, l = x.result!.filter((v) => v === -1).length;
      return `승${w}/패${l} ${(mean(x.area!) * 100).toFixed(0)}% 기아${mean(x.starv!).toFixed(0)}`;
    });
    console.log(`| ${p} | ${cells.join(" | ")} |`);
  }
})();
