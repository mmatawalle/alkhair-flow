import { describe, it, expect } from "vitest";
import { calculateEarnPoints, calculateMemberDiscount, generateLoyaltyToken, normalizePhone, sumLedgerBalance } from "@/lib/loyalty";

describe("calculateEarnPoints", () => {
  const rule = { amount_per_point: 100, min_spend: 0 };

  it("awards 1 point per ₦100 (floor)", () => {
    expect(
      calculateEarnPoints(
        [{ product_id: "a", category: "milkshake", line_total: 250 }],
        rule,
      ).points,
    ).toBe(2);
  });

  it("sums eligible lines before flooring", () => {
    expect(
      calculateEarnPoints(
        [
          { product_id: "a", category: "x", line_total: 60 },
          { product_id: "b", category: "y", line_total: 60 },
        ],
        rule,
      ).points,
    ).toBe(1);
  });

  it("excludes products and categories", () => {
    const res = calculateEarnPoints(
      [
        { product_id: "excluded", category: "x", line_total: 1000 },
        { product_id: "b", category: "no-points", line_total: 1000 },
        { product_id: "c", category: "ok", line_total: 250 },
      ],
      rule,
      new Set(["excluded"]),
      new Set(["no-points"]),
    );
    expect(res.eligibleTotal).toBe(250);
    expect(res.points).toBe(2);
  });

  it("enforces minimum spend on eligible total", () => {
    const res = calculateEarnPoints(
      [{ product_id: "a", category: "x", line_total: 150 }],
      { amount_per_point: 100, min_spend: 500 },
    );
    expect(res.points).toBe(0);
  });

  it("applies promotion multiplier", () => {
    expect(
      calculateEarnPoints(
        [{ product_id: "a", category: "x", line_total: 200 }],
        rule,
        new Set(),
        new Set(),
        2,
      ).points,
    ).toBe(4);
  });

  it("returns zero for invalid rule", () => {
    expect(
      calculateEarnPoints([{ product_id: "a", category: "x", line_total: 500 }], { amount_per_point: 0, min_spend: 0 }).points,
    ).toBe(0);
  });
});

describe("sumLedgerBalance", () => {
  it("nets earns, redeems, adjustments and voids", () => {
    expect(sumLedgerBalance([{ points: 10 }, { points: -4 }, { points: 2 }, { points: -8 }])).toBe(0);
  });
});

describe("generateLoyaltyToken", () => {
  it("produces 12-char unambiguous tokens", () => {
    const t = generateLoyaltyToken();
    expect(t).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$/);
  });

  it("produces unique tokens", () => {
    const set = new Set(Array.from({ length: 1000 }, () => generateLoyaltyToken()));
    expect(set.size).toBe(1000);
  });
});

describe("calculateMemberDiscount", () => {
  it("applies 5% rounded to whole Naira", () => {
    expect(calculateMemberDiscount(10000, 5)).toBe(500);
    expect(calculateMemberDiscount(1001, 5)).toBe(50);
    expect(calculateMemberDiscount(1010, 5)).toBe(51);
  });

  it("returns zero for missing/zero inputs", () => {
    expect(calculateMemberDiscount(10000, 0)).toBe(0);
    expect(calculateMemberDiscount(10000, null)).toBe(0);
    expect(calculateMemberDiscount(0, 5)).toBe(0);
  });

  it("caps at 100% of subtotal", () => {
    expect(calculateMemberDiscount(2000, 150)).toBe(2000);
  });
});

describe("normalizePhone", () => {
  it("strips spaces, dashes and brackets", () => {
    expect(normalizePhone("0803 123-4567")).toBe("08031234567");
    expect(normalizePhone("  (0803) 123 4567 ")).toBe("08031234567");
  });
});
