/**
 * 지도 화면. 곡선 전선과 두 영토, 병력 밀도, 명령선을 그리고, 전선의 점을 끌어 명령한다.
 * 원칙 0-2: 지도가 화면의 중심이고, 조작은 지도 위에서 직접 한다.
 */
import { MAP_H, MAP_W, UNIT_KM } from "../sim/constants";
import { VILLAGES, computePressure, frontY, sampleFront } from "../sim/war";
import { popOf, totalPop } from "../sim/state";
import { setOrder } from "../sim/world";
import type { MonthPreview, World } from "../sim/world";

const SIGMA = 1.4; // 끌 때 이웃 점이 따라오는 정도(점 개수 단위)
const HIT_PX = 20;
const PAD = 18; // 지도 위아래 여백(px). 전선 양 끝 점이 잘리지 않게 한다.

export interface MapHooks {
  onSelect: (i: number | null) => void;
  onOrdersChanged: () => void;
}

export interface MapView {
  draw: (selected: number | null, preview: MonthPreview | null) => void;
  /** 선택한 점의 명령선을 키보드로 움직인다 */
  nudge: (i: number, dx: number) => void;
}

const css = (name: string, fallback: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export function createMap(canvas: HTMLCanvasElement, getWorld: () => World, hooks: MapHooks): MapView {
  const ctx = canvas.getContext("2d")!;
  let selected: number | null = null;
  let lastPreview: MonthPreview | null = null;
  let dragging: number | null = null;
  let snapshot: number[] = [];
  let hover: number | null = null;

  const scaleOf = () => canvas.clientWidth / MAP_W;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = (w * MAP_H) / MAP_W + PAD * 2;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    redraw();
  }
  new ResizeObserver(resize).observe(canvas);

  function toMap(ev: MouseEvent): { x: number; y: number } {
    const r = canvas.getBoundingClientRect();
    const k = r.width / MAP_W;
    return { x: (ev.clientX - r.left) / k, y: (ev.clientY - r.top - PAD) / k };
  }

  function hit(p: { x: number; y: number }): number | null {
    const w = getWorld();
    const front = w.war!.front;
    const k = scaleOf();
    let best: number | null = null;
    let bd = HIT_PX / k;
    front.forEach((x, i) => {
      const d = Math.hypot(x - p.x, frontY(i) - p.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  function applyDrag(i: number, targetX: number) {
    const w = getWorld();
    const delta = targetX - snapshot[i]!;
    for (let j = 0; j < snapshot.length; j++) {
      const f = Math.exp(-(((j - i) / SIGMA) ** 2));
      setOrder(w, j, snapshot[j]! + delta * f);
    }
  }

  canvas.addEventListener("pointerdown", (ev) => {
    const i = hit(toMap(ev));
    selected = i;
    hooks.onSelect(i);
    if (i !== null) {
      dragging = i;
      snapshot = [...getWorld().war!.orders.player];
      canvas.setPointerCapture(ev.pointerId);
      canvas.style.cursor = "grabbing";
    }
    redraw();
  });
  canvas.addEventListener("pointermove", (ev) => {
    const p = toMap(ev);
    if (dragging !== null) {
      applyDrag(dragging, p.x);
      hooks.onOrdersChanged();
      return;
    }
    const h = hit(p);
    if (h !== hover) {
      hover = h;
      canvas.style.cursor = h === null ? "default" : "grab";
      redraw();
    }
  });
  const end = (ev: PointerEvent) => {
    if (dragging !== null) {
      dragging = null;
      canvas.releasePointerCapture(ev.pointerId);
      canvas.style.cursor = hover === null ? "default" : "grab";
      hooks.onOrdersChanged();
    }
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("dblclick", (ev) => {
    const i = hit(toMap(ev));
    if (i === null) return;
    const w = getWorld();
    setOrder(w, i, w.war!.front[i]!);
    hooks.onOrdersChanged();
  });

  function nudge(i: number, dx: number) {
    const w = getWorld();
    snapshot = [...w.war!.orders.player];
    applyDrag(i, snapshot[i]! + dx);
    hooks.onOrdersChanged();
  }

  let rafPending = false;
  function redraw() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      paint();
    });
  }

  function paint() {
    const w = getWorld();
    const war = w.war!;
    const dpr = window.devicePixelRatio || 1;
    const k = scaleOf() * dpr;
    const colP = css("--a", "#1f64d6");
    const colR = css("--rv", "#d63658");
    const ink = css("--fg", "#12202c");
    const land = css("--land", "#dfe7e2");
    const grid = css("--grid", "rgba(0,0,0,.08)");
    const panel = css("--panel", "#fff");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = css("--bg", "#e9eef2");
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(k, 0, 0, k, 0, PAD * dpr);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, MAP_W, MAP_H);
    ctx.clip();

    // 바탕과 격자
    ctx.fillStyle = land;
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1 / k;
    for (let x = 100; x < MAP_W; x += 100) line(x, 0, x, MAP_H);
    for (let y = 100; y < MAP_H; y += 100) line(0, y, MAP_W, y);

    // 영토
    const pts = sampleFront(war.front);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(pts[0]!.x, 0);
    pts.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(0, MAP_H);
    ctx.closePath();
    ctx.globalAlpha = 0.17;
    ctx.fillStyle = colP;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(MAP_W, 0);
    ctx.lineTo(pts[0]!.x, 0);
    pts.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(MAP_W, MAP_H);
    ctx.closePath();
    ctx.fillStyle = colR;
    ctx.fill();
    ctx.globalAlpha = 1;

    // 마을: 크기는 그 쪽 주민 수를 마을 수로 나눈 값에 비례한다
    {
      const P = w.regions.find((r) => r.id === war.playerRegionId)!;
      const R = w.regions.find((r) => r.id === war.rivalRegionId)!;
      const mine = VILLAGES.filter((v) => v.x < xAt(pts, v.y));
      const theirs = VILLAGES.length - mine.length;
      const perP = (totalPop(P) - popOf(P, "soldier")) / Math.max(1, mine.length);
      const perR = (totalPop(R) - popOf(R, "soldier")) / Math.max(1, theirs);
      for (const v of VILLAGES) {
        const isMine = v.x < xAt(pts, v.y);
        const per = isMine ? perP : perR;
        const r = (2 + 2.6 * Math.sqrt(per / 260)) ;
        ctx.beginPath();
        ctx.arc(v.x, v.y, Math.min(9, r), 0, Math.PI * 2);
        ctx.fillStyle = isMine ? colP : colR;
        ctx.globalAlpha = 0.5;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // 예상 전선(이번 달 끝)
    if (lastPreview) {
      const pp = sampleFront(lastPreview.front);
      ctx.beginPath();
      pp.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.setLineDash([7 / k, 6 / k]);
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2 / k;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // 밀도 막대
    const pr = computePressure(w);
    const barScale = 2.2; // 명/km → 지도 단위
    war.front.forEach((x, i) => {
      const y = frontY(i);
      const dp = Math.min(150, pr.playerDensity[i]! * barScale);
      const dr = Math.min(150, pr.rivalDensity[i]! * barScale);
      ctx.fillStyle = colP;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x - 5 - dp, y - 5, dp, 10);
      ctx.fillStyle = colR;
      ctx.fillRect(x + 5, y - 5, dr, 10);
      ctx.globalAlpha = 1;
    });

    // 적의 명령선(의도): 적이 앞으로 내미는 곳
    war.front.forEach((x, i) => {
      const o = war.orders.rival[i]!;
      if (x - o > 6) arrow(x, frontY(i) + 12, o, frontY(i) + 12, colR, 2 / k, k);
    });

    // 플레이어 명령선
    const diff = war.orders.player.some((o, i) => Math.abs(o - war.front[i]!) > 3);
    if (diff) {
      const op = sampleFront(war.orders.player);
      ctx.beginPath();
      op.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.setLineDash([3 / k, 5 / k]);
      ctx.strokeStyle = colP;
      ctx.lineWidth = 2 / k;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    war.orders.player.forEach((o, i) => {
      const x = war.front[i]!;
      if (Math.abs(o - x) > 3) {
        arrow(x, frontY(i) - 12, o, frontY(i) - 12, colP, 2.4 / k, k);
        ctx.beginPath();
        ctx.arc(o, frontY(i), 5 / k, 0, Math.PI * 2);
        ctx.fillStyle = panel;
        ctx.fill();
        ctx.strokeStyle = colP;
        ctx.lineWidth = 2 / k;
        ctx.stroke();
      }
    });

    // 전선
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3.2 / k;
    ctx.lineJoin = "round";
    ctx.stroke();

    // 제어점
    war.front.forEach((x, i) => {
      const y = frontY(i);
      const sel = selected === i;
      const hov = hover === i;
      ctx.beginPath();
      ctx.arc(x, y, (sel ? 9 : hov ? 8 : 6) / k, 0, Math.PI * 2);
      ctx.fillStyle = sel ? css("--hot", "#e0a100") : panel;
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2 / k;
      ctx.stroke();
    });

    // 수도
    for (const [name, c, col] of [["우리 수도", war.capitals.player, colP], ["적 수도", war.capitals.rival, colR]] as const) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = col;
      ctx.fillRect(-8 / k, -8 / k, 16 / k, 16 / k);
      ctx.strokeStyle = panel;
      ctx.lineWidth = 2 / k;
      ctx.strokeRect(-8 / k, -8 / k, 16 / k, 16 / k);
      ctx.restore();
      ctx.fillStyle = ink;
      ctx.font = `${12 / k}px "Noto Sans KR", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(name, c.x, c.y + 26 / k);
    }

    // 축척
    const km10 = 10 / UNIT_KM;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2 / k;
    line(24, MAP_H - 24, 24 + km10, MAP_H - 24);
    line(24, MAP_H - 29, 24, MAP_H - 19);
    line(24 + km10, MAP_H - 29, 24 + km10, MAP_H - 19);
    ctx.fillStyle = ink;
    ctx.font = `${11 / k}px "IBM Plex Mono", monospace`;
    ctx.textAlign = "left";
    ctx.fillText("10 km", 24, MAP_H - 34);
    ctx.restore();
  }

  function xAt(pts: { x: number; y: number }[], y: number): number {
    const idx = Math.min(pts.length - 2, Math.max(0, Math.floor((y / MAP_H) * (pts.length - 1))));
    const a = pts[idx]!, b = pts[idx + 1]!;
    const t = (y - a.y) / Math.max(1e-9, b.y - a.y);
    return a.x + t * (b.x - a.x);
  }

  function line(x1: number, y1: number, x2: number, y2: number) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function arrow(x1: number, y1: number, x2: number, y2: number, color: string, lw: number, k: number) {
    const head = 7 / k;
    const dir = Math.sign(x2 - x1) || 1;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lw;
    line(x1, y1, x2 - dir * head, y2);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - dir * head, y2 - head * 0.6);
    ctx.lineTo(x2 - dir * head, y2 + head * 0.6);
    ctx.closePath();
    ctx.fill();
  }

  resize();
  return {
    draw(sel, preview) {
      selected = sel;
      lastPreview = preview;
      redraw();
    },
    nudge,
  };
}
