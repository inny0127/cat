import type { CapacitorConfig } from '@capacitor/cli';

// Native wrapper (iOS / Android) so the cat can send real, scheduled local notifications.
const config: CapacitorConfig = {
  appId: 'com.inny0127.catwindow',
  appName: '창가의 고양이',
  webDir: 'dist',
  backgroundColor: '#c99486',
  ios: { contentInset: 'never', backgroundColor: '#c99486' },
  android: { backgroundColor: '#c99486' },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_cat',
      iconColor: '#c9772e',
    },
  },
};

export default config;
