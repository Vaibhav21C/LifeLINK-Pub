import { useState, useEffect, useRef } from 'react';
import LandingPage from './components/LandingPage';
import TrackingView from './components/TrackingView';

const BACKEND = 'http://127.0.0.1:8000';

export default function App() {
  const [screen, setScreen] = useState('landing'); // 'landing' | 'tracking'
  const [incidentPos, setIncidentPos] = useState(null);
  const [dispatchStatus, setDispatchStatus] = useState('monitoring'); // 'monitoring' | 'found'
  const pollRef = useRef(null);

  const handleStartMission = (pos) => {
    setIncidentPos(pos);
    setScreen('tracking');
    // Stop polling once mission is started
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const handleBack = () => {
    setScreen('landing');
    setIncidentPos(null);
    setDispatchStatus('monitoring');
    // Resume polling when returning to landing
    startPolling();
  };

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        // Use the Vite proxy path, not direct backend URL, to avoid CORS issues
        const res = await fetch('/api/active-incident');
        const data = await res.json();
        if (data.status === 'found') {
          setDispatchStatus('found');
          // Small delay so the user sees the "DISPATCH RECEIVED" badge flash
          setTimeout(() => {
            handleStartMission({ lat: data.lat, lng: data.lng });
          }, 800);
        }
      } catch (_) {
        // Backend not running yet — silently retry
      }
    }, 2000); // Poll every 2 seconds for fast detection
  };

  // Start polling as soon as the app mounts
  useEffect(() => {
    // ── Check if we were launched from the paramedic app with pre-supplied coords ──
    const params = new URLSearchParams(window.location.search);
    const qLat = parseFloat(params.get('lat'));
    const qLng = parseFloat(params.get('lng'));
    if (!isNaN(qLat) && !isNaN(qLng)) {
      // Skip landing page and go straight into the tracking view
      handleStartMission({ lat: qLat, lng: qLng });
      return; // Don't start polling
    }

    startPolling();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  return (
    <div className="w-full h-full" style={{ position: 'relative' }}>

      {/* ── Dispatch status badge (always visible on landing screen) ── */}
      {screen === 'landing' && (
        <div style={{
          position: 'absolute', top: 16, right: 16, zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 16px', borderRadius: 24,
          background: dispatchStatus === 'found'
            ? 'rgba(239,68,68,0.92)'
            : 'rgba(15,23,42,0.85)',
          border: dispatchStatus === 'found'
            ? '1.5px solid rgba(239,68,68,0.8)'
            : '1.5px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(12px)',
          boxShadow: dispatchStatus === 'found' ? '0 0 24px rgba(239,68,68,0.4)' : 'none',
          transition: 'all 0.4s ease',
          color: 'white', fontSize: 13, fontWeight: 600,
          fontFamily: "'Inter', sans-serif",
        }}>
          <span style={{
            width: 9, height: 9, borderRadius: '50%',
            background: dispatchStatus === 'found' ? '#fff' : '#22c55e',
            animation: 'pulse-dot 1.4s infinite',
            flexShrink: 0,
          }} />
          {dispatchStatus === 'found'
            ? '🚨 DISPATCH RECEIVED — Launching...'
            : '🔴 Monitoring for dispatch...'}
        </div>
      )}

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(34,197,94,0.5); }
          50% { box-shadow: 0 0 0 5px transparent; opacity: 0.7; }
        }
      `}</style>

      {screen === 'landing' && (
        <LandingPage onStartMission={handleStartMission} />
      )}
      {screen === 'tracking' && incidentPos && (
        <TrackingView incidentPos={incidentPos} onBack={handleBack} />
      )}
    </div>
  );
}
