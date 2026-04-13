/** Shared stock status logic for products and raw materials */

export type StockLevel = "available" | "few_left" | "finished";

export function getStockLevel(current: number, reorder: number): StockLevel {
  if (current <= 0) return "finished";
  if (current <= reorder) return "few_left";
  return "available";
}

export function getProductStockLevel(stock: number): StockLevel {
  if (stock <= 0) return "finished";
  if (stock <= 5) return "few_left";
  return "available";
}

export const stockColors: Record<StockLevel, { dot: string; bg: string; text: string }> = {
  available: { dot: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700" },
  few_left: { dot: "bg-amber-500", bg: "bg-amber-50", text: "text-amber-700" },
  finished: { dot: "bg-red-500", bg: "bg-red-50", text: "text-red-700" },
};

export const stockLabels: Record<StockLevel, string> = {
  available: "Available",
  few_left: "Few Left",
  finished: "Finished",
};

export function StockBadge({ level }: { level: StockLevel }) {
  const c = stockColors[level];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {stockLabels[level]}
    </span>
  );
}

export const fmt = (n: number) => `₦${Number(n).toLocaleString()}`;
