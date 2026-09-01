import Link from "next/link";

export interface Trilha {
  label: string;
  href?: string;
}

/** Path back out of an inner admin page. Last item is the current page. */
export default function Breadcrumb({ trilha }: { trilha: Trilha[] }) {
  return (
    <nav aria-label="Trilha de navegação" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-white/40">
        {trilha.map((item, index) => {
          const ultimo = index === trilha.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {item.href && !ultimo ? (
                <Link
                  href={item.href}
                  className="transition-colors hover:text-white"
                >
                  {item.label}
                </Link>
              ) : (
                <span className={ultimo ? "text-white/70" : undefined}>
                  {item.label}
                </span>
              )}
              {!ultimo && (
                <span aria-hidden="true" className="text-white/20">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
