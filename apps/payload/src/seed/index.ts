import { getPayload } from 'payload'
import config from '../payload.config'
import { seedDoctors } from './doctors'
import { seedKnowledge } from './knowledge'
import { seedSlots } from './slots'

// Run with: pnpm seed
// Reads the same PAYLOAD_SECRET and PAYLOAD_DATABASE_URI that the CMS uses.
// Both steps are idempotent, so re-running is safe.
async function main() {
  const payload = await getPayload({ config })

  await seedDoctors(payload)
  await seedSlots(payload)
  await seedKnowledge(payload)

  // Knowledge afterChange defers the RAG sync POST until after the create
  // transaction commits (setImmediate). Give those callbacks a chance to fire
  // before this local Payload process exits.
  await new Promise<void>((resolve) => setImmediate(resolve))
  await new Promise<void>((resolve) => setTimeout(resolve, 1500))

  payload.logger.info('seed complete')
  process.exit(0)
}

main().catch((error) => {
  console.error('seed failed:', error)
  process.exit(1)
})
