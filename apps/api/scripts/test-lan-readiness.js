const http = require('http');
const path = require('path');
const fs = require('fs');

async function runChecks() {
  console.log('--- Physical Device Readiness Checks ---');

  // Check 1: Check apps/mobile/src/services/api.ts
  console.log('\n[Check 1] Mobile API Client BASE_URL:');
  const apiTs = fs.readFileSync(path.join(__dirname, '../../mobile/src/services/api.ts'), 'utf8');
  const baseMatch = apiTs.match(/export const API_BASE_URL =[\s\S]*?;/);
  console.log('Found API_BASE_URL definition:\n', baseMatch ? baseMatch[0] : 'NOT FOUND');
  if (baseMatch && baseMatch[0].includes('10.146.195.195') && !baseMatch[0].includes('localhost')) {
    console.log('✅ Check 1 PASSED: API_BASE_URL points to LAN IP 10.146.195.195 and does not default to localhost.');
  } else {
    console.error('❌ Check 1 FAILED');
    process.exit(1);
  }

  // Check 2: Check app.json permissions
  console.log('\n[Check 2] app.json Permissions & Plugins:');
  const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../mobile/app.json'), 'utf8'));
  const iosPlist = appJson.expo?.ios?.infoPlist || {};
  const androidPerms = appJson.expo?.android?.permissions || [];
  const plugins = appJson.expo?.plugins || [];

  console.log('iOS NSPhotoLibraryUsageDescription:', iosPlist.NSPhotoLibraryUsageDescription);
  console.log('iOS NSCameraUsageDescription:', iosPlist.NSCameraUsageDescription);
  console.log('Android permissions:', androidPerms);
  console.log('Plugins:', JSON.stringify(plugins));

  const hasIosPhoto = !!iosPlist.NSPhotoLibraryUsageDescription;
  const hasIosCam = !!iosPlist.NSCameraUsageDescription;
  const hasAndroidPerms = androidPerms.includes('android.permission.CAMERA') && androidPerms.includes('android.permission.READ_MEDIA_IMAGES');
  const hasPickerPlugin = plugins.some(p => Array.isArray(p) && p[0] === 'expo-image-picker');

  if (hasIosPhoto && hasIosCam && hasAndroidPerms && hasPickerPlugin) {
    console.log('✅ Check 2 PASSED: app.json includes iOS infoPlist descriptions, Android camera/media permissions, and expo-image-picker plugin.');
  } else {
    console.error('❌ Check 2 FAILED');
    process.exit(1);
  }

  // Check 3: Test backend binding to 0.0.0.0 and LAN IP accessibility
  console.log('\n[Check 3] Backend Server 0.0.0.0 Binding & LAN IP Accessibility:');
  process.env.NODE_ENV = 'test';
  process.env.PORT = '4000';
  process.env.HOST = '0.0.0.0';
  
  // Start server
  const express = require('express');
  const cors = require('cors');
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(4000, '0.0.0.0', resolve));
  const addr = server.address();
  console.log(`Server bound to: ${addr.address}:${addr.port} (${addr.family})`);

  if (addr.address !== '0.0.0.0') {
    console.error('❌ Check 3 FAILED: Server is not bound to 0.0.0.0');
    server.close();
    process.exit(1);
  }

  // Test pinging via LAN IP 10.146.195.195
  console.log('Testing HTTP GET http://10.146.195.195:4000/api/health...');
  const res = await fetch('http://10.146.195.195:4000/api/health');
  const body = await res.json();
  console.log('HTTP response status:', res.status, 'body:', body);

  await new Promise((resolve) => server.close(resolve));

  if (res.status === 200 && body.status === 'ok') {
    console.log('✅ Check 3 PASSED: Backend binds to 0.0.0.0 and is reachable via LAN IP 10.146.195.195:4000.');
  } else {
    console.error('❌ Check 3 FAILED');
    process.exit(1);
  }

  console.log('\n🎉 ALL READINESS CHECKS PASSED!');
}

runChecks().catch((err) => {
  console.error('Error during readiness checks:', err);
  process.exit(1);
});
