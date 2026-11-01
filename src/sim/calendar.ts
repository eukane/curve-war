/** 달력. 1년 = 12달 × 30일 = 360일 (이 세계의 설정; docs/MODEL.md 참조). */
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;

export type Season = "봄" | "여름" | "가을" | "겨울";

export interface DateParts {
  year: number;
  month: number; // 1..12
  dayOfMonth: number; // 1..30
  dayOfYear: number; // 0..359
  season: Season;
}

export function dateOf(day: number): DateParts {
  const year = Math.floor(day / DAYS_PER_YEAR);
  const dayOfYear = day - year * DAYS_PER_YEAR;
  const month = Math.floor(dayOfYear / DAYS_PER_MONTH) + 1;
  const dayOfMonth = (dayOfYear % DAYS_PER_MONTH) + 1;
  const seasons: Season[] = ["봄", "여름", "가을", "겨울"];
  const season = seasons[Math.floor(dayOfYear / (DAYS_PER_YEAR / 4))] as Season;
  return { year, month, dayOfMonth, dayOfYear, season };
}

/** 한 턴 = 한 계절 = 90일. 시뮬레이션은 일 단위로 돌고, 플레이어의 결정과 보고는 턴 단위다. */
export const TURN_DAYS = DAYS_PER_YEAR / 4;

export interface TurnInfo {
  /** 시작 후 몇 번째 턴인가 (0부터) */
  index: number;
  year: number;
  season: Season;
  /** 계절 번호 0~3 */
  seasonIndex: number;
  /** 이 턴의 첫날(절대 일수) */
  startDay: number;
  /** 이 턴의 다음 날(절대 일수) */
  endDay: number;
  /** 턴 안에서 며칠째인가 (0부터) */
  dayInTurn: number;
}

export function turnOf(day: number): TurnInfo {
  const index = Math.floor(day / TURN_DAYS);
  const seasonIndex = index % 4;
  const seasons: Season[] = ["봄", "여름", "가을", "겨울"];
  return {
    index,
    year: Math.floor(index / 4),
    season: seasons[seasonIndex]!,
    seasonIndex,
    startDay: index * TURN_DAYS,
    endDay: (index + 1) * TURN_DAYS,
    dayInTurn: day - index * TURN_DAYS,
  };
}
