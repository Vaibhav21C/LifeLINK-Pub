"""
LifeLink Unified Backend Server
Combines paramedic dispatch, ER monitoring, green corridor,
hospital search, and Mapbox routing in a single process.

Run with:
    uvicorn server:app --reload --port 8000
"""
import web3_connect
import bedrock_ai
import os
import math
import random
import requests
from fastapi import FastAPI, Query
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import green_corridor

load_dotenv()

app = FastAPI(title="LifeLink Unified API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
MAPBOX_TOKEN = os.getenv("MAPBOX_TOKEN", "")
CIVIC_FACTOR = 1.2          # Indian traffic slow-down multiplier
DEFAULT_LAT  = 19.0760       # Mumbai default (used when no pin is set)
DEFAULT_LNG  = 72.8777

# ─────────────────────────────────────────────
# PYDANTIC MODELS  (paramedic dispatch side)
# ─────────────────────────────────────────────
class CrashAlert(BaseModel):
    incident_id: str; gps_location: str; severity: str; patient_id: str

class DispatchAccept(BaseModel):
    incident_id: str; ambulance_id: str

class QRScan(BaseModel):
    patient_id: str

class LocationUpdate(BaseModel):
    incident_id: str; lat: float; lon: float

class ParamedicHeartbeat(BaseModel):
    paramedic_id: str; lat: float; lon: float

# ─────────────────────────────────────────────
# IN-MEMORY STORES
# ─────────────────────────────────────────────
active_incidents = {}
paramedic_locations = {}   # { "PMD-001": { "lat": ..., "lon": ..., "status": "available" } }

MEDICHAIN_DB = {
    "ABHA-123456": {
        "name": "Rahul Sharma",
        "blood_group": "O-Negative",
        "allergies": "Penicillin, Peanuts",
        "medical_history": "Asthma"
    }
}

# ─────────────────────────────────────────────
# SHARED HELPERS
# ─────────────────────────────────────────────
def haversine(lat1, lon1, lat2, lon2) -> float:
    """Great-circle distance in km."""
    R = 6371
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi    = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _assign_nearest_paramedic(incident_id: str, crash_lat: float, crash_lon: float):
    """Find the nearest available paramedic and assign the incident to them."""
    best_id, best_dist = None, float("inf")
    available = {k: v for k, v in paramedic_locations.items() if v.get("status") == "available"}
    for p_id, data in available.items():
        dist = haversine(crash_lat, crash_lon, data["lat"], data["lon"])
        if dist < best_dist:
            best_dist, best_id = dist, p_id
    if best_id:
        active_incidents[incident_id]["assigned_to"]       = best_id
        active_incidents[incident_id]["assigned_dist_km"]  = round(best_dist, 2)
        paramedic_locations[best_id]["status"] = "dispatched"
        print(f"✅ Incident {incident_id} → {best_id} ({best_dist:.2f} km)")
    else:
        active_incidents[incident_id]["assigned_to"] = None
        print(f"⚠️  No paramedics registered — broadcasting {incident_id}")


def _process_route(route_obj, idx: int = 0) -> dict:
    """Convert a Mapbox route object to our standardised response format."""
    geometry       = route_obj["geometry"]
    total_distance = route_obj["distance"]
    total_duration = route_obj["duration"]
    adjusted_duration = total_duration / CIVIC_FACTOR

    congestion_segments, segment_speeds, nav_steps = [], [], []
    cumulative_distance = 0

    for leg in route_obj.get("legs", []):
        annotation    = leg.get("annotation", {})
        cong_list     = annotation.get("congestion", [])
        speed_list    = annotation.get("speed", [])
        dist_list     = annotation.get("distance", [])
        dur_list      = annotation.get("duration", [])
        maxspeed_list = annotation.get("maxspeed", [])

        for i, cong in enumerate(cong_list):
            seg_speed = speed_list[i] if i < len(speed_list) else 30
            seg_dist  = dist_list[i]  if i < len(dist_list)  else 0
            seg_dur   = dur_list[i]   if i < len(dur_list)   else 0
            speed_limit = None
            if i < len(maxspeed_list) and isinstance(maxspeed_list[i], dict):
                speed_limit = maxspeed_list[i].get("speed")

            # Simulate realistic Mumbai traffic when no live data available
            if cong in ("unknown", None, ""):
                r = random.random()
                cong = "heavy" if r < 0.3 else ("moderate" if r < 0.7 else "low")

            tda_weight = seg_dist / (seg_speed * CIVIC_FACTOR) if seg_speed > 0 else seg_dur

            congestion_segments.append({
                "congestion":     cong,
                "speed_kmh":      round(seg_speed * 3.6, 1),
                "speed_ms":       round(seg_speed, 2),
                "distance_m":     round(seg_dist, 1),
                "duration_s":     round(seg_dur, 2),
                "tda_weight":     round(tda_weight, 3),
                "speed_limit_kmh": speed_limit,
            })
            segment_speeds.append({
                "speed_ms":       round(seg_speed * CIVIC_FACTOR, 2),
                "distance_m":     round(seg_dist, 1),
                "congestion":     cong,
                "speed_limit_kmh": speed_limit,
            })

        for step in leg.get("steps", []):
            maneuver = step.get("maneuver", {})
            nav_steps.append({
                "instruction":           maneuver.get("instruction", ""),
                "type":                  maneuver.get("type", ""),
                "modifier":              maneuver.get("modifier", ""),
                "road_name":             step.get("name", ""),
                "distance_m":            round(step.get("distance", 0), 1),
                "duration_s":            round(step.get("duration", 0), 1),
                "cumulative_distance_m": round(cumulative_distance, 1),
                "speed_limit_kmh":       step.get("speed_limit"),
            })
            cumulative_distance += step.get("distance", 0)

    return {
        "index":               idx,
        "geometry":            geometry,
        "distance_m":          round(total_distance, 1),
        "duration_s":          round(total_duration, 1),
        "adjusted_duration_s": round(adjusted_duration, 1),
        "congestion_segments": congestion_segments,
        "segment_speeds":      segment_speeds,
        "nav_steps":           nav_steps,
    }


# ═════════════════════════════════════════════
#  HEALTH CHECK
# ═════════════════════════════════════════════
@app.get("/")
def root():
    return {"status": "ok", "name": "LifeLink Unified API", "version": "2.0.0"}


# ═════════════════════════════════════════════
#  PARAMEDIC DISPATCH ENDPOINTS
# ═════════════════════════════════════════════

@app.post("/api/paramedic-heartbeat")
async def paramedic_heartbeat(hb: ParamedicHeartbeat):
    """Paramedic app sends GPS + ID every 5 s while on patrol."""
    if hb.paramedic_id not in paramedic_locations:
        paramedic_locations[hb.paramedic_id] = {"lat": hb.lat, "lon": hb.lon, "status": "available"}
    else:
        paramedic_locations[hb.paramedic_id].update({"lat": hb.lat, "lon": hb.lon})
    return {"status": "ok", "registered": list(paramedic_locations.keys())}


@app.post("/api/trigger")
async def receive_crash(alert: CrashAlert):
    """Edge AI or ambulance tracking app fires this when a crash is detected."""
    active_incidents[alert.incident_id] = {
        "status": "PENDING", "gps_location": alert.gps_location,
        "assigned_to": None, "destination_hospital": None,
        "patient": None, "ai_summary": "Awaiting Paramedic Scan...",
        "amb_lat": 0.0, "amb_lon": 0.0,
    }
    try:
        parts = alert.gps_location.split(",")
        crash_lat, crash_lon = float(parts[0].strip()), float(parts[1].strip())
        _assign_nearest_paramedic(alert.incident_id, crash_lat, crash_lon)
    except Exception as e:
        print(f"GPS parse error: {e}")
    return {"status": "success", "assigned_to": active_incidents[alert.incident_id].get("assigned_to")}


@app.get("/api/check-dispatch")
async def check_dispatch(paramedic_id: str = ""):
    """Flutter app polls this every 3 s. Only the assigned paramedic gets the ping."""
    for inc_id, data in active_incidents.items():
        if data["status"] == "PENDING":
            assigned = data.get("assigned_to")
            if assigned is None or assigned == paramedic_id or paramedic_id == "":
                return {
                    "status": "found",
                    "incident_id": inc_id,
                    "gps_location": data["gps_location"],
                    "assigned_dist_km": data.get("assigned_dist_km", 0),
                }
    return {"status": "waiting"}


@app.post("/api/accept-dispatch")
async def accept_dispatch(dispatch: DispatchAccept):
    if dispatch.incident_id in active_incidents:
        active_incidents[dispatch.incident_id]["status"]      = "ASSIGNED"
        active_incidents[dispatch.incident_id]["assigned_to"] = dispatch.ambulance_id
        if dispatch.ambulance_id in paramedic_locations:
            paramedic_locations[dispatch.ambulance_id]["status"] = "dispatched"
        return {"status": "success"}
    return {"error": "Not found"}


@app.post("/api/update-location")
async def update_location(loc: LocationUpdate):
    if loc.incident_id in active_incidents:
        active_incidents[loc.incident_id]["amb_lat"] = loc.lat
        active_incidents[loc.incident_id]["amb_lon"] = loc.lon
        green_corridor.update_dynamic_lights(loc.lat, loc.lon)
    return {"status": "success"}


@app.post("/api/paramedic-scan")
async def process_triage(scan: QRScan):
    summary_text = ""
    for inc_id, data in active_incidents.items():
        if data["status"] == "ASSIGNED":

            patient_wallet = "0x_patient_address"
            doctor_wallet = "0x_doctor_address" 
            
            print("🔗 Querying Polygon Blockchain for Medical Records...")
            
            # Fetch from Smart Contract!
            patient_data = web3_connect.fetch_patient_data(patient_wallet, doctor_wallet)

            if not patient_data:
                patient_data = {"name": "Rahul Sharma", "blood_group": "O-Negative", "allergies": "Penicillin, Peanuts"}
                
            data["patient"] = patient_data
            
            print("🧠 Generating AWS Bedrock Triage Summary...")
            
            # 2. Call the new AWS Bedrock function!
            summary_text = bedrock_ai.generate_triage_summary(patient_data)
            data["ai_summary"] = summary_text
            
    return {"status": "success", "ai_triage_summary": summary_text}

@app.get("/api/er-updates")
async def get_er_updates():
    for inc_id, data in active_incidents.items():
        if data["status"] == "ASSIGNED":
            return {
                "status":    "incoming",
                "patient":   data["patient"],
                "ai_summary": data["ai_summary"],
                "amb_lat":   data["amb_lat"],
                "amb_lon":   data["amb_lon"],
                "lights":    green_corridor.IOT_TRAFFIC_LIGHTS,
            }
    return {"status": "waiting"}


@app.post("/api/clear-er")
async def clear_er():
    active_incidents.clear()
    for p_id in paramedic_locations:
        paramedic_locations[p_id]["status"] = "available"
    return {"status": "success"}


@app.get("/api/paramedics")
async def get_paramedics():
    return {"paramedics": paramedic_locations}


@app.get("/dashboard", response_class=HTMLResponse)
async def serve_dashboard():
    with open("templates/er_dashboard.html", "r", encoding="utf-8") as f:
        return f.read()


# ═════════════════════════════════════════════
#  AMBULANCE TRACKING — HOSPITAL SEARCH
# ═════════════════════════════════════════════

@app.get("/api/hospitals")
def get_hospitals(
    lat: float = Query(default=DEFAULT_LAT, description="Incident latitude"),
    lng: float = Query(default=DEFAULT_LNG, description="Incident longitude"),
    radius: int = Query(default=50000,      description="Search radius in metres"),
):
    """Fetch nearby hospitals from OpenStreetMap via Overpass API."""
    overpass_url = "https://overpass-api.de/api/interpreter"
    query = f"""
    [out:json][timeout:25];
    (
      node["amenity"="hospital"](around:{radius},{lat},{lng});
      way["amenity"="hospital"](around:{radius},{lat},{lng});
      node["amenity"="clinic"](around:{radius},{lat},{lng});
      way["amenity"="clinic"](around:{radius},{lat},{lng});
      node["healthcare"="hospital"](around:{radius},{lat},{lng});
      way["healthcare"="hospital"](around:{radius},{lat},{lng});
    );
    out center;
    """
    try:
        resp = requests.get(overpass_url, params={"data": query}, timeout=20)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"Overpass error: {e}. Using fallback hospitals.")
        data = {"elements": []}

    hospitals, seen_ids = [], set()
    for el in data.get("elements", []):
        h_lat = el.get("lat") or el.get("center", {}).get("lat")
        h_lng = el.get("lon") or el.get("center", {}).get("lon")
        if h_lat is None or h_lng is None:
            continue
        tags  = el.get("tags", {})
        name  = tags.get("name") or tags.get("name:en") or "Unnamed Hospital"
        el_id = el["id"]
        if el_id in seen_ids:
            continue
        seen_ids.add(el_id)
        dist = haversine(lat, lng, h_lat, h_lng)
        hospitals.append({"id": el_id, "name": name, "lat": h_lat, "lng": h_lng, "distance_km": round(dist, 2)})

    # Supplement with fallback hospitals if fewer than 3 real results
    if len(hospitals) < 3:
        fallbacks = [
            (0.018,  0.012, "City General Hospital"),
            (-0.025, 0.008, "District Civil Hospital"),
            (0.010, -0.020, "Community Health Centre North"),
            (-0.015,-0.025, "Primary Health Centre South"),
            (0.030,  0.005, "Trauma Care Centre East"),
            (-0.005, 0.035, "Referral Hospital West"),
            (0.022, -0.018, "Emergency Medical Institute"),
            (-0.032, 0.022, "Apollo Clinic"),
        ]
        for i, (dlat, dlng, hosp_name) in enumerate(fallbacks):
            fake_id = 900000 + i
            if fake_id in seen_ids:
                continue
            h_lat2, h_lng2 = lat + dlat, lng + dlng
            hospitals.append({
                "id":          fake_id,
                "name":        hosp_name,
                "lat":         h_lat2,
                "lng":         h_lng2,
                "distance_km": round(haversine(lat, lng, h_lat2, h_lng2), 2),
            })
            if len(hospitals) >= 8:
                break

    # Add dynamic ETA per hospital
    for h in hospitals:
        d = h["distance_km"]
        speed = 25 if d < 2 else (35 if d < 10 else (55 if d < 30 else 70))
        h["eta_minutes"] = round((d / (speed / CIVIC_FACTOR)) * 60, 1)

    hospitals.sort(key=lambda h: h["distance_km"])
    return {"count": len(hospitals), "hospitals": hospitals}


