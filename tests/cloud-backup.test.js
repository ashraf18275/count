import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('cloud backup uses authenticated, user-scoped Firestore paths', async () => {
  const source = await read('../src/cloud-backup.js');
  assert.match(source, /signInWithEmailAndPassword/);
  assert.match(source, /createUserWithEmailAndPassword/);
  assert.match(source, /\['users', uid, 'backups'\]/);
  assert.match(source, /status: 'uploading'/);
  assert.match(source, /status: 'complete'/);
  assert.match(source, /metadata\.data\(\)\.status !== 'complete'/);
  assert.match(source, /pruneOldBackups/);
  assert.match(source, /user\.uid, 5\)/);
  assert.match(source, /النسخة السحابية غير مكتملة أو لا تتطابق أعداد سجلاتها/);
});

test('Firestore rules isolate each user and deny all other paths', async () => {
  const rules = await read('../firestore.rules');
  assert.match(rules, /request\.auth != null && request\.auth\.uid == userId/);
  assert.match(rules, /match \/\{document=\*\*\}/);
  assert.match(rules, /allow read, write: if false;/);
});

test('cloud controls exist while local backup and restore remain available', async () => {
  const html = await read('../index.html');
  const app = await read('../src/app.js');
  assert.match(html, /id="cloudLoginBtn"/);
  assert.match(html, /id="cloudCreateAccountBtn"/);
  assert.ok(html.indexOf("نسخة ملف على Google Drive أو الجهاز") < html.indexOf("النسخ السحابي التلقائي عبر Firebase"));
  assert.match(html, /id="cloudBackupBtn"/);
  assert.match(html, /id="cloudRestoreBtn"/);
  assert.match(html, /id="exportBtn"/);
  assert.match(html, /id="importFile"/);
  assert.match(app, /queueCloudBackup\(reason\)/);
  assert.match(app, /replaceAll\(data\)/);
  assert.match(html, /id="localSafetySelect"/);
  assert.match(html, /id="localSafetyRestoreBtn"/);
  assert.match(app, /createLocalSafetyBackup/);
  const sw = await read('../sw.js');
  assert.match(sw, /tijara-accounting-v3/);
  assert.match(sw, /src\/cloud-backup\.js/);
  assert.match(sw, /src\/firebase-config\.js/);
});

test('Firebase SDK is loaded lazily so the local app can still start offline', async () => {
  const source = await read('../src/cloud-backup.js');
  assert.match(source, /import\(SDK \+ 'firebase-app\.js'\)/);
  assert.doesNotMatch(source, /^import .*https:\/\//m);
});

test('local safety backups use a separate IndexedDB store', async () => {
  const db = await read('../src/db.js');
  const app = await read('../src/app.js');
  assert.match(db, /DB_VERSION=3/);
  assert.match(db, /SAFETY_STORE='safetyBackups'/);
  assert.match(db, /STORES,SAFETY_STORE/);
  assert.match(app, /backups\.slice\(3\)/);
  assert.match(app, /function validateBackupData/);
});
