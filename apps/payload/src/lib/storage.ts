import type { Plugin } from 'payload'
import { azureStorage } from '@payloadcms/storage-azure'
import { s3Storage } from '@payloadcms/storage-s3'

export type StorageDriver = 'local' | 's3' | 'azure'

export function storageDriver(): StorageDriver {
  const value = (process.env.STORAGE_DRIVER || 'local').toLowerCase()
  if (value === 's3' || value === 'azure') return value
  return 'local'
}

/**
 * Payload storage plugins selected by STORAGE_DRIVER.
 * - local (default): no plugin; collections keep staticDir on disk / Docker volumes
 * - s3 / azure: official Payload adapters for media + knowledge-files
 */
export function storagePlugins(): Plugin[] {
  const driver = storageDriver()
  if (driver === 'local') return []

  const collections = {
    media: true,
    'knowledge-files': true,
  } as const

  if (driver === 's3') {
    const bucket = process.env.S3_BUCKET
    if (!bucket) {
      throw new Error('STORAGE_DRIVER=s3 requires S3_BUCKET')
    }
    return [
      s3Storage({
        collections: { ...collections },
        bucket,
        config: {
          credentials:
            process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
              ? {
                  accessKeyId: process.env.S3_ACCESS_KEY_ID,
                  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
                }
              : undefined,
          region: process.env.S3_REGION || 'us-east-1',
          endpoint: process.env.S3_ENDPOINT || undefined,
          forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
        },
      }),
    ]
  }

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME
  if (!connectionString || !containerName) {
    throw new Error(
      'STORAGE_DRIVER=azure requires AZURE_STORAGE_CONNECTION_STRING and AZURE_STORAGE_CONTAINER_NAME',
    )
  }

  return [
    azureStorage({
      collections: { ...collections },
      allowContainerCreate: process.env.AZURE_STORAGE_ALLOW_CONTAINER_CREATE === 'true',
      baseURL: process.env.AZURE_STORAGE_ACCOUNT_BASEURL || '',
      connectionString,
      containerName,
    }),
  ]
}
