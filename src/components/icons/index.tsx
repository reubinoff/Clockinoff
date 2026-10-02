import type { SVGProps, ReactNode } from "react";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  size?: number | string;
  title?: string;
};

function makeIcon(
  paths: ReactNode,
  {
    strokeWidth = 1.75,
    filled = false,
  }: { strokeWidth?: number; filled?: boolean } = {},
) {
  return function Icon({
    size = 20,
    title,
    role,
    "aria-hidden": ariaHidden,
    ...rest
  }: IconProps): JSX.Element {
    const labelled = title
      ? { role: role ?? "img", "aria-label": title }
      : { "aria-hidden": ariaHidden ?? true };
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...labelled}
        {...rest}
      >
        {title ? <title>{title}</title> : null}
        {paths}
      </svg>
    );
  };
}

export const IconTimer = makeIcon(
  <>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 13V8" />
    <path d="M9 2h6" />
    <path d="M12 2v3" />
  </>,
);

export const IconPlay = makeIcon(
  <path d="M7 5.5v13l11-6.5-11-6.5Z" fill="currentColor" />,
  { strokeWidth: 1.5 },
);

export const IconStop = makeIcon(
  <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />,
  { strokeWidth: 1.5 },
);

export const IconDiscard = makeIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 9l6 6M15 9l-6 6" />
  </>,
);

export const IconProject = makeIcon(
  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
);

export const IconClient = makeIcon(
  <>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M8 8h2M8 12h2M8 16h2M14 8h2M14 12h2M14 16h2" />
  </>,
);

export const IconTag = makeIcon(
  <>
    <path d="M20 12.5V5a1 1 0 0 0-1-1h-7.5a1 1 0 0 0-.7.3l-7 7a1 1 0 0 0 0 1.4l7.5 7.5a1 1 0 0 0 1.4 0l7-7a1 1 0 0 0 .3-.7Z" />
    <circle cx="15.5" cy="8.5" r="1.25" />
  </>,
);

export const IconExport = makeIcon(
  <>
    <path d="M12 4v11" />
    <path d="M8 11l4 4 4-4" />
    <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
  </>,
);

export const IconEntries = makeIcon(<path d="M4 6h16M4 12h16M4 18h10" />);

export const IconBillable = makeIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.4 0-2.5.9-2.5 2 0 1.2 1 1.7 2.5 2s2.5.8 2.5 2c0 1.1-1.1 2-2.5 2-1 0-2-.5-2.5-1.5" />
    <path d="M12 6.5v11" />
  </>,
);

export const IconEye = makeIcon(
  <>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);

export const IconEyeOff = makeIcon(
  <>
    <path d="M3 3l18 18" />
    <path d="M10.6 6.1A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a17.3 17.3 0 0 1-3.2 3.9" />
    <path d="M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 6 10 6a10.7 10.7 0 0 0 4.4-.9" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </>,
);

export const IconCheck = makeIcon(<path d="M4 12l5 5L20 6" />);

export const IconAlert = makeIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v6" />
    <circle cx="12" cy="16.25" r="0.5" fill="currentColor" />
  </>,
);

export const IconSearch = makeIcon(
  <>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.3-4.3" />
  </>,
);

export const IconChevronDown = makeIcon(<path d="M6 9l6 6 6-6" />);

export const IconX = makeIcon(<path d="M6 6l12 12M18 6L6 18" />);

export const IconEdit = makeIcon(
  <>
    <path d="M4 20h4l10.5-10.5a2.121 2.121 0 0 0-3-3L5 17v3Z" />
    <path d="M13.5 6.5l3 3" />
  </>,
);

export const IconPlus = makeIcon(<path d="M12 5v14M5 12h14" />);

export const IconMinus = makeIcon(<path d="M5 12h14" />);

export const IconLibrary = makeIcon(
  <>
    <path d="M12 3l9 4.5-9 4.5-9-4.5L12 3Z" />
    <path d="M3 12l9 4.5 9-4.5" />
    <path d="M3 16.5l9 4.5 9-4.5" />
  </>,
);

// Three ascending bars with a baseline — a plain Reports / Summary glyph.
// Deliberately not a pie chart: the donut lives inside the report, we don't
// also want to overload the nav glyph with it (would look like a billable
// chart in list form). Height ordering matches the Quiet Pulse bar chart
// (left-to-right increasing) so it visually echoes the page it opens.
export const IconReports = makeIcon(
  <>
    <path d="M4 20h16" />
    <path d="M7 20V13" />
    <path d="M12 20V9" />
    <path d="M17 20V5" />
  </>,
);

export const IconMore = makeIcon(
  <>
    <circle cx="5" cy="12" r="1.25" fill="currentColor" />
    <circle cx="12" cy="12" r="1.25" fill="currentColor" />
    <circle cx="19" cy="12" r="1.25" fill="currentColor" />
  </>,
  { strokeWidth: 0 },
);
