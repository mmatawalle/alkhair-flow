import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt } from "@/lib/stock-helpers";

type SalesBarChartProps = {
  data: Array<{ date: string; revenue: number }>;
};

export function SalesBarChart({ data }: SalesBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} barCategoryGap="22%">
        <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={v => `${Math.round(Number(v) / 1000)}k`}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip
          formatter={(v: number) => fmt(v)}
          cursor={{ fill: "hsl(var(--muted) / 0.7)" }}
          contentStyle={{
            borderRadius: "8px",
            border: "1px solid hsl(var(--border))",
            boxShadow: "0 12px 28px hsl(30 18% 12% / 0.12)",
          }}
        />
        <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={i === data.length - 1 ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.28)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
