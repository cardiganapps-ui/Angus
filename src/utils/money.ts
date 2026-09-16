/* ── Money primitives ──
   Amounts live as pesos (`number`) in the domain model and as
   numeric(12,2) in Postgres, but ALL arithmetic happens on integer
   cents. Summing floats drifts (0.1 + 0.2 = 0.30000000000000004), and
   a balance that is off by a cent is a balance the owner can't trust.

   Rule: never write `a + b` on two money values — go through here. */

export function toCents(pesos: number): number {
  // `pesos * 100` alone rounds 0.145 DOWN, because the product is
  // 14.499999999999998 in binary floating point. Normalizing at the
  // 4th decimal first restores the half-up behaviour a human expects.
  return Math.round(Number((pesos * 100).toFixed(4)));
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** Sum of money values, exact to the cent. */
export function sumMoney(values: number[]): number {
  return fromCents(values.reduce((total, v) => total + toCents(v), 0));
}

/** a - b, exact to the cent. */
export function subtractMoney(a: number, b: number): number {
  return fromCents(toCents(a) - toCents(b));
}

/** Never-negative difference — for "still owed" style figures. */
export function remainder(total: number, paid: number): number {
  return fromCents(Math.max(0, toCents(total) - toCents(paid)));
}

/** Split `total` into `count` installments that add back up exactly. */
export function splitEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const cents = toCents(total);
  const base = Math.trunc(cents / count);
  const leftover = cents - base * count;
  return Array.from({ length: count }, (_, i) => fromCents(base + (i < leftover ? 1 : 0)));
}

export function formatMXN(value: number): string {
  return `$${value.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Compact form for KPI tiles — "$12,450" (no cents). */
export function formatMXNShort(value: number): string {
  return `$${Math.round(value).toLocaleString("es-MX")}`;
}

/** Compact form that can go negative — "-$3,300", never "$-3,300". */
export function formatMXNShortSigned(value: number): string {
  // `+ 0` normalizes -0 (Math.round(-0.4)), which otherwise formats as "-0".
  const rounded = Math.round(value) + 0;
  return rounded < 0 ? `-${formatMXNShort(-rounded)}` : formatMXNShort(rounded);
}

/* Split `total` across `weights`, keeping their proportions and adding
   back up to exactly `total`.

   `splitEvenly` is right when a plan is being created — there is no shape
   yet. It is wrong when one is being REBUILT: a 30/70 anticipo-and-
   liquidación came back 50/50, silently discarding a split she chose, and
   rebuilding an already-correct plan was not even a no-op. Leftover cents
   go to the EARLIEST entries, same as splitEvenly, so the two agree at
   the boundary. Zero weights have no shape to preserve, so they fall back. */
export function splitProportionally(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const totalCents = toCents(total);
  const w = weights.map(toCents);
  const sum = w.reduce((a, b) => a + b, 0);
  if (sum <= 0) return splitEvenly(total, weights.length);
  const base = w.map((x) => Math.floor((totalCents * x) / sum));
  const leftover = totalCents - base.reduce((a, b) => a + b, 0);
  return base.map((c, i) => fromCents(c + (i < leftover ? 1 : 0)));
}
