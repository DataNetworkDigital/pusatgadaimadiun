import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'];

function safeName(name) {
  return name
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
}

export function validateProofFile(file) {
  if (!file) return 'Pilih file terlebih dulu';
  if (file.size > MAX_BYTES) return `Ukuran maksimum ${Math.round(MAX_BYTES / 1024 / 1024)} MB`;
  if (file.type && !ALLOWED.includes(file.type)) {
    return 'Format harus PDF, JPG, PNG, atau HEIC';
  }
  return null;
}

export async function uploadProjectProof(file, { isDemo = false } = {}) {
  const err = validateProofFile(file);
  if (err) throw new Error(err);
  const folder = isDemo ? 'demo_project_proofs' : 'project_proofs';
  const stamp = Date.now().toString(36);
  const filename = `${stamp}-${safeName(file.name)}`;
  const r = ref(storage, `${folder}/${filename}`);
  const snap = await uploadBytes(r, file, {
    contentType: file.type || 'application/octet-stream',
  });
  const url = await getDownloadURL(snap.ref);
  return { url, fileName: file.name, storagePath: snap.ref.fullPath };
}

export async function deleteProjectProof(storagePath) {
  if (!storagePath) return;
  try {
    await deleteObject(ref(storage, storagePath));
  } catch (e) {
    // best-effort: file may already be gone
    console.warn('deleteProjectProof failed:', e?.code || e?.message);
  }
}