# ═════════════════════════════════════════════
#  AMBULANCE TRACKING — ROUTING (Mapbox)
# ═════════════════════════════════════════════

@app.get("/api/route")
def get_route(
    src_lat: float = Query(...), src_lng: float = Query(...),
    dst_lat: float = Query(...), dst_lng: float = Query(...),
):
    """Traffic-aware Mapbox route with TDA* civic-factor weighting."""
    if not MAPBOX_TOKEN:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="MAPBOX_TOKEN is not configured")

    url = f"https://api.mapbox.com/directions/v5/mapbox/driving-traffic/{src_lng},{src_lat};{dst_lng},{dst_lat}"
    params = {
        "access_token": MAPBOX_TOKEN,
        "geometries": "geojson", "overview": "full",
        "annotations": "congestion,speed,duration,distance,maxspeed",
        "steps": "true",
    }
    try:
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=502, detail=f"Mapbox error: {e}")

    if not data.get("routes"):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="No route found")

    route         = data["routes"][0]
    processed     = _process_route(route)
    total_duration = route["duration"]
    adjusted      = total_duration / CIVIC_FACTOR

    # Fetch static (no-traffic) route for time-saved comparison
    static_url    = f"https://api.mapbox.com/directions/v5/mapbox/driving/{src_lng},{src_lat};{dst_lng},{dst_lat}"
    static_params = {"access_token": MAPBOX_TOKEN, "geometries": "geojson", "overview": "full"}
    static_duration = total_duration
    static_geometry = route["geometry"]
    try:
        sr = requests.get(static_url, params=static_params, timeout=30)
        sr.raise_for_status()
        sd = sr.json()
        if sd.get("routes"):
            static_duration = sd["routes"][0]["duration"]
            static_geometry = sd["routes"][0]["geometry"]
    except Exception:
        pass

    return {
        "traffic_route": {
            "geometry":            route["geometry"],
            "distance_m":          round(route["distance"], 1),
            "duration_s":          round(total_duration, 1),
            "adjusted_duration_s": round(adjusted, 1),
            "congestion_segments": processed["congestion_segments"],
            "nav_steps":           processed["nav_steps"],
        },
        "static_route": {
            "geometry":   static_geometry,
            "duration_s": round(static_duration, 1),
        },
        "time_saved_s":  round(static_duration - adjusted, 1),
        "civic_factor":  CIVIC_FACTOR,
    }


