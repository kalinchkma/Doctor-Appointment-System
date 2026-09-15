import type { Payload } from 'payload'

const QUESTIONS: { question: string; order: number }[] = [
  // pregnancy-nutrition.pdf
  { question: 'Does energy need to double during pregnancy?', order: 10 },
  { question: 'Which micronutrients are highlighted for pregnancy nutrition?', order: 20 },
  { question: 'What does the pregnancy nutrition guide say about alcohol?', order: 30 },
  // prenatal-care.pdf
  { question: 'How many antenatal contacts did the WHO 2016 model recommend?', order: 40 },
  { question: 'What is the purpose of antenatal care?', order: 50 },
  { question: 'What can maternal assessment include during prenatal care?', order: 60 },
  // child-nutrition.pdf
  { question: 'At what age should complementary foods start?', order: 70 },
  { question: 'How many meals per day are described for ages 6–8 months?', order: 80 },
  { question: 'What is responsive feeding?', order: 90 },
  // Intentionally weakly covered — useful for demos of the fallback path.
  { question: 'What paracetamol dosage is safe in the third trimester?', order: 100 },
]

export async function seedChatQuestions(payload: Payload) {
  const existing = await payload.find({
    collection: 'chat-suggested-questions',
    limit: 200,
    overrideAccess: true,
  })

  for (const doc of existing.docs) {
    await payload.delete({
      collection: 'chat-suggested-questions',
      id: doc.id,
      overrideAccess: true,
    })
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
