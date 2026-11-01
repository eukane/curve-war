/**
 * 감사용 실행기: 주어진 소스 디렉터리(원본이거나 상수를 바꾼 복제본)를 불러와
 * 여러 정책 × 여러 시드로 전쟁을 돌리고 결과 지표를 JSON으로 출력한다.
 * 사용: npx tsx tools/audit/run-variant.ts <소스 디렉터리> [시드 시작=1] [시드 개수=6] [턴 수=24]
 */
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const dir = process.argv[2]!;
const seed0 = Number(process.argv[3] ?? 1);
const nSeeds = Number(process.argv[4] ?? 6);
const maxTurns = Number(process.argv[5] ?? 24);

const load = (p: string) => import(pathToFileURL(join(dir, p)).href);

async function main() {
  const [world, war, data, cal] = await Promise.all([load("sim/world.ts"), load("sim/war.ts"), load("data/start-regions.ts"), load("sim/calendar.ts")]);
  const { createWorld, step, levy, disband, setOrder, startClearing, totalPop } = world;
  const { soldiersOf, readySoldiers, playerAreaHa, totalAreaHa } = war;
  const { dateOf } = cal;

  type W = ReturnType<typeof createWorld>;
  const P = (w: W) => w.regions[0]!;
  const R = (w: W) => w.regions[1]!;

  /** 점 끌기 규칙: 적이 몰아붙이는 곳에 맞서 병력을 몰고(mirror), 조건이 맞으면 중앙을 친다 */
  const orders = (w: W, mirror: number, strike: boolean, depth: number) => {
    const f = w.war.front, oR = w.war.orders.rival;
    for (let i = 0; i < f.length; i++) {
      const g = Math.exp(-(((i - 8) / 2.2) ** 2));
      setOrder(w, i, f[i] + Math.max(Math.max(0, f[i] - oR[i]) * mirror, strike ? depth * g : 0));
    }
  };
  const matchTroops = (w: W, ratio: number, autumnRatio: number) => {
    const rs = soldiersOf(R(w)), ps = soldiersOf(P(w));
    const want = Math.round(rs * (dateOf(w.day).season === "가을" ? autumnRatio : ratio));
    if (want > ps) levy(w, 1, want - ps);
    else if (want < ps) disband(w, 1, ps - want);
  };

  const policies: Record<string, (w: W, t: number) => void> = {
    방치: () => {},
    방어: (w) => {
      matchTroops(w, 1.1, 0.8);
      orders(w, 1.0, false, 0);
    },
    영리: (w) => {
      matchTroops(w, 1.3, 0.9);
      orders(w, 1.0, readySoldiers(P(w), w.day) > 1.2 * soldiersOf(R(w)), 120);
    },
    총동원: (w) => {
      matchTroops(w, 1.8, 0.9);
      orders(w, 1.0, readySoldiers(P(w), w.day) > 1.1 * soldiersOf(R(w)), 80);
    },
    단순공세: (w, t) => {
      if (t === 0) levy(w, 1, 3000);
      if (t >= 1) orders(w, 0, true, 150);
    },
    방어개간: (w, t) => {
      if (t === 0) startClearing(w, 1, 1500, 1500);
      matchTroops(w, 1.1, 0.8);
      orders(w, 1.0, false, 0);
    },
  };

  const out: Record<string, Record<string, number[]>> = {};
  for (const [name, pol] of Object.entries(policies)) {
    const m: Record<string, number[]> = { result: [], turns: [], area: [], starv: [], pop: [], soldiers: [], rivalSoldiers: [], stagnant: [], harvestT: [] };
    for (let s = 0; s < nSeeds; s++) {
      const w = createWorld(seed0 + s, data.WAR_REGIONS, { war: { playerRegionId: 1, rivalRegionId: 2 } });
      let t = 0, stag = 0, last = playerAreaHa(w.war.front) / totalAreaHa();
      for (; t < maxTurns && !w.war.result; t++) {
        pol(w, t);
        step(w, 90);
        const a = playerAreaHa(w.war.front) / totalAreaHa();
        if (Math.abs(a - last) < 0.003) stag++;
        last = a;
      }
      m.result.push(w.war.result === "win" ? 1 : w.war.result === "loss" ? -1 : 0);
      m.turns.push(t);
      m.area.push(playerAreaHa(w.war.front) / totalAreaHa());
      m.starv.push(P(w).starvationDeathsTotal);
      m.pop.push(totalPop(P(w)));
      m.soldiers.push(soldiersOf(P(w)));
      m.rivalSoldiers.push(soldiersOf(R(w)));
      m.stagnant.push(t > 0 ? stag / t : 0);
      m.harvestT.push(P(w).lastHarvest ? P(w).lastHarvest.value / 1000 : 0);
    }
    out[name] = m;
  }
  process.stdout.write(JSON.stringify(out));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
