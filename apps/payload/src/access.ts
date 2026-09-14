import type { Access } from 'payload'

export const anyone: Access = () => true
export const authenticated: Access = ({ req: { user } }) => Boolean(user)
export const admins: Access = ({ req: { user } }) => user?.role === 'admin'
export const adminsOrSelf: Access = ({ req: { user } }) => {
  if (user?.role === 'admin') return true
  return user ? { id: { equals: user.id } } : false
}
export const ownAppointments: Access = ({ req: { user } }) => {
  if (user?.role === 'admin') return true
  return user ? { patient: { equals: user.id } } : false
}
