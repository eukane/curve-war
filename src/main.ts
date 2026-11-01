import { WAR_REGIONS } from "./data/start-regions";
import { TURN_DAYS, turnOf } from "./sim/calendar";
import { FORT_DENSITY_BONUS, EDICT_RESEARCH_DAYS, EDICT_SLOTS, HARVEST_DAY_OF_YEAR, HA_PER_FARMER, SEASON_MOVE_MULT, SOWING_DAY_OF_YEAR, UNIT_KM } from "./sim/constants";
import { EDICTS, cancelEdictResearch, edictOf, repealEdict, startEdict } from "./sim/edicts";
import { profileOf } from "./sim/ai";
import { KIND_NAME, buildInfo, canBuild, cancelBuild, fortMultipliers, roadFalloffMultipliers, startBuild } from "./sim/structures";
import { EVENTS } from "./sim/events";
import { computePressure, playerAreaHa, sectorName, soldiersOf, supplyMultipliers, totalAreaHa, trainingCount } from "./sim/war";
import { createWorld, dailyNeedKg, disband, fieldFarmersAt, levy, popOf, previewTurn, setOrder, step, totalPop } from "./sim/world";
import type { TurnPreview, TurnReport, World } from "./sim/world";
import { advise } from "./ui/advisor";
import { edictNumbers } from "./ui/edict-info";
import { $, esc, fmt, initEconomyPanel, renderSummary } from "./ui/economy-panel";
import { createMap } from "./ui/map";
import type { MapView } from "./ui/map";
import { timersOf } from "./ui/timers";

let seed = 20260101;
let world: World;
let selected: number | null = null;
let busy = false;
let skip = false;
let auto = false;
let preview: TurnPreview | null = null;
/** 명령을 바꾼 직후에는 예상이 낡았다. 잠시 멈추면 다시 계산한다 (탐색형 적 AI 때문에 계산이 수백 ms 걸린다) */
let previewStale = false;
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
  preview = world.war?.result ? null : previewTurn(world);
  previewStale = false;
}

/* ------------------------------------------------------------------ */
/* 렌더링                                                              */
/* ------------------------------------------------------------------ */
function renderTop() {
  const P = player();
  const R = rival();
  const war = world.war!;
  const t = turnOf(world.day);
  document.documentElement.dataset.season = t.season;
  $("date").textContent = `${t.year + 1}년차 ${t.season} · ${t.index + 1}번째 턴`;
  const stockDays = P.granaryKg / dailyNeedKg(P);
  const area = (playerAreaHa(war.front) / totalAreaHa()) * 100;
  const training = trainingCount(P, world.day);
  const chips: string[] = [];
  chips.push(
    `<span class="chip" title="우리 병력 vs 적 병력. 훈련 중인 병사 포함">병력 <b>${fmt(soldiersOf(P))}</b>${training > 0 ? ` <span class="mu">(훈련 ${fmt(training)})</span>` : ""} <span class="mu">vs ${fmt(soldiersOf(R))}</span></span>`,
  );
  chips.push(`<span class="chip ${stockDays < 60 ? "warn" : ""}" title="곡창 재고가 하루 소비량으로 며칠을 버티는가">식량 <b>${fmt(stockDays)}</b>일치</span>`);
  chips.push(`<span class="chip">인구 <b>${fmt(totalPop(P))}</b> <span class="mu">vs ${fmt(totalPop(R))}</span></span>`);
  chips.push(`<span class="chip">영토 <b>${fmt(area, 1)}%</b></span>`);
  const prof = profileOf(war.ai.profile);
  chips.push(`<span class="chip" title="${esc(prof.blurb)}">적 지도자 <b>${esc(prof.name)}</b></span>`);
  if (P.lastDeficit > 0.01) chips.push(`<span class="chip bad" title="지난 한 달 필요한 곡식 중 못 먹은 비율">굶는 중 <b>${fmt(P.lastDeficit * 100, 0)}%</b></span>`);
  $("chips").innerHTML = chips.join("");
}

