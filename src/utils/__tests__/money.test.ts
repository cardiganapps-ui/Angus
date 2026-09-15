import { describe, expect, it } from "vitest";
import {
  formatMXN,
  formatMXNShortSigned,
  formatMXNShort,
  fromCents,
  remainder,
  splitEvenly,
  subtractMoney,
  sumMoney,
  toCents
} from "../money";

describe("money", () => {
  it("sums without float drift", () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney([1500.55, 2300.45, 99.99])).toBe(3900.99);
    expect(sumMoney([])).toBe(0);
  });

  it("subtracts without float drift", () => {
    expect(subtractMoney(0.3, 0.1)).toBe(0.2);
    expect(subtractMoney(100, 129.5)).toBe(-29.5);
  });

  it("remainder never goes negative", () => {
    expect(remainder(1000, 300)).toBe(700);
    expect(remainder(1000, 1000)).toBe(0);
    expect(remainder(1000, 1500)).toBe(0);
  });

  it("splits evenly and the parts add back to the total", () => {
    const parts = splitEvenly(1000, 3);
    expect(parts).toEqual([333.34, 333.33, 333.33]);
    expect(sumMoney(parts)).toBe(1000);

    expect(sumMoney(splitEvenly(8500, 7))).toBe(8500);
    expect(splitEvenly(500, 1)).toEqual([500]);
    expect(splitEvenly(500, 0)).toEqual([]);
  });

  it("round-trips cents", () => {
    expect(fromCents(toCents(1234.56))).toBe(1234.56);
    expect(toCents(0.145)).toBe(15); // half-up at the cent
  });

  it("formats MXN", () => {
    expect(formatMXN(1234.5)).toBe("$1,234.50");
    expect(formatMXNShort(1234.5)).toBe("$1,235");
    expect(formatMXNShort(0)).toBe("$0");
  });

  it("puts the minus sign outside the currency symbol", () => {
    expect(formatMXNShortSigned(-3300)).toBe("-$3,300");
    expect(formatMXNShortSigned(3300)).toBe("$3,300");
    expect(formatMXNShortSigned(0)).toBe("$0");
    expect(formatMXNShortSigned(-0.4)).toBe("$0");
  });
});
