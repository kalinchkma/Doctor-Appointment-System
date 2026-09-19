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
  experienceYears?: number | null
  photo?: Media | string | null
  address?: string | null
  latitude?: number | null
  longitude?: number | null
  ratingAverage?: number | null
  reviewCount?: number | null
  /** True when the doctor has at least one open slot for the local calendar day. */
  availableToday?: boolean
  active: boolean
}

export type DoctorReview = {
  id: string
  doctor: Doctor | string
  patient: User | string
  patientName?: string | null
  appointment?: string | null
  rating: number
  comment?: string | null
  createdAt: string
}

export type SlotStatus = 'available' | 'booked'

export type AppointmentSlot = {
  id: string
  doctor: Doctor | string
  startsAt: string
  endsAt?: string
  durationMinutes: number
  status: SlotStatus
  scheduleType?: 'once' | 'daily' | 'weekdays'
  seriesId?: string | null
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
  /** Contact details provided at booking so the clinic can reach the patient. */
  contactName?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  /** Special request left by the patient when booking. */
  patientNote?: string | null
  /** Comment from the clinic / doctor, editable in Payload admin. */
  doctorComment?: string | null
  createdAt: string
}

export type BookingContact = {
  contactName: string
  contactPhone: string
  contactEmail: string
}

export type Session = { token: string; user: User }

export type ChatSource = { title: string; page?: number; score?: number }

export type ChatReply = {
  sessionId: string
  answer: string
  sources: ChatSource[]
  /** False when the knowledge base did not contain enough evidence to answer. */
  grounded: boolean
  topScore?: number
  confidence?: number
  reason?: string
}

export type ChatSessionMessage = {
  role: 'user' | 'assistant'
  content: string
  grounded?: boolean
  fromStaff?: boolean
  sources?: ChatSource[]
  createdAt: string
}

export type ChatSession = {
  id: string
  createdAt: string
  updatedAt: string
  messages: ChatSessionMessage[]
}

export type ChatSuggestedQuestion = {
  id: string
  question: string
  order: number
  active: boolean
}

export type ClinicThreadRole = 'patient' | 'staff'

export type ClinicThreadMessage = {
  role: ClinicThreadRole
  body: string
  createdAt: string
}

/** Patient-visible unresolved query. Clinic answers live here, not in RAG chat. */
export type ClinicReply = {
  id: string
  question: string
  status: 'new' | 'resolved'
  humanResponse: string | null
  lastBody?: string | null
  lastRole?: ClinicThreadRole | null
  waitingOn?: 'staff' | 'patient'
  messageCount?: number
  messages?: ClinicThreadMessage[]
  createdAt: string
  updatedAt?: string
  resolvedAt: string | null
}
