import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatCurrency } from '../../utils/formatCurrency';

export default function MonthlyChart({ data }) {
  return (
    <div className="card">
      <h3 className="font-semibold text-gray-900 mb-3">Pemasukan vs Pengeluaran</h3>
      <div className="h-56 -ml-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => {
                if (v === 0) return '0';
                if (v >= 1000000) return `${(v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1)}jt`;
                if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}rb`;
                return v;
              }}
              allowDecimals={false}
            />
            <Tooltip
              formatter={(value) => formatCurrency(value)}
              contentStyle={{ borderRadius: 8, fontSize: 12 }}
            />
            <Bar dataKey="Pemasukan" fill="#22C55E" radius={[6, 6, 0, 0]} />
            <Bar dataKey="Pengeluaran" fill="#EF4444" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
