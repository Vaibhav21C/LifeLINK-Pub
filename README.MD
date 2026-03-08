# 🚑 LifeLink: Decentralized AI Emergency Response System

> **LifeLink** is a comprehensive, end-to-end emergency response architecture that bypasses traditional 911 delays. By combining Edge Computer Vision, Live GPS Routing, Generative AI Triage, and a Web3 Medical Data Vault, LifeLink gets the right care to crash victims instantly.

---

## 🌟 The Problem
During severe road accidents, the "Golden Hour" dictates patient survival. Current systems rely on human bystanders to call 911, dispatchers to route ambulances manually, and ER doctors waiting blindly until the patient physically arrives to check their medical history.

## 🚀 The LifeLink Solution
LifeLink completely automates the rescue pipeline:
1. **Detect:** Edge AI cameras instantly detect collisions and dispatch the nearest ambulance.
2. **Route:** The system simulates a "Green Corridor," clearing traffic lights via IoT as the ambulance navigates via live GPS.
3. **Scan:** Paramedics scan the victim's ID to unlock decentralized medical records (MediChain) via Polygon & IPFS.
4. **Triage:** Amazon Nova Lite (AWS Bedrock) instantly reads the medical file and generates a 3-bullet critical action plan for the ER.
5. **Prepare:** The ER Dashboard tracks the ambulance live on a map and displays the AI triage plan before the patient even arrives.

---

## 🛠️ Tech Stack
* **Edge AI:** Python, OpenCV, YOLO Vision Models
* **Cloud Backend:** FastAPI (Python), AWS EC2
* **Generative AI:** Amazon Nova Lite (via AWS Bedrock REST API)
* **Mobile/Web Frontend:** Flutter, Leaflet.js, Tailwind CSS
* **Web3 / Blockchain:** Solidity, Foundry, Polygon Amoy Testnet, IPFS (Pinata), Web3.py

---

## 📁 Repository Architecture

This monorepo is divided into 5 microservices:

* `1_edge_ai/` - The local Computer Vision node. Watches intersection feeds and fires Webhooks on crash detection.
* `2_backend_server/` - The FastAPI brain. Orchestrates IoT traffic lights, queries the blockchain, and calls AWS Bedrock.
* `3_paramedic_app/` - The Flutter mobile console. Provides live GPS routing (`flutter_map`) and MediChain QR scanning.
* `4_er_dashboard/` - (Served via backend) The hospital web portal with live Leaflet.js tracking and patient data.
* `5_medichain_web3/` - The Foundry project containing our decentralized medical architecture (`MedicalRecords.sol`, `ConsentManager.sol`, etc.).

---

## ⛓️ MediChain Web3 Architecture
To guarantee absolute patient privacy and data integrity, LifeLink uses a multi-contract Web3 architecture deployed on **Polygon**:
* **`HospitalRegistry.sol` & `DoctorRegistry.sol`:** Ensures only verified medical professionals can query the network.
* **`ConsentManager.sol`:** Features a `grantEmergencyAccess` function to temporarily allow paramedics to view records during a crisis.
* **`MedicalRecords.sol`:** The data vault. Stores a secure IPFS Hash pointing to the patient's heavy medical JSON data, minimizing gas fees while maximizing security.
* **`InsuranceEscrow.sol`:** Smart contract for automated insurance payouts post-treatment.

---

## 🚀 How to Run the Demo

**1. Setup the Environment**
Clone the repository and install dependencies.
*Note: Do not commit your `.env` file! See `.env.example` for required Web3 and AWS API keys.*

**2. Start the Cloud Backend (Terminal 1)**
```bash
cd 2_backend_server
python -m venv venv
source venv/bin/activate  # (or venv\Scripts\activate on Windows)
pip install -r requirements.txt
uvicorn server:app --reload

Open http://127.0.0.1:8000/dashboard to view the ER Hospital Dashboard.

**3. Launch the Paramedic Console (Terminal 2)**

```bash
cd 3_paramedic_app
flutter run -d chrome
```

**4. Trigger the Edge AI Crash (Terminal 3)**

```bash
cd 1_edge_ai
python edge_camera.py
```

<<<<<<< HEAD
The local video feed will open. Upon collision, the YOLO model will trigger the cloud backend, dispatching the Flutter app and updating the ER dashboard in real-time.
=======
The local video feed will open. Upon collision, the YOLO model will trigger the cloud backend, dispatching the Flutter app and updating the ER dashboard in real-time.
