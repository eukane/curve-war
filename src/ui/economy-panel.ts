import { dateOf } from "../sim/calendar";
import { HA_PER_FARMER } from "../sim/constants";
import type { Explained } from "../sim/explain";
import { carryingCapacity, dailyNeedKg, fieldFarmersAt, popOf, totalPop } from "../sim/world";
import type { World } from "../sim/world";

let world: World;
let REGION_ID = 1;
let onChange: () => void = () => {};
const region = () => world.regions.find((r) => r.id === REGION_ID)!;

/** 경제 상세 패널을 초기화한다. */
export function initEconomyPanel(w: World, regionId: number, changed: () => void): void {
  world = w;
  REGION_ID = regionId;
  onChange = changed;
}

export const $ = (id: string) => document.getElementById(id)!;
export const fmt = (v: number, d = 0) => v.toLocaleString("ko-KR", { maximumFractionDigits: d, minimumFractionDigits: d });
export const tons = (kg: number) => `${fmt(kg / 1000)}t`;
export const dateText = (day: number) => {
  const d = dateOf(day);
  return `${d.year + 1}년 ${d.month}월 ${d.dayOfMonth}일 (${d.season})`;
};
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/* ------------------------------------------------------------------ */
/* "왜 이 값인가" 표                                                    */
/* ------------------------------------------------------------------ */
function explainedTable(e: Explained | null | undefined): string {
  if (!e) return `<span class="mu">아직 기록이 없습니다.</span>`;
  const rows = e.terms
    .map((t) => {
      const val = t.unit === "" ? "" : `${fmt(t.value, Math.abs(t.value) < 10 ? 2 : 0)} ${t.unit}`;
      return `<tr><td>${esc(t.label)}</td><td class="n mono">${val}</td><td class="mu">${esc(t.note ?? "")}</td></tr>`;
    })
    .join("");
  const head = e.unit === "kg" ? `${fmt(e.value / 1000)} t` : `${fmt(e.value, e.unit === "ha" ? 0 : 1)} ${e.unit}`;
  return `<p style="margin:0 0 6px"><b>${esc(e.label)}: ${head}</b><br><code>${esc(e.formula)}</code></p><table><tbody>${rows}</tbody></table>`;
}

/* ------------------------------------------------------------------ */
/* 요약                                                                */
/* ------------------------------------------------------------------ */
export function renderSummary() {
  const r = region();
  const need = dailyNeedKg(r);
  const k = carryingCapacity(r);
  const pop = totalPop(r);
  const fillPct = Math.min(100, (pop / k) * 100);
  const stockDays = r.granaryKg / need;
  const fieldFarmers = fieldFarmersAt(r, world.day);
  const needField = r.arableHa / HA_PER_FARMER;
  $("eco-date").textContent = `${dateText(world.day)} — ${r.name}`;
  $("summary").innerHTML = `<table><tbody>
    <tr><td>인구</td><td class="n mono">${fmt(pop)} 명</td>
      <td class="mu">농민 ${fmt(popOf(r, "farmer"))} · 장인·상인 ${fmt(popOf(r, "artisan"))} · 지배층 ${fmt(popOf(r, "elite"))}</td></tr>
    <tr><td>수용력</td><td class="n mono">${fmt(k)} 명</td>
      <td><div class="meter" role="img" aria-label="인구는 수용력의 ${fmt(fillPct)}%"><i style="width:${fillPct}%"></i></div>
        <span class="mu">인구는 수용력의 ${fmt(fillPct)}% (경작지 ${fmt(r.arableHa)}ha 기준, 평년, 일손은 충분하다고 가정)</span></td></tr>
    <tr><td>곡창 재고</td><td class="n mono">${tons(r.granaryKg)}</td>
      <td class="mu">하루 소비 약 ${fmt(need / 1000, 1)}t → ${fmt(stockDays)}일치 · 종자 ${tons(r.seedKg)} 별도</td></tr>
    <tr><td>일손</td><td class="n mono">${fmt(fieldFarmers)} 명</td>
      <td class="mu">들에 나갈 농민. 필요한 일손은 경작지 ${fmt(r.arableHa)}ha ÷ ${HA_PER_FARMER} = ${fmt(needField)}명${
        fieldFarmers < needField ? ` <span class="warn">— ${fmt(needField - fieldFarmers)}명 부족</span>` : ` <span class="good">— ${fmt(Math.max(0, fieldFarmers - needField))}명 여유</span>`
      }</td></tr>
    <tr><td>지난달 식량 부족률</td><td class="n mono ${r.lastDeficit > 0.01 ? "bad" : ""}">${fmt(r.lastDeficit * 100, 1)} %</td>
      <td class="mu">필요량 대비 못 먹은 비율 · 누적 기아·질병 사망 ${fmt(r.starvationDeathsTotal)}명</td></tr>
  </tbody></table>`;
  $("why-sow").innerHTML = explainedTable(r.lastSowing);
  $("why-harvest").innerHTML = explainedTable(r.lastHarvest);
  const dm = r.lastDemography;
  $("why-demog").innerHTML = dm ? explainedTable(dm.births) + `<div style="height:10px"></div>` + explainedTable(dm.deaths) : `<span class="mu">첫 달이 끝나면 표시됩니다.</span>`;
  $("log").innerHTML =
    world.log.length === 0
      ? `<li class="empty"><span class="mu">아직 기록이 없습니다.</span></li>`
      : [...world.log]
          .reverse()
          .map((l) => `<li><time>${dateText(l.day)}</time><span>${esc(l.text)}</span></li>`)
          .join("");
}

