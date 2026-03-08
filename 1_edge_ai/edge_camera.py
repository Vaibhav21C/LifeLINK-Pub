import cv2
import time
from ultralytics import YOLO
import trigger_client  # Our modular webhook sender

# --- 1. INITIALIZATION ---
print("🚀 Loading Custom LifeLink Brain...")
model = YOLO("best.pt")

# Load your video (replace with 0 for live webcam during the demo if needed)
video_source = "test_crash.mp4" 
cap = cv2.VideoCapture(video_source)

# --- 2. STATE MANAGEMENT (Anti-Spam) ---
is_incident_active = False
cooldown_seconds = 30  # Wait 30 seconds before the camera can trigger another alert
last_alert_time = 0

print("🎥 LifeLink Edge Camera Initialized. Watching for crashes...")

# --- 3. MAIN VISION LOOP ---
while cap.isOpened():
    success, frame = cap.read()
    if not success:
        print("End of video stream. Looping for test purposes...")
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        continue

    # Run AI inference. Adjust 'conf' up or down based on your new model's strictness
    results = model(frame, verbose=False, conf=0.60) 
    crash_detected_this_frame = False

    # Parse the YOLO bounding boxes
    for result in results:
        boxes = result.boxes
        for box in boxes:
            cls_id = int(box.cls[0])
            class_name = model.names[cls_id].lower()
            
            # Coordinates and confidence for drawing
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            confidence = round(float(box.conf[0]), 2)
            
            # Highlight accidents in RED for the judges
            if class_name == 'accident':
                crash_detected_this_frame = True
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
                cv2.putText(frame, f"CRASH ALERT {confidence}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            
            # Highlight normal traffic in GREEN (if your model has a non-accident class)
            elif class_name == 'non accident':
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 1)
                cv2.putText(frame, f"Traffic {confidence}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 0), 1)

    # --- 4. THE TRIGGER PIPELINE ---
    current_time = time.time()
    
    # Release the state lock if the cooldown timer has expired
    if is_incident_active and (current_time - last_alert_time > cooldown_seconds):
        is_incident_active = False
        print("🟢 Incident cleared. System ready for new detections.")

    # Fire the webhook if a crash is seen AND the system isn't currently locked
    if crash_detected_this_frame and not is_incident_active:
        print("\n🚨 CRASH CONFIRMED! Executing Handoff to Trigger Client...")
        
        # Call the external trigger file
        success = trigger_client.fire_trigger(
            incident_id="CRASH-991",
            location="22.6116, 77.7810", # Mock CCTV GPS coordinates
            severity="HIGH"
        )
        
        if success:
            is_incident_active = True
            last_alert_time = current_time

    # --- 5. THE LIVE DEMO DISPLAY ---
    cv2.imshow("LifeLink Edge AI - CCTV Feed", frame)

    # Press 'q' in the video window to cleanly exit
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()