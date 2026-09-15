import { getPayload } from 'payload'
import config from '../payload.config'
import { seedChatQuestions } from './chatQuestions'
import { seedDoctors } from './doctors'
import { seedKnowledge, waitForKnowledgeIndex } from './knowledge'
import { seedSlots } from './slots'

// Run with: pnpm seed
// Reads the same PAYLOAD_SECRET and PAYLOAD_DATABASE_URI that the CMS uses.
// Steps are idempotent, so re-running is safe.
async function main() {
  const payload = await getPayload({ config })

  await seedDoctors(payload)
  await seedSlots(payload)
  await seedChatQuestions(payload)
  await seedKnowledge(payload)
  await waitForKnowledgeIndex(payload)

  payload.logger.info('seed complete')
  process.exit(0)
}

main().catch((error) => {
  console.error('seed failed:', error)
  process.exit(1)
})
