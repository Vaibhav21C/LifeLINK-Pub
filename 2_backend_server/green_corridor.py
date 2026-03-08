import math

def get_distance_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

AMBULANCE_FLEET = {"AMB-01": {"lat": 22.6120, "lon": 77.7800, "status": "AVAILABLE"}}
HOSPITAL_DB = {"HOSP-01": {"name": "Govt Hospital Itarsi", "lat": 22.6150, "lon": 77.7750, "trauma_level": 1}}

# We placed these exactly on the route between the crash and the hospital
IOT_TRAFFIC_LIGHTS = {
    "TL-101": {"name": "Main Junction", "lat": 22.6130, "lon": 77.7780, "status": "RED"},
    "TL-102": {"name": "Market Square", "lat": 22.6140, "lon": 77.7760, "status": "RED"}
}

def find_nearby_ambulances(crash_lat, crash_lon, radius_km=5.0):
    return [amb_id for amb_id, data in AMBULANCE_FLEET.items() if get_distance_km(crash_lat, crash_lon, data["lat"], data["lon"]) <= radius_km]

def find_nearest_hospital(crash_lat, crash_lon):
    return {"id": "HOSP-01", "name": "Govt Hospital Itarsi", "lat": 22.6150, "lon": 77.7750, "distance_km": get_distance_km(crash_lat, crash_lon, 22.6150, 77.7750)}

def update_dynamic_lights(amb_lat, amb_lon):
    """If the ambulance is within 400 meters of a light, turn it GREEN. Otherwise RED."""
    for tl_id, data in IOT_TRAFFIC_LIGHTS.items():
        dist = get_distance_km(amb_lat, amb_lon, data["lat"], data["lon"])
        if dist < 0.4:  
            data["status"] = "GREEN"
        else:
            data["status"] = "RED"
    return IOT_TRAFFIC_LIGHTS