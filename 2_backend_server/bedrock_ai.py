import requests
import json

# Paste your single Bedrock API key here
BEDROCK_API_KEY = "api_key" 

def generate_triage_summary(patient_data):
    """Feeds MediChain data to Amazon Nova Lite using the new ABSK Bearer Token."""
    
    prompt = f"""You are an elite ER AI assistant. A patient is arriving via ambulance in 4 minutes following a road crash.
    
    PATIENT MEDICHAIN DATA:
    - Name: {patient_data.get('name', 'Unknown')}
    - Blood Group: {patient_data.get('bloodGroup', 'Unknown')}
    - Allergies: {patient_data.get('allergies', 'None recorded')}
    - Medical History: {patient_data.get('medicalHistory', 'None recorded')}

    TASK: Generate a critical, 3-bullet point immediate action plan for the ER trauma team. 
    Keep it strictly under 50 words total. Be authoritative, urgent, and concise. Do not use conversational filler."""

    # The direct REST endpoint for the Converse API (using Nova Lite)
    url = "https://bedrock-runtime.us-east-1.amazonaws.com/model/us.amazon.nova-lite-v1:0/converse"
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {BEDROCK_API_KEY}" # <-- Your ABSK key goes straight into the header!
    }

    payload = {
        "messages": [
            {
                "role": "user",
                "content": [{"text": prompt}]
            }
        ],
        "inferenceConfig": {
            "maxTokens": 150,
            "temperature": 0.2
        }
    }

    try:
        response = requests.post(url, headers=headers, json=payload)
        
        if response.status_code == 200:
            response_data = response.json()
            return response_data['output']['message']['content'][0]['text']
        else:
            print(f"❌ AWS Bedrock Error {response.status_code}: {response.text}")
            return "⚠️ AI GENERATION FAILED.\n1. Prepare standard trauma bay.\n2. Standby for manual triage."
            
    except Exception as e:
        print(f"❌ Network Error: {e}")
        return "⚠️ AI GENERATION FAILED.\n1. Prepare standard trauma bay.\n2. Standby for manual triage."