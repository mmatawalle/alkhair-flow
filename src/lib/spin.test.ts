import { describe, it, expect } from "vitest";
import {
  eligiblePrizes,
  oddsPercent,
  pickWeightedPrize,
  prizeShortText,
  publicGameUrl,
  wheelSegments,
  winHeaderText,
  DEMO_PRIZES,
} from "@/lib/spin";

describe("pickWeightedPrize", () => {
  const prizes = [
    { id: "a", weight: 1 },
    { id: "b", weight: 2 },
    { id: "c", weight: 7 },
  ];

  it("picks the first segment for r=0", () => {
    expect(pickWeightedPrize(prizes, 0)?.id).toBe("a");
  });

  it("respects weights (r=0.15 → b, r=0.5 → c)", () => {
    expect(pickWeightedPrize(prizes, 0.15)?.id).toBe("b");
    expect(pickWeightedPrize(prizes, 0.5)?.id).toBe("c");
  });

  it("returns null for empty / zero weights", () => {
    expect(pickWeightedPrize([], 0.5)).toBeNull();
    expect(pickWeightedPrize([{ id: "x", weight: 0 }], 0.5)).toBeNull();
  });

  it("never promises more than available: distribution roughly matches odds", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 10000; i++) {
      const p = pickWeightedPrize(prizes, i / 10000)!;
      counts.set(p.id, (counts.get(p.id) || 0) + 1);
    }
    expect(counts.get("a")).toBeGreaterThan(500);
    expect(counts.get("a")).toBeLessThan(1500);
    expect(counts.get("c")).toBeGreaterThan(6000);
  });
});

describe("eligiblePrizes (capped budgets)", () => {
  it("excludes prizes whose max_wins is exhausted", () => {
    const list = [
      { id: "p1", weight: 10, max_wins: 2 as number | null },
      { id: "p2", weight: 10, max_wins: null },
      { id: "p3", weight: 0, max_wins: null },
    ];
    expect(eligiblePrizes(list, { p1: 2 }).map((p) => p.id)).toEqual(["p2"]);
    expect(eligiblePrizes(list, { p1: 1 }).map((p) => p.id)).toEqual(["p1", "p2"]);
  });
});

describe("wheelSegments", () => {
  it("sweeps sum to 360", () => {
    const segs = wheelSegments(DEMO_PRIZES, (p) => p.weight);
    const total = segs.reduce((s, x) => s + x.sweep, 0);
    expect(total).toBeCloseTo(360, 6);
    expect(segs).toHaveLength(DEMO_PRIZES.length);
  });
});

describe("oddsPercent", () => {
  it("computes share of total weight", () => {
    expect(oddsPercent(25, 100)).toBeCloseTo(25);
    expect(oddsPercent(2, 120)).toBeCloseTo((2 / 120) * 100);
    expect(oddsPercent(5, 0)).toBe(0);
  });
});

describe("win header (registration modal must display the win)", () => {
  it("shows points wins prominently", () => {
    expect(winHeaderText({ prize_label: "50 PTS", prize_type: "points", points_amount: 50 })).toContain("50 POINTS");
  });

  it("shows discount / free-product wins by label", () => {
    expect(winHeaderText({ prize_label: "5% OFF", prize_type: "discount" })).toContain("5% OFF");
  });

  it("softens no-win into a join nudge", () => {
    expect(winHeaderText({ prize_label: "TRY AGAIN", prize_type: "no_win" })).toMatch(/join/i);
  });
});

describe("publicGameUrl", () => {
  it("builds absolute share links for the guest pages", () => {
    expect(publicGameUrl("spin")).toBe(window.location.origin + "/spin");
    expect(publicGameUrl("join")).toBe(window.location.origin + "/join");
  });
});

describe("prizeShortText", () => {
  it("formats each prize type", () => {
    expect(prizeShortText({ label: "50 PTS", prize_type: "points", points_amount: 50, discount_percent: null, value_amount: null })).toBe("50 points");
    expect(prizeShortText({ label: "5% OFF", prize_type: "discount", points_amount: 0, discount_percent: 5, value_amount: null })).toBe("5% off");
    expect(prizeShortText({ label: "TRY AGAIN", prize_type: "no_win", points_amount: 0, discount_percent: null, value_amount: null })).toBe("no win");
  });
});
