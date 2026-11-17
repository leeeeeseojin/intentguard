const base = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 } as const;

export const RefreshIcon = () => (
  <svg {...base}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </svg>
);

export const MoreIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="19" r="1" />
  </svg>
);

export const PlusIcon = () => (
  <svg {...base}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const TrashIcon = () => (
  <svg {...base}>
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
  </svg>
);

export const ServerIcon = () => (
  <svg {...base}>
    <rect x="3" y="4" width="18" height="7" rx="1" />
    <rect x="3" y="13" width="18" height="7" rx="1" />
  </svg>
);

export const BucketIcon = () => (
  <svg {...base}>
    <path d="M4 6h16l-2 14H6z" />
    <ellipse cx="12" cy="6" rx="8" ry="2" />
  </svg>
);

export const ShieldIcon = () => (
  <svg {...base}>
    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
  </svg>
);
