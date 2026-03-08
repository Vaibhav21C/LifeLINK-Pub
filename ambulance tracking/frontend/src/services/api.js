import axios from 'axios';

const API_BASE = '/api';

export async function fetchHospitals(lat, lng, radius = 10000) {
    const res = await axios.get(`${API_BASE}/hospitals`, {
        params: { lat, lng, radius },
    });
    return res.data;
}

export async function fetchRoute(srcLat, srcLng, dstLat, dstLng) {
    const res = await axios.get(`${API_BASE}/route`, {
        params: {
            src_lat: srcLat,
            src_lng: srcLng,
            dst_lat: dstLat,
            dst_lng: dstLng,
        },
    });
    return res.data;
}

export async function fetchReroute(srcLat, srcLng, excludeDstLat, excludeDstLng, incidentLat, incidentLng) {
    const res = await axios.get(`${API_BASE}/reroute`, {
        params: {
            src_lat: srcLat,
            src_lng: srcLng,
            exclude_dst_lat: excludeDstLat,
            exclude_dst_lng: excludeDstLng,
            incident_lat: incidentLat,
            incident_lng: incidentLng,
        },
    });
    return res.data;
}

export async function fetchAlternativeRoutes(srcLat, srcLng, dstLat, dstLng) {
    const res = await axios.get(`${API_BASE}/alternative_routes`, {
        params: {
            src_lat: srcLat,
            src_lng: srcLng,
            dst_lat: dstLat,
            dst_lng: dstLng,
        },
    });
    return res.data;
}
