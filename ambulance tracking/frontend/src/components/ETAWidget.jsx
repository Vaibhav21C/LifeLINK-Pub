import { formatDuration, formatDistance } from '../utils/helpers';

export default function ETAWidget({ routeData, elapsedTime, missionActive }) {
    if (!routeData) return null;

    const { traffic_route, static_route, time_saved_s, civic_factor } = routeData;
    const adjusted = traffic_route.adjusted_duration_s;
    const remaining = missionActive ? Math.max(0, adjusted - elapsedTime) : adjusted;

    return (
        <div className="glass-card p-5 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">⏱️</span>
                <h3 className="text-sm font-semibold tracking-wide uppercase" style={{ color: 'var(--text-secondary)' }}>
                    Dynamic ETA
                </h3>
                {missionActive && (
                    <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold"
                        style={{ background: 'rgba(239,68,68,0.2)', color: 'var(--accent-red)' }}>
                        LIVE
                    </span>
                )}
            </div>

            {/* ETA Counter */}
            <div className="text-center mb-4">
                <div className="text-4xl font-bold tracking-tight" style={{
                    background: 'linear-gradient(135deg, #ef4444, #f59e0b)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    fontFamily: "'JetBrains Mono', monospace"
                }}>
                    {formatDuration(remaining)}
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {missionActive ? 'Time Remaining' : 'Estimated Travel Time'}
                </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
                <div className="glass-card-sm p-3 text-center">
                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Distance</p>
                    <p className="text-sm font-semibold">{formatDistance(traffic_route.distance_m)}</p>
                </div>
                <div className="glass-card-sm p-3 text-center">
                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Civic Factor</p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--accent-cyan)' }}>{civic_factor}×</p>
                </div>
                <div className="glass-card-sm p-3 text-center">
                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Static ETA</p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                        {formatDuration(static_route.duration_s)}
                    </p>
                </div>
                <div className="glass-card-sm p-3 text-center">
                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Time Saved</p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--accent-green)' }}>
                        {formatDuration(time_saved_s)}
                    </p>
                </div>
            </div>
        </div>
    );
}
