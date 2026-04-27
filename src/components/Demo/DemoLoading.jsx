export default function DemoLoading({ message = 'Menyiapkan data demo...' }) {
  return (
    <div className="min-h-[100svh] flex flex-col items-center justify-center bg-gradient-to-b from-primary-50 to-white px-6">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="mt-4 text-sm text-gray-600 font-medium">{message}</p>
      <p className="mt-1 text-xs text-gray-400">2-3 detik...</p>
    </div>
  );
}
