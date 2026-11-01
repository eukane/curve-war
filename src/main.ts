import { WAR_REGIONS } from "./data/start-regions";
import { HA_PER_FARMER, UNIT_KM } from "./sim/constants";
import { EVENTS } from "./sim/events";
import { computePressure, playerAreaHa, sectorName, soldiersOf, supplyMultipliers, totalAreaHa } from "./sim/war";
import { createWorld, dailyNeedKg, disband, fieldFarmersAt, levy, popOf, previewMonth, setOrder, step, totalPop } from "./sim/world";
import type { MonthPreview, World } from "./sim/world";
import { advise } from "./ui/advisor";
import { $, buildClearPanel, clearBuilt, dateText, esc, fmt, initEconomyPanel, renderClearActive, renderSummary } from "./ui/economy-panel";
import { createMap } from "./ui/map";
import type { MapView } from "./ui/map";

let seed = 20260101;
let world: World;
let selected: number | null = null;
let busy = false;
let auto = false;
let preview: MonthPreview | null = null;
let map: MapView;
let ecoOpen = false;

const PLAYER = 1;
const RIVAL = 2;
const player = () => world.regions.find((r) => r.id === PLAYER)!;
const rival = () => world.regions.find((r) => r.id === RIVAL)!;

/* 개발 중에만 열어 두는 점검용 손잡이 */
if (import.meta.env.DEV) {
  Object.defineProperty(window, "__curveWar", { get: () => ({ world, EVENTS, step, setOrder, levy, disband, seed }) });
}

function newGame() {
  world = createWorld(seed, WAR_REGIONS, { war: { playerRegionId: PLAYER, rivalRegionId: RIVAL } });
  selected = null;
  busy = false;
  auto = false;
  initEconomyPanel(world, PLAYER, () => renderAll());
  $("overlay").hidden = true;
  $("hint").hidden = false;
  refreshPreview();
}

function refreshPreview() {
  preview = world.war?.result ? null : previewMonth(world);
}

/* ------------------------------------------------------------------ */
/* 렌더링                                                              */
/* ------------------------------------------------------------------ */
function renderTop() {
  const P = player();
  const R = rival();
  const war = world.war!;
  $("date").textContent = dateText(world.day);
  const stockDays = P.granaryKg / dailyNeedKg(P);
  const area = (playerAreaHa(war.front) / totalAreaHa()) * 100;
  const chips: string[] = [];
  chips.push(`<span class="chip">병력 <b>${fmt(soldiersOf(P))}</b> <span class="mu">vs ${fmt(soldiersOf(R))}</span></span>`);
  chips.push(`<span class="chip ${stockDays < 60 ? "warn" : ""}">식량 <b>${fmt(stockDays)}</b>일치</span>`);
  chips.push(`<span class="chip">인구 <b>${fmt(totalPop(P))}</b> <span class="mu">vs ${fmt(totalPop(R))}</span></span>`);
  chips.push(`<span class="chip">영토 <b>${fmt(area, 1)}%</b></span>`);
  if (P.lastDeficit > 0.01) chips.push(`<span class="chip bad">굶는 중 <b>${fmt(P.lastDeficit * 100, 0)}%</b></span>`);
  $("chips").innerHTML = chips.join("");
}

function renderAdvice() {
  $("advice").innerHTML = advise(world, preview)
    .map((a) => `<li class="${a.level}"><b>${esc(a.title)}</b><span>${esc(a.text)}</span></li>`)
    .join("");
}

