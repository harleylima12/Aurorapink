import CountUp from "@/components/CountUp";

export default function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-white/50">
        {label}
      </p>
      <CountUp
        value={value}
        duration={0.6}
        className="mt-2 block font-display text-3xl font-bold text-white"
      />
    </div>
  );
}
