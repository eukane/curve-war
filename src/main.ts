import { START_REGIONS } from "./data/start-regions";
import { dateOf } from "./sim/calendar";
import type { Explained } from "./sim/explain";
import { GRAIN_KG_PER_PERSON_DAY } from "./sim/constants";
import { createWorld, popOf, step, totalPop } from "./sim/world";

const world = createWorld(20260101, START_REGIONS);
const region = world.regions[0]!;

/** 속도: 초당 진행 일수. 0이면 일시정지 */
let speed = 0;
const SPEEDS: [string, number][] = [["일시정지", 0], ["×1 (1일/초)", 1], ["×10", 10], ["×30 (1달/초)", 30], ["×180", 180]];

const $ = (id: string) => document.getElementById(id)!;
const fmt = (v: number, d = 0) => v.toLocaleString("ko-KR", { maximumFractionDigits: d, minimumFractionDigits: d });

function explainedTable(e: Explained | null | undefined): string {
  if (!e) return `<span class="mu">아직 기록이 없습니다.</span>`;
  const rows = e.terms
    .map((t) => `<tr><td>${t.label}</td><td class="n">${fmt(t.value, t.value < 10 ? 2 : 0)} ${t.unit}</td><td class="mu">${t.note ?? ""}</td></tr>`)
    .join("");
  return `<p><b>${e.label}: ${fmt(e.value / (e.unit === "kg" ? 1000 : 1), e.unit === "kg" ? 0 : 1)} ${e.unit === "kg" ? "t" : e.unit}</b><br><code>${e.formula}</code></p><table>${rows}</table>`;
}

function render() {
  const d = dateOf(world.day);
  $("date").textContent = `${d.year + 1}년 ${d.month}월 ${d.dayOfMonth}일 (${d.season}) — ${region.name}`;
  const need = totalPop(region) * GRAIN_KG_PER_PERSON_DAY;
  $("summary").innerHTML = `<table>
    <tr><td>인구</td><td class="n">${fmt(totalPop(region))} 명</td><td class="mu">농민 ${fmt(popOf(region, "farmer"))} · 장인·상인 ${fmt(popOf(region, "artisan"))} · 지배층 ${fmt(popOf(region, "elite"))}</td></tr>
    <tr><td>곡창 재고</td><td class="n">${fmt(region.granaryKg / 1000)} t</td><td class="mu">하루 소비 약 ${fmt(need / 1000, 1)} t → 남은 ${fmt(region.granaryKg / need, 0)}일치</td></tr>
    <tr><td>지난달 식량 부족률</td><td class="n">${fmt(region.lastDeficit * 100, 1)} %</td><td class="mu">필요량 대비 못 먹은 비율</td></tr>
  </table>`;
  $("harvest").innerHTML = explainedTable(region.lastHarvest);
  const dm = region.lastDemography;
  $("demog").innerHTML = dm ? explainedTable(dm.births) + explainedTable(dm.deaths) : `<span class="mu">첫 달이 끝나면 표시됩니다.</span>`;
}

function buildControls() {
  const c = $("controls");
  SPEEDS.forEach(([label, v]) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.setAttribute("aria-pressed", String(v === speed));
    b.addEventListener("click", () => {
      speed = v;
      c.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    });
    c.appendChild(b);
  });
}

let last = performance.now();
let acc = 0;
function frame(now: number) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (speed > 0) {
    acc += dt * speed;
    const days = Math.floor(acc);
    if (days > 0) {
      acc -= days;
      step(world, days);
    }
  }
  render();
  requestAnimationFrame(frame);
}

buildControls();
requestAnimationFrame(frame);
