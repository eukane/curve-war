/**
 * 이벤트 선택지의 품질 검사. 원칙 0: 선택은 세계를 실제로 바꾸고, 가짜 선택지를 만들지 않는다.
 *
 * 한 선택지가 다른 선택지에 "모든 핵심 지표에서 같거나 낫고, 하나 이상에서 확실히 낫다"면
 * 그 선택지는 쓸 이유가 없는 가짜 선택지다 (지배당했다고 부른다).
 * 이 판정은 **모든 시나리오(평년, 흉년 1회)에서 동시에** 성립할 때만 내린다.
 * 한 시나리오에서 지더라도 다른 시나리오에서 이기면 진짜 선택이다(예: 비축은 평년에는 손해, 흉년에는 이득).
 * 단기 이득이 있어도 지평 끝에서 모두 뒤진다면 가짜 딜레마다.
 */
import { SCENARIOS } from "./state";
import type { Metrics, PendingOption } from "./state";

interface Axis {
  name: string;
  /** 클수록 좋게 만든 값 */
  value: (m: Metrics) => number;
}

export const KEY_AXES: Axis[] = [
  { name: "인구", value: (m) => m.pop },
  { name: "기아 사망(적을수록 좋음)", value: (m) => -m.starvationDeaths },
  { name: "곡창 재고", value: (m) => m.granaryKg + m.seedKg },
  { name: "경작지", value: (m) => m.arableHa },
  { name: "최근 수확량", value: (m) => m.lastHarvestKg ?? 0 },
];

/** 상대 차이가 이 값 이하면 같다고 본다 */
const TOL = 0.005;

function cmp(a: number, b: number, scale: number): -1 | 0 | 1 {
  const d = a - b;
  if (Math.abs(d) <= TOL * Math.max(scale, 1)) return 0;
  return d > 0 ? 1 : -1;
}

/** a가 b를 지배하는가 */
export function dominates(a: Metrics, b: Metrics): boolean {
  let strictly = false;
  for (const ax of KEY_AXES) {
    const va = ax.value(a);
    const vb = ax.value(b);
    const c = cmp(va, vb, Math.max(Math.abs(va), Math.abs(vb)));
    if (c < 0) return false;
    if (c > 0) strictly = true;
  }
  return strictly;
}

/** 지평 끝에서 다른 선택지에 지배당하는 선택지의 id들 */
export function dominatedOptions(options: PendingOption[]): { id: string; by: string }[] {
  const out: { id: string; by: string }[] = [];
  for (const b of options) {
    for (const a of options) {
      if (a.id !== b.id && SCENARIOS.every((sc) => dominates(a.outcomes[sc.id].forecast, b.outcomes[sc.id].forecast))) {
        out.push({ id: b.id, by: a.id });
        break;
      }
    }
  }
  return out;
}
