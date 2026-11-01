/**
 * 지도 화면. 곡선 전선과 두 영토, 병력 밀도, 명령선을 그리고, 전선의 점을 끌어 명령한다.
 * 원칙 0-2: 지도가 화면의 중심이고, 조작은 지도 위에서 직접 한다.
 */
import { MAP_H, MAP_W, UNIT_KM } from "../sim/constants";
import { VILLAGES, computePressure, frontY, sampleFront, trainingCount } from "../sim/war";
import { popOf, totalPop } from "../sim/state";
import { COMMAND_ZONES } from "../sim/constants";
import { TRAIT_NAME, ZONE_NAME, levelOf } from "../sim/commanders";
import { TERRAIN, TIDE_NAME, tideLevel } from "../sim/terrain";
import { seasonIndexOf } from "../sim/state";
import { fortController } from "../sim/structures";
import { setOrder } from "../sim/world";
import type { TurnPreview, World } from "../sim/world";

const SIGMA = 1.4; // 끌 때 이웃 점이 따라오는 정도(점 개수 단위)
const HIT_PX = 20;
const PAD = 18; // 지도 위아래 여백(px). 전선 양 끝 점이 잘리지 않게 한다.

export interface MapHooks {
  onSelect: (i: number | null) => void;
  onOrdersChanged: () => void;
}

export interface MapView {
  draw: (selected: number | null, preview: TurnPreview | null) => void;
  /** 선택한 점의 명령선을 키보드로 움직인다 */
  nudge: (i: number, dx: number) => void;
}

