import { useEffect, useState } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import type { Doctor } from '../types'
import { googleMapsUrl, hasDoctorLocation } from '../lib/maps'

type LeafletReact = typeof import('react-leaflet')

function MapViewSync({
  useMap,
  center,
}: {
  useMap: LeafletReact['useMap']
  center: [number, number]
}) {
  const map = useMap() as LeafletMap
  useEffect(() => {
    map.setView(center, 15)
  }, [center, map])
  return null
}

type Props = {
  doctor: Doctor
  compact?: boolean
}

/**
 * OpenStreetMap preview of a doctor's clinic, with a Google Maps deep link.
 */
export function DoctorMap({ doctor, compact }: Props) {
  const [leaflet, setLeaflet] = useState<LeafletReact | null>(null)

  useEffect(() => {
    if (!hasDoctorLocation(doctor)) return
    let cancelled = false
    void (async () => {
      await import('leaflet/dist/leaflet.css')
      const L = await import('leaflet')
      const reactLeaflet = await import('react-leaflet')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })
      if (!cancelled) setLeaflet(reactLeaflet)
    })()
    return () => {
      cancelled = true
    }
  }, [doctor])

  if (!hasDoctorLocation(doctor)) return null

  const center: [number, number] = [doctor.latitude, doctor.longitude]
  const mapsUrl = googleMapsUrl(doctor.latitude, doctor.longitude, doctor.address)
  const MapContainer = leaflet?.MapContainer
  const TileLayer = leaflet?.TileLayer
  const Marker = leaflet?.Marker

  return (
    <section className={`doctor-map${compact ? ' compact' : ''}`}>
      <div className="doctor-map-head">
        <h2>Clinic location</h2>
        <a className="maps-link" href={mapsUrl} target="_blank" rel="noreferrer">
          Open in Google Maps
        </a>
      </div>
      {doctor.address && <p className="doctor-address">{doctor.address}</p>}
      <div className="doctor-map-frame">
        {!MapContainer || !TileLayer || !Marker || !leaflet ? (
          <p className="map-loading">Loading map…</p>
        ) : (
          <MapContainer
            center={center}
            zoom={15}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={center} />
            <MapViewSync useMap={leaflet.useMap} center={center} />
          </MapContainer>
        )}
      </div>
    </section>
  )
}
