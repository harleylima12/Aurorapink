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

export function GridIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.5" />
    </IconBase>
  );
}

export function CarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 16V11.5l1.8-4.6A2 2 0 0 1 7.7 5.6h8.6a2 2 0 0 1 1.9 1.3L20 11.5V16" />
      <path d="M4 16a1.5 1.5 0 0 0 1.5 1.5h1A1.5 1.5 0 0 0 8 16v-1H4v1Z" />
      <path d="M16 16a1.5 1.5 0 0 0 1.5 1.5h1A1.5 1.5 0 0 0 20 16v-1h-4v1Z" />
      <path d="M4 12h16" />
      <circle cx="7.5" cy="14" r="0.1" />
      <circle cx="16.5" cy="14" r="0.1" />
    </IconBase>
  );
}

export function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M12 4.5v15M4.5 12h15" />
    </IconBase>
  );
}

export function LogoutIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M9 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3" />
      <path d="M15.5 16.5 20 12l-4.5-4.5" />
      <path d="M20 12H9" />
    </IconBase>
  );
}

export function MenuIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" />
    </IconBase>
  );
}

export function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M5 5l14 14M19 5 5 19" />
    </IconBase>
  );
}

export function EditIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="M14 6.5 17.5 10" />
    </IconBase>
  );
}

export function TrashIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4.5 7h15" />
      <path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2" />
      <path d="M6.5 7 7.3 19a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9L17.5 7" />
      <path d="M10 11v6M14 11v6" />
    </IconBase>
  );
}

export function ToggleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M7 7h9l-2.5-2.5" />
      <path d="M17 17H8l2.5 2.5" />
    </IconBase>
  );
}

export function UserIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </IconBase>
  );
}
