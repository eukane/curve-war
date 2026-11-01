/**
 * 감사 결과 분석: results.json을 읽어 상수별 영향, 빈껍데기 후보, 짝 상호작용을 표로 낸다.
 * 사용: npx tsx tools/audit/analyze.ts <작업 디렉터리>
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { variants, results } = JSON.parse(readFileSync(join(process.argv[2]!, "results.json"), "utf-8")) as {
  variants: { id: string; group: string; label: string }[];
  results: Record<string, Record<string, Record<string, number[]>>>;
};

/** 이만큼 이상 달라져야 "눈에 띄는 변화"로 본다 (지표별 문턱) */
const TH: Record<string, number> = { result: 0.34, area: 0.03, starv: 400, pop: 1500, turns: 2, stagnant: 0.15 };
const METRICS = Object.keys(TH);
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1));
};

interface Hit { policy: string; metric: string; diff: number; z: number; score: number }
function compare(base: Record<string, Record<string, number[]>>, v: Record<string, Record<string, number[]>>): Hit[] {
  const hits: Hit[] = [];
  for (const policy of Object.keys(base)) {
    for (const metric of METRICS) {
      const b = base[policy]![metric]!, x = v[policy]?.[metric];
      if (!x) continue;
      const d = x.map((val, i) => val - b[i]!);
      const diff = mean(d);
      const z = sd(d) > 1e-12 ? diff / (sd(d) / Math.sqrt(d.length)) : diff === 0 ? 0 : Infinity * Math.sign(diff);
      const score = Math.abs(diff) / TH[metric]!;
      if (score >= 1 && Math.abs(z) >= 2) hits.push({ policy, metric, diff, z, score });
    }
  }
  return hits.sort((a, b) => b.score - a.score);
}
const BASE = results["BASE"]!;
const f = (h: Hit) => `${h.policy}.${h.metric} ${h.diff > 0 ? "+" : ""}${Math.abs(h.diff) < 10 ? h.diff.toFixed(2) : h.diff.toFixed(0)}`;

console.log("## 잡음 확인: 기준선(시드 1~6) vs 같은 설정 다른 시드(7~12)\n");
const noise = (() => {
  const out: string[] = [];
  for (const policy of Object.keys(BASE)) for (const metric of METRICS) {
    const a = mean(BASE[policy]![metric]!), b = mean(results["BASE2"]![policy]![metric]!);
    if (Math.abs(a - b) >= TH[metric]!) out.push(`${policy}.${metric} (${a.toFixed(2)} vs ${b.toFixed(2)})`);
  }
  return out;
})();
console.log(noise.length ? `시드 집합만 바꿔도 문턱을 넘는 지표: ${noise.join(", ")}\n→ 이 지표들의 작은 변화는 잡음일 수 있다.` : "시드 집합을 바꿔도 문턱을 넘는 지표 없음.");

const byGroup = new Map<string, typeof variants>();
for (const v of variants) {
  if (v.group === "짝") continue;
  if (!byGroup.has(v.group)) byGroup.set(v.group, []);
  byGroup.get(v.group)!.push(v);
}

const inert: string[] = [];
for (const [g, vs] of byGroup) {
  console.log(`\n## ${g}\n`);
  console.log("| 변형 | 눈에 띄게 달라진 것 (정책.지표 변화량) | 영향 점수 |");
  console.log("|---|---|---|");
  const rows = vs.map((v) => {
    const r = results[v.id];
    if (!r) return { v, hits: [] as Hit[], max: -1, missing: true };
    const hits = compare(BASE, r);
    return { v, hits, max: hits.length ? hits[0]!.score : 0, missing: false };
  });
  rows.sort((a, b) => b.max - a.max);
  for (const row of rows) {
    if (row.missing) {
      console.log(`| ${row.v.label} | (실행 실패) | — |`);
      continue;
    }
    const txt = row.hits.length ? row.hits.slice(0, 4).map(f).join("; ") : "**없음 (변화 없음)**";
    console.log(`| ${row.v.label} | ${txt} | ${row.max.toFixed(1)} |`);
    if (!row.hits.length) inert.push(row.v.label);
  }
}

console.log("\n## 변화 없는 변형 목록 (빈껍데기 후보, 단 사용한 정책이 그 기능을 안 썼을 수 있음)\n");
console.log(inert.length ? inert.map((x) => `- ${x}`).join("\n") : "없음");