function renderSector() {
  const el = $("sector");
  if (selected === null) {
    el.innerHTML = `<p class="mu" style="margin:0">지도에서 <b>전선의 점</b>을 누르거나 끌어 보세요. 끌면 그 구간과 이웃 구간의 명령선이 함께 움직이고, 병력이 거기에 몰립니다. 점을 두 번 누르면 그 점의 명령이 취소됩니다.</p>`;
    return;
  }
  const war = world.war!;
  const pr = computePressure(world);
  const i = selected;
  const supP = supplyMultipliers(war.front, war.capitals.player.x)[i]!;
  const supR = supplyMultipliers(war.front, war.capitals.rival.x)[i]!;
  const net = pr.net[i]!;
  const shiftKm = preview ? preview.shifts[i]! * UNIT_KM : 0;
  const order = war.orders.player[i]!;
  const ahead = (order - war.front[i]!) * UNIT_KM;
  el.innerHTML = `<dl class="kv">
      <dt>구간</dt><dd>${sectorName(i)}</dd>
      <dt>우리 밀도</dt><dd>${fmt(pr.playerDensity[i]!, 1)} 명/km</dd>
      <dt>적 밀도</dt><dd>${fmt(pr.rivalDensity[i]!, 1)} 명/km</dd>
      <dt>차이</dt><dd class="${net > 1 ? "good" : net < -1 ? "bad" : ""}">${net > 0 ? "+" : ""}${fmt(net, 1)} 명/km</dd>
      <dt>보급 배율</dt><dd>우리 ${fmt(supP, 2)} · 적 ${fmt(supR, 2)}</dd>
      <dt>명령선</dt><dd>${Math.abs(ahead) < 0.05 ? "현재 전선 유지" : `${ahead > 0 ? "앞으로" : "뒤로"} ${fmt(Math.abs(ahead), 1)}km`}</dd>
      <dt>이번 달 예상</dt><dd class="${shiftKm > 0.05 ? "good" : shiftKm < -0.05 ? "bad" : ""}">${Math.abs(shiftKm) < 0.05 ? "움직임 없음" : `${shiftKm > 0 ? "전진" : "후퇴"} ${fmt(Math.abs(shiftKm), 1)}km`}</dd>
    </dl>
    <div class="row" style="margin-top:8px">
      <button id="sec-back">← 뒤로 12</button><button id="sec-fwd">앞으로 12 →</button><button id="sec-clear">명령 취소</button>
    </div>
    <p class="note" style="margin:6px 0 0">밀도 차이가 +이면 우리가 밀고, −이면 밀립니다. 명령선보다 앞으로는 나아가지 못합니다. 수도에서 멀수록 보급 배율이 떨어집니다.</p>`;
  $("sec-back").onclick = () => map.nudge(i, -12);
  $("sec-fwd").onclick = () => map.nudge(i, 12);
  $("sec-clear").onclick = () => {
    setOrder(world, i, war.front[i]!);
    onOrdersChanged();
  };
}

function renderArmy() {
  const P = player();
  const farmers = popOf(P, "farmer");
  const sold = soldiersOf(P);
  const need = P.arableHa / HA_PER_FARMER;
  const gap = need - fieldFarmersAt(P, world.day);
  const cap = (farmers + sold) * 0.4;
  $("army").innerHTML = `<dl class="kv">
      <dt>병력</dt><dd>${fmt(sold)}명</dd>
      <dt>농민</dt><dd>${fmt(farmers)}명</dd>
      <dt>농사에 필요한 일손</dt><dd>${fmt(need)}명</dd>
      <dt>일손</dt><dd class="${gap > 0.5 ? "warn" : "good"}">${gap > 0.5 ? `${fmt(gap)}명 부족` : `${fmt(Math.max(0, -gap))}명 여유`}</dd>
      <dt>징집 한도</dt><dd>${fmt(cap)}명</dd>
    </dl>
    <div class="row" style="margin-top:8px">
      <button data-lv="500">+500 징집</button><button data-lv="1000">+1,000 징집</button>
      <button data-lv="-500">−500 해산</button><button data-lv="-1000">−1,000 해산</button>
    </div>
    <p class="note" id="army-note" style="margin:6px 0 0">병력은 농사를 짓지 못하지만 곡식은 똑같이 먹습니다. 일손이 모자라면 수확이 그만큼 줄고, 굶으면 병사도 약해집니다. 적은 우리 병력을 보고 따라 징집합니다.</p>`;
  $("army")
    .querySelectorAll<HTMLButtonElement>("button[data-lv]")
    .forEach((b) =>
      b.addEventListener("click", () => {
        const n = +b.dataset.lv!;
        const res = n > 0 ? levy(world, PLAYER, n) : disband(world, PLAYER, -n);
        if (!res.ok) $("army-note").textContent = res.reason;
        else onOrdersChanged();
      }),
    );
}

