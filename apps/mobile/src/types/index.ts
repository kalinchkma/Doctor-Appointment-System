export type Role = 'admin' | 'patient'

export type User = {
  id: string
  name: string
  email: string
  role: Role
}

export type Media = {
  id: string
  url?: string
  alt?: string
  sizes?: { thumbnail?: { url?: string } }
}

export type Doctor = {
  id: string
  name: string
  specialization: string
  qualifications?: string
  bio?: string
  photo?: Media | string | null
  active: boolean
}

export type SlotStatus = 'available' | 'booked'

export type AppointmentSlot = {
  id: string
  doctor: Doctor | string
  startsAt: string
  durationMinutes: number
  status: SlotStatus
}

export type AppointmentStatus = 'booked' | 'cancelled'

export type Appointment = {
  id: string
  patient: User | string
  doctor: Doctor | string
  slot: AppointmentSlot | string
  status: AppointmentStatus
  bookedAt: string
  cancelledAt?: string | null
  createdAt: string
}

export type Session = { token: string; user: User }

export type ChatSource = { title: string; page?: number }

export type ChatReply = {
  answer: string
  sources: ChatSource[]
  /** False when the knowledge base did not contain enough evidence to answer. */
  grounded: boolean
}

export type ChatSuggestedQuestion = {
  id: string
  question: string
  order: number
  active: boolean
}
