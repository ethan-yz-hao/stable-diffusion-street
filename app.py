from flask import Flask, request, jsonify
import torch
from diffusers import ControlNetModel, AutoencoderKL, StableDiffusionXLControlNetPipeline, StableDiffusionXLControlNetInpaintPipeline
from transformers import AutoImageProcessor, UperNetForSemanticSegmentation
from PIL import Image
import numpy as np
import io
import base64
import traceback  # For detailed error tracing
from flask_cors import CORS  # Import CORS
import os
import shutil
from huggingface_hub import snapshot_download  # Add this import

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Global variables to store models
controlnet = None
vae = None
inpaint_pipe = None  # Add this for the inpainting pipeline
image_processor = None
image_segmentor = None
device = 'cuda' if torch.cuda.is_available() else 'cpu'

# ADE20K palette for segmentation
ade_palette = np.asarray([
    [120, 120, 120], [180, 120, 120], [6, 230, 230], [80, 50, 50], [4, 200, 3],
    [120, 120, 80], [140, 140, 140], [204, 5, 255], [230, 230, 230], [4, 250, 7],
    [224, 5, 255], [235, 255, 7], [150, 5, 61], [120, 120, 70], [8, 255, 51],
    [255, 6, 82], [143, 255, 140], [204, 255, 4], [255, 51, 7], [204, 70, 3],
    [0, 102, 200], [61, 230, 250], [255, 6, 51], [11, 102, 255], [255, 7, 71],
    [255, 9, 224], [9, 7, 230], [220, 220, 220], [255, 9, 92], [112, 9, 255],
    [8, 255, 214], [7, 255, 224], [255, 184, 6], [10, 255, 71], [255, 41, 10],
    [7, 255, 255], [224, 255, 8], [102, 8, 255], [255, 61, 6], [255, 194, 7],
    [255, 122, 8], [0, 255, 20], [255, 8, 41], [255, 5, 153], [6, 51, 255],
    [235, 12, 255], [160, 150, 20], [0, 163, 255], [
        140, 140, 140], [250, 10, 15],
    [20, 255, 0], [31, 255, 0], [255, 31, 0], [255, 224, 0], [153, 255, 0],
    [0, 0, 255], [255, 71, 0], [0, 235, 255], [0, 173, 255], [31, 0, 255],
    [11, 200, 200], [255, 82, 0], [0, 255, 245], [0, 61, 255], [0, 255, 112],
    [0, 255, 133], [255, 0, 0], [255, 163, 0], [255, 102, 0], [194, 255, 0],
    [0, 143, 255], [51, 255, 0], [0, 82, 255], [0, 255, 41], [0, 255, 173],
    [10, 0, 255], [173, 255, 0], [0, 255, 153], [255, 92, 0], [255, 0, 255],
    [255, 0, 245], [255, 0, 102], [255, 173, 0], [255, 0, 20], [255, 184, 184],
    [0, 31, 255], [0, 255, 61], [0, 71, 255], [255, 0, 204], [0, 255, 194],
    [0, 255, 82], [0, 10, 255], [0, 112, 255], [51, 0, 255], [0, 194, 255],
    [0, 122, 255], [0, 255, 163], [255, 153, 0], [0, 255, 10], [255, 112, 0],
    [143, 255, 0], [82, 0, 255], [163, 255, 0], [255, 235, 0], [8, 184, 170],
    [133, 0, 255], [0, 255, 92], [184, 0, 255], [255, 0, 31], [0, 184, 255],
    [0, 214, 255], [255, 0, 112], [92, 255, 0], [0, 224, 255], [112, 224, 255],
    [70, 184, 160], [163, 0, 255], [153, 0, 255], [71, 255, 0], [255, 0, 163],
    [255, 204, 0], [255, 0, 143], [0, 255, 235], [133, 255, 0], [255, 0, 235],
    [245, 0, 255], [255, 0, 122], [255, 245, 0], [10, 190, 212], [214, 255, 0],
    [0, 204, 255], [20, 0, 255], [255, 255, 0], [0, 153, 255], [0, 41, 255],
    [0, 255, 204], [41, 0, 255], [41, 255, 0], [173, 0, 255], [0, 245, 255],
    [71, 0, 255], [122, 0, 255], [0, 255, 184], [0, 92, 255], [184, 255, 0],
    [0, 133, 255], [255, 214, 0], [25, 194, 194], [102, 255, 0], [92, 0, 255]
])


def download_model():
    model_path = "model/diffusion_pytorch_model.safetensors"
    if not os.path.exists("model") or not os.path.exists(model_path):
        print("Downloading model files...")
        snapshot_download_path = snapshot_download(
            repo_id="abovzv/sdxl_segmentation_controlnet_ade20k")
        # create a full copy of the snapshot_download_path to the current directory under the name "model"
        shutil.copytree(snapshot_download_path, "model")
        # use shutil and rename the file  "sdxl_segmentation_ade20k_controlnet.safetensors" to "diffusion_pytorch_model.safetensors"
        # so to meet the requirements of the StableDiffusionXLControlNetPipeline
        shutil.move("model/sdxl_segmentation_ade20k_controlnet.safetensors",
                    model_path)
    print("Model files downloaded.")
    return "model"