/** 한 해의 4계절을 한 줄로 보여주고, 지금 어디쯤인지와 파종·수확 시점을 표시한다. */
function renderTimeline() {
  const t = turnOf(world.day);
  const seasons = ["봄", "여름", "가을", "겨울"];
  const cells = seasons
    .map((s, i) => {
      const cls = i === t.seasonIndex ? "now" : i < t.seasonIndex ? "done" : "";
      return `<div class="tl-s ${cls}"><span>${s}</span><span class="mono">${i * 90 + 1}~${(i + 1) * 90}일</span></div>`;
    })
    .join("");
  const yearDay = world.day - t.year * 360;
  const pct = (d: number) => `${(d / 360) * 100}%`;
  $("timeline").innerHTML = `<div class="tl-seasons">${cells}</div>
    <div class="tl-now" style="left:${pct(yearDay)}" title="지금 ${yearDay + 1}일째"></div>
    <div class="tl-mark" style="left:${pct(SOWING_DAY_OF_YEAR)}">파종</div>
    <div class="tl-mark" style="left:${pct(HARVEST_DAY_OF_YEAR)}">수확</div>`;
}

/** 폐지 버튼을 한 번 누른 법령 id. 두 번째 누름에서 실제로 폐지한다 (되살리려면 180일이 걸리는 실수를 막는다) */
let armedRepeal: string | null = null;
let armedTimer: ReturnType<typeof setTimeout> | undefined;

const SEASON_NOTE = [
  "해빙기라 진창이 많아 전진이 느립니다.",
  "원정의 계절입니다. 전진이 가장 빠릅니다.",
  "수확기입니다. 병사를 농사에 돌릴 일손이 곧 식량입니다.",
  "추위와 눈으로 전진이 크게 느려집니다. 정비의 계절입니다.",
];
function renderSeasonNote() {
  const t = turnOf(world.day);
  const m = SEASON_MOVE_MULT[t.seasonIndex]!;
  $("season-note").innerHTML = `<b>${t.season}</b> · 전진 속도 ×${fmt(m, 1)} — ${SEASON_NOTE[t.seasonIndex]} <span class="mu">(배율은 임시값)</span>`;
}

function renderEdicts() {
  const e = world.war!.edicts.player;
  const el = $("edicts");
  const slots: string[] = [];
  for (let i = 0; i < EDICT_SLOTS; i++) {
    const id = e.enacted[i];
    slots.push(id ? `<span class="slot on">${esc(edictOf(id).name)} ✓</span>` : `<span class="slot empty">${e.researching && i === e.enacted.length ? "연구 중" : "빈 슬롯"}</span>`);
  }
  let html = `<div class="slots" aria-label="법령 슬롯">${slots.join("")}</div>`;
  if (e.researching) {
    const def = edictOf(e.researching.id);
    const done = EDICT_RESEARCH_DAYS - e.researching.remaining;
    html += `<div class="research"><b>${esc(def.name)}</b> 연구 중 — 시행까지 ${fmt(e.researching.remaining)}일 (D+${fmt(e.researching.remaining)})
      <div class="meter" role="img" aria-label="진행 ${fmt((done / EDICT_RESEARCH_DAYS) * 100)}%"><i style="width:${(done / EDICT_RESEARCH_DAYS) * 100}%"></i></div>
      <button id="ed-cancel">연구 취소</button></div>`;
  }
  const canStart = !e.researching && e.enacted.length < EDICT_SLOTS;
  html += EDICTS.map((d) => {
    const on = e.enacted.includes(d.id);
    const researching = e.researching?.id === d.id;
    const n = edictNumbers(world, d.id);
    return `<div class="edict"><h3><span>${esc(d.name)} <span class="mu" style="font-weight:400">— ${esc(d.blurb)}</span></span>
      ${on ? `<button data-repeal="${d.id}" class="${armedRepeal === d.id ? "danger" : ""}">${armedRepeal === d.id ? "정말 폐지? (되살리려면 180일)" : "폐지"}</button>` : researching ? `<span class="mu">연구 중</span>` : `<button data-start="${d.id}" ${canStart && !busy ? "" : "disabled"} title="${canStart ? `${EDICT_RESEARCH_DAYS}일 걸립니다` : e.researching ? "다른 법령을 연구 중입니다" : "슬롯이 가득 찼습니다. 하나를 폐지해야 합니다"}">연구 시작</button>`}</h3>
      <ul>${d.gains.map((g) => `<li class="g">${esc(g)}</li>`).join("")}${d.costs.map((c) => `<li class="c">${esc(c)}</li>`).join("")}</ul>
      <div class="num">${esc(n.gain)} ${esc(n.cost)}</div></div>`;
  }).join("");
  html += `<p class="note" style="margin:8px 0 0">연구는 ${EDICT_RESEARCH_DAYS}일(2턴) 걸리고 법령은 ${EDICT_SLOTS}개까지만 시행할 수 있습니다. 폐지한 법령을 되살리려면 다시 연구해야 합니다.</p>`;
  el.innerHTML = html;
  el.querySelectorAll<HTMLButtonElement>("button[data-start]").forEach((b) => b.addEventListener("click", () => { startEdict(world, "player", b.dataset.start!); onOrdersChanged(); }));
  el.querySelectorAll<HTMLButtonElement>("button[data-repeal]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.repeal!;
      if (armedRepeal !== id) {
        armedRepeal = id;
        if (armedTimer) clearTimeout(armedTimer);
        armedTimer = setTimeout(() => {
          armedRepeal = null;
          renderEdicts();
        }, 4000);
        renderEdicts();
        return;
      }
      armedRepeal = null;
      if (armedTimer) clearTimeout(armedTimer);
      repealEdict(world, "player", id);
      onOrdersChanged();
    }),
  );
  const c = document.getElementById("ed-cancel");
  if (c) c.addEventListener("click", () => { cancelEdictResearch(world, "player"); onOrdersChanged(); });
}

