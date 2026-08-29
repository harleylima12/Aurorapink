export default function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-800 px-8 py-16 text-center">
      <p className="font-display text-xl font-semibold text-white">{title}</p>
      <p className="mt-2 max-w-sm text-sm text-white/60">{description}</p>
    </div>
  );
}
