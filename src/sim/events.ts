import type { Checkpoint, Region, World } from "./state";

/**
 * 이벤트 정의. 원칙 0: 개수가 아니라 깊이.
 *
 * - 이벤트는 시뮬레이션 상태가 조건을 넘을 때만 발생한다 (달력에 박힌 사건이 아니다).
 * - 선택지는 모델의 값을 실제로 바꾼다. 각 선택지의 결과는 world.ts가 모델을 복제해 돌려 계산한다.
 * - 본문의 숫자는 모두 그 순간의 상태에서 계산한다.
 * - 선택지가 가짜(다른 선택지에 일방적으로 밀림)가 아님을 quality.ts의 검사가 시험으로 강제한다.
 */
export interface EventOption {
  id: string;
  label: string;
  /** 모델에 실제로 일어나는 변화를 적용한다 */
  apply: (w: World, r: Region) => void;
  /** 기록에 남길 문장 */
  logText: (w: World, r: Region) => string;
}

export interface EventDef {
  id: string;
  title: string;
  /** 선택지 결과를 보여줄 시점들 (결정 후 일수). 마지막 값이 예측 지평이다. */
  checkpoints: Checkpoint[];
  check: (w: World, r: Region) => boolean;
  text: (w: World, r: Region) => string;
  options: (w: World, r: Region) => EventOption[];
}

/**
 * 출시된 이벤트. 현재 0개다.
 * 지금 모델에는 서로 경쟁하는 목표가 없어서(식량 수지 하나뿐) 진짜 딜레마를 만들 수 없었다.
 * 시험으로 폐기 근거를 확인했다: docs/MODEL.md "폐기한 이벤트", src/sim/fixtures/rejected-events.ts.
 * M2에서 계층별 이해관계, 세금, 교역이 들어오면 첫 이벤트를 만든다.
 */
export const EVENTS: EventDef[] = [];