function renderAdvice() {
  $("advice").innerHTML = advise(world, preview)
    .map((a) => `<li class="${a.level}"><b>${esc(a.title)}</b><span>${esc(a.text)}</span></li>`)
    .join("");
}

function renderTimers() {
  const t = turnOf(world.day);
  const list = timersOf(world, preview, 2);
  const el = $("timers");
  if (list.length === 0) {
    el.innerHTML = `<li><span class="mu">지금 예정된 일은 없습니다.</span></li>`;
    return;
  }
  el.innerHTML = list
    .map((x) => {
      const d = x.day - world.day;
      const inThis = x.day < t.endDay;
      const when = d <= 0 ? "지금" : `D+${d}`;
      const sub = inThis ? "이번 계절" : "다음 계절";
      return `<li class="${x.level ? `t-${x.level}` : ""} ${inThis ? "" : "next-turn"}"><span class="when"><b>${when}</b>${sub}</span><span class="what"><b>${esc(x.title)}</b><span>${esc(x.detail)}</span></span></li>`;
    })
    .join("");
}

function renderSector() {
  const el = $("sector");
  if (selected === null) {
    el.innerHTML = `<p class="mu" style="margin:0">지도에서 <b>전선의 점</b>을 누르거나 끌어 보세요. 끌면 그 구간과 이웃 구간의 명령선이 함께 움직이고, 병력이 거기에 몰립니다. 점을 두 번 누르면 그 점의 명령이 취소됩니다. 점을 선택하면 그 구간에 요새와 도로를 지을 수 있습니다.</p>${buildListHtml()}`;
    bindCancel(el);
    return;
  }
  const war = world.war!;
  const pr = computePressure(world);
  const i = selected;
  const roads = roadFalloffMultipliers(world);
  const forts = fortMultipliers(world);
  const supP = supplyMultipliers(war.front, war.capitals.player.x, roads.player.map((m) => m * player().rules.supplyFalloffMult))[i]!;
  const supR = supplyMultipliers(war.front, war.capitals.rival.x, roads.rival.map((m) => m * rival().rules.supplyFalloffMult))[i]!;
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
      ${forts.player[i]! > 1.005 || forts.rival[i]! > 1.005 ? `<dt>요새 효과</dt><dd>우리 ×${fmt(forts.player[i]!, 2)} · 적 ×${fmt(forts.rival[i]!, 2)}</dd>` : ""}
      <dt>명령선</dt><dd>${Math.abs(ahead) < 0.05 ? "현재 전선 유지" : `${ahead > 0 ? "앞으로" : "뒤로"} ${fmt(Math.abs(ahead), 1)}km`}</dd>
      <dt>이번 계절 예상</dt><dd class="${shiftKm > 0.05 ? "good" : shiftKm < -0.05 ? "bad" : ""}">${Math.abs(shiftKm) < 0.05 ? "움직임 없음" : `${shiftKm > 0 ? "전진" : "후퇴"} ${fmt(Math.abs(shiftKm), 1)}km`}</dd>
    </dl>
    <div class="row" style="margin-top:8px">
      <button id="sec-back">← 뒤로 12</button><button id="sec-fwd">앞으로 12 →</button><button id="sec-clear">명령 취소</button>
    </div>
    ${buildHtml(i)}
    <p class="note" style="margin:6px 0 0">밀도 차이가 +이면 우리가 밀고, −이면 밀립니다. 명령선보다 앞으로는 나아가지 못합니다. 수도에서 멀수록 보급 배율이 떨어집니다.</p>`;
  $("sec-back").onclick = () => map.nudge(i, -12);
  $("sec-fwd").onclick = () => map.nudge(i, 12);
  el.querySelectorAll<HTMLButtonElement>("button[data-build]").forEach((b) => b.addEventListener("click", () => {
    const r = startBuild(world, "player", b.dataset.build as "fort" | "road", i);
    if (r.ok) onOrdersChanged();
  }));
  bindCancel(el);
  $("sec-clear").onclick = () => {
    setOrder(world, i, war.front[i]!);
    onOrdersChanged();
  };
}

function buildListHtml(): string {
  const mine = world.war!.structures.filter((s) => s.realm === "player");
  if (mine.length === 0) return "";
  return `<ul class="blist">${mine
    .map((s) => `<li>${KIND_NAME[s.kind]} · 구간 ${s.sector + 1} · ${s.done ? "완공" : `공사 ${s.progressDays}/${s.totalDays}일`}${s.done ? "" : ` <button data-cancel="${s.id}" class="mini">취소</button>`}</li>`)
    .join("")}</ul>`;
}

function bindCancel(el: HTMLElement) {
  el.querySelectorAll<HTMLButtonElement>("button[data-cancel]").forEach((b) => b.addEventListener("click", () => {
    const id = Number(b.dataset.cancel);
    const st = world.war!.structures.find((x) => x.id === id);
    if (st && st.progressDays > 0 && b.dataset.armed !== "1") {
      b.dataset.armed = "1";
      b.textContent = `정말? ${st.progressDays}일 분량이 사라짐`;
      b.classList.add("danger");
      return;
    }
    cancelBuild(world, "player", id);
    onOrdersChanged();
  }));
}

/** 선택한 구간의 건설 버튼: 비용(인부·기간)을 보여 주고, 못 짓는 이유는 비활성 버튼 옆에 글로 적는다 */
function buildHtml(i: number): string {
  const season = turnOf(world.day).season;
  const busyField = season === "봄" || season === "가을";
  const rows = (["fort", "road"] as const).map((kind) => {
    const info = buildInfo(kind);
    const can = canBuild(world, "player", kind, i);
    const what = kind === "fort" ? `이 구간 병력 밀도 최대 +${Math.round(FORT_DENSITY_BONUS * 100)}% (전선이 요새에 가까울 때)` : "이 구간 보급이 멀리까지 닿음";
    return `<div class="buildrow"><button data-build="${kind}" ${can.ok ? "" : "disabled"}>${KIND_NAME[kind]} 짓기</button><span class="mu">${what} · 인부 ${fmt(info.workers)}명 · ${info.days}일${can.ok ? "" : ` — <b>${esc(can.reason)}</b>`}</span></div>`;
  });
  return `<div class="builds"><h3>건설</h3>${rows.join("")}${busyField ? `<p class="note warnline">지금은 ${season} — 인부를 빼면 ${season === "봄" ? "파종" : "수확"} 일손이 줄어 곡식을 덜 거둡니다. 여름이나 겨울이 안전합니다.</p>` : ""}${buildListHtml()}</div>`;
}

function renderArmy() {
  const P = player();
  const farmers = popOf(P, "farmer");
  const sold = soldiersOf(P);
  const training = trainingCount(P, world.day);
  const need = P.arableHa / HA_PER_FARMER;
  const gap = need - fieldFarmersAt(P, world.day);
  const cap = (farmers + sold) * 0.4;
  $("army").innerHTML = `<dl class="kv">
      <dt>병력</dt><dd>${fmt(sold)}명${training > 0 ? ` <span class="mu">(훈련 중 ${fmt(training)})</span>` : ""}</dd>
      <dt>농민</dt><dd>${fmt(farmers)}명</dd>
      <dt>농사에 필요한 일손</dt><dd>${fmt(need)}명</dd>
      <dt>일손</dt><dd class="${gap > 0.5 ? "warn" : "good"}">${gap > 0.5 ? `${fmt(gap)}명 부족` : `${fmt(Math.max(0, -gap))}명 여유`}</dd>
      <dt>징집 한도</dt><dd>${fmt(cap)}명</dd>
    </dl>
    <div class="row" style="margin-top:8px">
      <button data-lv="500">+500 징집</button><button data-lv="1000">+1,000 징집</button>
      <button data-lv="-500">−500 해산</button><button data-lv="-1000">−1,000 해산</button>
    </div>
    <p class="note" id="army-note" style="margin:6px 0 0">징집한 농민은 곧바로 농사에서 빠지고 60일 훈련을 받습니다. 훈련 중에는 싸우지 못하고 곡식만 먹습니다. 해산하면 훈련 중인 병사부터 농민으로 돌아갑니다. 적은 우리 병력을 보고 따라 징집합니다.</p>`;
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
  const t = turnOf(world.day);
  const dHa = preview.playerAreaHaDelta;
  const dPct = (dHa / totalAreaHa()) * 100;
  const big = preview.shifts.reduce((m, v, i) => (Math.abs(v) > Math.abs(preview!.shifts[m]!) ? i : m), 0);
  const bigKm = preview.shifts[big]! * UNIT_KM;
  const res = preview.result === "win" ? `<b class="good"> 이대로면 이번 계절에 적 수도가 함락됩니다.</b>` : preview.result === "loss" ? `<b class="bad"> 이대로면 이번 계절에 우리 수도가 함락됩니다.</b>` : "";
  el.style.opacity = previewStale ? "0.5" : "1";
  el.innerHTML = `<b>${t.season} 예상</b> <span class="mu">(${previewStale ? "명령이 바뀌어 다시 계산하는 중… " : ""}적의 반응 포함, 전황 변수 ±12% 불확실)</span>
    영토 <span class="${dHa > 1 ? "good" : dHa < -1 ? "bad" : ""}">${dHa >= 0 ? "+" : ""}${fmt(dHa)}ha (${dPct >= 0 ? "+" : ""}${fmt(dPct, 2)}%p)</span> ·
    우리 병력 ${fmt(soldiersOf(player()))}→${fmt(preview.playerSoldiers)} (전사 약 ${fmt(preview.playerCasualties)}) ·
    적 ${fmt(soldiersOf(rival()))}→${fmt(preview.rivalSoldiers)} (전사 약 ${fmt(preview.rivalCasualties)}) ·
    ${Math.abs(bigKm) < 0.05 ? "전선은 움직이지 않을 전망" : `가장 크게 움직이는 곳 ${sectorName(big)}: ${bigKm > 0 ? "전진" : "후퇴"} ${fmt(Math.abs(bigKm), 1)}km`}${res}`;
}

function turnCardHtml(r: TurnReport): string {
  const dPct = (r.playerAreaHaDelta / totalAreaHa()) * 100;
  const adv = r.bestAdvanceUnits * UNIT_KM;
  const ret = r.worstRetreatUnits * UNIT_KM;
  const moves = [adv >= 0.1 ? `${sectorName(r.bestAdvancePoint)} 전진 ${fmt(adv, 1)}km` : "", ret >= 0.1 ? `${sectorName(r.worstRetreatPoint)} 후퇴 ${fmt(ret, 1)}km` : ""].filter(Boolean).join(", ");
  const front =
    Math.abs(r.playerAreaHaDelta) < 1 && !moves
      ? "전선은 거의 움직이지 않았다."
      : `영토 ${r.playerAreaHaDelta > 0 ? "+" : ""}${fmt(r.playerAreaHaDelta)}ha (${dPct > 0 ? "+" : ""}${fmt(dPct, 2)}%p).${moves ? ` ${moves}.` : ""}${r.villagesDelta !== 0 ? ` <b class="${r.villagesDelta > 0 ? "good" : "bad"}">마을 ${Math.abs(r.villagesDelta)}곳 ${r.villagesDelta > 0 ? "점령" : "상실"}.</b>` : ""}`;
  const army = `우리 ${fmt(r.playerSoldiersStart)}→${fmt(r.playerSoldiersEnd)}명 (전사 ${fmt(r.playerCasualties)}), 적 ${fmt(r.rivalSoldiersStart)}→${fmt(r.rivalSoldiersEnd)}명 (전사 ${fmt(r.rivalCasualties)}).`;
  const seasonal: string[] = [];
  if (r.sowing) seasonal.push(`<b>파종</b> ${fmt(r.sowing.sownHa)}ha를 심었다 (경작지 ${fmt(r.sowing.arableHa)}ha). ${esc(r.sowing.limit)}.`);
  if (r.harvest) {
    const w = r.harvest.weather;
    seasonal.push(
      `<b>수확</b> 순수확 ${fmt(r.harvest.netKg / 1000)}t. 기상 ${fmt(w, 2)}배${w < 0.8 ? " <span class='bad'>(흉년)</span>" : w > 1.1 ? " <span class='good'>(풍년)</span>" : ""}, 일손이 모자라 못 거둔 비율 ${fmt((1 - r.harvest.fraction) * 100, 0)}%.`,
    );
  }
  if (!r.sowing && !r.harvest) seasonal.push(r.season === "겨울" ? "겨울나기. 곡창의 곡식으로 다음 파종까지 버틴다." : "농사에는 이 계절에 큰 일이 없었다.");
  const popD = r.popEnd - r.popStart;
  const food = `인구 ${fmt(r.popStart)}→${fmt(r.popEnd)}명 (${popD >= 0 ? "+" : ""}${fmt(popD)}).${r.playerDeficit > 0.02 ? ` <span class="bad">식량 부족 ${fmt(r.playerDeficit * 100, 0)}%.</span>` : ""}`;
  return `<div><h3>전선</h3><p>${front}</p></div><div><h3>병력</h3><p>${army}</p></div><div><h3>계절의 일</h3><p>${seasonal.join(" ")}</p></div><div><h3>인구와 식량</h3><p>${food}</p></div>`;
}

function renderReports() {
  const rs = [...world.war!.reports].reverse();
  const latest = rs[0];
  $("turncard-title").textContent = latest ? `지난 계절 결과 — ${latest.year + 1}년차 ${latest.season}` : "지난 계절 결과";
  $("turncard").innerHTML = latest ? turnCardHtml(latest) : `<p class="mu" style="grid-column:1/-1;margin:0">아직 한 계절도 지나지 않았습니다. 명령을 내리고 <b>진행 ▶</b>을 눌러 보세요.</p>`;
  $("reports").innerHTML = rs
    .slice(1, 9)
    .map((r) => {
      const dPct = (r.playerAreaHaDelta / totalAreaHa()) * 100;
      return `<li><time>${r.year + 1}년차 ${r.season}</time><span>영토 ${r.playerAreaHaDelta > 0 ? "+" : ""}${fmt(dPct, 2)}%p${r.villagesDelta !== 0 ? ` · 마을 ${Math.abs(r.villagesDelta)}곳 ${r.villagesDelta > 0 ? "점령" : "상실"}` : ""} · 전사 우리 ${fmt(r.playerCasualties)} / 적 ${fmt(r.rivalCasualties)}${r.harvest ? ` · 수확 ${fmt(r.harvest.netKg / 1000)}t` : ""}</span></li>`;
    })
    .join("");
}

function renderResult() {
  const war = world.war!;
  const ov = $("overlay");
  if (!war.result) {
    ov.hidden = true;
    return;
  }
  const win = war.result === "win";
  const turns = Math.round(world.day / TURN_DAYS);
  ov.hidden = false;
  $("overlay-card").innerHTML = `<h2 class="${win ? "good" : "bad"}">${win ? "승리 — 적 수도 함락" : "패배 — 수도 함락"}</h2>
    <p>${turns}턴(${(turns / 4).toFixed(1)}년) 만에 ${win ? "적의 수도를 함락했습니다" : "수도를 잃었습니다"}.</p>
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

function renderButtons() {
  const t = turnOf(world.day);
  const btn = $("btn-next") as HTMLButtonElement;
  btn.disabled = !!world.war!.result;
  btn.textContent = busy ? "건너뛰기 ⏭" : `${t.season} 진행 ▶`;
  btn.title = busy ? "결과를 바로 보기 (Space)" : `이 명령으로 ${t.season} 90일을 진행합니다 (Space)`;
  $("btn-auto").setAttribute("aria-pressed", String(auto));
  ($("btn-reset-orders") as HTMLButtonElement).disabled = busy;
  ($("btn-new") as HTMLButtonElement).disabled = busy;
}

function renderAll() {
  renderTop();
  renderTimeline();
  renderSeasonNote();
  renderEdicts();
  renderAdvice();
  renderTimers();
  renderSector();
  renderArmy();
  renderPreview();
  renderReports();
  renderResult();
  map.draw(selected, preview);
  if (ecoOpen) renderSummary();
  renderButtons();
}

/* ------------------------------------------------------------------ */
/* 입력과 턴 진행                                                      */
/* ------------------------------------------------------------------ */
let previewTimer: ReturnType<typeof setTimeout> | undefined;
function onOrdersChanged() {
  // 끌고 있는 동안에는 낡은 예상을 흐리게 보여 주고, 멈춘 뒤 한 번만 다시 계산한다
  if (busy) return;
  previewStale = true;
  renderAll();
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    if (busy) return;
    refreshPreview();
    previewStale = false;
    renderAll();
  }, 220);
}

