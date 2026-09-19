import type { Payload } from 'payload'

/** Natural prompts aligned with the seeded knowledge PDFs — plus one weak-coverage demo. */
const QUESTIONS: { question: string; order: number }[] = [
  { question: 'What should I eat during pregnancy?', order: 10 },
  { question: 'Do I need to eat for two while pregnant?', order: 20 },
  { question: 'Which vitamins matter most in pregnancy?', order: 30 },
  { question: 'Is alcohol safe at any stage of pregnancy?', order: 40 },
  { question: 'How many antenatal visits does WHO recommend?', order: 50 },
  { question: 'What happens during a prenatal check-up?', order: 60 },
  { question: 'When should my baby start solid foods?', order: 70 },
  { question: 'How often should a 6–8 month old eat each day?', order: 80 },
  { question: 'What is responsive feeding for infants?', order: 90 },
  { question: 'What paracetamol dose is safe in the third trimester?', order: 100 },
  { question: 'গর্ভাবস্থায় কী খাওয়া উচিত?', order: 110 },
  { question: 'গর্ভাবস্থায় কি দুজনের জন্য খেতে হয়?', order: 120 },
  { question: 'Pregnancy te ki khawa uchit?', order: 130 },
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
