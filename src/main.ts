import { START_REGIONS } from "./data/start-regions";
import { DAYS_PER_YEAR, dateOf } from "./sim/calendar";
import { CLEARING_LABOR_DAYS_PER_HA, HA_PER_FARMER } from "./sim/constants";
import { EVENTS } from "./sim/events";
import type { Explained } from "./sim/explain";
import { dominatedOptions } from "./sim/quality";
import {
  carryingCapacity,
  createWorld,
  dailyNeedKg,
  fieldFarmersAt,
  forecastSeries,
  popOf,
  resolveEvent,
  startClearing,
  step,
  stopClearing,
  totalPop,
} from "./sim/world";
import { SCENARIOS } from "./sim/world";
import type { Metrics, PendingEvent, ScenarioId, World } from "./sim/world";

const world: World = createWorld(20260101, START_REGIONS);
const REGION_ID = START_REGIONS[0]!.id;
const region = () => world.regions.find((r) => r.id === REGION_ID)!;

/* 개발 중에만 열어 두는 점검용 손잡이 (화면 검증에 사용) */
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__curveWar = { world, EVENTS };
}

const $ = (id: string) => document.getElementById(id)!;
const fmt = (v: number, d = 0) => v.toLocaleString("ko-KR", { maximumFractionDigits: d, minimumFractionDigits: d });
const tons = (kg: number) => `${fmt(kg / 1000)}t`;
const dateText = (day: number) => {
  const d = dateOf(day);
  return `${d.year + 1}년 ${d.month}월 ${d.dayOfMonth}일 (${d.season})`;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/* ------------------------------------------------------------------ */
/* 시간 조작                                                           */
/* ------------------------------------------------------------------ */
let speed = 0; // 초당 진행 일수. 0이면 일시정지
const SPEEDS: [string, number][] = [
  ["일시정지", 0],
  ["×1 (1일/초)", 1],
  ["×10", 10],
  ["×30 (1달/초)", 30],
  ["×180", 180],
];

function buildControls() {
  const c = $("controls");
  SPEEDS.forEach(([label, v]) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.setAttribute("aria-pressed", String(v === speed));
    b.addEventListener("click", () => {
      speed = v;
      refreshSpeedButtons();
    });
    c.appendChild(b);
  });
}
function refreshSpeedButtons() {
  $("controls")
    .querySelectorAll("button")
    .forEach((b, i) => b.setAttribute("aria-pressed", String(SPEEDS[i]![1] === speed)));
}

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
function renderSummary() {
  const r = region();
  const need = dailyNeedKg(r);
  const k = carryingCapacity(r);
  const pop = totalPop(r);
  const fillPct = Math.min(100, (pop / k) * 100);
  const stockDays = r.granaryKg / need;
  const fieldFarmers = fieldFarmersAt(r, world.day);
  const needField = r.arableHa / HA_PER_FARMER;
  $("date").textContent = `${dateText(world.day)} — ${r.name}`;
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
        fieldFarmers < needField ? ` <span class="warn">— ${fmt(needField - fieldFarmers)}명 부족</span>` : ` <span class="good">— ${fmt(fieldFarmers - needField)}명 여유</span>`
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
let clearBuilt = false;
let lastPreviewKey = "";
let previewScenario: ScenarioId = "normal";

function buildClearPanel() {
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
    renderAll();
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

function renderClearActive() {
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
    renderAll();
  });
}

/* ------------------------------------------------------------------ */
/* 사건 창                                                             */
/* ------------------------------------------------------------------ */
function renderModal() {
  const modal = $("modal");
  const p = world.pending;
  if (!p) {
    modal.hidden = true;
    return;
  }
  if (!modal.hidden && modal.dataset.key === `${p.eventId}:${p.day}`) return; // 이미 그림
  modal.hidden = false;
  modal.dataset.key = `${p.eventId}:${p.day}`;
  speed = 0;
  refreshSpeedButtons();
  $("modal-card").innerHTML = modalHtml(p);
  $("modal-card")
    .querySelectorAll<HTMLButtonElement>("button[data-opt]")
    .forEach((b) =>
      b.addEventListener("click", () => {
        resolveEvent(world, b.dataset.opt!);
        modal.hidden = true;
        modal.dataset.key = "";
        renderAll();
      }),
    );
}

function modalHtml(p: PendingEvent): string {
  const fake = new Set(dominatedOptions(p.options).map((d) => d.id));
  const opts = p.options
    .map((o) => {
      const tables = SCENARIOS.map((sc) => {
        const rows = o.outcomes[sc.id].series
          .map(
            (s) =>
              `<tr><td>${esc(s.label)}</td><td class="n mono">${fmt(s.metrics.pop)}</td><td class="n mono">${fmt(s.metrics.starvationDeaths - p.before.starvationDeaths)}</td><td class="n mono">${tons(s.metrics.granaryKg)}</td><td class="n mono">${s.metrics.lastHarvestKg === null ? "—" : tons(s.metrics.lastHarvestKg)}</td></tr>`,
          )
          .join("");
        return `<h3>${esc(sc.label)} <span class="note" style="font-weight:400">— ${esc(sc.note)}</span></h3>
          <div class="wrapx"><table class="wide"><thead><tr><th>시점</th><th class="n">인구</th><th class="n">이후 기아 사망</th><th class="n">곡창</th><th class="n">최근 수확</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      }).join("");
      return `<div class="opt"><div class="head"><span>${esc(o.label)}</span><button class="primary" data-opt="${esc(o.id)}">이걸로 결정</button></div>${tables}
        ${fake.has(o.id) ? `<p class="note bad" style="margin:4px 0 0">주의: 이 선택지는 평년·흉년 어느 쪽에서도 다른 선택지보다 모든 면에서 나쁩니다.</p>` : ""}</div>`;
    })
    .join("");
  return `<h2 id="modal-title" style="font-size:18px">${esc(p.title)}</h2>
    <p class="mu" style="margin:0 0 4px">${dateText(p.day)}</p>
    <p>${esc(p.text)}</p>${opts}`;
}

/* ------------------------------------------------------------------ */
/* 루프                                                                */
/* ------------------------------------------------------------------ */
function renderAll() {
  if (!clearBuilt) buildClearPanel();
  renderSummary();
  renderClearActive();
  renderModal();
  lastRenderedDay = world.day;
}

let lastRenderedDay = -1;
let last = performance.now();
let acc = 0;
function frame(now: number) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (speed > 0 && !world.pending) {
    acc += dt * speed;
    const days = Math.floor(acc);
    if (days > 0) {
      acc -= days;
      step(world, days);
    }
  }
  if (world.day !== lastRenderedDay || (world.pending && $("modal").hidden)) renderAll();
  requestAnimationFrame(frame);
}

buildControls();
renderAll();
requestAnimationFrame(frame);
