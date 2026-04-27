export default function KawungMark({ size = 40, color = '#2D4A6B', bg = '#F8F1E2' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="block">
      <circle cx="20" cy="20" r="19.5" fill={bg} stroke={color} strokeWidth="1" />
      <ellipse cx="20" cy="10" rx="5" ry="8" fill="none" stroke={color} strokeWidth="1.4" />
      <ellipse cx="30" cy="20" rx="8" ry="5" fill="none" stroke={color} strokeWidth="1.4" />
      <ellipse cx="20" cy="30" rx="5" ry="8" fill="none" stroke={color} strokeWidth="1.4" />
      <ellipse cx="10" cy="20" rx="8" ry="5" fill="none" stroke={color} strokeWidth="1.4" />
      <circle cx="20" cy="20" r="2.2" fill={color} />
    </svg>
  );
}
