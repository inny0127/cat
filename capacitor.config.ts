import type { CapacitorConfig } from '@capacitor/cli';

// Native wrapper (iOS / Android) so the cat can send real, scheduled local notifications.
const config: CapacitorConfig = {
  appId: 'com.inny0127.catwindow',
  appName: '창가의 고양이',
  webDir: 'dist',
  backgroundColor: '#fffbfa',
  ios: { contentInset: 'never', backgroundColor: '#fffbfa' },
  android: { backgroundColor: '#fffbfa' },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_cat',
      iconColor: '#c9772e',
    },
  },
};

export default config;
