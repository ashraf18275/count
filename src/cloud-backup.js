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
  return { id: snapshotId, createdAt: new Date().toISOString(), count: records.length };
}

export async function listCloudBackups() {
  const { auth, db, dbSdk } = await services();
  const user = auth.currentUser;
  if (!user) throw new Error('سجّل الدخول إلى الحساب السحابي أولًا');
  const backupsRef = dbSdk.collection(db, ...userPath(user.uid));
  const q = dbSdk.query(backupsRef, dbSdk.orderBy('createdAt', 'desc'), dbSdk.limit(40));
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
  return { ...data, format: 'tijara-accounting-backup', version: 2, exportedAt: metadata.data().createdAt };
}
