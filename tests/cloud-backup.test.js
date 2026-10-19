import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('cloud backup uses authenticated, user-scoped Firestore paths', async () => {
  const source = await read('../src/cloud-backup.js');
  assert.match(source, /signInWithEmailAndPassword/);
  assert.match(source, /\['users', uid, 'backups'\]/);
  assert.match(source, /status: 'uploading'/);
  assert.match(source, /status: 'complete'/);
  assert.match(source, /metadata\.data\(\)\.status !== 'complete'/);
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
  assert.match(html, /id="cloudBackupBtn"/);
  assert.match(html, /id="cloudRestoreBtn"/);
  assert.match(html, /id="exportBtn"/);
  assert.match(html, /id="importFile"/);
  assert.match(app, /queueCloudBackup\(reason\)/);
  assert.match(app, /replaceAll\(data\)/);
});

test('Firebase SDK is loaded lazily so the local app can still start offline', async () => {
  const source = await read('../src/cloud-backup.js');
  assert.match(source, /import\(SDK \+ 'firebase-app\.js'\)/);
  assert.doesNotMatch(source, /^import .*https:\/\//m);
});
