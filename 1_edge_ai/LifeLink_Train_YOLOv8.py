# -*- coding: utf-8 -*-
"""
# 🚀 LifeLink - YOLOv8 Accident Detection Training
### Train on Google Colab with Free GPU

**Instructions:**
1. Open Google Colab: https://colab.research.google.com
2. Go to File → Upload Notebook → Upload this file
3. Set Runtime → Change runtime type → GPU (T4)
4. Run each cell from top to bottom
5. Download `best.pt` at the end
"""

# %% [markdown]
# ## 📦 Step 1: Install Dependencies

# %%
!pip install ultralytics roboflow -q
import torch
print(f"✅ PyTorch: {torch.__version__}")
print(f"🖥️ GPU Available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"🎮 GPU Name: {torch.cuda.get_device_name(0)}")

# %% [markdown]
# ## 📥 Step 2: Download the Accident Detection Dataset
#
# **Option A (Recommended):** Download from Roboflow (no account needed for public datasets)
#
# **Option B:** Upload your own dataset zip to Colab

# %%
# ============================================================
# OPTION A: Download from Roboflow (RECOMMENDED — large dataset)
# ============================================================
# This dataset has 3200+ images of accident/non-accident from
# CCTV footage, YouTube, and traffic cameras.
#
# 👉 Get a FREE API key: https://app.roboflow.com → Settings → API Key
# ============================================================

from roboflow import Roboflow

# 🔑 PASTE YOUR FREE ROBOFLOW API KEY BELOW
API_KEY = "YOUR_API_KEY"  # <-- Replace this!

rf = Roboflow(api_key=API_KEY)
project = rf.workspace("accident-detection-model").project("accident-detection-model-lkhwi")
version = project.version(1)
dataset = version.download("yolov8")

print(f"\n✅ Dataset downloaded to: {dataset.location}")

# %%
# ============================================================
# OPTION B: Upload your own dataset from Kaggle
# ============================================================
# 1. Download from Kaggle: search "Accident Detection from CCTV Footage"
# 2. Upload the zip to Colab (use the file browser on the left)
# 3. Uncomment and run the lines below:
# ============================================================

# import zipfile
# zip_path = "/content/your_dataset.zip"  # <-- Change to your zip filename
# with zipfile.ZipFile(zip_path, 'r') as z:
#     z.extractall("/content/dataset")
# print("✅ Dataset extracted to /content/dataset")

# %% [markdown]
# ## 🔍 Step 3: Verify Dataset Structure

# %%
import os

# Auto-detect dataset path
possible_paths = [
    "/content/Accident-detection-model-1",  # Roboflow default
    "/content/dataset",                      # Manual upload
]

DATASET_PATH = None
for p in possible_paths:
    if os.path.exists(p):
        DATASET_PATH = p
        break

if DATASET_PATH is None:
    print("❌ Dataset not found! Check the download step above.")
else:
    print(f"📂 Dataset found at: {DATASET_PATH}")
    for split in ["train", "valid", "test"]:
        img_dir = os.path.join(DATASET_PATH, split, "images")
        lbl_dir = os.path.join(DATASET_PATH, split, "labels")
        if os.path.exists(img_dir):
            n_imgs = len(os.listdir(img_dir))
            n_lbls = len(os.listdir(lbl_dir)) if os.path.exists(lbl_dir) else 0
            print(f"  ✅ {split:6s} → {n_imgs} images, {n_lbls} labels")
        else:
            print(f"  ⚠️ {split:6s} → Not found")

# %% [markdown]
# ## ✏️ Step 4: Create / Fix data.yaml

# %%
import yaml

data_yaml_path = os.path.join(DATASET_PATH, "data.yaml")

# Read existing data.yaml if it exists
if os.path.exists(data_yaml_path):
    with open(data_yaml_path, 'r') as f:
        data_config = yaml.safe_load(f)
    print(f"📋 Existing data.yaml found:")
    print(f"   Classes: {data_config.get('names', 'N/A')}")
    print(f"   NC: {data_config.get('nc', 'N/A')}")
else:
    print("⚠️ No data.yaml found. Creating one...")

# Create/overwrite with correct paths for Colab
data_config = {
    'path': DATASET_PATH,
    'train': 'train/images',
    'val': 'valid/images',
    'test': 'test/images',
    'nc': 2,
    'names': ['accident', 'non accident']
}

with open(data_yaml_path, 'w') as f:
    yaml.dump(data_config, f, default_flow_style=False)

print(f"\n✅ data.yaml saved at: {data_yaml_path}")
print(f"📋 Config: {data_config}")

# %% [markdown]
# ## 🧠 Step 5: Train the YOLOv8 Model
#
# This is the main training cell. It will take **30-90 minutes** on Colab GPU.
#
# **Tuning tips:**
# - More epochs (150-200) = better accuracy but longer training
# - Reduce batch to 8 if you get OOM errors
# - `yolov8s.pt` is a good balance of speed vs accuracy
# - Try `yolov8m.pt` for higher accuracy (slower)

# %%
from ultralytics import YOLO

# Load pre-trained YOLOv8 small model (downloads automatically)
model = YOLO("yolov8s.pt")

# 🚀 START TRAINING
results = model.train(
    data=data_yaml_path,
    epochs=100,             # Increase to 150-200 for better results
    imgsz=640,              # Image size
    batch=16,               # Reduce to 8 if GPU runs out of memory
    device=0,               # GPU
    name="lifelink_accident",
    patience=20,            # Stop early if no improvement for 20 epochs

    # --- Augmentation (improves generalization) ---
    augment=True,
    hsv_h=0.015,
    hsv_s=0.7,
    hsv_v=0.4,
    degrees=10.0,
    translate=0.1,
    scale=0.5,
    fliplr=0.5,
    mosaic=1.0,
    mixup=0.1,

    # --- Optimizer ---
    optimizer="AdamW",
    lr0=0.001,
    lrf=0.01,
    weight_decay=0.0005,
    warmup_epochs=3.0,

    # --- Saving ---
    save=True,
    save_period=10,
    plots=True,
    exist_ok=True,
)

print("\n🎉 Training Complete!")

# %% [markdown]
# ## 📊 Step 6: View Training Results

# %%
from IPython.display import Image, display

# Show training curves
results_img = "/content/runs/detect/lifelink_accident/results.png"
if os.path.exists(results_img):
    display(Image(filename=results_img, width=900))
else:
    print("⚠️ Results image not found")

# Show confusion matrix
conf_img = "/content/runs/detect/lifelink_accident/confusion_matrix.png"
if os.path.exists(conf_img):
    display(Image(filename=conf_img, width=600))

# %% [markdown]
# ## 🔍 Step 7: Validate the Model

# %%
# Load the best model
best_model = YOLO("/content/runs/detect/lifelink_accident/weights/best.pt")

# Run validation
metrics = best_model.val(data=data_yaml_path, imgsz=640, device=0)

print(f"\n📊 Validation Results:")
print(f"   • mAP50:      {metrics.box.map50:.4f}")
print(f"   • mAP50-95:   {metrics.box.map:.4f}")
print(f"   • Precision:  {metrics.box.mp:.4f}")
print(f"   • Recall:     {metrics.box.mr:.4f}")

# %% [markdown]
# ## 🧪 Step 8: Test on Sample Images (Optional)

# %%
import glob

# Find test images
test_images = glob.glob(os.path.join(DATASET_PATH, "test/images/*"))[:5]

if test_images:
    results = best_model.predict(
        source=test_images,
        conf=0.5,
        save=True,
        project="/content",
        name="test_predictions"
    )

    # Display predictions
    pred_dir = "/content/test_predictions"
    if os.path.exists(pred_dir):
        for img_file in sorted(os.listdir(pred_dir))[:5]:
            if img_file.endswith(('.jpg', '.png', '.jpeg')):
                print(f"\n📸 {img_file}")
                display(Image(filename=os.path.join(pred_dir, img_file), width=600))
else:
    print("⚠️ No test images found")

# %% [markdown]
# ## 💾 Step 9: Download best.pt
#
# **This is the final trained model!**
# Download it and place it in your `1_edge_ai/` folder.

# %%
import shutil
from google.colab import files

# Copy best.pt to a convenient location
src = "/content/runs/detect/lifelink_accident/weights/best.pt"
dst = "/content/best.pt"
shutil.copy2(src, dst)

print("📦 Model size:", round(os.path.getsize(dst) / 1024 / 1024, 1), "MB")
print("⬇️ Downloading best.pt to your computer...")

# This will trigger a browser download
files.download(dst)

print("\n✅ Done! Place best.pt in your 1_edge_ai/ folder and run edge_camera.py")

# %% [markdown]
# ## 🎯 Summary
#
# After downloading `best.pt`:
# 1. Copy it to `d:\Hackathons\LifeLink\1_edge_ai\best.pt`
# 2. Run: `python edge_camera.py`
# 3. Your LifeLink CCTV system will now use the new model!
