import requests

# The local URL of your FastAPI orchestration server
# (If you deploy the server to AWS/Render later, you just change this one line!)
SERVER_URL = "http://127.0.0.1:8000/api/trigger"

def fire_trigger(incident_id, location, severity, patient_id="PENDING"):
    """
    Fires the webhook to the FastAPI orchestration server.
    Returns True if successful, False if it fails.
    """
    payload = {
        "incident_id": incident_id,
        "gps_location": location,
        "severity": severity,
        "patient_id": patient_id
    }
    
    try:
        # We use a 3-second timeout so if the server is down, 
        # it doesn't freeze your live camera feed!
        response = requests.post(SERVER_URL, json=payload, timeout=3)
        
        if response.status_code == 200:
            print(f"✅ Webhook Fired Successfully! Server says: {response.json().get('message')}")
            return True
        else:
            print(f"⚠️ Webhook reached server, but got error code: {response.status_code}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("❌ Webhook Failed: Cannot reach backend. Is your FastAPI server running?")
        return False
    except requests.exceptions.Timeout:
        print("❌ Webhook Failed: Server took too long to respond (Timeout).")
        return False