import config from '@payload-config'
import { RootLayout, handleServerFunctions } from '@payloadcms/next/layouts'
import type { ReactNode } from 'react'
import { importMap } from './admin/importMap'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootLayout
      config={config}
      importMap={importMap}
      serverFunction={(args) => handleServerFunctions({ ...args, config, importMap })}
    >
      {children}
    </RootLayout>
  )
}