/* 짝 상호작용 */
console.log("\n## 짝(2×2) 상호작용\n");
console.log("| 짝 | 정책.지표 | 주효과 A | 주효과 B | 상호작용 | 판정 |");
console.log("|---|---|---|---|---|---|");
const pairIds = [...new Set(variants.filter((v) => v.group === "짝").map((v) => v.id.replace(/^P_/, "").split("__")[0]!.replace(/_[0-9.]+$/, "") + "|" + v.id.replace(/^P_/, "").split("__")[1]!.replace(/_[0-9.]+$/, "")))];
for (const key of pairIds) {
  const [a, b] = key.split("|") as [string, string];
  const get = (fa: number, fb: number) => results[`P_${a}_${fa}__${b}_${fb}`];
  const [ll, lh, hl, hh] = [get(0.5, 0.5), get(0.5, 2), get(2, 0.5), get(2, 2)];
  if (!ll || !lh || !hl || !hh) continue;
  const lines: { s: number; txt: string }[] = [];
  for (const policy of Object.keys(BASE)) for (const metric of METRICS) {
    const y = (r: typeof ll) => mean(r[policy]![metric]!);
    const A = (y(hl) + y(hh) - y(ll) - y(lh)) / 2;
    const B = (y(lh) + y(hh) - y(ll) - y(hl)) / 2;
    const I = (y(hh) - y(hl) - y(lh) + y(ll)) / 2;
    const th = TH[metric]!;
    if (Math.abs(I) < th) continue;
    const ratio = Math.abs(I) / (Math.max(Math.abs(A), Math.abs(B)) + 1e-9);
    const verdict = ratio > 1 ? "**상호작용이 주효과보다 큼 (한쪽 역할이 다른 쪽에 좌우됨)**" : ratio > 0.5 ? "상호작용 큼" : "미미";
    if (ratio > 0.5) lines.push({ s: Math.abs(I) / th, txt: `| ${a} × ${b} | ${policy}.${metric} | ${A.toFixed(2)} | ${B.toFixed(2)} | ${I.toFixed(2)} | ${verdict} |` });
  }
  lines.sort((x, y) => y.s - x.s);
  if (lines.length === 0) console.log(`| ${a} × ${b} | (문턱을 넘는 상호작용 없음) | | | | 독립적 |`);
  for (const l of lines.slice(0, 4)) console.log(l.txt);
}

/* 분산 효과: 평균은 안 바꾸고 흔들림(시드별 결과의 퍼짐)만 바꾸는 변수를 잡는다 */
console.log("\n## 분산 효과 (평균 비교로는 못 잡는 변수)\n");
console.log("정책별 시드 6개 결과의 표준편차를 기준선과 비교한다. 비율 > 1이면 결과가 더 흔들린다. 같은 설정에서 시드만 바꾼 기준선(BASE2)과의 비율이 잡음 수준이다.\n");
const VM = ["area", "pop", "starv", "result"];
function sdRatio(v: Record<string, Record<string, number[]>>): number {
  const logs: number[] = [];
  for (const policy of Object.keys(BASE)) for (const m of VM) {
    const sb = sd(BASE[policy]![m]!), sv = v[policy]?.[m] ? sd(v[policy]![m]!) : NaN;
    const floor = m === "area" ? 0.01 : m === "pop" ? 300 : m === "starv" ? 50 : 0.15;
    if (!Number.isFinite(sv) || (sb < floor && sv < floor)) continue;
    logs.push(Math.log((sv + floor * 0.2) / (sb + floor * 0.2)));
  }
  return logs.length ? Math.exp(mean(logs)) : 1;
}
console.log(`잡음 수준(BASE2/BASE): ×${sdRatio(results["BASE2"]!).toFixed(2)}\n`);
console.log("| 변형 | 결과 흔들림 비율 |");
console.log("|---|---|");
const varRows = variants
  .filter((v) => v.group !== "짝" && results[v.id])
  .map((v) => ({ v, r: sdRatio(results[v.id]!) }))
  .sort((a, b) => Math.abs(Math.log(b.r)) - Math.abs(Math.log(a.r)));
for (const row of varRows.slice(0, 14)) console.log(`| ${row.v.label} | ×${row.r.toFixed(2)} |`);

/* 레버 직접 비교: 개간 사업을 곁들이는 것이 결과를 바꾸는가 */
console.log("\n## 레버 직접 비교: 방어 vs 방어+개간 (기준선)\n");
for (const m of ["area", "pop", "starv", "result", "harvestT"]) {
  const a = BASE["방어"]![m]!, b = BASE["방어개간"]![m]!;
  console.log(`- ${m}: 방어 ${mean(a).toFixed(2)} → 방어+개간 ${mean(b).toFixed(2)} (차이 ${(mean(b) - mean(a)).toFixed(2)})`);
}