/** 한 턴(계절)을 진행한다. 진행 중에 다시 누르면 결과를 바로 보여 준다. */
function nextTurn() {
  if (world.war!.result) return;
  if (busy) {
    skip = true;
    return;
  }
  busy = true;
  skip = false;
  $("hint").hidden = true;
  preview = null;
  const endDay = turnOf(world.day).endDay;
  renderButtons();
  const tick = () => {
    const remaining = endDay - world.day;
    const stepped = step(world, skip ? remaining : Math.min(2, remaining));
    map.draw(selected, null);
    renderTop();
    renderTimeline();
    const done = world.day >= endDay || world.war!.result || stepped === 0;
    if (!done) {
      setTimeout(tick, 22);
      return;
    }
    busy = false;
    skip = false;
    refreshPreview();
    renderAll();
    if (auto && !world.war!.result) {
      const danger = advise(world, preview).some((a) => a.level === "danger");
      if (danger) {
        auto = false;
        renderAll();
      } else setTimeout(nextTurn, 700);
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
  document.addEventListener("keydown", (ev) => {
    const tag = (ev.target as HTMLElement).tagName;
    if (ev.code === "Space" && tag !== "BUTTON" && tag !== "INPUT" && tag !== "SUMMARY") {
      ev.preventDefault();
      nextTurn();
    }
  });
  $("btn-next").addEventListener("click", nextTurn);
  $("btn-auto").addEventListener("click", () => {
    auto = !auto;
    renderAll();
    if (auto && !busy) nextTurn();
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