const css = (name: string, fallback: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export function createMap(canvas: HTMLCanvasElement, getWorld: () => World, hooks: MapHooks): MapView {
  const ctx = canvas.getContext("2d")!;
  let selected: number | null = null;
  let lastPreview: TurnPreview | null = null;
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
    paint(); // 크기를 바꾸면 캔버스가 비워지므로, 한 프레임도 비지 않게 곧바로 그린다
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

    // 지형: 갯벌은 수위만큼 물빛이 진해지고, 능선은 빗금과 이름표로 보인다
    {
      const lvl = tideLevel(w.day);
      const water = css("--water", "#3d8fb5");
      for (const f of TERRAIN) {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(f.cx, f.cy, f.rx, f.ry, 0, 0, Math.PI * 2);
        ctx.clip();
        if (f.kind === "tidalflat") {
          ctx.fillStyle = water;
          ctx.globalAlpha = 0.12 + 0.38 * lvl;
          ctx.fillRect(f.cx - f.rx, f.cy - f.ry, f.rx * 2, f.ry * 2);
          ctx.globalAlpha = 0.28 * (1 - lvl) + 0.06;
          ctx.strokeStyle = water;
          ctx.lineWidth = 1.2 / k;
          for (let d = -f.ry; d < f.ry; d += 9) line(f.cx - f.rx, f.cy + d, f.cx + f.rx, f.cy + d + 6);
        } else {
          ctx.globalAlpha = 0.18;
          ctx.strokeStyle = ink;
          ctx.lineWidth = 1.4 / k;
          for (let d = -f.rx - f.ry; d < f.rx + f.ry; d += 11) line(f.cx - f.rx + d, f.cy - f.ry, f.cx + f.rx + d - f.ry * 0.0, f.cy + f.ry);
        }
        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.ellipse(f.cx, f.cy, f.rx, f.ry, 0, 0, Math.PI * 2);
        ctx.setLineDash([4 / k, 5 / k]);
        ctx.strokeStyle = f.kind === "tidalflat" ? water : ink;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1.5 / k;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.fillStyle = f.kind === "tidalflat" ? water : ink;
        ctx.font = `${11 / k}px "Noto Sans KR", system-ui, sans-serif`;
        ctx.textAlign = "center";
        const label = f.kind === "tidalflat" ? `${f.name} · ${TIDE_NAME[seasonIndexOf(w.day)]}` : f.name;
        const lw = ctx.measureText(label).width;
        const lx = f.kind === "tidalflat" ? f.cx - 95 : f.cx; // 갯벌 이름표는 전선(x≈500)을 피해 왼쪽에
        const ly = f.kind === "tidalflat" ? f.cy - 50 : f.cy + 4;
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = panel;
        ctx.fillRect(lx - lw / 2 - 4 / k, ly - 11 / k, lw + 8 / k, 16 / k);
        ctx.globalAlpha = 1;
        ctx.fillStyle = f.kind === "tidalflat" ? water : ink;
        ctx.fillText(label, lx, ly);
      }
    }

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
    // 지휘 구간: 경계 눈금과 이름표(지휘관, 성향, 계급). 비어 있으면 "배치 가능"을 표시한다
    COMMAND_ZONES.forEach(([a, b], z) => {
      const y0 = frontY(a) - (a === 0 ? 0 : 20), y1 = frontY(b) + (b === 16 ? 0 : 20);
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1.5 / k;
      line(10, y0 + 4 / k, 10, y1 - 4 / k);
      ctx.globalAlpha = 1;
      const mine = war.commanders.filter((c) => c.realm === "player" && (c.toZone ?? c.zone) === z)[0];
      const label = mine
        ? mine.toZone !== null
          ? `${ZONE_NAME[z]} · ${mine.name} 이동 중 ${mine.arriveDay - w.day}일`
          : `${ZONE_NAME[z]} · ${mine.name}(${TRAIT_NAME[mine.trait]} ${levelOf(mine)}급)`
        : `${ZONE_NAME[z]} · 지휘관 없음`;
      ctx.font = `${11 / k}px "Noto Sans KR", system-ui, sans-serif`;
      ctx.textAlign = "left";
      const tw = ctx.measureText(label).width;
      const ly = y0 + 16 / k; // 구간 위쪽에 둔다 (수도 이름표와 겹치지 않게)
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = panel;
      ctx.fillRect(14, ly - 9 / k, tw + 10 / k, 16 / k);
      ctx.globalAlpha = 1;
      ctx.fillStyle = mine ? colP : ink;
      ctx.fillText(label, 14 + 5 / k, ly + 3.5 / k);
    });

    // 건설: 도로는 수도에서 그 구간까지 선, 요새는 전선 뒤(앞) 네모. 공사 중이면 점선과 진행 막대
    for (const st of war.structures) {
      const mine = st.realm === "player";
      const col = mine ? colP : colR;
      const y = frontY(st.sector);
      const prog = st.progressDays / st.totalDays;
      if (st.kind === "road") {
        const c = war.capitals[st.realm];
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(war.front[st.sector]!, y);
        ctx.strokeStyle = col;
        ctx.lineWidth = (st.done ? 4 : 3) / k;
        ctx.globalAlpha = st.done ? 0.55 : 0.8;
        ctx.setLineDash(st.done ? [] : [2 / k, 7 / k]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        if (!st.done) {
          ctx.fillStyle = col;
          ctx.font = `${10 / k}px "IBM Plex Mono", monospace`;
          ctx.textAlign = "center";
          ctx.fillText(`도로 ${Math.round(prog * 100)}%`, (c.x + war.front[st.sector]!) / 2, (c.y + y) / 2 - 7 / k);
        }
      } else {
        const owner = st.done ? fortController(w, st) : st.realm;
        const oc = owner === "player" ? colP : colR;
        const s = 9 / k;
        ctx.beginPath();
        ctx.rect(st.x - s, y - s, s * 2, s * 2);
        if (st.done) {
          ctx.fillStyle = oc;
          ctx.fill();
          ctx.strokeStyle = panel;
          ctx.lineWidth = 2 / k;
          ctx.stroke();
          if (owner !== st.realm) {
            ctx.fillStyle = panel;
            ctx.font = `bold ${11 / k}px "Noto Sans KR", sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText("!", st.x, y + 4 / k);
          }
        } else {
          ctx.fillStyle = panel;
          ctx.fill();
          ctx.setLineDash([3 / k, 3 / k]);
          ctx.strokeStyle = col;
          ctx.lineWidth = 2 / k;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = col;
          ctx.fillRect(st.x - s, y + s + 3 / k, s * 2 * prog, 4 / k);
          ctx.strokeRect(st.x - s, y + s + 3 / k, s * 2, 4 / k);
        }
      }
    }

    // 훈련 중인 병사: 수도 아래에 진행 상황을 보여 준다
    {
      const P = w.regions.find((r) => r.id === war.playerRegionId)!;
      const n = trainingCount(P, w.day);
      if (n > 0) {
        const next = Math.min(...P.trainees.filter((t) => t.readyDay > w.day).map((t) => t.readyDay));
        const c = war.capitals.player;
        ctx.fillStyle = colP;
        ctx.font = `${11 / k}px "IBM Plex Mono", monospace`;
        ctx.textAlign = "center";
        const label = `훈련 ${Math.round(n).toLocaleString("ko-KR")}명 · ${next - w.day}일`;
        // 좁은 화면에서 글자가 지도 밖으로 잘리지 않도록 가운데 위치를 안쪽으로 당긴다
        const half = ctx.measureText(label).width / 2 + 4 / k;
        const lx = Math.max(half, Math.min(MAP_W - half, c.x));
        ctx.fillText(label, lx, c.y + 42 / k);
        const bw = 70 / k;
        ctx.strokeStyle = colP;
        ctx.lineWidth = 1.5 / k;
        ctx.strokeRect(lx - bw / 2, c.y + 47 / k, bw, 5 / k);
        ctx.fillRect(lx - bw / 2, c.y + 47 / k, bw * (1 - (next - w.day) / 60), 5 / k);
      }
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
