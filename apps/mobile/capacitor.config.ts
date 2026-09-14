import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.doctorapp.careconnect',
  appName: 'CareConnect',
  webDir: 'dist',
  // Development only: permits calls to a local HTTP Payload server on Android.
  // Use HTTPS and set this to false before a production release.
  server: { androidScheme: 'https', cleartext: true },
}

export default config
