/**
 * Utility functions for LifeLink
 */

/**
 * Map congestion level string to color hex
 */
export function congestionColor(level) {
    switch (level) {
        case 'low':
        case 'unknown':
            return '#22c55e'; // green
        case 'moderate':
            return '#f59e0b'; // orange
        case 'heavy':
            return '#ef4444'; // red
        case 'severe':
            return '#dc2626'; // dark red
        default:
            return '#3b82f6'; // blue fallback
    }
}

/**
 * Format seconds into mm:ss or hh:mm:ss
 */
export function formatDuration(seconds) {
    if (seconds == null || seconds < 0) return '--:--';
    const s = Math.round(seconds);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
        return `${hrs}h ${mins}m ${secs}s`;
    }
    return `${mins}m ${secs}s`;
}

/**
 * Format distance in meters to km
 */
export function formatDistance(meters) {
    if (meters == null) return '--';
    return (meters / 1000).toFixed(2) + ' km';
}