function renderPreview() {
  const el = $("preview");
  if (world.war!.result) {
    el.textContent = "";
    return;
  }
  if (!preview) {
    el.innerHTML = `<span class="mu">예상을 계산하는 중…</span>`;
    return;
  }
  const dHa = preview.playerAreaHaDelta;
  const dPct = (dHa / totalAreaHa()) * 100;
  const big = preview.shifts.reduce((m, v, i) => (Math.abs(v) > Math.abs(preview!.shifts[m]!) ? i : m), 0);
  const bigKm = preview.shifts[big]! * UNIT_KM;
  const res = preview.result === "win" ? `<b class="good"> 이대로면 이번 달에 적 수도가 함락됩니다.</b>` : preview.result === "loss" ? `<b class="bad"> 이대로면 이번 달에 우리 수도가 함락됩니다.</b>` : "";
  el.innerHTML = `<b>이번 달 예상</b> (적의 반응 포함, 전황 변수 ±12% 불확실)　
    영토 <span class="${dHa > 1 ? "good" : dHa < -1 ? "bad" : ""}">${dHa >= 0 ? "+" : ""}${fmt(dHa)}ha (${dPct >= 0 ? "+" : ""}${fmt(dPct, 2)}%p)</span> ·
    우리 병력 ${fmt(soldiersOf(player()))}→${fmt(preview.playerSoldiers)} (전사 약 ${fmt(preview.playerCasualties)}) ·
    적 ${fmt(soldiersOf(rival()))}→${fmt(preview.rivalSoldiers)} (전사 약 ${fmt(preview.rivalCasualties)}) ·
    ${Math.abs(bigKm) < 0.05 ? "전선은 움직이지 않을 전망" : `가장 크게 움직이는 곳 ${sectorName(big)}: ${bigKm > 0 ? "전진" : "후퇴"} ${fmt(Math.abs(bigKm), 1)}km`}${res}`;
}

function renderReports() {
  const rs = [...world.war!.reports].reverse().slice(0, 8);
  $("reports").innerHTML = rs.length
    ? rs
        .map((r) => {
          const dPct = (r.playerAreaHaDelta / totalAreaHa()) * 100;
          const adv = r.bestAdvanceUnits * UNIT_KM;
          const ret = r.worstRetreatUnits * UNIT_KM;
          const moves = [adv >= 0.1 ? `${sectorName(r.bestAdvancePoint)} 전진 ${fmt(adv, 1)}km` : "", ret >= 0.1 ? `${sectorName(r.worstRetreatPoint)} 후퇴 ${fmt(ret, 1)}km` : ""].filter(Boolean).join(", ");
          const parts = [
            Math.abs(r.playerAreaHaDelta) < 1 && !moves ? "전선은 거의 움직이지 않았다." : `영토 ${r.playerAreaHaDelta > 0 ? "+" : ""}${fmt(r.playerAreaHaDelta)}ha(${dPct > 0 ? "+" : ""}${fmt(dPct, 2)}%p).${moves ? ` ${moves}.` : ""}`,
            r.villagesDelta !== 0 ? `<b class="${r.villagesDelta > 0 ? "good" : "bad"}">마을 ${Math.abs(r.villagesDelta)}곳 ${r.villagesDelta > 0 ? "점령" : "상실"}.</b>` : "",
            `전사: 우리 ${fmt(r.playerCasualties)}명, 적 ${fmt(r.rivalCasualties)}명.`,
            r.playerDeficit > 0.02 ? `<span class="bad">식량 부족 ${fmt(r.playerDeficit * 100, 0)}%.</span>` : "",
          ];
          return `<li><time>${dateText(r.day - 1).replace(/ \(.*\)/, "")}</time><span>${parts.filter(Boolean).join(" ")}</span></li>`;
        })
        .join("")
    : `<li class="empty"><span class="mu">아직 한 달도 지나지 않았습니다. 명령을 내리고 <b>다음 달 ▶</b>을 눌러 보세요.</span></li>`;
}

