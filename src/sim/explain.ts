/**
 * 설명 가능한 값. 제1원칙: 모든 파생 값은 "왜 이 값인가"를 함께 가진다.
 * terms는 계산에 들어간 항목이고, formula는 그 항목들이 value가 되는 식이다.
 */
export interface Term {
  label: string;
  value: number;
  unit: string;
  note?: string;
}

export interface Explained {
  label: string;
  value: number;
  unit: string;
  formula: string;
  terms: Term[];
}