def load_models():
    global controlnet, vae, inpaint_pipe, image_processor, image_segmentor
    
    print("Loading models...")
    
    # Download the model first
    model_path = download_model()
    
    # Load ControlNet model from the local path
    controlnet = ControlNetModel.from_pretrained(
        model_path, torch_dtype=torch.float16
    ).to(device)
    
    # Load VAE
    vae = AutoencoderKL.from_pretrained(
        "madebyollin/sdxl-vae-fp16-fix", torch_dtype=torch.float16
    ).to(device)
    
    # Load inpainting pipeline
    inpaint_pipe = StableDiffusionXLControlNetInpaintPipeline.from_pretrained(
        "stabilityai/sdxl-turbo",
        controlnet=controlnet,
        vae=vae,
        torch_dtype=torch.float16
    ).to(device)
    
    # Load segmentation models
    image_processor = AutoImageProcessor.from_pretrained(
        "openmmlab/upernet-convnext-small"
    )
    image_segmentor = UperNetForSemanticSegmentation.from_pretrained(
        "openmmlab/upernet-convnext-small"
    ).to(device)
    
    print("Models loaded successfully")

def resize_img(image, width=1024, height=512):
    return image.resize((width, height))

def segment_input_image(img):
    # Convert to PIL Image if needed
    if isinstance(img, np.ndarray):
        img = Image.fromarray(img)
    if img.mode != "RGB":
        img = img.convert("RGB")

    pixel_values = image_processor(img, return_tensors="pt").pixel_values.to(device)

    with torch.no_grad():
        outputs = image_segmentor(pixel_values)
        seg = image_processor.post_process_semantic_segmentation(
            outputs, target_sizes=[img.size[::-1]])[0]
        
        # Move tensor to CPU before converting to numpy
        seg = seg.cpu()
        
        # Create colored segmentation
        color_seg = np.zeros((seg.shape[0], seg.shape[1], 3), dtype=np.uint8)
        for label, color in enumerate(ade_palette):
            color_seg[seg == label, :] = color
        
        color_seg = color_seg.astype(np.uint8)
        color_segmentation = Image.fromarray(color_seg)
        color_segmentation = color_segmentation.convert("RGB")
    
    return color_segmentation

def generate_image_from_segmentation(prompt, seg_image, original_image):
    # Resize segmentation image
    seg_image = resize_img(seg_image)

    # Convert original image to PIL if it's base64
    if isinstance(original_image, str) and original_image.startswith('data:image'):
        original_image_data = original_image.split(',')[1]
        original_image = Image.open(io.BytesIO(base64.b64decode(original_image_data))).convert('RGB')
        original_image = resize_img(original_image)
    
    # Create a mask from the segmentation image
    # Black pixels (#000000) in the segmentation image indicate areas to preserve
    mask = np.array(seg_image)
    mask_areas = np.all(mask == [0, 0, 0], axis=-1)
    
    # Create a proper mask image for inpainting
    # White (1) for areas to change, Black (0) for areas to preserve
    mask_image = np.zeros_like(mask_areas, dtype=np.uint8)
    mask_image[~mask_areas] = 255  # Areas to generate are white
    mask_image = Image.fromarray(mask_image)
    
    # Use the inpainting pipeline for better blending
    output = inpaint_pipe(
        prompt=prompt,
        image=original_image,  # Original image
        mask_image=mask_image,  # Areas to modify
        control_image=seg_image,  # ControlNet conditioning
        strength=0.9,
        num_inference_steps=2,
        guidance_scale=0.9,
        width=seg_image.width,
        height=seg_image.height,
        controlnet_conditioning_scale=1.0,
    ).images[0]
    
    return output

def pil_to_base64(image):
    buffered = io.BytesIO()
    image.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
    return f"data:image/png;base64,{img_str}"

@app.route('/segment', methods=['POST'])
def segment_image():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    try:
        # Print debugging info
        print(f"Processing file: {file.filename}, size: {file.content_length} bytes")
        
        # Read and process the image
        img = Image.open(file.stream).convert('RGB')
        print(f"Image opened successfully: {img.size}, mode: {img.mode}")
        
        # Check if models are loaded
        if image_processor is None or image_segmentor is None:
            print("Models not loaded! Loading now...")
            load_models()
        
        # Segment the image
        segmented_img = segment_input_image(img)
        print("Segmentation completed successfully")
        
        # Convert to base64 for response
        img_base64 = pil_to_base64(segmented_img)
        
        return jsonify({
            'segmented_image': img_base64
        })
    except Exception as e:
        # Print detailed error information
        error_traceback = traceback.format_exc()
        print(f"Error in segment_image: {str(e)}")
        print(error_traceback)
        return jsonify({'error': str(e), 'traceback': error_traceback}), 500

@app.route('/generate', methods=['POST'])
def generate():
    if not request.json:
        return jsonify({'error': 'Invalid request'}), 400
    
    try:
        # Get prompt and segmentation image from request
        data = request.json
        prompt = data.get('prompt', '')
        seg_image_base64 = data.get('segmentation_image', '')
        original_image = data.get('original_image', None)
        
        if not prompt or not seg_image_base64:
            return jsonify({'error': 'Missing prompt or segmentation image'}), 400
        
        # Decode base64 image
        seg_image_data = seg_image_base64.split(',')[1]
        seg_image = Image.open(io.BytesIO(base64.b64decode(seg_image_data))).convert('RGB')
        
        # Generate image
        generated_img = generate_image_from_segmentation(
            prompt, 
            seg_image, 
            original_image=original_image
        )
        
        # Convert to base64 for response
        img_base64 = pil_to_base64(generated_img)
        
        return jsonify({
            'generated_image': img_base64
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok'})

@app.route('/')
def index():
    return "Street View Generation API is running!"

if __name__ == '__main__':
    try:
        # Load models on startup
        load_models()
    except Exception as e:
        print(f"Error loading models: {str(e)}")
        print(traceback.format_exc())
    
    # Run the Flask app
    app.run(host='0.0.0.0', port=5000, debug=True)  # Enable debug mode for more info