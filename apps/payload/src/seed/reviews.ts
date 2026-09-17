import type { Payload } from 'payload'
import { recalculateDoctorRating } from '../lib/doctorRatings'
import { DEMO_PATIENTS } from './patients'

type ReviewSeed = {
  patientEmail: string
  doctorName: string
  rating: number
  comment: string
}

const REVIEWS: ReviewSeed[] = [
  {
    patientEmail: 'ayesha.karim@careconnect.demo',
    doctorName: 'Dr Amara Osei',
    rating: 5,
    comment:
      'Clear explanations about my antenatal visits and diet. The appointment felt unhurried and practical.',
  },
  {
    patientEmail: 'maya.rahman@careconnect.demo',
    doctorName: 'Dr Amara Osei',
    rating: 4,
    comment: 'Very reassuring during my second trimester check. Waiting time was short.',
  },
  {
    patientEmail: 'rahim.uddin@careconnect.demo',
    doctorName: 'Dr Idris Rahman',
    rating: 5,
    comment:
      'Excellent with my daughter’s fever follow-up. Gave a simple home-care plan we could actually follow.',
  },
  {
    patientEmail: 'ayesha.karim@careconnect.demo',
    doctorName: 'Dr Wei Lin Tan',
    rating: 5,
    comment: 'Thorough review of my blood pressure medicines and lifestyle changes. Would book again.',
  },
  {
    patientEmail: 'maya.rahman@careconnect.demo',
    doctorName: 'Dr Nadia Chowdhury',
    rating: 4,
    comment: 'Took my chest discomfort seriously and explained the ECG results in plain language.',
  },
  {
    patientEmail: 'rahim.uddin@careconnect.demo',
    doctorName: 'Dr Farhan Ahmed',
    rating: 5,
    comment: 'Helpful for my knee pain after jogging. Clear physio advice without pushing unnecessary scans.',
  },
  {
    patientEmail: 'ayesha.karim@careconnect.demo',
    doctorName: 'Dr Sabina Yasmin',
    rating: 4,
    comment: 'Good acne treatment plan and honest about what over-the-counter products actually help.',
  },
]

export async function seedReviews(payload: Payload): Promise<void> {
  const patients = await payload.find({
    collection: 'users',
    where: {
      email: { in: DEMO_PATIENTS.map((patient) => patient.email) },
    },
    limit: 20,
    overrideAccess: true,
  })
  const patientByEmail = new Map(patients.docs.map((doc) => [doc.email, doc]))

  const doctors = await payload.find({
    collection: 'doctors',
    limit: 50,
    overrideAccess: true,
  })
  const doctorByName = new Map(doctors.docs.map((doc) => [doc.name, doc]))

  let created = 0
  let skipped = 0

  for (const review of REVIEWS) {
    const patient = patientByEmail.get(review.patientEmail)
    const doctor = doctorByName.get(review.doctorName)
    if (!patient || !doctor) {
      payload.logger.warn(
        `skipping review seed — missing ${!patient ? review.patientEmail : review.doctorName}`,
      )
      continue
    }

    const existing = await payload.find({
      collection: 'doctor-reviews',
      where: {
        and: [
          { patient: { equals: patient.id } },
          { doctor: { equals: doctor.id } },
        ],
      },
      limit: 1,
      overrideAccess: true,
    })

    if (existing.totalDocs > 0) {
      skipped++
      continue
    }

    await payload.create({
      collection: 'doctor-reviews',
      overrideAccess: true,
      data: {
        patient: patient.id,
        patientName: patient.name,
        doctor: doctor.id,
        rating: review.rating,
        comment: review.comment,
      },
    })
    created++
  }

  for (const doctor of doctors.docs) {
    await recalculateDoctorRating(payload, doctor.id)
  }

  payload.logger.info(`seeded doctor reviews: ${created} created, ${skipped} already present`)
}
