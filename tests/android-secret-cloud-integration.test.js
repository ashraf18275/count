import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Android starts the secret game shell, not the accounting screen directly', () => {
  const activity = read('../android/app/src/main/java/com/starpuzzles/game/MainActivity.java');
  const launcher = read('../android/app/src/main/assets/launcher.html');
  assert.match(activity, /assets\/launcher\.html/);
  assert.doesNotMatch(activity, /loadUrl\("https:\/\/appassets\.androidplatform\.net\/assets\/www\/index\.html"\)/);
  assert.match(launcher, /function enterSecretMode\(/);
  assert.match(launcher, /function secretTap\(/);
  assert.match(launcher, /assets\/www\/index\.html/);
});

test('the hidden accounting screen contains cloud backup controls and handlers', () => {
  const html = read('../index.html');
  const app = read('../src/app.js');
  for (const id of ['cloudStatus', 'cloudEmail', 'cloudPassword', 'cloudLoginBtn', 'cloudBackupBtn', 'cloudRefreshBtn', 'cloudRestoreBtn']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing HTML control: ' + id);
  }
  for (const id of ['cloudLoginBtn', 'cloudBackupBtn', 'cloudRefreshBtn', 'cloudRestoreBtn']) {
    assert.ok(app.includes("$('" + '#' + id + "'" + ')') || app.includes("#" + id), 'missing JavaScript handler reference: ' + id);
  }
});

test('Android WebView presents JavaScript confirmations used by delete and restore actions', () => {
  const activity = read('../android/app/src/main/java/com/starpuzzles/game/MainActivity.java');
  assert.match(activity, /setWebChromeClient\(new WebChromeClient\(\)/);
  assert.match(activity, /onJsConfirm\(/);
  assert.match(activity, /result\.confirm\(\)/);
  assert.match(activity, /result\.cancel\(\)/);
});

test('Android declares internet access for Firebase authentication and Firestore', () => {
  const manifest = read('../android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /uses-permission android:name="android\.permission\.INTERNET"/);
});

test('Android build packages the accounting web app under the path used by the secret launcher', () => {
  const gradle = read('../android/app/build.gradle');
  assert.match(gradle, /applicationId "com\.starpuzzles\.game"/);
  assert.match(gradle, /into\(layout\.buildDirectory\.dir\("generated\/web-assets\/www"\)\)/);
  assert.match(gradle, /include "src\/\*\*"/);
});
