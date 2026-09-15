'use client'

import { useEffect, useMemo, useState } from 'react'
import { useField } from '@payloadcms/ui'
import type { Map as LeafletMap } from 'leaflet'

type LatLng = { lat: number; lng: number }
type LeafletReact = typeof import('react-leaflet')

const DEFAULT_CENTER: LatLng = { lat: 23.8103, lng: 90.4125 }

function ClickCapture({
  useMapEvents,
  onPick,
}: {
  useMapEvents: LeafletReact['useMapEvents']
  onPick: (point: LatLng) => void
}) {
  useMapEvents({
    click(event) {
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng })
    },
  })
  return null
}

function MapViewSync({
  useMap,
  center,
}: {
  useMap: LeafletReact['useMap']
  center: LatLng
}) {
  const map = useMap() as LeafletMap
  useEffect(() => {
    map.setView(center)
  }, [center, map])
  return null
}

/**
 * OpenStreetMap picker for doctor clinic location.
 * Writes latitude / longitude / address on the doctor document.
 * Leaflet is loaded only in the browser to avoid Next SSR crashes.
 */
export function LocationMapField() {
  const { value: latitude, setValue: setLatitude } = useField<number | null>({ path: 'latitude' })
  const { value: longitude, setValue: setLongitude } = useField<number | null>({ path: 'longitude' })
  const { value: address, setValue: setAddress } = useField<string>({ path: 'address' })
  const [leaflet, setLeaflet] = useState<LeafletReact | null>(null)
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [hint, setHint] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await import('leaflet/dist/leaflet.css')
      const L = await import('leaflet')
      const reactLeaflet = await import('react-leaflet')
      // Bundlers break Leaflet's default marker paths; point them at CDN assets.
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
  }, [])

  const hasPin = typeof latitude === 'number' && typeof longitude === 'number'
  const position = useMemo<LatLng>(
    () => (hasPin ? { lat: latitude, lng: longitude } : DEFAULT_CENTER),
    [hasPin, latitude, longitude],
  )

  const applyPoint = async (point: LatLng, resolvedAddress?: string) => {
    setLatitude(Number(point.lat.toFixed(6)))
    setLongitude(Number(point.lng.toFixed(6)))
    if (resolvedAddress) {
      setAddress(resolvedAddress)
      return
    }
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${point.lat}&lon=${point.lng}`,
        { headers: { Accept: 'application/json' } },
      )
      if (!response.ok) return
      const data = (await response.json()) as { display_name?: string }
      if (data.display_name) setAddress(data.display_name)
    } catch {
      // Address lookup is best-effort; coordinates still save.
    }
  }

  const runSearch = async () => {
    const query = search.trim()
    if (!query) return
    setSearching(true)
    setHint('')
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
        { headers: { Accept: 'application/json' } },
      )
      if (!response.ok) {
        setHint('Search failed. Try again or click the map.')
        return
      }
      const results = (await response.json()) as {
        lat: string
        lon: string
        display_name?: string
      }[]
      const hit = results[0]
      if (!hit) {
        setHint('No places found for that search.')
        return
      }
      await applyPoint({ lat: Number(hit.lat), lng: Number(hit.lon) }, hit.display_name)
      setHint('Location updated from search.')
    } catch {
      setHint('Search failed. Try again or click the map.')
    } finally {
      setSearching(false)
    }
  }

  const MapContainer = leaflet?.MapContainer
  const TileLayer = leaflet?.TileLayer
  const Marker = leaflet?.Marker

  return (
    <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search clinic address (OpenStreetMap)"
          style={{
            flex: '1 1 220px',
            padding: '10px 12px',
            border: '1px solid #c9d4d0',
            borderRadius: 8,
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void runSearch()
            }
          }}
        />
        <button
          type="button"
          onClick={() => void runSearch()}
          disabled={searching}
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            border: 'none',
            background: '#166b61',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
        {hasPin && (
          <button
            type="button"
            onClick={() => {
              setLatitude(null)
              setLongitude(null)
              setAddress('')
              setHint('Location cleared.')
            }}
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #c9d4d0',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            Clear pin
          </button>
        )}
      </div>
      <div style={{ height: 320, borderRadius: 12, overflow: 'hidden', border: '1px solid #d5e0dc' }}>
        {!MapContainer || !TileLayer || !Marker || !leaflet ? (
          <p style={{ padding: 16, color: '#667' }}>Loading map…</p>
        ) : (
          <MapContainer
            center={position}
            zoom={hasPin ? 15 : 12}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <ClickCapture useMapEvents={leaflet.useMapEvents} onPick={(point) => void applyPoint(point)} />
            {hasPin && <Marker position={position} />}
            <MapViewSync useMap={leaflet.useMap} center={position} />
          </MapContainer>
        )}
      </div>
      <p style={{ margin: 0, color: '#5b6b67', fontSize: 13 }}>
        Click the map to drop a pin. Coordinates:{' '}
        {hasPin ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` : 'not set'}
        {address ? ` — ${address}` : ''}
      </p>
      {hint ? <p style={{ margin: 0, color: '#166b61', fontSize: 13 }}>{hint}</p> : null}
    </div>
  )
}

export default LocationMapField
