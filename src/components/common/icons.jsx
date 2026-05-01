function Icon({ d, size = 24, stroke = 'currentColor', sw = 1.75, fill = 'none', children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0"
      aria-hidden
    >
      {d ? <path d={d} /> : children}
    </svg>
  );
}

export const IcHome = (p) => (
  <Icon {...p}>
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10h14V10" />
    <path d="M10 20v-6h4v6" />
  </Icon>
);
export const IcWallet = (p) => (
  <Icon {...p}>
    <path d="M3 7c0-1.1.9-2 2-2h13a2 2 0 012 2v2" />
    <path d="M3 7v11a2 2 0 002 2h14a2 2 0 002-2v-3" />
    <path d="M21 11h-4a2 2 0 100 4h4v-4z" />
  </Icon>
);
export const IcSwap = (p) => (
  <Icon {...p}>
    <path d="M7 4l-4 4 4 4" />
    <path d="M3 8h14" />
    <path d="M17 20l4-4-4-4" />
    <path d="M21 16H7" />
  </Icon>
);
export const IcCalendar = (p) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18" />
    <path d="M8 3v4M16 3v4" />
  </Icon>
);
export const IcLedger = (p) => (
  <Icon {...p}>
    <path d="M5 4h12a2 2 0 012 2v14H7a2 2 0 01-2-2V4z" />
    <path d="M5 4v14" />
    <path d="M9 8h6M9 12h6M9 16h4" />
  </Icon>
);
export const IcSettings = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3h0a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
  </Icon>
);
export const IcArrowDown = (p) => (
  <Icon {...p}>
    <path d="M12 5v14" />
    <path d="M5 12l7 7 7-7" />
  </Icon>
);
export const IcArrowUp = (p) => (
  <Icon {...p}>
    <path d="M12 19V5" />
    <path d="M5 12l7-7 7 7" />
  </Icon>
);
export const IcArrowRight = (p) => (
  <Icon {...p}>
    <path d="M5 12h14" />
    <path d="M12 5l7 7-7 7" />
  </Icon>
);
export const IcChevronRight = (p) => (
  <Icon {...p}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
);
export const IcChevronLeft = (p) => (
  <Icon {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Icon>
);
export const IcPlus = (p) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const IcSearch = (p) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </Icon>
);
export const IcFilter = (p) => (
  <Icon {...p}>
    <path d="M3 5h18l-7 9v6l-4-2v-4L3 5z" />
  </Icon>
);
export const IcAlert = (p) => (
  <Icon {...p}>
    <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </Icon>
);
export const IcEdit = (p) => (
  <Icon {...p}>
    <path d="M17 3l4 4-12 12H5v-4L17 3z" />
  </Icon>
);
export const IcTrash = (p) => (
  <Icon {...p}>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
  </Icon>
);
export const IcLock = (p) => (
  <Icon {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 018 0v4" />
  </Icon>
);
export const IcReset = (p) => (
  <Icon {...p}>
    <path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8" />
    <path d="M3 3v5h5" />
  </Icon>
);
export const IcExport = (p) => (
  <Icon {...p}>
    <path d="M12 3v12" />
    <path d="M7 8l5-5 5 5" />
    <path d="M5 21h14" />
  </Icon>
);
export const IcCheck = (p) => (
  <Icon {...p}>
    <path d="M5 12l5 5L20 7" />
  </Icon>
);
export const IcMail = (p) => (
  <Icon {...p}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m2 7 10 7L22 7" />
  </Icon>
);
export const IcBell = (p) => (
  <Icon {...p}>
    <path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8z" />
    <path d="M10 21a2 2 0 004 0" />
  </Icon>
);
export const IcPower = (p) => (
  <Icon {...p}>
    <path d="M12 3v9" />
    <path d="M5.6 6.6a8 8 0 1012.8 0" />
  </Icon>
);
export const IcReceipt = (p) => (
  <Icon {...p}>
    <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3z" />
    <path d="M9 8h6M9 12h6M9 16h4" />
  </Icon>
);
