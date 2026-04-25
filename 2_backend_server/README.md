# LifeLink Unified Backend Server

LifeLink is an integrated health and emergency response system. This FastAPI-based backend server orchestrates paramedic dispatch, dynamic ambulance routing, "green corridor" traffic management, blockchain-secured medical records retrieval, and AI-driven triage generation.

## Features

- **Paramedic Dispatch**: Handles real-time incident reports (crash alerts) and assigns the nearest available paramedics based on GPS locations using Haversine distance calculations.
- **Dynamic Routing (Mapbox)**: Calculates optimal paths for ambulances considering live traffic congestion, providing time-saved estimations against static routes. Also handles dynamic rerouting if a destination is blocked.
- **Green Corridor Management**: Simulates an IoT traffic light system, dynamically turning traffic lights green as an ambulance approaches to ensure uninterrupted transit.
- **Blockchain Medical Records**: Connects to the Polygon network to retrieve decentralized medical records (via IPFS) for victims from a verified smart contract (`MedicalRecords.sol`).
- **AI Triage Summaries (AWS Bedrock)**: Utilizes Amazon Nova Lite (via AWS Bedrock) to generate concise, critical action plans for the ER trauma team based on the retrieved medical history.
- **Hospital Search Database**: Locates nearby hospitals via OpenStreetMap (Overpass API) with geographical radius limits and estimated time of arrivals (ETAs).

## Project Structure

- `server.py`: The core FastAPI application that ties all components together and exposes the API endpoints.
- `web3_connect.py`: Handles Web3 connectivity to a Polygon RPC (e.g., Amoy testnet) and fetches patient IPFS hash from the smart contract.
- `green_corridor.py`: Helper functions to locate nearest hospitals/ambulances and manage the dynamic traffic lights along the route.
- `bedrock_ai.py`: Functions to query AWS Bedrock with patient data to generate an actionable triage summary for the emergency room.

## Environment Variables

Make sure to create a `.env` file in the root of `2_backend_server` or set these in your environment:

- `MAPBOX_TOKEN`: Your API token for Mapbox services to enable routing features.

*Note: Some tokens/keys (like `BEDROCK_API_KEY` for AWS Bedrock) are currently hardcoded in their respective modules and should also be moved to the `.env` file for best security practices.*

## Prerequisites

- Python 3.8+
- [FastAPI](https://fastapi.tiangolo.com/)
- [Uvicorn](https://www.uvicorn.org/)
- Requests
- Web3.py
- Python-dotenv

## Installation

1. Navigate to the backend directory:
   ```bash
   cd 2_backend_server
   ```

2. Create and activate a virtual environment (optional but recommended):
   ```bash
   python -m venv env
   # On Windows:
   env\Scripts\activate
   # On macOS/Linux:
   source env/bin/activate
   ```

3. Install the required dependencies:
   ```bash
   pip install fastapi uvicorn requests web3 python-dotenv pydantic
   ```

## Running the Server

Start the development server with Uvicorn:

```bash
uvicorn server:app --reload --port 8000
```

The API will be running on `http://localhost:8000`.
Check out the interactive Swagger documentation and test the endpoints directly from your browser by visiting: `http://localhost:8000/docs`.

## Key Endpoints

### Dispatch
- `POST /api/trigger`: Receive a crash alert and dispatch the nearest paramedic.
- `POST /api/paramedic-heartbeat`: Update the GPS location of an available paramedic.
- `POST /api/accept-dispatch`: Paramedic app accepts the incident assignment.

### Routing & ER Readiness
- `GET /api/hospitals`: Get nearby hospitals around a specific Lat/Lng.
- `GET /api/route`: Get a traffic-adjusted route between source and destination using Mapbox.
- `POST /api/paramedic-scan`: Triggered when an ambulance identifies a patient. Calls Web3 (Polygon) to fetch medical records and AWS Bedrock for a triage summary.
- `GET /api/er-updates`: Endpoint polled by the ER to get incoming ambulance status, patient medical records, and the AI summary.

## Health Check
- `GET /`: Health check endpoint to verify the server is running.
