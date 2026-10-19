import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/11.10.0/';
let servicesPromise;

async function services() {
  if (!servicesPromise) {
    servicesPromise = (async () => {
      const [appSdk, authSdk, dbSdk] = await Promise.all([
        import(SDK + 'firebase-app.js'),
        import(SDK + 'firebase-auth.js'),
        import(SDK + 'firebase-firestore.js')
      ]);
      const app = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(firebaseConfig);
      const auth = authSdk.getAuth(app);
      const db = dbSdk.getFirestore(app);
      return { authSdk, dbSdk, auth, db };
    })().catch(error => {
      servicesPromise = undefined;
      throw error;
    });
  }
  return servicesPromise;
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || ('backup-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
}

function userPath(uid) {
  return ['users', uid, 'backups'];
}

async function pruneOldBackups(db, dbSdk, uid, keep = 5) {
  const backupsRef = dbSdk.collection(db, ...userPath(uid));
  const snapshot = await dbSdk.getDocs(dbSdk.query(backupsRef, dbSdk.orderBy('createdAt', 'desc')));
  const completed = snapshot.docs.filter(item => item.data().status === 'complete');
  const expired = completed.slice(keep);
  for (const backup of expired) {
    const records = await dbSdk.getDocs(dbSdk.collection(db, ...userPath(uid), backup.id, 'records'));
    const refs = [...records.docs.map(item => item.ref), backup.ref];
    for (let start = 0; start < refs.length; start += 400) {
      const batch = dbSdk.writeBatch(db);
      for (const ref of refs.slice(start, start + 400)) batch.delete(ref);
      await batch.commit();
    }
  }
  return { retained: Math.min(completed.length, keep), deleted: expired.length };
}

export async function createCloudAccount(email, password) {
  const { authSdk, auth } = await services();
  return authSdk.createUserWithEmailAndPassword(auth, email.trim(), password);
}

export async function signInWithEmail(email, password) {
  const { authSdk, auth } = await services();
  return authSdk.signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function signOutCloud() {
  const { authSdk, auth } = await services();
  return authSdk.signOut(auth);
}

export async function getCloudUser() {
  const { auth } = await services();
  return auth.currentUser;
}

export async function listenCloudAuth(callback) {
  const { authSdk, auth } = await services();
  return authSdk.onAuthStateChanged(auth, callback);
}

export async function createCloudBackup(data, reason = 'manual') {
  const { auth, db, dbSdk } = await services();
  const user = auth.currentUser;
  if (!user) throw new Error('سجّل الدخول إلى الحساب السحابي أولًا');
  const stores = ['customers', 'suppliers', 'transactions', 'meta'];
  const snapshotId = makeId();
  const base = userPath(user.uid);
  const backupRef = dbSdk.doc(db, ...base, snapshotId);
  const records = stores.flatMap(store => (Array.isArray(data[store]) ? data[store] : []).map(item => ({
    store,
    recordId: String(item.id ?? makeId()),
    data: item
  })));
  await dbSdk.setDoc(backupRef, {
    format: 'tijara-accounting-backup',
    version: 2,
    createdAt: new Date().toISOString(),
    reason,
    status: 'uploading',
    counts: {
      customers: (data.customers || []).length,
      suppliers: (data.suppliers || []).length,
      transactions: (data.transactions || []).length,
      meta: (data.meta || []).length
    }
  });
  try {
    for (let start = 0; start < records.length; start += 400) {
      const batch = dbSdk.writeBatch(db);
      for (const item of records.slice(start, start + 400)) {
        const key = item.store + '--' + encodeURIComponent(item.recordId);
        const ref = dbSdk.doc(db, ...base, snapshotId, 'records', key);
        batch.set(ref, item);
      }
      await batch.commit();
    }
    await dbSdk.updateDoc(backupRef, { status: 'complete' });
  } catch (error) {
    // Incomplete uploads are never offered for restoration.
    throw new Error('لم يكتمل رفع النسخة السحابية؛ النسخة غير المكتملة لن تظهر للاستعادة. ' + error.message);
  }

  let retention = { retained: null, deleted: 0 };
  try {
    retention = await pruneOldBackups(db, dbSdk, user.uid, 5);
  } catch (error) {
    // Retention cleanup must never turn a successfully uploaded backup into a reported failure.
    console.warn('Cloud backup retention cleanup failed:', error);
  }
  return { id: snapshotId, createdAt: new Date().toISOString(), count: records.length, retention };
}

export async function listCloudBackups() {
  const { auth, db, dbSdk } = await services();
  const user = auth.currentUser;
  if (!user) throw new Error('سجّل الدخول إلى الحساب السحابي أولًا');
  const backupsRef = dbSdk.collection(db, ...userPath(user.uid));
  const q = dbSdk.query(backupsRef, dbSdk.orderBy('createdAt', 'desc'), dbSdk.limit(100));
  const result = await dbSdk.getDocs(q);
  return result.docs.map(item => ({ id: item.id, ...item.data() }))
    .filter(item => item.status === 'complete')
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function restoreCloudBackup(snapshotId) {
  const { auth, db, dbSdk } = await services();
  const user = auth.currentUser;
  if (!user) throw new Error('سجّل الدخول إلى الحساب السحابي أولًا');
  const base = userPath(user.uid);
  const backupRef = dbSdk.doc(db, ...base, snapshotId);
  const metadata = await dbSdk.getDoc(backupRef);
  if (!metadata.exists() || metadata.data().status !== 'complete') {
    throw new Error('النسخة غير موجودة أو لم يكتمل رفعها');
  }
  const result = await dbSdk.getDocs(dbSdk.collection(db, ...base, snapshotId, 'records'));
  const data = { customers: [], suppliers: [], transactions: [], meta: [] };
  for (const item of result.docs) {
    const value = item.data();
    if (data[value.store] && value.data && typeof value.data === 'object') data[value.store].push(value.data);
  }
  if (data.customers.length !== Number(metadata.data().counts?.customers || 0)
      || data.suppliers.length !== Number(metadata.data().counts?.suppliers || 0)
      || data.transactions.length !== Number(metadata.data().counts?.transactions || 0)
      || data.meta.length !== Number(metadata.data().counts?.meta || 0)) {
    throw new Error('النسخة السحابية غير مكتملة أو لا تتطابق أعداد سجلاتها؛ لم يتم تغيير البيانات المحلية');
  }
  return { ...data, format: 'tijara-accounting-backup', version: 2, exportedAt: metadata.data().createdAt };
}
