# Gen-Street: Generative Street View Image Creator

## Overview

Gen-Street generates street view images using text prompts and a pre-trained text-to-image diffusion model. The SDXL Turbo model is used to generate high-quality images from text prompts. The notebook provides a step-by-step guide to generate street view images using the pre-trained model.

## Usage Requirements

-   Python 3.8+
-   PyTorch 1.9+
-   CUDA-enabled GPU (recommended for faster generation)
-   12GB+ GPU memory for high-resolution outputs
    Note: this notebook _might_ work with Google Colab free tier, but it is recommended to use a local machine with a CUDA-enabled GPU for faster generation.

## Getting Started

1. Clone this repository
2. Install dependencies: `pip install -r requirements.txt`
3. Open the notebook and follow the step-by-step instructions
4. Customize the prompts to generate your desired street views

## Setting Up Jupyter Environment

```bash
# Create a virtual environment
python -m venv .venv
# Activate the environment
# On Windows:
.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate
# Install dependencies
pip install -r requirements.txt
# Install and register the Jupyter kernel
pip install ipykernel
```
