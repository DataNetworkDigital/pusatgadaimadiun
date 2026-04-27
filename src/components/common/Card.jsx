export default function Card({ as: Tag = 'div', className = '', children, ...rest }) {
  return (
    <Tag
      className={`bg-paper rounded-2xl border border-line shadow-card p-4 ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