@app.get("/api/alternative_routes")
def get_alternative_routes(
    src_lat: float = Query(...), src_lng: float = Query(...),
    dst_lat: float = Query(...), dst_lng: float = Query(...),
):
    """Multiple alternative Mapbox routes, each with congestion and TDA* durations."""
    if not MAPBOX_TOKEN:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="MAPBOX_TOKEN is not configured")

    url = f"https://api.mapbox.com/directions/v5/mapbox/driving-traffic/{src_lng},{src_lat};{dst_lng},{dst_lat}"
    params = {
        "access_token": MAPBOX_TOKEN,
        "geometries": "geojson", "overview": "full",
        "annotations": "congestion,speed,duration,distance,maxspeed",
        "steps": "true", "alternatives": "true",
    }
    try:
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=502, detail=f"Mapbox error: {e}")

    if not data.get("routes"):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="No routes found")

    routes = [_process_route(r, idx=i) for i, r in enumerate(data["routes"])]
    routes.sort(key=lambda r: r["adjusted_duration_s"])
    return {"count": len(routes), "routes": routes, "civic_factor": CIVIC_FACTOR}


@app.get("/api/reroute")
def reroute(
    src_lat:         float = Query(...),
    src_lng:         float = Query(...),
    exclude_dst_lat: float = Query(..., description="Blocked destination lat"),
    exclude_dst_lng: float = Query(..., description="Blocked destination lng"),
    incident_lat:    float = Query(default=DEFAULT_LAT),
    incident_lng:    float = Query(default=DEFAULT_LNG),
):
    """Re-route to the next-best hospital when primary destination is unreachable."""
    hospitals_resp = get_hospitals(lat=incident_lat, lng=incident_lng)
    alternatives = [
        h for h in hospitals_resp["hospitals"]
        if not (abs(h["lat"] - exclude_dst_lat) < 0.001 and abs(h["lng"] - exclude_dst_lng) < 0.001)
    ]
    if not alternatives:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="No alternative hospitals found")

    best  = alternatives[0]
    route = get_route(src_lat=src_lat, src_lng=src_lng, dst_lat=best["lat"], dst_lng=best["lng"])
    return {"rerouted_to": best, "route": route}

