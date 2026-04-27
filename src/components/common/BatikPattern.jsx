import { useId } from 'react';

export default function BatikPattern({ opacity = 0.06, color = '#2A1F14' }) {
  const id = `batik-${useId().replace(/:/g, '')}`;
  return (
    <svg
      width="100%"
      height="100%"
      className="absolute inset-0 pointer-events-none"
      style={{ opacity }}
      aria-hidden
    >
      <defs>
        <pattern id={id} x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
          <ellipse cx="20" cy="10" rx="4" ry="6" fill="none" stroke={color} strokeWidth="0.8" />
          <ellipse cx="20" cy="30" rx="4" ry="6" fill="none" stroke={color} strokeWidth="0.8" />
          <ellipse cx="10" cy="20" rx="6" ry="4" fill="none" stroke={color} strokeWidth="0.8" />
          <ellipse cx="30" cy="20" rx="6" ry="4" fill="none" stroke={color} strokeWidth="0.8" />
          <circle cx="20" cy="20" r="1.2" fill={color} />
          <circle cx="0" cy="0" r="1" fill={color} />
          <circle cx="40" cy="0" r="1" fill={color} />
          <circle cx="0" cy="40" r="1" fill={color} />
          <circle cx="40" cy="40" r="1" fill={color} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
