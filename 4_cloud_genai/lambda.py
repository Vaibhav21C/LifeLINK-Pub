import json
import boto3
import os

# Initialize the Bedrock client to talk to Claude 3
# Note: Ensure your Lambda execution role has 'bedrock:InvokeModel' permissions
bedrock = boto3.client(service_name='bedrock-runtime', region_name='us-east-1')

def lambda_handler(event, context):
    try:
        # 1. Parse the incoming JSON payload from your FastAPI server
        # API Gateway wraps the payload in a 'body' string
        body = json.loads(event.get('body', '{}'))
        patient_data = body.get('patient_data')
        
        if not patient_data:
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'Missing patient data from MediChain'})
            }

        # 2. Construct the strict System Prompt
        prompt = f"""
        You are an expert ER trauma AI. A severe road accident has just occurred.
        Generate a highly concise, bulleted pre-arrival briefing for paramedics and ER staff based on this patient's MediChain data.
        
        PATIENT DATA:
        Name: {patient_data.get('name', 'Unknown')}
        Blood Group: {patient_data.get('blood_group', 'Unknown')}
        Allergies: {patient_data.get('allergies', 'None recorded')}
        Medical History: {patient_data.get('medical_history', 'None recorded')}

        RULES:
        - Focus ONLY on immediate life-threatening risks and actionable ER prep.
        - DO NOT output any conversational filler.
        - Keep it under 50 words. Format with emojis for quick reading.
        """

        # 3. Format the payload specifically for Anthropic Claude 3 Messages API
        bedrock_payload = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 200,
            "messages": [
                {
                    "role": "user", 
                    "content": prompt
                }
            ]
        }

        # 4. Invoke the Model
        response = bedrock.invoke_model(
            modelId='anthropic.claude-3-haiku-20240307-v1:0', # Haiku is the fastest for real-time ER triage
            contentType='application/json',
            accept='application/json',
            body=json.dumps(bedrock_payload)
        )

        # 5. Extract the generated text
        response_body = json.loads(response.get('body').read())
        ai_summary = response_body.get('content')[0].get('text')

        # 6. Return the formatted response back to your local server/Flutter app
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*' # Prevents CORS errors during testing
            },
            'body': json.dumps({
                'status': 'success',
                'ai_triage_summary': ai_summary
            })
        }

    except Exception as e:
        print(f"Bedrock Invocation Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': 'Internal Server Error during AI Generation'})
        }