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

# Dynamic traffic lights — will be populated from the actual route
IOT_TRAFFIC_LIGHTS = {}

# Fallback static lights (used only if no route is synced)
STATIC_TRAFFIC_LIGHTS = {
    "TL-101": {"name": "Main Junction", "lat": 22.6130, "lon": 77.7780, "status": "RED"},
    "TL-102": {"name": "Market Square", "lat": 22.6140, "lon": 77.7760, "status": "RED"}
}

def find_nearby_ambulances(crash_lat, crash_lon, radius_km=5.0):
    return [amb_id for amb_id, data in AMBULANCE_FLEET.items() if get_distance_km(crash_lat, crash_lon, data["lat"], data["lon"]) <= radius_km]

def find_nearest_hospital(crash_lat, crash_lon):
    return {"id": "HOSP-01", "name": "Govt Hospital Itarsi", "lat": 22.6150, "lon": 77.7750, "distance_km": get_distance_km(crash_lat, crash_lon, 22.6150, 77.7750)}


def generate_traffic_lights_from_route(route_coords):
    """
    Generate 5-6 traffic light markers evenly spaced along the route.
    route_coords: list of [lng, lat] pairs (GeoJSON format).
    Returns a dict of traffic lights.
    """
    global IOT_TRAFFIC_LIGHTS
    
    if not route_coords or len(route_coords) < 4:
        IOT_TRAFFIC_LIGHTS = dict(STATIC_TRAFFIC_LIGHTS)
        return IOT_TRAFFIC_LIGHTS
    
    # Calculate cumulative distances along the route
    cum_dists = [0.0]
    for i in range(1, len(route_coords)):
        d = get_distance_km(
            route_coords[i-1][1], route_coords[i-1][0],  # lat, lon from [lng, lat]
            route_coords[i][1], route_coords[i][0]
        )
        cum_dists.append(cum_dists[-1] + d)
    
    total_dist = cum_dists[-1]
    if total_dist < 0.5:  # Too short for traffic lights
        IOT_TRAFFIC_LIGHTS = dict(STATIC_TRAFFIC_LIGHTS)
        return IOT_TRAFFIC_LIGHTS
    
    # Place 5 traffic lights evenly along the route (at 15%, 30%, 45%, 60%, 75%)
    light_fractions = [0.15, 0.30, 0.45, 0.60, 0.75]
    light_names = [
        "Signal Alpha", "Junction Beta", "Crossing Gamma",
        "Signal Delta", "Junction Epsilon"
    ]
    
    new_lights = {}
    for idx, frac in enumerate(light_fractions):
        target_dist = total_dist * frac
        
        # Find the segment where this distance falls
        for i in range(1, len(cum_dists)):
            if cum_dists[i] >= target_dist:
                # Interpolate between points i-1 and i
                seg_len = cum_dists[i] - cum_dists[i-1]
                if seg_len > 0:
                    t = (target_dist - cum_dists[i-1]) / seg_len
                else:
                    t = 0
                lat = route_coords[i-1][1] + t * (route_coords[i][1] - route_coords[i-1][1])
                lon = route_coords[i-1][0] + t * (route_coords[i][0] - route_coords[i-1][0])
                
                tl_id = f"TL-{201 + idx}"
                new_lights[tl_id] = {
                    "name": light_names[idx],
                    "lat": round(lat, 6),
                    "lon": round(lon, 6),
                    "status": "RED"
                }
                break
    
    IOT_TRAFFIC_LIGHTS = new_lights
    return IOT_TRAFFIC_LIGHTS


def update_dynamic_lights(amb_lat, amb_lon):
    """If the ambulance is within 400 meters of a light, turn it GREEN. Otherwise RED."""
    # If no dynamic lights have been generated yet, use static fallback
    if not IOT_TRAFFIC_LIGHTS:
        lights_to_check = STATIC_TRAFFIC_LIGHTS
    else:
        lights_to_check = IOT_TRAFFIC_LIGHTS
    
    for tl_id, data in lights_to_check.items():
        dist = get_distance_km(amb_lat, amb_lon, data["lat"], data["lon"])
        if dist < 0.4:  
            data["status"] = "GREEN"
        else:
            data["status"] = "RED"
    return lights_to_check


def get_current_lights():
    """Return whichever traffic lights are currently active."""
    if IOT_TRAFFIC_LIGHTS:
        return IOT_TRAFFIC_LIGHTS
    return STATIC_TRAFFIC_LIGHTS