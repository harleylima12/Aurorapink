import type { ReactNode } from "react";

export default function SpecRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3">
      <span className="flex-shrink-0 text-gold-400">{icon}</span>
      {value ? (
        <div className="min-w-0">
          <p className="text-xs text-white/50">{label}</p>
          <p className="truncate text-sm font-semibold text-white">{value}</p>
        </div>
      ) : (
        <p className="text-sm font-medium text-white/90">{label}</p>
      )}
    </div>
  );
}
