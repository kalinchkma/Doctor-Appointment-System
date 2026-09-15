import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CollectionConfig } from 'payload'
import { admins, anyone } from '../../access'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Doctor profile photos. Uploads are handled by Payload rather than by storing an
// external URL, so the admin panel can manage the files and sharp can derive the
// list thumbnail without the mobile app downloading a full-size image.
export const Media: CollectionConfig = {
  slug: 'media',
  admin: { useAsTitle: 'alt' },
  access: { read: anyone, create: admins, update: admins, delete: admins },
  upload: {
    staticDir: path.resolve(dirname, '../../../media'),
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    imageSizes: [{ name: 'thumbnail', width: 320, height: 320, position: 'centre' }],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      admin: { description: 'Describes the image for screen readers.' },
    },
  ],
}
