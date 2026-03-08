import { formatDuration, formatDistance } from '../utils/helpers';

const ROUTE_COLORS = ['#22c55e', '#3b82f6', '#a855f7'];
const ROUTE_LABELS = ['Fastest (LifeLink)', 'Alternative A', 'Alternative B'];

export default function RoutesPanel({
    alternativeRoutes,
    selectedRouteIndex,
    onSelectRoute,
    loading,
}) {
    if (!alternativeRoutes || alternativeRoutes.length === 0) return null;

    return (
        <div className="glass-card p-5 animate-slide-up" style={{ animationDelay: '0.3s' }}>
            <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">🛤️</span>
                <h3 className="text-sm font-semibold tracking-wide uppercase" style={{ color: 'var(--text-secondary)' }}>
                    Route Options
                </h3>
                <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7' }}>
                    {alternativeRoutes.length} routes
                </span>
            </div>

            <div className="space-y-2">
                {alternativeRoutes.map((route, i) => {
                    const isSelected = selectedRouteIndex === i;
                    const color = ROUTE_COLORS[i] || '#64748b';
                    const label = ROUTE_LABELS[i] || `Route ${i + 1}`;

                    // Count congestion levels
                    const segments = route.congestion_segments || [];
                    const heavy = segments.filter(s => s.congestion === 'heavy' || s.congestion === 'severe').length;
                    const moderate = segments.filter(s => s.congestion === 'moderate').length;
                    const low = segments.length - heavy - moderate;

                    return (
                        <button
                            key={i}
                            onClick={() => onSelectRoute(i)}
                            disabled={loading}
                            className={`w-full text-left p-3 rounded-xl transition-all duration-200 border ${isSelected
                                    ? 'border-opacity-60 bg-opacity-20'
                                    : 'border-transparent bg-white/5 hover:bg-white/10'
                                }`}
                            style={isSelected ? {
                                borderColor: color,
                                background: `${color}15`,
                            } : {}}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 8px ${color}40` }}></span>
                                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>
                                    {label}
                                </span>
                                {isSelected && (
                                    <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded"
                                        style={{ background: `${color}20`, color }}>
                                        ACTIVE
                                    </span>
                                )}
                                {i === 0 && !isSelected && (
                                    <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded"
                                        style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                                        RECOMMENDED
                                    </span>
                                )}
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div>
                                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>ETA</p>
                                    <p className="text-xs font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                                        {formatDuration(route.adjusted_duration_s)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Distance</p>
                                    <p className="text-xs font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                                        {formatDistance(route.distance_m)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Traffic</p>
                                    <div className="flex items-center justify-center gap-1 mt-0.5">
                                        {low > 0 && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-green)' }} title={`${low} clear`}></span>}
                                        {moderate > 0 && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-orange)' }} title={`${moderate} moderate`}></span>}
                                        {heavy > 0 && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-red)' }} title={`${heavy} heavy`}></span>}
                                    </div>
                                </div>
                            </div>

                            {/* Traffic bar visualization */}
                            {segments.length > 0 && (
                                <div className="mt-2 h-1.5 rounded-full overflow-hidden flex"
                                    style={{ background: 'rgba(255,255,255,0.05)' }}>
                                    {segments.length > 0 && (
                                        <>
                                            <div style={{ width: `${(low / segments.length) * 100}%`, background: 'var(--accent-green)' }}></div>
                                            <div style={{ width: `${(moderate / segments.length) * 100}%`, background: 'var(--accent-orange)' }}></div>
                                            <div style={{ width: `${(heavy / segments.length) * 100}%`, background: 'var(--accent-red)' }}></div>
                                        </>
                                    )}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
