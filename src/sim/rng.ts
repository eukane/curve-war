/**
 * 시드 기반 난수. Math.random은 쓰지 않는다 (CLAUDE.md 기술 규칙).
 * 같은 (시드, 부품들)에서는 호출 순서와 무관하게 항상 같은 스트림이 나온다.
 */

function splitmix32(a: number): number {
  a = (a + 0x9e3779b9) | 0;
  let t = a ^ (a >>> 16);
  t = Math.imul(t, 0x21f0aaad);
  t ^= t >>> 15;
  t = Math.imul(t, 0x735a2d97);
  t ^= t >>> 15;
  return t >>> 0;
}

export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = splitmix32(seed | 0);
  }

  /** 시드와 정수 부품(년도, 지역 번호, 용도 번호 등)으로 독립된 스트림을 만든다. */
  static fromParts(seed: number, ...parts: number[]): Rng {
    let h = splitmix32(seed | 0);
    for (const p of parts) h = splitmix32((h ^ (p | 0)) | 0);
    return new Rng(h);
  }

  /** [0, 1) */
  next(): number {
    // mulberry32
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** 표준정규분포 (Box-Muller) */
  normal(): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}
