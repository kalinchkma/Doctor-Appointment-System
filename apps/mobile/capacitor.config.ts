import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.doctorapp.careconnect',
  appName: 'CareConnect',
  webDir: 'dist',
  // Assignment/dev: allow plain HTTP to a local Payload CMS from the Android WebView.
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    // Route window.fetch through native Android HTTP so https://localhost → http://LAN
    // is not blocked as WebView mixed content (phone browser works; WebView fetch does not).
    CapacitorHttp: {
      enabled: true,
    },
  },
}

export default config
