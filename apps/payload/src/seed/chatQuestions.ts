import type { Payload } from 'payload'

const QUESTIONS: { question: string; order: number }[] = [
  { question: 'Why is folic acid important during pregnancy?', order: 10 },
  { question: 'Which foods are commonly advised against during pregnancy?', order: 20 },
  { question: 'What warning signs in pregnancy need same-day medical attention?', order: 30 },
  { question: 'How often are prenatal visits scheduled after 28 weeks?', order: 40 },
  { question: 'When are complementary foods usually introduced?', order: 50 },
  { question: 'Why should honey not be given to infants under twelve months?', order: 60 },
  { question: 'What does a typical prenatal visit include?', order: 70 },
  // Intentionally weakly covered — useful for demos of the fallback path.
  { question: 'What paracetamol dosage is safe in the third trimester?', order: 80 },
]

export async function seedChatQuestions(payload: Payload) {
  const existing = await payload.find({
    collection: 'chat-suggested-questions',
    limit: 1,
    overrideAccess: true,
  })
  if (existing.totalDocs > 0) {
    payload.logger.info(
      `chat suggested questions already present (${existing.totalDocs}+), skipping`,
    )
    return
  }

  for (const item of QUESTIONS) {
    await payload.create({
      collection: 'chat-suggested-questions',
      overrideAccess: true,
      data: { ...item, active: true },
    })
  }

  payload.logger.info(`seeded ${QUESTIONS.length} chat suggested questions`)
}
