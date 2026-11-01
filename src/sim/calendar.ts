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
