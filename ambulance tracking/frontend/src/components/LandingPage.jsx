import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

function createPinIcon() {
    return L.divIcon({
        className: '',
        html: `<div class="incident-marker">📍</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
    });
}

function MapClick({ onMapClick }) {
    useMapEvents({ click: (e) => onMapClick(e.latlng) });
    return null;
}

export default function LandingPage({ onStartMission }) {
    const [pin, setPin] = useState(null);
    const [address, setAddress] = useState('');
    const [searching, setSearching] = useState(false);
    const [countdown, setCountdown] = useState(null);
    const timerRef = useRef(null);

    // Auto-launch when pin is set
    const launchWithPin = (p) => {
        setPin(p);
        setCountdown(2);
        if (timerRef.current) clearInterval(timerRef.current);
        // Countdown 2 → 1 → go
        let t = 2;
        timerRef.current = setInterval(() => {
            t -= 1;
            if (t <= 0) {
                clearInterval(timerRef.current);
                onStartMission(p);
            } else {
                setCountdown(t);
            }
        }, 750);
    };

    // Cleanup on unmount
    useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

    // Fire the accident to the LifeLink backend → triggers nearest-paramedic assignment
    const fireIncidentToBackend = (pos) => {
        const LIFELINK_BACKEND = 'http://127.0.0.1:8000';
        const incidentId = `CRASH-${Date.now().toString().slice(-4)}`;
        fetch(`${LIFELINK_BACKEND}/api/trigger`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                incident_id: incidentId,
                gps_location: `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`,
                severity: 'HIGH',
                patient_id: 'UNKNOWN',
            }),
        })
            .then(r => r.json())
            .then(data => console.log(`🚨 Incident fired: ${incidentId} → assigned to:`, data.assigned_to))
            .catch(err => console.warn('LifeLink backend unreachable (module 2 not running?):', err));
    };

    const handleMapClick = (latlng) => {
        const p = { lat: latlng.lat, lng: latlng.lng };
        launchWithPin(p);
        fireIncidentToBackend(p);
        // Reverse geocode for display
        fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${latlng.lng},${latlng.lat}.json?access_token=${MAPBOX_TOKEN}&limit=1`)
            .then(r => r.json())
            .then(data => {
                if (data.features?.[0]) setAddress(data.features[0].place_name);
            })
            .catch(() => { });
    };


    const handleSearch = () => {
        if (!address.trim()) return;
        setSearching(true);
        fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&proximity=77.7271,22.754&limit=1`)
            .then(r => r.json())
            .then(data => {
                if (data.features?.[0]) {
                    const [lng, lat] = data.features[0].center;
                    const p = { lat, lng };
                    setAddress(data.features[0].place_name);
                    launchWithPin(p);
                }
            })
            .catch(() => { })
            .finally(() => setSearching(false));
    };

    return (
        <div className="w-full h-full relative" style={{ background: '#0a0e1a' }}>
            {/* ====== FULL-SCREEN DARK MAP ====== */}
            <div className="absolute inset-0">
                <MapContainer center={[19.076, 72.8777]} zoom={13} className="w-full h-full" zoomControl={false} style={{ background: '#0a0e1a' }}>
                    <TileLayer
                        url={`https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`}
                        attribution='&copy; Mapbox'
                        tileSize={512}
                        zoomOffset={-1}
                    />
                    <MapClick onMapClick={handleMapClick} />
                    {pin && <Marker position={[pin.lat, pin.lng]} icon={createPinIcon()} />}
                </MapContainer>
            </div>

            {/* ====== TOP BAR ====== */}
            <div className="absolute top-0 left-0 right-0 z-[500] flex items-center justify-between px-8 py-4"
                style={{ background: 'linear-gradient(180deg, rgba(10,14,26,0.85) 0%, rgba(10,14,26,0.4) 70%, transparent 100%)' }}>
                <div className="flex items-center gap-3">
                    <div style={{ width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" fill="white" />
                        </svg>
                    </div>
                    <div>
                        <h1 style={{ fontSize: 22, fontWeight: 900, color: 'white', letterSpacing: '-0.02em' }}>Life<span style={{ color: '#ef4444' }}>Link</span></h1>
                        <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Emergency Dispatch</p>
                    </div>
                </div>
                <div className="flex items-center gap-5">
                    {[
                        { v: '47', l: 'Hospitals', c: '#ef4444' },
                        { v: '2.3m', l: 'Avg Response', c: '#3b82f6' },
                        { v: '99.8%', l: 'Uptime', c: '#22c55e' },
                    ].map((s, i) => (
                        <div key={i} className="text-center">
                            <p style={{ fontSize: 18, fontWeight: 800, color: s.c, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{s.v}</p>
                            <p style={{ fontSize: 9, fontWeight: 500, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.l}</p>
                        </div>
                    ))}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}>
                        <span className="animate-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 10px rgba(34,197,94,0.7)' }}></span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#4ade80' }}>Live</span>
                    </div>
                </div>
            </div>

            {/* ====== CENTER CARD — MAIN ACTION ====== */}
            <div className="absolute z-[500] animate-slide-up" style={{ left: 40, top: 80, bottom: 20, width: 400, display: 'flex', flexDirection: 'column' }}>
                <div style={{
                    background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(24px)',
                    borderRadius: 24, padding: '28px 28px 20px',
                    boxShadow: '0 24px 80px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.1)',
                    flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                }}>
                    {/* Title */}
                    <div style={{ marginBottom: 24 }}>
                        <h2 style={{ fontSize: 30, fontWeight: 900, color: '#0f172a', lineHeight: 1.15, marginBottom: 8 }}>
                            Report an<br />
                            <span style={{ background: 'linear-gradient(135deg, #ef4444 0%, #f97316 50%, #eab308 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Emergency</span>
                        </h2>
                        <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
                            Click on the map or search below. We'll find the <strong style={{ color: '#334155' }}>nearest hospital</strong> instantly.
                        </p>
                    </div>

                    {/* Search */}
                    <div style={{ marginBottom: 16 }}>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="Search address or click map..."
                                style={{
                                    flex: 1, padding: '13px 16px', borderRadius: 14, fontSize: 14, fontWeight: 500,
                                    background: '#f8fafc', border: '2px solid #e2e8f0', color: '#1e293b', outline: 'none',
                                    transition: 'border-color 0.2s',
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                            />
                            <button onClick={handleSearch} disabled={searching}
                                style={{
                                    padding: '13px 16px', borderRadius: 14, fontSize: 15,
                                    background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: 'white',
                                    border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.35)',
                                }}>
                                {searching ? '⏳' : '🔍'}
                            </button>
                        </div>
                    </div>

                    {/* Pin info */}
                    {pin && (
                        <div style={{ padding: '12px 14px', borderRadius: 14, background: '#fff7ed', border: '1px solid #fed7aa', marginBottom: 16 }}>
                            <div className="flex items-center gap-2">
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316' }}></span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }} className="truncate">{address || `${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)}`}</span>
                            </div>
                        </div>
                    )}

                    {/* CTA Button */}
                    <button
                        onClick={() => pin && onStartMission(pin)}
                        disabled={!pin}
                        style={{
                            width: '100%', padding: '15px', borderRadius: 16, fontSize: 15, fontWeight: 700,
                            background: pin ? 'linear-gradient(135deg, #ef4444, #dc2626)' : '#e2e8f0',
                            color: pin ? 'white' : '#94a3b8', border: 'none',
                            cursor: pin ? 'pointer' : 'not-allowed',
                            boxShadow: pin ? '0 8px 28px rgba(239,68,68,0.4)' : 'none',
                            transition: 'all 0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}
                    >
                        {countdown ? `⏱️ Launching in ${countdown}...` : pin ? '🚀 Find Hospital & Navigate' : '📍 Set location first'}
                    </button>

                    {/* Divider */}
                    <div style={{ height: 1, background: '#e2e8f0', margin: '20px 0 16px' }}></div>

                    {/* Feature row — compact horizontal */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {[
                            { icon: '📍', title: 'Set Location', c: '#ef4444' },
                            { icon: '🏥', title: 'AI Hospital', c: '#3b82f6' },
                            { icon: '🚑', title: '3D Tracking', c: '#22c55e' },
                            { icon: '🚨', title: 'Smart Siren', c: '#f59e0b' },
                        ].map((f, i) => (
                            <div key={i} className="flex items-center gap-2" style={{ padding: '10px 12px', borderRadius: 12, background: `${f.c}08`, border: `1px solid ${f.c}15` }}>
                                <span style={{ fontSize: 16 }}>{f.icon}</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{f.title}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ====== MAP PROMPT (when no pin) ====== */}
            {!pin && (
                <div className="absolute z-[400] animate-float" style={{ top: '50%', left: '55%', transform: 'translate(-50%, -50%)' }}>
                    <div style={{ padding: '16px 24px', borderRadius: 18, background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.15)' }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>👆 Click anywhere on the map</p>
                    </div>
                </div>
            )}

            {/* ====== BOTTOM BADGE ====== */}
            <div className="absolute bottom-4 right-4 z-[500]" style={{ padding: '5px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <p style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}>📍 Mumbai, India • Mapbox • OSRM</p>
            </div>
        </div>
    );
}