function renderResult() {
  const war = world.war!;
  const ov = $("overlay");
  if (!war.result) {
    ov.hidden = true;
    return;
  }
  const win = war.result === "win";
  const months = Math.round(world.day / 30);
  ov.hidden = false;
  $("overlay-card").innerHTML = `<h2 class="${win ? "good" : "bad"}">${win ? "승리 — 적 수도 함락" : "패배 — 수도 함락"}</h2>
    <p>${months}개월(${(months / 12).toFixed(1)}년) 만에 ${win ? "적의 수도를 함락했습니다" : "수도를 잃었습니다"}.</p>
    <dl class="kv"><dt>영토</dt><dd>${fmt((playerAreaHa(war.front) / totalAreaHa()) * 100, 1)}%</dd>
      <dt>우리 병력</dt><dd>${fmt(soldiersOf(player()))}명</dd><dt>적 병력</dt><dd>${fmt(soldiersOf(rival()))}명</dd>
      <dt>우리 인구</dt><dd>${fmt(totalPop(player()))}명</dd><dt>누적 기아 사망</dt><dd>${fmt(player().starvationDeathsTotal)}명</dd></dl>
    <div class="row" style="margin-top:14px"><button class="primary" id="btn-again">새 게임</button></div>`;
  $("btn-again").onclick = () => {
    seed += 1;
    newGame();
    renderAll();
  };
}

function renderAll() {
  renderTop();
  renderAdvice();
  renderSector();
  renderArmy();
  renderPreview();
  renderReports();
  renderResult();
  map.draw(selected, preview);
  if (ecoOpen) {
    if (!clearBuilt) buildClearPanel();
    renderSummary();
    renderClearActive();
  }
  renderButtons();
}

function renderButtons() {
  const btn = $("btn-next") as HTMLButtonElement;
  btn.disabled = busy || !!world.war!.result;
  btn.textContent = busy ? "진행 중…" : "다음 달 ▶";
  $("btn-auto").setAttribute("aria-pressed", String(auto));
}

/* ------------------------------------------------------------------ */
/* 입력과 턴 진행                                                      */
/* ------------------------------------------------------------------ */
let previewQueued = false;
function onOrdersChanged() {
  // 끌고 있는 동안에는 예측을 프레임당 한 번만 계산한다
  if (previewQueued) return;
  previewQueued = true;
  requestAnimationFrame(() => {
    previewQueued = false;
    if (busy) return;
    refreshPreview();
    renderAll();
  });
}

function nextMonth() {
  if (busy || world.war!.result) return;
  busy = true;
  $("hint").hidden = true;
  preview = null;
  renderButtons();
  const startMonth = Math.floor(world.day / 30);
  const tick = () => {
    const stepped = step(world, 1);
    map.draw(selected, null);
    renderTop();
    const done = Math.floor(world.day / 30) > startMonth || world.war!.result || stepped === 0;
    if (!done) {
      setTimeout(tick, 28);
      return;
    }
    busy = false;
    refreshPreview();
    renderAll();
    if (auto && !world.war!.result) {
      const danger = advise(world, preview).some((a) => a.level === "danger");
      if (danger) {
        auto = false;
        renderAll();
      } else setTimeout(nextMonth, 350);
    }
  };
  tick();
}

function init() {
  newGame();
  const canvas = document.getElementById("map") as HTMLCanvasElement;
  map = createMap(canvas, () => world, {
    onSelect: (i) => {
      selected = i;
      renderSector();
      map.draw(selected, preview);
    },
    onOrdersChanged,
  });
  canvas.addEventListener("keydown", (ev) => {
    if (selected === null) return;
    const dx = ev.key === "ArrowRight" ? 12 : ev.key === "ArrowLeft" ? -12 : 0;
    if (dx) {
      ev.preventDefault();
      map.nudge(selected, dx);
    } else if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
      ev.preventDefault();
      selected = Math.max(0, Math.min(world.war!.front.length - 1, selected + (ev.key === "ArrowUp" ? -1 : 1)));
      renderAll();
    }
  });
  $("btn-next").addEventListener("click", nextMonth);
  $("btn-auto").addEventListener("click", () => {
    auto = !auto;
    renderAll();
    if (auto) nextMonth();
  });
  $("btn-reset-orders").addEventListener("click", () => {
    world.war!.orders.player = [...world.war!.front];
    onOrdersChanged();
  });
  $("btn-new").addEventListener("click", () => {
    seed += 1;
    newGame();
    renderAll();
  });
  $("eco").addEventListener("toggle", () => {
    ecoOpen = ($("eco") as HTMLDetailsElement).open;
    renderAll();
  });
  renderAll();
}

init();
