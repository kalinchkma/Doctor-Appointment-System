import config from '@payload-config'
import { cookies } from 'next/headers'
import { RootPage, generatePageMetadata } from '@payloadcms/next/views'
import { importMap } from '../importMap'

export const dynamic = 'force-dynamic'

export const generateMetadata = ({
  params,
  searchParams,
}: {
  params: Promise<{ segments: string[] }>
  searchParams: Promise<Record<string, string | string[]>>
}) => generatePageMetadata({ config, params, searchParams })
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ segments: string[] }>
  searchParams: Promise<Record<string, string | string[]>>
}) {
  await cookies()
  return (
    <RootPage config={config} importMap={importMap} params={params} searchParams={searchParams} />
  )
}
