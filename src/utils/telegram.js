const BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
const CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID;

export async function notifyTelegram(text) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
    });
  } catch (_) {
    // silent — notification failure should never block the app
  }
}

const DT_PROJECT = 'roxannecapital';
const DT_DOC = 'danatrack/main_data';
const DT_KEY = 'AIzaSyDTB7lgEkWOsQGjdlb9RxIABxvR6VRrBCI';
const DT_URL = `https://firestore.googleapis.com/v1/projects/${DT_PROJECT}/databases/(default)/documents/${DT_DOC}?key=${DT_KEY}`;

function toFsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return v.length ? { arrayValue: { values: v.map(toFsValue) } } : { arrayValue: {} };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = toFsValue(val);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function fromFsValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFsValue);
  if ('mapValue' in v) {
    const obj = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) obj[k] = fromFsValue(val);
    return obj;
  }
  return null;
}

function addMonths(iso, m) {
  const [y, mo, da] = iso.split('-').map(Number);
  const total = mo - 1 + m;
  const y2 = y + Math.floor(total / 12);
  const mo2 = (total % 12) + 1;
  const maxDay = new Date(y2, mo2, 0).getDate();
  return `${String(y2).padStart(4, '0')}-${String(mo2).padStart(2, '0')}-${String(Math.min(da, maxDay)).padStart(2, '0')}`;
}

function guessType(name) {
  const n = name.toLowerCase();
  if (/sawah|kebun|pisang|tambang|brambang/.test(n)) return 'agriculture';
  if (/kambing|sapi|ayam|lele|tape|pindang|bakso|kompor/.test(n)) return 'fnb';
  if (/kavling|tanah/.test(n)) return 'property';
  if (/rent|l300|toys|hong/.test(n)) return 'logistics';
  if (/pest|pupr|atk|elektronik/.test(n)) return 'services';
  return 'other';
}

export async function syncToDanaTrack({ name, principalAmount, disbursedAmount, monthlyReturnPct, durationMonths, startDate }) {
  try {
    const resp = await fetch(DT_URL);
    if (!resp.ok) throw new Error(`Read failed: ${resp.status}`);
    const doc = await resp.json();
    const state = fromFsValue(doc.fields.state);

    const kontrak = Math.round(principalAmount / 1e6 * 1e4) / 1e4;
    const existing = (state.projects || []).some(
      (p) => p.peminjam.toLowerCase() === name.toLowerCase() && p.kontrak === kontrak
    );
    if (existing) {
      notifyTelegram(`ℹ️ DanaTrack sync skipped — "${name}" ${kontrak}jt sudah ada.`);
      return;
    }

    const iso = startDate instanceof Date
      ? startDate.toLocaleDateString('sv-SE')
      : new Date(startDate).toLocaleDateString('sv-SE');
    const dur = Number(durationMonths);
    const retP = Number(monthlyReturnPct);

    const project = {
      id: 'pgm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      peminjam: name,
      kontrak,
      jumlah: Math.round(kontrak * (1 - retP / 100) * 1e4) / 1e4,
      deployBasis: true,
      type: guessType(name),
      status: 'tersedia',
      tanggalMulai: iso,
      tanggalJT: addMonths(iso, dur),
      returnType: 'bulanan',
      durasiReturn: dur,
      returnMode: 'persen',
      returnPersen: retP,
      returnModeUmum: 'persen',
      returnPersenUmum: 2,
    };

    state.projects.push(project);

    const body = {
      fields: {
        state: toFsValue(state),
        updatedAt: { stringValue: new Date().toISOString() },
      },
    };

    const writeResp = await fetch(DT_URL, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!writeResp.ok) throw new Error(`Write failed: ${writeResp.status}`);

    notifyTelegram(`✅ DanaTrack synced — "${name}" ${kontrak}jt added as tersedia.`);
  } catch (err) {
    notifyTelegram(`❌ DanaTrack sync GAGAL untuk "${name}": ${err.message}`);
  }
}
