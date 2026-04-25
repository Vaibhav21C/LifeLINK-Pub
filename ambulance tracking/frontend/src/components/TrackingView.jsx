import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { congestionColor, formatDuration, formatDistance } from '../utils/helpers';
import { fetchHospitals, fetchRoute, fetchAlternativeRoutes, fetchReroute } from '../services/api';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
mapboxgl.accessToken = MAPBOX_TOKEN;
const CIVIC_FACTOR = 1.2;

/* ============ HELPERS ============ */
function calcBearing(lat1, lng1, lat2, lng2) {
    const toRad = Math.PI / 180;
    const dLng = (lng2 - lng1) * toRad;
    const y = Math.sin(dLng) * Math.cos(lat2 * toRad);
    const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) - Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLng);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}
function getTurnDirection(b1, b2) {
    let d = ((b2 - b1) + 360) % 360; if (d > 180) d -= 360;
    if (Math.abs(d) < 20) return { text: 'Continue straight', arrow: '↑' };
    if (d > 0 && d < 60) return { text: 'Bear right', arrow: '↗' };
    if (d >= 60 && d < 120) return { text: 'Turn right', arrow: '→' };
    if (d >= 120) return { text: 'Sharp right', arrow: '↘' };
    if (d < 0 && d > -60) return { text: 'Bear left', arrow: '↖' };
    if (d <= -60 && d > -120) return { text: 'Turn left', arrow: '←' };
    return { text: 'Sharp left', arrow: '↙' };
}
function getCardinal(b) { return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(b / 45) % 8]; }
function getEtaTime(s) { const d = new Date(); d.setSeconds(d.getSeconds() + s); return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function getDefaultSpeedLimit(c) { if (c === 'heavy' || c === 'severe') return 30; if (c === 'moderate') return 40; return 50; }

/* ============ LEAFLET TPP MAP HELPERS ============ */
function buildCongestionPolylines(geometry, congestionSegs) {
    if (!geometry?.coordinates) return [];
    const coords = geometry.coordinates;
    if (!congestionSegs?.length) return [{ positions: coords.map(c => [c[1], c[0]]), color: '#4285f4' }];
    const segs = [];
    for (let i = 0; i < congestionSegs.length && i < coords.length - 1; i++) {
        segs.push({
            positions: [[coords[i][1], coords[i][0]], [coords[i + 1][1], coords[i + 1][0]]],
            color: congestionColor(congestionSegs[i].congestion),
        });
    }
    return segs;
}
function createIcon(emoji, size = 32) {
    return L.divIcon({ className: '', html: `<div style="font-size:${size}px;text-align:center">${emoji}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}
function FitBounds({ bounds }) {
    const map = useMap();
    useEffect(() => { if (bounds) map.fitBounds(bounds, { padding: [40, 40] }); }, [bounds, map]);
    return null;
}

const glass = {
    background: 'rgba(15, 23, 42, 0.85)',
    backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(148, 163, 184, 0.25)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
};



/* ============ MAIN COMPONENT ============ */
export default function TrackingView({ incidentPos, onBack }) {
    const [phase, setPhase] = useState('finding');
    const [hospitals, setHospitals] = useState([]);
    const [selectedHospital, setSelectedHospital] = useState(null);
    const [routeData, setRouteData] = useState(null);
    const [altRoutes, setAltRoutes] = useState([]);
    const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
    const [currentSpeed, setCurrentSpeed] = useState(0);
    const [speedLimit, setSpeedLimit] = useState(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [autoFollow, setAutoFollow] = useState(true);
    const [showRoutes, setShowRoutes] = useState(false);
    const [currentTurn, setCurrentTurn] = useState({ text: 'Calculating...', arrow: '↑' });
    const [nextTurn, setNextTurn] = useState(null);
    const [currentRoad, setCurrentRoad] = useState('');
    const [nextRoad, setNextRoad] = useState('');
    const [congestionLevel, setCongestionLevel] = useState('low');
    const [sirenActive] = useState(true);
    const [routeProgress, setRouteProgress] = useState(0);
    const [soundOn, setSoundOn] = useState(false);
    const [timeSaved, setTimeSaved] = useState(0);
    const [distToNextTurn, setDistToNextTurn] = useState(0);


    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const markerRef = useRef(null);
    const minimapContainerRef = useRef(null);
    const minimapRef = useRef(null);
    const minimapMarkerRef = useRef(null);
    const animFrameRef = useRef(null);
    const simStartRef = useRef(null);
    const autoStartTimerRef = useRef(null);

    // ---- Init: find hospitals + route from crash site → nearest hospital ----
    useEffect(() => {
        if (!incidentPos) return;

        (async () => {
            try {
                const hospData = await fetchHospitals(incidentPos.lat, incidentPos.lng);
                const hosp = hospData.hospitals || [];
                setHospitals(hosp);
                if (!hosp.length) return;
                const best = hosp[0];
                setSelectedHospital(best);
                // Route from crash site → nearest hospital
                const [routeResp, altResp] = await Promise.all([
                    fetchRoute(incidentPos.lat, incidentPos.lng, best.lat, best.lng),
                    fetchAlternativeRoutes(incidentPos.lat, incidentPos.lng, best.lat, best.lng).catch(() => ({ routes: [] })),
                ]);
                setRouteData(routeResp);
                setTimeSaved(routeResp.time_saved_s || 0);
                setAltRoutes(altResp.routes || []);
                setPhase('ready');
            } catch (e) { console.error(e); }
        })();
    }, [incidentPos]);

    // ---- Switch hospital: re-fetch routes for chosen hospital ----
    const switchHospital = useCallback(async (hosp) => {
        if (hosp.id === selectedHospital?.id) return;
        setSelectedHospital(hosp);
        setSelectedRouteIdx(0);
        try {
            const [routeResp, altResp] = await Promise.all([
                fetchRoute(incidentPos.lat, incidentPos.lng, hosp.lat, hosp.lng),
                fetchAlternativeRoutes(incidentPos.lat, incidentPos.lng, hosp.lat, hosp.lng).catch(() => ({ routes: [] })),
            ]);
            setRouteData(routeResp);
            setTimeSaved(routeResp.time_saved_s || 0);
            setAltRoutes(altResp.routes || []);
        } catch (e) { console.error(e); }
    }, [incidentPos, selectedHospital]);


    const activeRoute = altRoutes[selectedRouteIdx];
    const adjustedDuration = activeRoute?.adjusted_duration_s || routeData?.traffic_route?.adjusted_duration_s || 0;
    const totalDistanceM = activeRoute?.distance_m || routeData?.traffic_route?.distance_m || 0;
    const remaining = Math.max(0, adjustedDuration - elapsedTime);
    const remainingMin = Math.ceil(remaining / 60);
    const navSteps = useMemo(() => activeRoute?.nav_steps || routeData?.traffic_route?.nav_steps || [], [activeRoute, routeData]);
    // Build Leaflet congestion polylines for TPP overview
    const tppSegments = useMemo(() => {
        const route = activeRoute || routeData?.traffic_route;
        if (!route) return [];
        return buildCongestionPolylines(route.geometry, route.congestion_segments);
    }, [activeRoute, routeData]);
    const altTppSegments = useMemo(() => {
        if (!altRoutes?.length) return [];
        return altRoutes.map((r, i) => ({
            index: i,
            segments: buildCongestionPolylines(r.geometry, r.congestion_segments),
            color: ['#4285f4', '#34a853', '#a855f7'][i] || '#64748b',
        }));
    }, [altRoutes]);
    const routeBounds = useMemo(() => {
        if (!incidentPos || !selectedHospital) return null;
        return L.latLngBounds([[incidentPos.lat, incidentPos.lng], [selectedHospital.lat, selectedHospital.lng]]);
    }, [incidentPos, selectedHospital]);

    const isOverSpeedLimit = speedLimit && currentSpeed > speedLimit;

    const trafficBreakdown = useMemo(() => {
        const segs = activeRoute?.congestion_segments || routeData?.traffic_route?.congestion_segments || [];
        if (!segs.length) return { green: 100, orange: 0, red: 0 };
        let g = 0, o = 0, r = 0, tot = 0;
        segs.forEach(s => { const d = s.distance_m || 1; tot += d; const c = s.congestion || ''; if (c === 'heavy' || c === 'severe') r += d; else if (c === 'moderate') o += d; else g += d; });
        return { green: Math.round(g / tot * 100), orange: Math.round(o / tot * 100), red: Math.round(r / tot * 100) };
    }, [activeRoute, routeData]);

    // ---- Initialize 3D Mapbox GL map when tracking starts ----
    const initMap = useCallback((startCoords, bearing, routeGeoJSON) => {
        if (mapRef.current) mapRef.current.remove();
        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: 'mapbox://styles/mapbox/navigation-night-v1',
            center: [startCoords.lng, startCoords.lat],
            zoom: 18.5,
            pitch: 65,
            bearing: bearing,
            antialias: true,
            interactive: true,
        });
        mapRef.current = map;

        // Force resize to fill container properly
        setTimeout(() => map.resize(), 100);

        map.on('load', () => {
            // Route line
            map.addSource('route', { type: 'geojson', data: routeGeoJSON });
            map.addLayer({
                id: 'route-line', type: 'line', source: 'route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#4285f4', 'line-width': 8, 'line-opacity': 0.85 },
            });
            // Route glow
            map.addLayer({
                id: 'route-glow', type: 'line', source: 'route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#4285f4', 'line-width': 16, 'line-opacity': 0.15, 'line-blur': 8 },
            }, 'route-line');

            // Incident marker
            new mapboxgl.Marker({ color: '#f59e0b' })
                .setLngLat([incidentPos.lng, incidentPos.lat])
                .addTo(map);

            // Hospital markers
            hospitals.forEach(h => {
                new mapboxgl.Marker({ color: selectedHospital?.id === h.id ? '#22c55e' : '#ef4444' })
                    .setLngLat([h.lng, h.lat]).addTo(map);
            });

            // 3D buildings for immersion
            const layers = map.getStyle().layers;
            const labelLayerId = layers.find(l => l.type === 'symbol' && l.layout['text-field'])?.id;
            if (labelLayerId) {
                map.addLayer({
                    id: '3d-buildings', source: 'composite', 'source-layer': 'building', filter: ['==', 'extrude', 'true'],
                    type: 'fill-extrusion', minzoom: 14,
                    paint: {
                        'fill-extrusion-color': '#1a1f36',
                        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.05, ['get', 'height']],
                        'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.05, ['get', 'min_height']],
                        'fill-extrusion-opacity': 0.7,
                    },
                }, labelLayerId);
            }
        });

        // Ambulance marker (DOM element)
        const el = document.createElement('div');
        el.style.width = '40px';
        el.style.height = '40px';
        el.style.position = 'relative';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.innerHTML = '<div style="position:absolute;inset:0;border-radius:50%;background:rgba(239,68,68,0.2);border:2px solid rgba(239,68,68,0.6);animation:pulse-ring 2s ease-in-out infinite"></div>' +
            '<div style="width:28px;height:28px;border-radius:50%;background:rgba(30,41,59,0.85);border:2px solid rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" fill="white"/></svg></div>';
        el.style.transition = 'transform 0.1s';
        markerRef.current = new mapboxgl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' })
            .setLngLat([startCoords.lng, startCoords.lat])
            .addTo(map);

        return map;
    }, [incidentPos, hospitals, selectedHospital]);

    // ---- SIMULATION ENGINE ----
    const handleStart = useCallback(() => {
        const routeGeom = activeRoute?.geometry || routeData?.traffic_route?.geometry;
        const segSpeeds = activeRoute?.segment_speeds || routeData?.traffic_route?.congestion_segments?.map(s => ({
            speed_ms: (s.speed_kmh || 30) / 3.6, distance_m: s.distance_m || 50, congestion: s.congestion,
            speed_limit_kmh: s.speed_limit_kmh || null,
        })) || [];
        if (!routeGeom?.coordinates) return;
        
        // Convert to array of {lat, lng} for simulation
        let fullCoords = routeGeom.coordinates.map(c => ({ lat: c[1], lng: c[0] }));
        
        // Trim the end of the route (keep ambulance slightly away from hospital)
        // Mercator coordinate math approximation for ~50-100m depending on segment density
        let trimCount = Math.min(Math.floor(fullCoords.length * 0.05), 10); // Remove last 5-10 points max
        trimCount = Math.max(trimCount, 2); // Always remove at least a little bit
        const coords = fullCoords.slice(0, fullCoords.length - trimCount);

        // Build route GeoJSON for map
        const routeGeoJSON = { type: 'Feature', geometry: routeGeom, properties: {} };

        // --- SYNC ROUTE WITH ER DASHBOARD ---
        fetch('/api/sync-route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                incident_id: "CRASH-991", // Demo fixed ID
                hospital_name: selectedHospital.name,
                hosp_lat: selectedHospital.lat,
                hosp_lng: selectedHospital.lng,
                route_geometry: fullCoords.map(c => [c.lng, c.lat]) // Send GeoJSON format
            })
        }).catch(e => console.error("Failed to sync route:", e));

        // Bearings
        const bearings = [];
        for (let i = 0; i < coords.length - 1; i++) {
            bearings.push(calcBearing(coords[i].lat, coords[i].lng, coords[i + 1].lat, coords[i + 1].lng));
        }

        // Cumulative distances
        const cumDists = [0];
        for (let i = 0; i < coords.length - 1; i++) {
            cumDists.push(cumDists[i] + (segSpeeds[i]?.distance_m || 50));
        }

        // Duration calculations
        const realDurations = [];
        let totalReal = 0;
        for (let i = 0; i < coords.length - 1; i++) {
            const sd = segSpeeds[i] || { speed_ms: 10, distance_m: 50 };
            const dur = (sd.distance_m / Math.max(sd.speed_ms, 1)) * 1000;
            realDurations.push(dur); totalReal += dur;
        }
        const targetMs = Math.min(totalReal, 240000);
        const speedUp = totalReal / targetMs;
        const adjDurations = realDurations.map(d => d / speedUp);
        const totalSimMs = adjDurations.reduce((a, b) => a + b, 0);

        // Init 3D map
        const map = initMap(coords[0], bearings[0], routeGeoJSON);

        // Init minimap (TPP overview in bottom-right)
        setTimeout(() => {
            if (!minimapContainerRef.current) return;
            if (minimapRef.current) minimapRef.current.remove();
            const mm = new mapboxgl.Map({
                container: minimapContainerRef.current,
                style: 'mapbox://styles/mapbox/dark-v11',
                center: [coords[0].lng, coords[0].lat],
                zoom: 12,
                pitch: 0,
                bearing: 0,
                interactive: false,
            });
            minimapRef.current = mm;
            mm.on('load', () => {
                mm.addSource('mm-route', { type: 'geojson', data: routeGeoJSON });
                mm.addLayer({ id: 'mm-route-line', type: 'line', source: 'mm-route', paint: { 'line-color': '#4285f4', 'line-width': 3, 'line-opacity': 0.8 } });
                // Fit to route bounds
                const lngs = coords.map(c => c.lng), lats = coords.map(c => c.lat);
                mm.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 30 });
            });
            // Minimap ambulance marker
            const mel = document.createElement('div');
            mel.innerHTML = '🚑';
            mel.style.fontSize = '18px';
            minimapMarkerRef.current = new mapboxgl.Marker({ element: mel })
                .setLngLat([coords[0].lng, coords[0].lat]).addTo(mm);
        }, 200);

        setPhase('tracking');
        setElapsedTime(0);
        setAutoFollow(true);
        simStartRef.current = Date.now();

        function animate() {
            const elapsed = Date.now() - simStartRef.current;
            if (elapsed >= totalSimMs) {
                markerRef.current?.setLngLat([coords[coords.length - 1].lng, coords[coords.length - 1].lat]);
                setElapsedTime(adjustedDuration);
                setCurrentSpeed(0); setSpeedLimit(null);
                setCurrentTurn({ text: 'You have arrived!', arrow: '🏥' });
                setNextTurn(null); setCurrentRoad(''); setRouteProgress(1);
                setPhase('arrived');
                return;
            }

            let acc = 0, segIdx = 0;
            for (let i = 0; i < adjDurations.length; i++) {
                if (acc + adjDurations[i] > elapsed) { segIdx = i; break; }
                acc += adjDurations[i]; segIdx = i;
            }
            const segProgress = Math.min((elapsed - acc) / Math.max(adjDurations[segIdx], 1), 1);
            const lat = coords[segIdx].lat + (coords[segIdx + 1].lat - coords[segIdx].lat) * segProgress;
            const lng = coords[segIdx].lng + (coords[segIdx + 1].lng - coords[segIdx].lng) * segProgress;
            const bearing = bearings[segIdx];

            // Update marker
            if (markerRef.current) {
                markerRef.current.setLngLat([lng, lat]);
                markerRef.current.getElement().style.transform = `rotate(${bearing - 90}deg)`;
            }
            // Update minimap marker
            if (minimapMarkerRef.current) {
                minimapMarkerRef.current.setLngLat([lng, lat]);
            }

            // FPP camera: follow behind the ambulance, looking forward
            if (map && autoFollow) {
                map.easeTo({
                    center: [lng, lat],
                    bearing: bearing,
                    pitch: 65,
                    zoom: 18.5,
                    duration: 100,
                    easing: t => t,
                });
            }

            // --- SEND REAL-TIME LOCATION TO BACKEND FOR ER DASHBOARD ---
            // Throttle to roughly once every 2 seconds (assuming 60fps animate calls, ~120 frames)
            if (!window._lastLocationUpdate || elapsed - window._lastLocationUpdate > 2000) {
                window._lastLocationUpdate = elapsed;
                fetch('/api/update-ambulance-location', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        incident_id: "CRASH-991", // Assuming fixed for this demo
                        lat: lat,
                        lng: lng
                    })
                }).catch(e => console.error("Failed to update ER dashboard:", e));
            }

            // Direction
            setCurrentTurn({ text: `Head ${getCardinal(bearing)}`, arrow: '↑' });
            if (segIdx + 1 < bearings.length) setNextTurn(getTurnDirection(bearing, bearings[segIdx + 1]));
            else setNextTurn({ text: 'Arrive at hospital', arrow: '🏥' });

            // Speed + limit
            const segData = segSpeeds[segIdx] || {};
            setCurrentSpeed(Math.round((segData.speed_ms || 10) * 3.6));
            setSpeedLimit(segData.speed_limit_kmh || getDefaultSpeedLimit(segData.congestion));
            setCongestionLevel(segData.congestion || 'low');

            // Road name + distance to next turn
            const currentDist = cumDists[segIdx] + segProgress * (segSpeeds[segIdx]?.distance_m || 50);
            let stepIdx = 0;
            for (let i = 0; i < navSteps.length; i++) {
                if (navSteps[i].cumulative_distance_m <= currentDist) stepIdx = i; else break;
            }
            setCurrentRoad(navSteps[stepIdx]?.road_name || '');
            setNextRoad(navSteps[stepIdx + 1]?.road_name || '');
            const nxtDist = navSteps[stepIdx + 1]?.cumulative_distance_m;
            setDistToNextTurn(nxtDist ? Math.max(0, Math.round(nxtDist - currentDist)) : 0);

            setRouteProgress(elapsed / totalSimMs);
            setElapsedTime((elapsed / totalSimMs) * adjustedDuration);
            animFrameRef.current = requestAnimationFrame(animate);
        }

        // Wait for map load before animating
        map.on('load', () => {
            animFrameRef.current = requestAnimationFrame(animate);
        });
    }, [activeRoute, routeData, adjustedDuration, navSteps, initMap, autoFollow]);

    // ---- AUTO-START: After route is ready, auto-start navigation after 2s ----
    useEffect(() => {
        if (phase === 'ready' && selectedHospital && routeData) {
            autoStartTimerRef.current = setTimeout(() => {
                handleStart();
            }, 2000); // Show route overview for 2 seconds, then auto-start
        }
        return () => {
            if (autoStartTimerRef.current) clearTimeout(autoStartTimerRef.current);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, selectedHospital, routeData, handleStart]);

    const handleStop = useCallback(() => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
        if (minimapRef.current) { minimapRef.current.remove(); minimapRef.current = null; }
        setCurrentSpeed(0); setElapsedTime(0); setPhase('ready');
    }, []);

    const handleReroute = useCallback(async () => {
        // Placeholder for reroute
    }, []);

    // Cleanup on unmount
    useEffect(() => () => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
        if (minimapRef.current) { minimapRef.current.remove(); minimapRef.current = null; }
        if (autoStartTimerRef.current) clearTimeout(autoStartTimerRef.current);
    }, []);

    /* ============ RENDER ============ */
    return (
        <div className="relative w-full h-full overflow-hidden" style={{ background: '#f0f4f8' }}>

            {/* ---- 3D MAP CONTAINER (shown during tracking) ---- */}
            <div ref={mapContainerRef} style={{
                position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 1,
                visibility: phase === 'tracking' || phase === 'arrived' ? 'visible' : 'hidden',
            }} />

            {/* ---- EMERGENCY SIREN BORDER ---- */}
            {phase === 'tracking' && <div className="emergency-border" style={{ zIndex: 100 }}></div>}

            {/* ============ FINDING OVERLAY ============ */}
            {phase === 'finding' && (
                <div className="absolute inset-0 z-[1000] flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.85)' }}>
                    <div className="glass-card p-8 text-center animate-slide-up" style={{ maxWidth: 360 }}>
                        <div className="text-5xl mb-4 animate-float">🚑</div>
                        <h2 className="text-lg font-bold mb-2">Finding nearest hospital...</h2>
                        <p className="text-xs" style={{ color: '#9aa0a6' }}>Analyzing real-time traffic & emergency routes</p>
                        <div className="mt-4 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                            <div className="h-full rounded-full" style={{ background: 'var(--gradient-emergency)', width: '60%', animation: 'gradient-shift 1.5s ease infinite' }}></div>
                        </div>
                    </div>
                </div>
            )}

            {/* ============ READY PHASE — TPP ROUTE OVERVIEW ============ */}
            {phase === 'ready' && selectedHospital && (
                <div className="absolute inset-0 z-[100]" style={{ background: '#0a0e1a' }}>
                    {/* Full-screen TPP Map */}
                    <MapContainer center={[incidentPos.lat, incidentPos.lng]} zoom={13} className="w-full h-full" zoomControl={false} style={{ background: '#0a0e1a' }}>
                        <TileLayer url={`https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`} attribution='&copy; Mapbox' tileSize={512} zoomOffset={-1} />
                        {routeBounds && <FitBounds bounds={routeBounds} />}
                        {/* Alt routes with traffic coloring (dashed) */}
                        {altTppSegments.map((route, ri) => (
                            ri !== selectedRouteIdx
                                ? route.segments.map((seg, si) => <Polyline key={`alt-${ri}-${si}`} positions={seg.positions} pathOptions={{ color: seg.color, weight: 4, opacity: 0.35, dashArray: '6 4' }} />)
                                : null
                        ))}
                        {/* Selected route with full traffic colors */}
                        {tppSegments.map((seg, i) => <Polyline key={`main-${i}`} positions={seg.positions} pathOptions={{ color: seg.color, weight: 7, opacity: 0.9 }} />)}
                        {/* Markers */}
                        <Marker position={[incidentPos.lat, incidentPos.lng]} icon={createIcon('🚑', 36)} />
                        <Marker position={[selectedHospital.lat, selectedHospital.lng]} icon={createIcon('🏥', 36)} />
                    </MapContainer>

                    {/* ---- TOP-LEFT: Route info badge ---- */}
                    <div className="absolute top-4 left-4 z-[200]">
                        <div style={{ ...glass, borderRadius: 14, padding: '10px 16px' }}>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#e8eaed' }}>🗺️ {altRoutes.length || 1} Route{(altRoutes.length || 1) > 1 ? 's' : ''} Available</p>
                            <div className="flex items-center gap-3 mt-2">
                                {[{ c: '#34a853', l: 'Clear' }, { c: '#fbbc04', l: 'Moderate' }, { c: '#ea4335', l: 'Heavy' }].map((t, i) => (
                                    <div key={i} className="flex items-center gap-1">
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.c }}></span>
                                        <span style={{ fontSize: 10, color: '#9aa0a6' }}>{t.l}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ---- TOP-RIGHT: Route selector (if multiple) ---- */}
                    {altRoutes.length > 1 && (
                        <div className="absolute top-4 right-4 z-[200]" style={{ width: 200 }}>
                            <div style={{ ...glass, borderRadius: 14, padding: '10px 12px' }}>
                                {altRoutes.map((r, i) => {
                                    const c = ['#4285f4', '#34a853', '#a855f7'][i] || '#64748b';
                                    return (
                                        <button key={i} onClick={() => setSelectedRouteIdx(i)} className="w-full text-left p-2 rounded-lg mb-1 transition-all" style={{ background: selectedRouteIdx === i ? `${c}20` : 'transparent', border: `1px solid ${selectedRouteIdx === i ? c : 'transparent'}`, cursor: 'pointer' }}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2"><span style={{ width: 8, height: 8, borderRadius: '50%', background: c }}></span><span style={{ fontSize: 11, fontWeight: 600, color: '#e8eaed' }}>{i === 0 ? 'Fastest' : `Route ${i + 1}`}</span></div>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: c, fontFamily: "'JetBrains Mono', monospace" }}>{formatDuration(r.adjusted_duration_s)}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ---- BOTTOM: Floating mission info card with hospital comparison ---- */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[200] animate-slide-up" style={{ width: 520, maxHeight: 'calc(100vh - 100px)' }}>
                        <div style={{ ...glass, borderRadius: 24, padding: '16px 20px', overflowY: 'auto' }}>

                            {/* Hospital comparison list */}
                            {hospitals.length > 1 && (
                                <div style={{ marginBottom: 14 }}>
                                    <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Choose Hospital ({Math.min(hospitals.length, 3)} nearest)</p>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        {hospitals.slice(0, 3).map((h, i) => {
                                            const isSelected = h.id === selectedHospital?.id;
                                            return (
                                                <button key={h.id} onClick={() => switchHospital(h)}
                                                    style={{
                                                        flex: 1, padding: '10px 10px', borderRadius: 14, cursor: 'pointer',
                                                        background: isSelected ? 'rgba(34,197,94,0.12)' : 'rgba(0,0,0,0.03)',
                                                        border: isSelected ? '2px solid rgba(34,197,94,0.5)' : '1px solid rgba(148,163,184,0.2)',
                                                        transition: 'all 0.2s', textAlign: 'left',
                                                    }}>
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        {i === 0 && <span style={{ fontSize: 8, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.15)', padding: '1px 5px', borderRadius: 4, textTransform: 'uppercase' }}>Fastest</span>}
                                                        {isSelected && i !== 0 && <span style={{ fontSize: 8, fontWeight: 700, color: '#3b82f6', background: 'rgba(59,130,246,0.15)', padding: '1px 5px', borderRadius: 4 }}>Selected</span>}
                                                    </div>
                                                    <p style={{ fontSize: 12, fontWeight: 700, color: '#e8eaed', lineHeight: 1.3 }} className="truncate">{h.name}</p>
                                                    <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                                                        {h.distance_km} km • ~{h.eta_minutes >= 60
                                                            ? `${Math.floor(h.eta_minutes / 60)}h ${Math.round(h.eta_minutes % 60)}m`
                                                            : `${Math.ceil(h.eta_minutes)}m`}
                                                    </p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Selected hospital details */}
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: 'rgba(34,197,94,0.12)' }}>🏥</div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold truncate" style={{ color: '#e8eaed' }}>{selectedHospital.name}</p>
                                    <p className="text-[11px]" style={{ color: '#94a3b8' }}>{selectedHospital.distance_km} km away</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xl font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#34a853' }}>{formatDuration(adjustedDuration)}</p>
                                    <p className="text-[10px]" style={{ color: '#64748b' }}>ETA</p>
                                </div>
                            </div>
                            <div className="flex gap-2 mb-3">
                                {[{ l: 'Distance', v: formatDistance(totalDistanceM) }, { l: 'Time Saved', v: formatDuration(timeSaved), c: '#34a853' }, { l: 'Civic Factor', v: '1.2×', c: '#4285f4' }].map((d, i) => (
                                    <div key={i} className="flex-1 p-2 rounded-lg text-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                                        <p className="text-[10px]" style={{ color: '#94a3b8' }}>{d.l}</p>
                                        <p className="text-sm font-bold" style={d.c ? { color: d.c } : { color: '#e8eaed' }}>{d.v}</p>
                                    </div>
                                ))}
                            </div>
                            {/* Traffic breakdown */}
                            <div className="mb-3" style={{ padding: '6px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.05)' }}>
                                <div style={{ height: 5, borderRadius: 3, overflow: 'hidden', display: 'flex', background: 'rgba(255,255,255,0.08)' }}>
                                    <div style={{ width: `${trafficBreakdown.green}%`, background: '#34a853' }}></div>
                                    <div style={{ width: `${trafficBreakdown.orange}%`, background: '#fbbc04' }}></div>
                                    <div style={{ width: `${trafficBreakdown.red}%`, background: '#ea4335' }}></div>
                                </div>
                                <div className="flex gap-3 mt-1">
                                    {[{ c: '#34a853', l: 'Clear', v: trafficBreakdown.green }, { c: '#fbbc04', l: 'Moderate', v: trafficBreakdown.orange }, { c: '#ea4335', l: 'Heavy', v: trafficBreakdown.red }].map((t, i) => (
                                        <div key={i} className="flex items-center gap-1"><span style={{ width: 5, height: 5, borderRadius: '50%', background: t.c }}></span><span style={{ fontSize: 9, color: '#94a3b8' }}>{t.l} {t.v}%</span></div>
                                    ))}
                                </div>
                            </div>
                            <button onClick={handleStart} className="btn-primary w-full justify-center py-3 text-base rounded-2xl" style={{ opacity: 0.7, pointerEvents: 'none' }}>⏱️ Auto-launching navigation...</button>
                            <button onClick={onBack} className="w-full text-center text-xs mt-2 cursor-pointer" style={{ color: '#94a3b8', background: 'none', border: 'none' }}>← Go back</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================================ */}
            {/* ====================  TRACKING HUD — FIRST-PERSON VIEW  =================== */}
            {/* ============================================================================ */}
            {phase === 'tracking' && (
                <>
                    {/* ======== TOP-LEFT: Direction Card ======== */}
                    <div className="absolute top-5 left-5 z-[200] animate-slide-up" style={{ width: 320 }}>
                        <div style={{
                            background: 'linear-gradient(135deg, #1a7f37 0%, #1e8e3e 50%, #188038 100%)',
                            borderRadius: 20, padding: '18px 22px',
                            boxShadow: '0 8px 32px rgba(30,142,62,0.5)', marginBottom: 8,
                        }}>
                            <div className="flex items-center gap-4">
                                <span style={{ fontSize: 42, lineHeight: 1, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}>{currentTurn.arrow}</span>
                                <div>
                                    <span style={{ fontSize: 20, fontWeight: 700, color: 'white', textTransform: 'capitalize' }}>{currentTurn.text}</span>
                                    {currentRoad && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{currentRoad}</p>}
                                    {distToNextTurn > 0 && (
                                        <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginTop: 3 }}>
                                            {distToNextTurn > 1000 ? `${(distToNextTurn / 1000).toFixed(1)} km` : `${distToNextTurn} m`}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                        {nextTurn && (
                            <div style={{ ...glass, borderRadius: 14, padding: '10px 16px' }}>
                                <div className="flex items-center gap-3">
                                    <span style={{ fontSize: 12, color: '#9aa0a6', fontWeight: 500 }}>Then</span>
                                    <span style={{ fontSize: 20 }}>{nextTurn.arrow}</span>
                                    <div>
                                        <span style={{ fontSize: 13, fontWeight: 500, color: '#e8eaed' }}>{nextTurn.text}</span>
                                        {nextRoad && <span style={{ fontSize: 10, color: '#9aa0a6', marginLeft: 6 }}>{nextRoad}</span>}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ======== Hospital Card (Stacked to prevent overlap) ======== */}
                        {selectedHospital && (
                            <div style={{ width: 250, marginTop: 12 }}>
                                <div style={{ ...glass, borderRadius: 16, padding: '12px 14px' }}>
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <span style={{ fontSize: 12 }}>🏥</span>
                                        <span style={{ fontSize: 9, fontWeight: 600, color: '#34a853', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Next Hospital</span>
                                    </div>
                                    <p style={{ fontSize: 12, fontWeight: 700, color: '#e8eaed', lineHeight: 1.3, marginBottom: 3 }}>{selectedHospital.name}</p>
                                    <div className="flex items-center gap-2">
                                        <span style={{ fontSize: 10, color: '#9aa0a6' }}>{selectedHospital.distance_km} km</span>
                                        <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#9aa0a6' }}></span>
                                        <span style={{ fontSize: 10, color: '#9aa0a6' }}>{formatDuration(remaining)} ETA</span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1.5">
                                        <span style={{ fontSize: 9, color: '#9aa0a6' }}>Capacity:</span>
                                        <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: 2, background: i <= 3 ? '#34a853' : 'rgba(255,255,255,0.1)' }}></div>)}</div>
                                        <span style={{ fontSize: 9, color: '#34a853', fontWeight: 600 }}>Available</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ======== TOP-RIGHT: ETA Widget ======== */}
                    <div className="absolute top-5 right-5 z-[200]">
                        <div style={{ ...glass, borderRadius: 16, padding: '14px 18px', textAlign: 'center', minWidth: 110 }}>
                            <p style={{ fontSize: 24, fontWeight: 700, color: '#34a853', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{remainingMin} min</p>
                            <p style={{ fontSize: 12, color: '#e8eaed', fontWeight: 500, marginTop: 4 }}>{formatDistance(totalDistanceM)}</p>
                            <p style={{ fontSize: 10, color: '#9aa0a6', marginTop: 2 }}>Arrive {getEtaTime(remaining)}</p>
                            {timeSaved > 0 && (
                                <div className="time-saved-badge" style={{ marginTop: 6, padding: '3px 8px', borderRadius: 8, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', display: 'inline-block' }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: '#34a853' }}>⚡ {formatDuration(timeSaved)} saved</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ======== RIGHT: Button Column ======== */}
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 z-[200] flex flex-col gap-3">
                        {[
                            { icon: '🧭', tt: 'Re-centre', fn: () => setAutoFollow(true) },
                            { icon: soundOn ? '🔊' : '🔇', tt: 'Sound', fn: () => setSoundOn(!soundOn) },
                            { icon: '⚠️', tt: 'Reroute', fn: handleReroute },
                        ].map((b, i) => (
                            <button key={i} onClick={b.fn} title={b.tt} style={{
                                width: 48, height: 48, borderRadius: '50%', ...glass,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 20, cursor: 'pointer', transition: 'all 0.2s',
                            }}>{b.icon}</button>
                        ))}
                    </div>

                    {/* ======== BOTTOM-LEFT: Dual Speedometer ======== */}
                    <div className="absolute bottom-24 left-5 z-[200] flex items-end gap-3">
                        <div style={{
                            ...glass, width: 80, height: 80, borderRadius: 18,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            borderColor: isOverSpeedLimit ? 'rgba(239,68,68,0.5)' : undefined,
                            animation: isOverSpeedLimit ? 'glow-pulse 1s ease-in-out infinite' : 'none',
                        }}>
                            <span style={{
                                fontSize: 28, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1,
                                color: currentSpeed === 0 ? '#9aa0a6' : currentSpeed < 20 ? '#ea4335' : currentSpeed < 40 ? '#fbbc04' : '#34a853',
                            }}>{currentSpeed || '--'}</span>
                            <span style={{ fontSize: 10, color: '#9aa0a6', fontWeight: 500, marginTop: 2 }}>km/h</span>
                        </div>
                        {speedLimit && (
                            <div style={{
                                width: 52, height: 52, borderRadius: '50%',
                                background: isOverSpeedLimit ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.12)',
                                border: `3px solid ${isOverSpeedLimit ? '#ef4444' : '#e8eaed'}`,
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                animation: isOverSpeedLimit ? 'glow-pulse 0.8s ease-in-out infinite' : 'none',
                                boxShadow: isOverSpeedLimit ? '0 0 20px rgba(239,68,68,0.4)' : '0 2px 8px rgba(0,0,0,0.3)',
                                position: 'relative',
                            }}>
                                <span style={{ fontSize: 16, fontWeight: 800, color: isOverSpeedLimit ? '#ef4444' : '#e8eaed', fontFamily: "'JetBrains Mono', monospace" }}>{speedLimit}</span>
                                {isOverSpeedLimit && <span style={{ position: 'absolute', top: -6, right: -6, fontSize: 10, background: '#ef4444', color: 'white', padding: '1px 4px', borderRadius: 6, fontWeight: 700 }}>⚡</span>}
                            </div>
                        )}
                    </div>

                    {/* ======== LEFT: Hospital Card (Moved to top container to prevent overlap) ======== */}
                    {/* ======== Traffic Intelligence Bar ======== */}
                    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[200]" style={{ width: 380 }}>
                        <div style={{ ...glass, borderRadius: 14, padding: '8px 14px' }}>
                            <div className="flex items-center justify-between mb-1.5">
                                <span style={{ fontSize: 9, fontWeight: 600, color: '#9aa0a6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Route Traffic</span>
                                <div className="flex items-center gap-1" style={{ background: sirenActive ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 20, border: `1px solid ${sirenActive ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'}` }}>
                                    <span style={{ fontSize: 9 }}>{sirenActive ? '🚨' : '🔕'}</span>
                                    <span style={{ fontSize: 8, fontWeight: 600, color: sirenActive ? '#34a853' : '#9aa0a6' }}>{sirenActive ? 'Civic 1.2×' : 'Off'}</span>
                                </div>
                            </div>
                            <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex', background: 'rgba(255,255,255,0.05)', position: 'relative' }}>
                                <div style={{ width: `${trafficBreakdown.green}%`, background: '#34a853', height: '100%' }}></div>
                                <div style={{ width: `${trafficBreakdown.orange}%`, background: '#fbbc04', height: '100%' }}></div>
                                <div style={{ width: `${trafficBreakdown.red}%`, background: '#ea4335', height: '100%' }}></div>
                                <div style={{ position: 'absolute', left: `${routeProgress * 100}%`, top: -1, width: 3, height: 8, background: 'white', borderRadius: 2, boxShadow: '0 0 6px rgba(255,255,255,0.6)', transition: 'left 0.3s' }}></div>
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                                {[{ c: '#34a853', l: 'Clear', v: trafficBreakdown.green }, { c: '#fbbc04', l: 'Moderate', v: trafficBreakdown.orange }, { c: '#ea4335', l: 'Heavy', v: trafficBreakdown.red }].map((t, i) => (
                                    <div key={i} className="flex items-center gap-1"><span style={{ width: 5, height: 5, borderRadius: '50%', background: t.c }}></span><span style={{ fontSize: 8, color: '#9aa0a6' }}>{t.l} {t.v}%</span></div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ======== Bottom Nav Bar ======== */}
                    <div className="absolute bottom-4 left-4 right-4 z-[200]">
                        <div style={{ ...glass, borderRadius: 28, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                            <button onClick={handleStop} style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(234,67,53,0.15)', border: '1px solid rgba(234,67,53,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, cursor: 'pointer', flexShrink: 0, color: '#ea4335' }}>✕</button>
                            <div style={{ flex: 1 }}>
                                <div className="flex items-baseline gap-2">
                                    <span style={{ fontSize: 22, fontWeight: 700, color: '#34a853', fontFamily: "'JetBrains Mono', monospace" }}>{remainingMin} min</span>
                                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: congestionLevel === 'heavy' || congestionLevel === 'severe' ? '#ea4335' : congestionLevel === 'moderate' ? '#fbbc04' : '#34a853', display: 'inline-block' }}></span>
                                </div>
                                <span style={{ fontSize: 12, color: '#9aa0a6' }}>{formatDistance(totalDistanceM)} • {getEtaTime(remaining)}</span>
                            </div>
                            <button onClick={() => setAutoFollow(!autoFollow)} style={{ width: 42, height: 42, borderRadius: '50%', background: autoFollow ? 'rgba(66,133,244,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${autoFollow ? 'rgba(66,133,244,0.4)' : 'rgba(255,255,255,0.1)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, cursor: 'pointer', flexShrink: 0 }}>🧭</button>
                            <button onClick={() => setAutoFollow(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 20, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: '#e8eaed', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>▲ Re-centre</button>
                        </div>
                    </div>
                    {/* ======== MINIMAP: TPP Route Overview ======== */}
                    <div className="absolute z-[200]" style={{ bottom: 100, right: 16, width: 200, height: 160, borderRadius: 14, overflow: 'hidden', border: '2px solid rgba(66,133,244,0.4)', boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}>
                        <div ref={minimapContainerRef} style={{ width: '100%', height: '100%' }} />
                        <div style={{ position: 'absolute', bottom: 4, left: 4, padding: '2px 6px', borderRadius: 6, background: 'rgba(0,0,0,0.6)', zIndex: 10 }}>
                            <span style={{ fontSize: 8, color: '#9aa0a6', fontWeight: 600 }}>🗺️ Route Overview</span>
                        </div>
                    </div>
                </>
            )}

            {/* ============ ARRIVED ============ */}
            {phase === 'arrived' && (
                <div className="absolute inset-0 z-[300] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
                    <div className="glass-card p-8 text-center animate-slide-up" style={{ maxWidth: 380 }}>
                        <div className="text-5xl mb-4">✅</div>
                        <h2 className="text-xl font-bold mb-2">Mission Complete!</h2>
                        <p className="text-sm mb-1" style={{ color: '#bdc1c6' }}>Ambulance arrived at <strong>{selectedHospital?.name}</strong></p>
                        <p className="text-xs mb-4" style={{ color: '#9aa0a6' }}>Total time: {formatDuration(adjustedDuration)} • Distance: {formatDistance(totalDistanceM)}</p>
                        {timeSaved > 0 && <p className="text-sm mb-4" style={{ color: '#34a853', fontWeight: 600 }}>⚡ {formatDuration(timeSaved)} saved vs standard route</p>}
                        <button onClick={() => { handleStop(); onBack(); }} className="btn-secondary px-6 py-3">← New Emergency</button>
                    </div>
                </div>
            )}
        </div>
    );
}
