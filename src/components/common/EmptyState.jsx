export default function EmptyState({ icon = '📭', title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-5xl mb-3">{icon}</div>
      <h3 className="font-semibold text-gray-900">{title}</h3>
      {description && <p className="text-sm text-gray-500 mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
