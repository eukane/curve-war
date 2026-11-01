import { DAYS_PER_YEAR, dateOf } from "../sim/calendar";
import { CLEARING_LABOR_DAYS_PER_HA, HA_PER_FARMER } from "../sim/constants";
import type { Explained } from "../sim/explain";
import {
  SCENARIOS,
  carryingCapacity,
  dailyNeedKg,
  fieldFarmersAt,
  forecastSeries,
  popOf,
  startClearing,
  stopClearing,
  totalPop,
} from "../sim/world";
import type { Metrics, ScenarioId, World } from "../sim/world";

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

/* ------------------------------------------------------------------ */
/* 개간 패널                                                           */
/* ------------------------------------------------------------------ */
export let clearBuilt = false;
let lastPreviewKey = "";
let previewScenario: ScenarioId = "normal";

export function buildClearPanel() {
  const p = $("clear-panel");
  p.innerHTML = `
    <div id="clear-idle">
      <p class="mu" style="margin:0 0 6px">숲과 황무지를 경작지로 바꿉니다. 인부는 들에서 빠지고, 매일 인부 수 ÷ ${CLEARING_LABOR_DAYS_PER_HA}ha씩 땅이 늘어납니다. 새 땅은 다음 봄 파종부터 쓰입니다.</p>
      <div class="field"><label for="in-workers">인부</label><input id="in-workers" type="range" min="100" max="6000" step="100" value="1500" /><output id="out-workers"></output></div>
      <div class="field"><label for="in-target">목표 면적</label><input id="in-target" type="range" min="100" max="4000" step="100" value="2000" /><output id="out-target"></output></div>
      <div class="row"><button id="btn-start" class="primary">개간 시작</button><span id="clear-msg" class="note" role="status"></span></div>
      <div id="clear-preview" class="wrapx"></div>
    </div>
    <div id="clear-active" hidden></div>`;
  const wi = $("in-workers") as HTMLInputElement;
  const ti = $("in-target") as HTMLInputElement;
  const onInput = () => {
    updateClearInputs();
    lastPreviewKey = "";
    renderClearPreview();
  };
  wi.addEventListener("input", onInput);
  ti.addEventListener("input", onInput);
  $("btn-start").addEventListener("click", () => {
    const res = startClearing(world, REGION_ID, +wi.value, +ti.value);
    $("clear-msg").textContent = res.ok ? "" : res.reason;
    lastPreviewKey = "";
    onChange();
  });
  clearBuilt = true;
}

function updateClearInputs() {
  const r = region();
  const wi = $("in-workers") as HTMLInputElement;
  const ti = $("in-target") as HTMLInputElement;
  wi.max = String(Math.max(100, Math.floor(popOf(r, "farmer") / 100) * 100));
  ti.max = String(Math.max(100, Math.floor(r.clearableHa / 100) * 100));
  if (+ti.value > +ti.max) ti.value = ti.max;
  if (+wi.value > +wi.max) wi.value = wi.max;
  $("out-workers").textContent = `${fmt(+wi.value)} 명`;
  $("out-target").textContent = `${fmt(+ti.value)} ha`;
}

function deltaClass(good: boolean, diff: number): string {
  return Math.abs(diff) < 1e-9 ? "" : good ? "good" : "bad";
}

