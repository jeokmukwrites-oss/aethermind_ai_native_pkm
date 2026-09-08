import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aethermind.pkm',
  appName: 'AetherMind',
  webDir: 'dist',
  server: {
    // 'http' (not 'https') so the app itself loads over http://localhost.
    // With 'https' the WebView treats it as a secure origin and silently
    // blocks any fetch() to the plain-HTTP LAN sync server as "mixed
    // content" — the request never leaves the device. http://localhost is
    // still treated as a secure context by the engine, so camera/mic
    // access (voice & image capture) is unaffected.
    androidScheme: 'http',
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
