export default function ControlPanel({
    hospitals,
    selectedHospital,
    onSelectHospital,
    onStartMission,
    onStopMission,
    onToggleComparison,
    showComparison,
    missionActive,
    loading,
    onReroute,
    routeData,
    incidentPos,
}) {
    return (
        <div className="glass-card p-5 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">🏥</span>
                <h3 className="text-sm font-semibold tracking-wide uppercase" style={{ color: 'var(--text-secondary)' }}>
                    Nearby Hospitals
                </h3>
                <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)' }}>
                    {hospitals.length} found
                </span>
            </div>

            {/* Hospital List */}
            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto pr-1">
                {hospitals.length === 0 && (
                    <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
                        {incidentPos ? 'Loading hospitals...' : 'Click on the map to set incident location'}
                    </p>
                )}
                {hospitals.map((h) => (
                    <button
                        key={h.id}
                        onClick={() => onSelectHospital(h)}
                        className={`w-full text-left p-3 rounded-xl transition-all duration-200 border ${selectedHospital?.id === h.id
                                ? 'border-green-500/40 bg-green-500/10'
                                : 'border-transparent bg-white/5 hover:bg-white/10'
                            }`}
                        style={{ cursor: 'pointer' }}
                    >
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium truncate max-w-[180px]">{h.name}</span>
                            <span className="text-xs font-mono whitespace-nowrap ml-2" style={{ color: 'var(--accent-cyan)' }}>
                                {h.distance_km} km
                            </span>
                        </div>
                    </button>
                ))}
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
                <button
                    className="btn-primary w-full justify-center"
                    disabled={!selectedHospital || missionActive || loading}
                    onClick={onStartMission}
                >
                    {loading ? (
                        <>
                            <span className="animate-spin">⟳</span> Computing Route...
                        </>
                    ) : missionActive ? (
                        <>🚨 Mission In Progress...</>
                    ) : (
                        <>🚀 Start Mission</>
                    )}
                </button>

                {missionActive && (
                    <button
                        className="btn-secondary w-full justify-center"
                        onClick={onStopMission}
                        style={{ borderColor: 'rgba(239,68,68,0.3)', color: 'var(--accent-red)' }}
                    >
                        ⏹ Abort Mission
                    </button>
                )}

                <div className="flex gap-2">
                    <button
                        className={`btn-secondary flex-1 justify-center ${showComparison ? 'active' : ''}`}
                        onClick={onToggleComparison}
                        disabled={!routeData}
                    >
                        📊 Compare
                    </button>
                    <button
                        className="btn-secondary flex-1 justify-center"
                        onClick={onReroute}
                        disabled={!missionActive || !selectedHospital}
                        style={missionActive ? { borderColor: 'rgba(245,158,11,0.3)', color: 'var(--accent-orange)' } : {}}
                    >
                        🔄 Reroute
                    </button>
                </div>
            </div>

            {/* Traffic Legend */}
            <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Traffic Legend</p>
                <div className="traffic-legend">
                    <div className="legend-item">
                        <span className="legend-dot green"></span>
                        Fast
                    </div>
                    <div className="legend-item">
                        <span className="legend-dot orange"></span>
                        Moderate
                    </div>
                    <div className="legend-item">
                        <span className="legend-dot red"></span>
                        Heavy
                    </div>
                </div>
            </div>
        </div>
    );
}
