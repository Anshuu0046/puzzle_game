import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hauntedhostel.game',
  appName: 'Haunted Hostel',
  webDir: 'dist',
  android: {
    backgroundColor: '#050607',
    allowMixedContent: false,
  },
};

export default config;