function renderClearPreview() {
  const r = region();
  const wi = +(($("in-workers") as HTMLInputElement).value);
  const ti = +(($("in-target") as HTMLInputElement).value);
  const key = `${Math.floor(world.day / 30)}:${wi}:${ti}:${previewScenario}`;
  if (key === lastPreviewKey) return;
  lastPreviewKey = key;

  const days = (ti * CLEARING_LABOR_DAYS_PER_HA) / wi;
  const done = dateText(world.day + Math.ceil(days));
  const cps = [
    { days: DAYS_PER_YEAR, label: "1년 뒤" },
    { days: DAYS_PER_YEAR * 10, label: "10년 뒤" },
    { days: DAYS_PER_YEAR * 40, label: "40년 뒤" },
  ];
  const base = forecastSeries(world, REGION_ID, cps, undefined, previewScenario);
  const withIt = forecastSeries(
    world,
    REGION_ID,
    cps,
    (c) => {
      startClearing(c, REGION_ID, wi, ti);
    },
    previewScenario,
  );
  const scNote = SCENARIOS.find((x) => x.id === previewScenario)!.note;
  const toggle = SCENARIOS.map(
    (sc) => `<button data-sc="${sc.id}" aria-pressed="${sc.id === previewScenario}">${sc.label}</button>`,
  ).join("");
  const kWith = carryingCapacity(r, ti);

  const row = (label: string, f: (m: Metrics) => number, fmtv: (v: number) => string, goodWhenHigher: boolean) =>
    `<tr><td>${label}</td>${cps
      .map((_, i) => {
        const a = f(base[i]!.metrics);
        const b = f(withIt[i]!.metrics);
        const d = b - a;
        const cls = deltaClass(goodWhenHigher ? d > 0 : d < 0, d);
        return `<td class="n mono">${fmtv(a)} → <span class="${cls}">${fmtv(b)}</span></td>`;
      })
      .join("")}</tr>`;

  const farmersNow = popOf(r, "farmer");
  const needField = r.arableHa / HA_PER_FARMER;
  const surplus = farmersNow - needField;
  const labor =
    wi <= surplus
      ? `<span class="good">남는 일손 ${fmt(surplus)}명 안에서 보내므로 수확은 줄지 않습니다.</span>`
      : `<span class="warn">남는 일손은 ${fmt(Math.max(0, surplus))}명인데 ${fmt(wi)}명을 보내므로, 사업이 이어지는 동안 파종·수확 면적이 줄어듭니다.</span>`;

  $("clear-preview").innerHTML = `
    <p style="margin:8px 0 4px"><b>예상 완공:</b> ${fmt(days)}일 뒤 (${done}) · <b>수용력:</b> ${fmt(carryingCapacity(r))} → <span class="good">${fmt(kWith)}</span> 명 · ${labor}</p>
    <div class="row" role="group" aria-label="예측 시나리오" style="margin:8px 0 4px">${toggle}<span class="note">${esc(scNote)}</span></div>
    <table class="wide"><thead><tr><th>예측 (안 함 → 시작)</th>${cps.map((c) => `<th class="n">${c.label}</th>`).join("")}</tr></thead><tbody>
      ${row("인구 (명)", (m) => m.pop, (v) => fmt(v), true)}
      ${row("누적 기아 사망 (명)", (m) => m.starvationDeaths, (v) => fmt(v), false)}
      ${row("최근 수확 입고 (t)", (m) => (m.lastHarvestKg ?? 0) / 1000, (v) => fmt(v), true)}
      ${row("경작지 (ha)", (m) => m.arableHa, (v) => fmt(v), true)}
    </tbody></table>
    <p class="note" style="margin:6px 0 0">예측은 모델을 복제해 실제로 돌린 값입니다. 실제 기상은 이 두 시나리오 사이 어디든 될 수 있습니다.</p>`;
  $("clear-preview")
    .querySelectorAll<HTMLButtonElement>("button[data-sc]")
    .forEach((b) =>
      b.addEventListener("click", () => {
        previewScenario = b.dataset.sc as ScenarioId;
        renderClearPreview();
      }),
    );
}

export function renderClearActive() {
  const r = region();
  const c = r.clearing;
  const idle = $("clear-idle");
  const active = $("clear-active");
  idle.hidden = !!c;
  active.hidden = !c;
  if (!c) {
    updateClearInputs();
    renderClearPreview();
    return;
  }
  const pct = Math.min(100, (c.progressHa / c.targetHa) * 100);
  const rate = (c.workers - (world.day < c.reservedUntilDay ? c.reservedForHarvest : 0)) / CLEARING_LABOR_DAYS_PER_HA;
  const left = rate > 0 ? Math.ceil((c.targetHa - c.progressHa) / rate) : Infinity;
  active.innerHTML = `
    <p style="margin:0 0 4px"><b>진행 중</b> — 인부 ${fmt(c.workers)}명 · 목표 ${fmt(c.targetHa)}ha · 하루 ${fmt(rate, 1)}ha</p>
    <div class="meter" role="img" aria-label="진행률 ${fmt(pct)}%"><i style="width:${pct}%"></i></div>
    <p class="mu" style="margin:2px 0 8px">${fmt(c.progressHa, 1)}ha 완료 (${fmt(pct)}%) · 완공까지 약 ${Number.isFinite(left) ? `${fmt(left)}일 (${dateText(world.day + left)})` : "알 수 없음"}</p>
    <button id="btn-stop">중단 (이미 개간한 땅은 남습니다)</button>`;
  $("btn-stop").addEventListener("click", () => {
    stopClearing(world, REGION_ID);
    lastPreviewKey = "";
    onChange();
  });
}

