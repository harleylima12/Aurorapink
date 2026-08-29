function IconBase({
  children,
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function CalendarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </IconBase>
  );
}

export function GaugeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 15a8 8 0 1 1 16 0" />
      <path d="M12 15l4-5" />
      <path d="M12 15h.01" />
    </IconBase>
  );
}

export function FuelIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M5 20V6a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v14" />
      <path d="M4 20h11" />
      <path d="M14 10h1.5l2.7 2.7a1.5 1.5 0 0 1 .3.9V17a1.5 1.5 0 0 1-3 0v-1" />
    </IconBase>
  );
}

export function GearboxIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21M6 6l2.2 2.2M15.8 15.8 18 18M18 6l-2.2 2.2M8.2 15.8 6 18" />
    </IconBase>
  );
}

export function PaintIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M12 3a7 7 0 0 0 0 14 1.8 1.8 0 0 0 1.2-3.1 1.8 1.8 0 0 1 1.2-3.1H17a4 4 0 0 0 0-8 4.9 4.9 0 0 0-5-.8" />
      <circle cx="12" cy="21" r="1" />
    </IconBase>
  );
}

export function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <IconBase viewBox="0 0 20 20" {...props}>
      <circle cx="10" cy="10" r="8" />
      <path d="M6.5 10.2l2.3 2.3 4.7-4.9" />
    </IconBase>
  );
}
