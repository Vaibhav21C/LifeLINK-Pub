# -*- coding: utf-8 -*-
"""
LifeLink - Accident Detection Model Performance Evaluation
Runs the best.pt model on test images/videos and prints metrics.
"""

import os
import sys
import json
import time
import cv2
import numpy as np
from ultralytics import YOLO

# ──────────────────────────────────────────────────────────
# 1. LOAD MODEL
# ──────────────────────────────────────────────────────────
MODEL_PATH = os.path.join(os.path.dirname(__file__), "best.pt")
print(f"📦 Loading model from: {MODEL_PATH}")
model = YOLO(MODEL_PATH)
print(f"✅ Model loaded. Classes: {model.names}")

# ──────────────────────────────────────────────────────────
# 2. EVALUATE ON TEST IMAGES
# ──────────────────────────────────────────────────────────
IMG_DIR = os.path.join(os.path.dirname(__file__), "inputs", "images")
VID_DIR = os.path.join(os.path.dirname(__file__), "inputs", "videos")

print("\n" + "=" * 60)
print("📸  IMAGE INFERENCE RESULTS")
print("=" * 60)

image_results = []
for img_name in sorted(os.listdir(IMG_DIR)):
    img_path = os.path.join(IMG_DIR, img_name)
    if not img_name.lower().endswith((".jpg", ".jpeg", ".png", ".bmp")):
        continue

    t0 = time.perf_counter()
    results = model(img_path, verbose=False, conf=0.25)
    inference_ms = (time.perf_counter() - t0) * 1000

    detections = []
    for r in results:
        for box in r.boxes:
            cls_id = int(box.cls[0])
            conf = float(box.conf[0])
            detections.append({
                "class": model.names[cls_id],
                "confidence": round(conf, 4),
            })

    accident_dets = [d for d in detections if d["class"].lower() == "accident"]
    non_acc_dets = [d for d in detections if d["class"].lower() != "accident"]

    image_results.append({
        "file": img_name,
        "inference_ms": round(inference_ms, 1),
        "total_detections": len(detections),
        "accident_detections": len(accident_dets),
        "non_accident_detections": len(non_acc_dets),
        "max_accident_conf": round(max((d["confidence"] for d in accident_dets), default=0), 4),
        "detections": detections,
    })

    status = "🔴 ACCIDENT" if accident_dets else "🟢 Clear"
    max_conf = max((d["confidence"] for d in accident_dets), default=0)
    print(f"  {img_name:20s}  {status:16s}  conf={max_conf:.2f}  dets={len(detections):2d}  time={inference_ms:.0f}ms")


# ──────────────────────────────────────────────────────────
# 3. EVALUATE ON TEST VIDEOS (frame-level)
# ──────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("🎬  VIDEO INFERENCE RESULTS")
print("=" * 60)

# Also evaluate top-level test videos
all_videos = []
for vname in sorted(os.listdir(VID_DIR)):
    if vname.lower().endswith((".mp4", ".avi", ".mkv", ".mov")):
        all_videos.append(os.path.join(VID_DIR, vname))
# Add root-level test videos
for vname in ["test_crash.mp4", "testing1.mp4"]:
    vpath = os.path.join(os.path.dirname(__file__), vname)
    if os.path.exists(vpath):
        all_videos.append(vpath)

video_results = []
for vid_path in all_videos:
    vid_name = os.path.basename(vid_path)
    cap = cv2.VideoCapture(vid_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)

    frames_processed = 0
    frames_with_accident = 0
    all_confs = []
    total_inference_ms = 0
    sample_interval = max(1, int(fps // 5))  # sample ~5 frames per second

    frame_idx = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % sample_interval == 0:
            t0 = time.perf_counter()
            results = model(frame, verbose=False, conf=0.50)
            inf_ms = (time.perf_counter() - t0) * 1000
            total_inference_ms += inf_ms
            frames_processed += 1

            for r in results:
                for box in r.boxes:
                    cls_id = int(box.cls[0])
                    conf = float(box.conf[0])
                    if model.names[cls_id].lower() == "accident":
                        frames_with_accident += 1
                        all_confs.append(conf)
                        break  # count once per frame

        frame_idx += 1

    cap.release()

    detection_rate = (frames_with_accident / frames_processed * 100) if frames_processed else 0
    avg_inf = total_inference_ms / frames_processed if frames_processed else 0
    avg_conf = float(np.mean(all_confs)) if all_confs else 0

    video_results.append({
        "file": vid_name,
        "total_frames": total_frames,
        "sampled_frames": frames_processed,
        "accident_frames": frames_with_accident,
        "detection_rate_pct": round(detection_rate, 1),
        "avg_confidence": round(avg_conf, 4),
        "avg_inference_ms": round(avg_inf, 1),
    })

    print(f"  {vid_name:20s}  frames={frames_processed:4d}  accident_frames={frames_with_accident:4d}  "
          f"det_rate={detection_rate:.1f}%  avg_conf={avg_conf:.2f}  avg_time={avg_inf:.0f}ms")


# ──────────────────────────────────────────────────────────
# 4. AGGREGATE SUMMARY
# ──────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("📊  AGGREGATE PERFORMANCE SUMMARY")
print("=" * 60)

# Image stats
img_inf_times = [r["inference_ms"] for r in image_results]
print(f"\n  Images evaluated:       {len(image_results)}")
print(f"  Avg inference time:     {np.mean(img_inf_times):.1f} ms")
print(f"  Max inference time:     {np.max(img_inf_times):.1f} ms")
print(f"  Min inference time:     {np.min(img_inf_times):.1f} ms")

# Video stats
if video_results:
    total_sampled = sum(v["sampled_frames"] for v in video_results)
    total_accident = sum(v["accident_frames"] for v in video_results)
    vid_inf_times = [v["avg_inference_ms"] for v in video_results]
    print(f"\n  Videos evaluated:       {len(video_results)}")
    print(f"  Total sampled frames:   {total_sampled}")
    print(f"  Total accident frames:  {total_accident}")
    print(f"  Overall detection rate: {total_accident/total_sampled*100:.1f}%")
    print(f"  Avg inference time:     {np.mean(vid_inf_times):.1f} ms/frame")

# Model info
print(f"\n  Model:                  YOLOv8s (best.pt)")
print(f"  Model size:             {os.path.getsize(MODEL_PATH)/1024/1024:.1f} MB")
print(f"  Classes:                {list(model.names.values())}")
print(f"  Confidence threshold:   0.85 (production) / 0.50 (video eval) / 0.25 (image eval)")

# ──────────────────────────────────────────────────────────
# 5. EXPORT JSON
# ──────────────────────────────────────────────────────────
report = {
    "model": {
        "architecture": "YOLOv8s",
        "weights": "best.pt",
        "size_mb": round(os.path.getsize(MODEL_PATH) / 1024 / 1024, 1),
        "classes": list(model.names.values()),
        "input_size": 640,
        "training_epochs": 100,
        "optimizer": "AdamW",
        "augmentation": True,
    },
    "image_results": image_results,
    "video_results": video_results,
    "summary": {
        "images_evaluated": len(image_results),
        "avg_image_inference_ms": round(float(np.mean(img_inf_times)), 1),
        "videos_evaluated": len(video_results),
        "total_sampled_frames": total_sampled if video_results else 0,
        "total_accident_frames": total_accident if video_results else 0,
    }
}

report_path = os.path.join(os.path.dirname(__file__), "performance_report.json")
with open(report_path, "w") as f:
    json.dump(report, f, indent=2)
print(f"\n💾 Full report saved to: {report_path}")
