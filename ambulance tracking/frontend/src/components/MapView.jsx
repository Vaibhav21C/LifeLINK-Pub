import { useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { congestionColor } from '../utils/helpers';

// Fix default marker icon issue with bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const ALT_ROUTE_COLORS = ['#22c55e', '#3b82f6', '#a855f7'];

/** Custom hospital icon */
function createHospitalIcon(selected) {
    return L.divIcon({
        className: 'hospital-marker-wrapper',
        html: `<div class="hospital-marker ${selected ? 'selected' : ''}">🏥</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
    });
}

/** Custom incident icon */
function createIncidentIcon() {
    return L.divIcon({
        className: 'incident-marker-wrapper',
        html: `<div class="incident-marker">📍</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
    });
}

/** Custom ambulance siren icon with rotation */
function createSirenIcon(heading = 0) {
    return L.divIcon({
        className: 'siren-marker',
        html: `
      <div style="position:relative;width:48px;height:48px;display:flex;align-items:center;justify-content:center;">
        <div class="siren-ring"></div>
        <div class="siren-ring" style="animation-delay:0.5s"></div>
        <span class="siren-icon" style="transform:rotate(${heading}deg);display:inline-block;font-size:30px;">🚑</span>
      </div>
    `,
        iconSize: [48, 48],
        iconAnchor: [24, 24],
    });
}

/** Map click handler to set incident location */
function MapClickHandler({ onMapClick }) {
    useMapEvents({
        click(e) {
            onMapClick(e.latlng);
        },
    });
    return null;
}

/** Fly-to on center change */
function FlyTo({ center }) {
    const map = useMap();
    useEffect(() => {
        if (center) map.flyTo(center, 14, { duration: 1.2 });
    }, [center, map]);
    return null;
}

/**
 * Build congestion-colored polyline segments from route geometry
 * and congestion annotation data.
 */
function buildCongestionSegments(geometry, congestionData) {
    if (!geometry || !geometry.coordinates) return [];

    const coords = geometry.coordinates; // [lng, lat]
    const segments = [];

    if (!congestionData || congestionData.length === 0) {
        segments.push({
            positions: coords.map(c => [c[1], c[0]]),
            color: '#3b82f6',
        });
        return segments;
    }

    for (let i = 0; i < congestionData.length && i < coords.length - 1; i++) {
        segments.push({
            positions: [
                [coords[i][1], coords[i][0]],
                [coords[i + 1][1], coords[i + 1][0]],
            ],
            color: congestionColor(congestionData[i].congestion),
            congestion: congestionData[i].congestion,
        });
    }

    return segments;
}

export default function MapView({
    incidentPos,
    setIncidentPos,
    hospitals,
    selectedHospital,
    onSelectHospital,
    routeData,
    showComparison,
    sirenPos,
    sirenHeading,
    flyToCenter,
    alternativeRoutes,
    selectedRouteIndex,
}) {
    const mapRef = useRef(null);

    // Build segments for active route
    const activeRoute = alternativeRoutes?.[selectedRouteIndex];
    const trafficSegments = activeRoute
        ? buildCongestionSegments(activeRoute.geometry, activeRoute.congestion_segments)
        : routeData
            ? buildCongestionSegments(routeData.traffic_route.geometry, routeData.traffic_route.congestion_segments)
            : [];

    const staticCoords = routeData?.static_route?.geometry?.coordinates?.map(c => [c[1], c[0]]) || [];

    // Build ghost routes (non-selected alternatives)
    const ghostRoutes = useMemo(() => {
        if (!alternativeRoutes || alternativeRoutes.length <= 1) return [];
        return alternativeRoutes
            .map((r, i) => ({
                index: i,
                coords: r.geometry?.coordinates?.map(c => [c[1], c[0]]) || [],
                color: ALT_ROUTE_COLORS[i] || '#64748b',
            }))
            .filter((_, i) => i !== selectedRouteIndex);
    }, [alternativeRoutes, selectedRouteIndex]);

    // Memoize the siren icon so it only updates when heading changes significantly
    const sirenIcon = useMemo(() => createSirenIcon(sirenHeading || 0), [Math.round((sirenHeading || 0) / 5) * 5]);

    return (
        <MapContainer
            center={[22.754, 77.7271]}
            zoom={13}
            className="w-full h-full"
            ref={mapRef}
            zoomControl={true}
        >
            <TileLayer
                url={`https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`}
                attribution='&copy; <a href="https://www.mapbox.com/">Mapbox</a>'
                tileSize={512}
                zoomOffset={-1}
            />

            <MapClickHandler onMapClick={(latlng) => setIncidentPos(latlng)} />
            {flyToCenter && <FlyTo center={flyToCenter} />}

            {/* Incident Marker */}
            {incidentPos && (
                <Marker
                    position={[incidentPos.lat, incidentPos.lng]}
                    icon={createIncidentIcon()}
                    draggable={true}
                    eventHandlers={{
                        dragend: (e) => {
                            const m = e.target;
                            const pos = m.getLatLng();
                            setIncidentPos({ lat: pos.lat, lng: pos.lng });
                        },
                    }}
                />
            )}

            {/* Hospital Markers */}
            {hospitals.map((h) => (
                <Marker
                    key={h.id}
                    position={[h.lat, h.lng]}
                    icon={createHospitalIcon(selectedHospital?.id === h.id)}
                    eventHandlers={{
                        click: () => onSelectHospital(h),
                    }}
                />
            ))}

            {/* Ghost alternative routes (thin, dashed) */}
            {ghostRoutes.map((gr) => (
                <Polyline
                    key={`ghost-${gr.index}`}
                    positions={gr.coords}
                    pathOptions={{
                        color: gr.color,
                        weight: 3,
                        opacity: 0.35,
                        dashArray: '8 6',
                    }}
                />
            ))}

            {/* Comparison: Static Route (dashed gray) */}
            {showComparison && staticCoords.length > 0 && (
                <Polyline
                    positions={staticCoords}
                    pathOptions={{
                        color: '#64748b',
                        weight: 4,
                        opacity: 0.6,
                        dashArray: '10 8',
                    }}
                />
            )}

            {/* Active traffic-aware route (colored segments) */}
            {trafficSegments.map((seg, i) => (
                <Polyline
                    key={`traffic-${i}`}
                    positions={seg.positions}
                    pathOptions={{
                        color: seg.color,
                        weight: 5,
                        opacity: 0.9,
                    }}
                />
            ))}

            {/* Ambulance Siren with rotation */}
            {sirenPos && (
                <Marker
                    position={[sirenPos.lat, sirenPos.lng]}
                    icon={sirenIcon}
                    zIndexOffset={1000}
                />
            )}
        </MapContainer>
    );
}
