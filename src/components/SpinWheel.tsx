import { useEffect, useMemo, useRef, useState } from "react";
import type { SpinPrize } from "@/lib/spin";
import { wheelSegments } from "@/lib/spin";

interface SpinWheelProps {
  prizes: SpinPrize[];
  /** Prize id the pointer must land on after spin (server result). Null = idle. */
  targetPrizeId: string | null;
  spinning: boolean;
  onSettled?: () => void;
}

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function segmentPath(cx: number, cy: number, r: number, start: number, sweep: number): string {
  const [x1, y1] = polar(cx, cy, r, start);
  const [x2, y2] = polar(cx, cy, r, start + sweep);
  const large = sweep > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

/** SVG prize wheel. Rotation lands the pointer (top) on targetPrizeId. */
export function SpinWheel({ prizes, targetPrizeId, spinning, onSettled }: SpinWheelProps) {
  const [rotation, setRotation] = useState(0);
  const settledTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settledCb = useRef(onSettled);
  settledCb.current = onSettled;

  const segs = useMemo(
    () => wheelSegments(prizes, (p) => Math.max(0, p.weight)),
    [prizes],
  );

  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;

  useEffect(() => {
    if (!spinning || !targetPrizeId) return;
    const idx = segs.findIndex((s) => (s.prize as SpinPrize).id === targetPrizeId);
    const seg = segs[idx >= 0 ? idx : 0];
    // Pointer sits at angle 0 (top). Segment center is at seg.start + sweep/2.
    // Add small jitter inside the segment so repeat wins don't land pixel-identical.
    const jitter = (Math.random() - 0.5) * Math.max(0, seg.sweep - 12);
    const center = seg.start + seg.sweep / 2 + jitter;
    const current = ((rotation % 360) + 360) % 360;
    // Rotate forward: 5 full turns + delta to bring center under the pointer.
    const delta = ((360 - center - current) % 360 + 360) % 360;
    setRotation((prev) => prev + 360 * 5 + delta);
    if (settledTimer.current) clearTimeout(settledTimer.current);
    settledTimer.current = setTimeout(() => settledCb.current?.(), 4500);
    return () => {
      if (settledTimer.current) clearTimeout(settledTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, targetPrizeId]);

  return (
    <div className="relative mx-auto" style={{ width: size, maxWidth: "100%" }}>
      {/* pointer */}
      <div className="absolute -top-1 left-1/2 z-10 -translate-x-1/2">
        <div
          className="h-0 w-0 border-x-[13px] border-t-[22px] border-x-transparent border-t-foreground drop-shadow"
          aria-hidden
        />
      </div>
      <div
        className="rounded-full border-4 border-foreground/90 bg-card shadow-xl"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? "transform 4.2s cubic-bezier(0.12, 0.8, 0.12, 1)" : undefined,
          width: "100%",
          aspectRatio: "1",
        }}
        role="img"
        aria-label="Spin wheel"
      >
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full">
          {segs.map((s) => {
            const p = s.prize as SpinPrize;
            const [tx, ty] = polar(cx, cy, r * 0.62, s.start + s.sweep / 2);
            return (
              <g key={p.id}>
                <path
                  d={segmentPath(cx, cy, r, s.start, s.sweep)}
                  fill={p.color || "#0d7a5f"}
                  stroke="#fff"
                  strokeWidth={2}
                />
                <text
                  x={tx}
                  y={ty}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={s.sweep < 20 ? 9 : 11}
                  fontWeight={800}
                  fill="#fff"
                  transform={`rotate(${s.start + s.sweep / 2} ${tx} ${ty})`}
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,.4)" }}
                >
                  {p.label}
                </text>
              </g>
            );
          })}
          <circle cx={cx} cy={cy} r={26} fill="#101418" stroke="#f2c14e" strokeWidth={3} />
          <circle cx={cx} cy={cy} r={6} fill="#f2c14e" />
        </svg>
      </div>
    </div>
  );
}
