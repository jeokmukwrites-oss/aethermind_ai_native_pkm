import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aethermind.pkm',
  appName: 'AetherMind',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#1c1917',
      showSpinner: true,
      spinnerColor: '#f59e0b',
    },
  },
};

export default config;
