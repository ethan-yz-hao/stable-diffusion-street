import React, { useState, useRef } from "react";
import { GoogleMap, LoadScript, Marker } from "@react-google-maps/api";
import axios from "axios";
import "./App.css";

// API endpoint
const API_URL = "http://localhost:5000";

// Map container style
const mapContainerStyle = {
    width: "100%",
    height: "400px",
};

// Default center position (West Village, NYC)
const center = {
    lat: 40.7336,
    lng: -74.0028,
};

// Get Google Maps API key from environment variables
const googleMapsApiKey = "AIzaSyDvMT2K3oZ8QpoDvPbxCCDu3dAKyioAbIA";

function App() {
    const [selectedLocation, setSelectedLocation] =
        useState<google.maps.LatLngLiteral | null>(null);
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [segmentedImage, setSegmentedImage] = useState<string | null>(null);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [prompt, setPrompt] = useState<string>("a street in Brooklyn, NY");
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Handle image upload
    const handleImageUpload = async (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        if (!e.target.files || e.target.files.length === 0) return;

        const file = e.target.files[0];
        const reader = new FileReader();

        reader.onload = (event) => {
            if (event.target && event.target.result) {
                setUploadedImage(event.target.result as string);
            }
        };

        reader.readAsDataURL(file);
    };

    // Segment the uploaded image
    const segmentImage = async () => {
        if (!uploadedImage) {
            setError("Please upload an image first");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // Convert base64 to file
            const base64Response = await fetch(uploadedImage);
            const blob = await base64Response.blob();
            const file = new File([blob], "image.jpg", { type: "image/jpeg" });

            // Create form data
            const formData = new FormData();
            formData.append("file", file);

            // Send to backend
            const response = await axios.post(`${API_URL}/segment`, formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                },
            });

            setSegmentedImage(response.data.segmented_image);
        } catch (err) {
            console.error("Error segmenting image:", err);
            setError("Failed to segment image. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    // Generate image from segmentation
    const generateImage = async () => {
        if (!segmentedImage) {
            setError("Please segment an image first");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await axios.post(`${API_URL}/generate`, {
                prompt: prompt,
                segmentation_image: segmentedImage,
            });

            setGeneratedImage(response.data.generated_image);
        } catch (err) {
            console.error("Error generating image:", err);
            setError("Failed to generate image. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    // Handle map click
    const handleMapClick = (e: google.maps.MapMouseEvent) => {
        if (e.latLng) {
            setSelectedLocation({
                lat: e.latLng.lat(),
                lng: e.latLng.lng(),
            });

            // Update prompt with location
            setPrompt(
                `a street view of ${e.latLng.lat().toFixed(4)}, ${e.latLng
                    .lng()
                    .toFixed(4)}`
            );
        }
    };

    return (
        <div className="App">
            <header className="App-header">
                <h1>Street View Generation</h1>
            </header>

            <main>
                <section className="map-section">
                    <h2>Select Location</h2>
                    <LoadScript googleMapsApiKey={googleMapsApiKey}>
                        <GoogleMap
                            mapContainerStyle={mapContainerStyle}
                            center={center}
                            zoom={16}
                            onClick={handleMapClick}
                        >
                            {selectedLocation && (
                                <Marker position={selectedLocation} />
                            )}
                        </GoogleMap>
                    </LoadScript>

                    {selectedLocation && (
                        <div className="location-info">
                            <p>
                                Selected: {selectedLocation.lat.toFixed(4)},{" "}
                                {selectedLocation.lng.toFixed(4)}
                            </p>
                        </div>
                    )}
                </section>

                <section className="image-processing">
                    <div className="upload-section">
                        <h2>Upload Image</h2>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            ref={fileInputRef}
                            style={{ display: "none" }}
                        />
                        <button onClick={() => fileInputRef.current?.click()}>
                            Select Image
                        </button>

                        {uploadedImage && (
                            <div className="image-preview">
                                <h3>Uploaded Image</h3>
                                <img src={uploadedImage} alt="Uploaded" />
                                <button
                                    onClick={segmentImage}
                                    disabled={isLoading}
                                >
                                    {isLoading
                                        ? "Processing..."
                                        : "Segment Image"}
                                </button>
                            </div>
                        )}
                    </div>

                    {segmentedImage && (
                        <div className="segmented-preview">
                            <h3>Segmented Image</h3>
                            <img src={segmentedImage} alt="Segmented" />

                            <div className="prompt-section">
                                <h3>Prompt</h3>
                                <textarea
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    rows={3}
                                    placeholder="Enter a description for the generated image"
                                />
                                <button
                                    onClick={generateImage}
                                    disabled={isLoading}
                                >
                                    {isLoading
                                        ? "Generating..."
                                        : "Generate Image"}
                                </button>
                            </div>
                        </div>
                    )}

                    {generatedImage && (
                        <div className="generated-preview">
                            <h3>Generated Image</h3>
                            <img src={generatedImage} alt="Generated" />
                        </div>
                    )}

                    {error && <div className="error-message">{error}</div>}
                </section>
            </main>
        </div>
    );
}

export default App;
