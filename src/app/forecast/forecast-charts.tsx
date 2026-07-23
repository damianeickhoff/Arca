"use client";

import {
  PieChart, Pie, Cell, Sector, Tooltip, ResponsiveContainer,
} from "recharts";
import { formatEur } from "@/lib/format";

// ─── Rounded corner slice (mirrors TopExpenseCategoriesCard) ─────────────────

interface PieSliceProps {
  cx?: number; cy?: number;
  innerRadius?: number; outerRadius?: number;
  startAngle?: number; endAngle?: number;
  fill?: string;
}

function ScaledCornerSlice(maxRadius: number) {
  return function Slice(props: PieSliceProps) {
    const { outerRadius = 0, startAngle = 0, endAngle = 0 } = props;
    const angle = Math.abs(endAngle - startAngle);
    const arcLength = outerRadius * (angle * Math.PI) / 180;
    const safeRadius = Math.min(maxRadius, arcLength / 3);
    return <Sector {...props} cornerRadius={safeRadius} />;
  };
}

const roundedSliceShape = ScaledCornerSlice(9);

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { name: string; value: number; color: string } }>;
}) {
  if (!active || !payload?.length) return null;
  const { name, value, color } = payload[0].payload;
  return (
    <div className="rounded-xl bg-card-glass px-3.5 py-2.5 text-xs flex items-center gap-2">
      <span className="size-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-foreground/60 text-white">{name}</span>
      <span className="font-semibold  tabular-nums ml-auto pl-4">{formatEur(value)}</span>
    </div>
  );
}

// ─── Expense Composition Donut ──────────────────────────────────────────────

interface DonutSegment {
  name: string;
  value: number;
  color: string;
}

export function ExpenseDonutChart({ segments }: { segments: DonutSegment[] }) {
  const total = segments.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex justify-center items-center w-1/2 shrink-0 [&_.recharts-tooltip-wrapper]:z-10">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={segments}
              cx="50%"
              cy="50%"
              innerRadius="70%"
              outerRadius="80%"
              startAngle={90}
              endAngle={-270}
              strokeWidth={0}
              paddingAngle={segments.length > 1 ? 3 : 0}
              dataKey="value"
              shape={roundedSliceShape}
              isAnimationActive={false}
            >
              {segments.map((seg, i) => (
                <Cell key={`${seg.name}-${i}`} fill={seg.color} />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 z-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-lg tabular-nums leading-tight">
            {formatEur(total)}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 min-w-0 flex-1">
        {segments.map((seg, i) => {
          const pct = total > 0 ? (seg.value / total) * 100 : 0;
          return (
            <div key={`${seg.name}-${i}`} className="flex items-center gap-2.5 min-w-0">
              <span className="size-2 rounded-full shrink-0" style={{ background: seg.color }} />
              <span className="text-sm/[1.2] font-medium text-foreground/60 truncate">{seg.name}</span>
              <span className="text-sm/[1.2] font-medium text-white tabular-nums shrink-0 ml-auto">{pct.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
