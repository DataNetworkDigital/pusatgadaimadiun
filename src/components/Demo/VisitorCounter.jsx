import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

function formatId(n) {
  return new Intl.NumberFormat('id-ID').format(n || 0);
}

export default function VisitorCounter() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'demo_config', 'settings'), (snap) => {
      if (snap.exists()) setStats(snap.data());
    });
    return () => unsub();
  }, []);

  if (!stats) return null;
  return (
    <div className="card flex items-center gap-3 py-3">
      <div className="text-2xl">👁</div>
      <div className="flex-1 min-w-0 text-sm">
        <div className="font-semibold text-gray-900">
          {formatId(stats.visitorCount)} orang sudah mencoba demo ini
        </div>
        {stats.dailyVisitors > 0 && (
          <div className="text-xs text-gray-500">{formatId(stats.dailyVisitors)} pengunjung hari ini</div>
        )}
      </div>
    </div>
  );
}
