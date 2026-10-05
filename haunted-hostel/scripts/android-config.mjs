// Applies game-specific settings to the Capacitor-generated Android project (run after `cap add/sync`).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const manifest = 'android/app/src/main/AndroidManifest.xml';
if (!existsSync(manifest)) {
  console.log('android/ not found — run `npx cap add android` first.');
  process.exit(0);
}
let xml = readFileSync(manifest, 'utf8');
if (!xml.includes('android:screenOrientation')) {
  xml = xml.replace('<activity', '<activity\n            android:screenOrientation="sensorLandscape"');
}
if (!xml.includes('android:hardwareAccelerated')) {
  xml = xml.replace('<application', '<application\n        android:hardwareAccelerated="true"');
}
writeFileSync(manifest, xml);

const styles = 'android/app/src/main/res/values/styles.xml';
if (existsSync(styles)) {
  let s = readFileSync(styles, 'utf8');
  if (!s.includes('android:windowFullscreen')) {
    s = s.replace(
      /(<style name="AppTheme.NoActionBar"[^>]*>)/,
      '$1\n        <item name="android:windowFullscreen">true</item>\n        <item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>',
    );
    writeFileSync(styles, s);
  }
}
console.log('Android project configured: landscape, fullscreen, hardware acceleration.');
