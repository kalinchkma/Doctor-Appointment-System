import type { Payload } from 'payload'

/** Recompute cached ratingAverage / reviewCount on the doctor document. */
export async function recalculateDoctorRating(payload: Payload, doctorId: string): Promise<void> {
  const reviews = await payload.find({
    collection: 'doctor-reviews',
    where: { doctor: { equals: doctorId } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })

  const reviewCount = reviews.totalDocs
  const ratingAverage =
    reviewCount === 0
      ? 0
      : Math.round(
          (reviews.docs.reduce((sum, review) => sum + (review.rating ?? 0), 0) / reviewCount) * 10,
        ) / 10

  await payload.update({
    collection: 'doctors',
    id: doctorId,
    overrideAccess: true,
    data: { ratingAverage, reviewCount },
  })
}
