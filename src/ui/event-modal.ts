import { dominatedOptions } from "../sim/quality";
import { SCENARIOS, resolveEvent } from "../sim/world";
import type { PendingEvent, World } from "../sim/world";
import { $, dateText, esc, fmt, tons } from "./economy-panel";

/* ------------------------------------------------------------------ */
/* 사건 창                                                             */
/* ------------------------------------------------------------------ */
export function renderModal(world: World, onResolved: () => void, onOpen: () => void) {
  const modal = $("modal");
  const p = world.pending;
  if (!p) {
    modal.hidden = true;
    return;
  }
  if (!modal.hidden && modal.dataset.key === `${p.eventId}:${p.day}`) return; // 이미 그림
  modal.hidden = false;
  modal.dataset.key = `${p.eventId}:${p.day}`;
  onOpen();
  $("modal-card").innerHTML = modalHtml(p);
  $("modal-card")
    .querySelectorAll<HTMLButtonElement>("button[data-opt]")
    .forEach((b) =>
      b.addEventListener("click", () => {
        resolveEvent(world, b.dataset.opt!);
        modal.hidden = true;
        modal.dataset.key = "";
        onResolved();
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

