import { getPayload } from 'payload'
import config from '../payload.config'
import { seedChatQuestions } from './chatQuestions'
import { seedDoctors } from './doctors'
import { seedKnowledge, waitForKnowledgeIndex } from './knowledge'
import { seedPatients, DEMO_PATIENTS } from './patients'
import { seedRagSettings } from './ragSettings'
import { seedReviews } from './reviews'
import { seedSlots } from './slots'

// Run with: pnpm seed
// Reads the same PAYLOAD_SECRET and PAYLOAD_DATABASE_URI that the CMS uses.
// Steps are idempotent, so re-running is safe.
async function main() {
  const payload = await getPayload({ config })

  await seedRagSettings(payload)
  await seedPatients(payload)
  await seedDoctors(payload)
  await seedSlots(payload)
  await seedReviews(payload)
  await seedChatQuestions(payload)
  await seedKnowledge(payload)
  await waitForKnowledgeIndex(payload)

  payload.logger.info('seed complete')
  payload.logger.info(
    `demo login: ${DEMO_PATIENTS[0].email} / ${DEMO_PATIENTS[0].password}`,
  )
  process.exit(0)
}

main().catch((error) => {
  console.error('seed failed:', error)
  process.exit(1)
})
