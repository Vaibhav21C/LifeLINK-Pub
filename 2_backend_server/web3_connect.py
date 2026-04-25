from web3 import Web3
import requests

# --- 1. BLOCKCHAIN SETUP ---
# Tell your teammate to give you the RPC URL for whatever testnet they deployed to (e.g., Polygon Amoy)
# If they are running a local Anvil node from Foundry, it will be "http://127.0.0.1:8545"
RPC_URL = "https://rpc-amoy.polygon.technology/" 
w3 = Web3(Web3.HTTPProvider(RPC_URL))

# Tell your teammate to paste the deployed address of 'MedicalRecords.sol' here
CONTRACT_ADDRESS = "0x6EF09a8f3D57423827386650650df02ca29C48b1"

# This is the simplified ABI (Application Binary Interface) just for the getRecords function
ABI = [
    {
        "inputs": [{"internalType": "address", "name": "_patient", "type": "address"}],
        "name": "getRecords",
        "outputs": [
            {
                "components": [
                    {"internalType": "uint256", "name": "recordId", "type": "uint256"},
                    {"internalType": "address", "name": "doctor", "type": "address"},
                    {"internalType": "address", "name": "patient", "type": "address"},
                    {"internalType": "string", "name": "recordType", "type": "string"},
                    {"internalType": "string", "name": "ipfsHash", "type": "string"},
                    {"internalType": "uint256", "name": "timestamp", "type": "uint256"},
                    {"internalType": "uint256", "name": "version", "type": "uint256"}
                ],
                "internalType": "struct MedicalRecords.Record[]",
                "name": "",
                "type": "tuple[]"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
]

def fetch_patient_data(patient_wallet: str, doctor_wallet: str):
    """
    1. Queries the Polygon contract to get the IPFS hash.
    2. Fetches the JSON data from the IPFS gateway.
    """
    try:
        # Connect to the contract
        contract = w3.eth.contract(address=CONTRACT_ADDRESS, abi=ABI)
        
        # Call getRecords(). 
        # We MUST pass the doctor_wallet in the 'from' field so ConsentManager.sol knows who is asking!
        records = contract.functions.getRecords(patient_wallet).call({'from': doctor_wallet})
        
        if not records:
            return None
            
        # Get the most recent record (the last one in the array)
        latest_record = records[-1]
        ipfs_hash = latest_record[4] # Index 4 is the ipfsHash in the struct
        
        print(f"✅ Web3 Success! Found IPFS Hash: {ipfs_hash}")
        
        # Step 2: Fetch the actual medical data from IPFS
        ipfs_gateway_url = f"https://gateway.pinata.cloud/ipfs/{ipfs_hash}"
        response = requests.get(ipfs_gateway_url)
        
        if response.status_code == 200:
            return response.json() # Returns {"name": "...", "blood_group": "...", "allergies": "..."}
        else:
            return None
            
    except Exception as e:
        print(f"❌ Web3 Connection Error: {e}")
        return None