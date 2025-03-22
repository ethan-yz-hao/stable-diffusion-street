import React, { useState, useRef } from "react";
import {
    GoogleMap,
    LoadScript,
    Marker,
    StreetViewPanorama,
} from "@react-google-maps/api";
import axios from "axios";
import "./App.css";
import { Stage, Layer, Image as KonvaImage, Line } from "react-konva";
import useImage from "use-image";
import Konva from "konva";
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

// Placeholder image for empty states
const placeholderImage =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Crect width='100%25' height='100%25' fill='%23cccccc'/%3E%3C/svg%3E";

// Get Google Maps API key from environment variables
const googleMapsApiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "";

// Colors for segmentation editing with their meanings from ADE20K dataset
const segmentationClasses = [
    { color: "#787878", name: "wall" },
    { color: "#B47878", name: "building" },
    { color: "#06E6E6", name: "sky" },
    { color: "#503232", name: "floor" },
    { color: "#04C803", name: "tree" },
    { color: "#787850", name: "ceiling" },
    { color: "#8C8C8C", name: "road" },
    { color: "#CC05FF", name: "bed" },
    { color: "#E6E6E6", name: "window" },
    { color: "#04FA07", name: "grass" },
    { color: "#FF0000", name: "custom" }, // Custom color option
];

// Image Editor Component
const ImageEditor = ({
    image,
    onSave,
}: {
    image: string;
    onSave: (uri: string) => void;
}) => {
    const [selectedClass, setSelectedClass] = useState(segmentationClasses[0]);
    const [customColor, setCustomColor] = useState("#FF0000");
    const [lines, setLines] = useState<
        {
            color: string;
            points: number[];
            size: number;
        }[]
    >([]);
    const [isDrawing, setIsDrawing] = useState(false);
    const [brushSize, setBrushSize] = useState(5);
    const [imageObj] = useImage(image || placeholderImage);
    const stageRef = useRef<Konva.Stage>(null);

    // Get the active color (either selected class color or custom color)
    const getActiveColor = () => {
        return selectedClass.name === "custom"
            ? customColor
            : selectedClass.color;
    };

    const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
        if (!imageObj) return;

        setIsDrawing(true);
        const pos = e.target.getStage()?.getPointerPosition();
        if (!pos) return;
        setLines([
            ...lines,
            {
                color: getActiveColor(),
                points: [pos.x, pos.y],
                size: brushSize,
            },
        ]);
    };

    const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
        if (!isDrawing || !imageObj) return;

        const stage = e.target.getStage();
        const point = stage?.getPointerPosition();
        if (!point) return;
        const lastLine = lines[lines.length - 1];

        // Add point to the last line
        lastLine.points = lastLine.points.concat([point.x, point.y]);

        // Replace the last line with the updated one
        lines.splice(lines.length - 1, 1, lastLine);
        setLines([...lines]);
    };

    const handleMouseUp = () => {
        setIsDrawing(false);
    };

    const handleSave = () => {
        if (!stageRef.current || !imageObj) return;

        const uri = stageRef.current.toDataURL();
        onSave(uri);
    };

    const handleClear = () => {
        setLines([]);
    };

    const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedValue = e.target.value;
        const selectedClassObj = segmentationClasses.find(
            (c) => c.color === selectedValue
        );
        if (selectedClassObj) {
            setSelectedClass(selectedClassObj);
        }
    };

    return (
        <div className="image-editor">
            <div className="editor-controls">
                <div className="brush-controls">
                    <label>Brush Size:</label>
                    <input
                        type="range"
                        min="1"
                        max="20"
                        value={brushSize}
                        onChange={(e) => setBrushSize(parseInt(e.target.value))}
                    />
                    <span>{brushSize}px</span>
                </div>
                <div className="segment-class-selector">
                    <label>Segment Class:</label>
                    <select
                        value={selectedClass.color}
                        onChange={handleClassChange}
                        className="segment-dropdown"
                    >
                        {segmentationClasses.map((cls, i) => (
                            <option key={i} value={cls.color}>
                                {cls.name}
                            </option>
                        ))}
                    </select>
                    <div
                        className="color-preview"
                        style={{ backgroundColor: getActiveColor() }}
                    ></div>
                </div>
                {selectedClass.name === "custom" && (
                    <div className="custom-color-picker">
                        <label>Custom Color:</label>
                        <input
                            type="color"
                            value={customColor}
                            onChange={(e) => setCustomColor(e.target.value)}
                        />
                    </div>
                )}
                <div className="editor-buttons">
                    <button onClick={handleClear}>Clear</button>
                    <button onClick={handleSave}>Save Edits</button>
                </div>
            </div>
            <div className="canvas-container">
                <Stage
                    width={imageObj ? imageObj.width : 500}
                    height={imageObj ? imageObj.height : 300}
                    onMouseDown={handleMouseDown}
                    onMousemove={handleMouseMove}
                    onMouseup={handleMouseUp}
                    ref={stageRef}
                >
                    <Layer>
                        <KonvaImage image={imageObj} />
                        {lines.map((line, i) => (
                            <Line
                                key={i}
                                points={line.points}
                                stroke={line.color}
                                strokeWidth={line.size}
                                tension={0.5}
                                lineCap="round"
                                lineJoin="round"
                                globalCompositeOperation="source-over"
                            />
                        ))}
                    </Layer>
                </Stage>
            </div>
        </div>
    );
};

function App() {
    const [selectedLocation, setSelectedLocation] =
        useState<google.maps.LatLngLiteral | null>(null);
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [segmentedImage, setSegmentedImage] = useState<string | null>(null);
    const [editedSegmentedImage, setEditedSegmentedImage] = useState<
        string | null
    >(null);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [prompt, setPrompt] = useState<string>(
        "a street in West Village, NY"
    );
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<"map" | "streetview">("map");

    const fileInputRef = useRef<HTMLInputElement>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const streetViewPanoramaRef = useRef<google.maps.StreetViewPanorama | null>(
        null
    );

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

    // Capture the current view as an image (only street view)
    const captureImage = () => {
        if (!selectedLocation) {
            setError("Please select a location first");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            captureStreetViewImage();
        } catch (err) {
            console.error("Error capturing image:", err);
            setError("Failed to capture image");
            setIsLoading(false);
        }
    };

    // Capture street view
    const captureStreetViewImage = () => {
        if (!selectedLocation) {
            setError("Please select a location first");
            setIsLoading(false);
            return;
        }

        // Get heading from street view if available
        let heading = 0;
        if (streetViewPanoramaRef.current) {
            heading = streetViewPanoramaRef.current.getPov().heading || 0;
        }

        // Construct a Google Street View Static API URL
        const width = 640; // Max for free tier
        const height = 400;
        const fov = 90; // Field of view

        let streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?`;
        streetViewUrl += `size=${width}x${height}`;
        streetViewUrl += `&location=${selectedLocation.lat},${selectedLocation.lng}`;
        streetViewUrl += `&heading=${heading}`;
        streetViewUrl += `&pitch=0`;
        streetViewUrl += `&fov=${fov}`;

        // Add API key
        streetViewUrl += `&key=${googleMapsApiKey}`;

        // Load the image
        loadImageFromUrl(streetViewUrl);
    };

    // Helper function to load image from URL
    const loadImageFromUrl = (url: string) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";

        img.onload = () => {
            // Create canvas to draw the image
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;

            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.drawImage(img, 0, 0);
                const imageDataUrl = canvas.toDataURL("image/png");
                setUploadedImage(imageDataUrl);
                setIsLoading(false);
            } else {
                setError("Could not create canvas context");
                setIsLoading(false);
            }
        };

        img.onerror = () => {
            setError(
                "Failed to load image. Street View may not be available at this location."
            );
            setIsLoading(false);
        };

        img.src = url;
    };

    // Handle street view load
    const onStreetViewLoad = (panorama: google.maps.StreetViewPanorama) => {
        streetViewPanoramaRef.current = panorama;
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

    // Handle edited segmentation image
    const handleSegmentationEdit = (editedImage: string) => {
        setEditedSegmentedImage(editedImage);
    };

    // Generate image from segmentation (updated to use edited image if available)
    const generateImage = async () => {
        const imageToUse = editedSegmentedImage || segmentedImage;

        if (!imageToUse) {
            setError("Please segment an image first");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await axios.post(`${API_URL}/generate`, {
                prompt: prompt,
                segmentation_image: imageToUse,
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
        }
    };

    // Store map reference when the map loads
    const onMapLoad = (map: google.maps.Map) => {
        mapRef.current = map;
    };

    return (
        <div className="App">
            <header className="App-header">
                <h1>Street View Generation</h1>
            </header>

            <main className="layout-container">
                <div className="left-column">
                    <section className="map-section">
                        <h2>Map</h2>
                        <LoadScript googleMapsApiKey={googleMapsApiKey}>
                            <GoogleMap
                                mapContainerStyle={mapContainerStyle}
                                center={selectedLocation || center}
                                zoom={16}
                                onClick={handleMapClick}
                                onLoad={onMapLoad}
                                options={{
                                    streetViewControl: false,
                                }}
                            >
                                {selectedLocation && (
                                    <Marker position={selectedLocation} />
                                )}
                                {viewMode === "streetview" &&
                                    selectedLocation && (
                                        <StreetViewPanorama
                                            options={{
                                                position: selectedLocation,
                                                visible: true,
                                            }}
                                            onLoad={onStreetViewLoad}
                                        />
                                    )}
                            </GoogleMap>
                        </LoadScript>

                        <div className="view-toggle">
                            <button
                                className={viewMode === "map" ? "active" : ""}
                                onClick={() => setViewMode("map")}
                            >
                                Map View
                            </button>
                            <button
                                className={
                                    viewMode === "streetview" ? "active" : ""
                                }
                                onClick={() => setViewMode("streetview")}
                            >
                                Street View
                            </button>
                        </div>
                    </section>

                    <section className="capture-section">
                        <h2>Capture Image/Upload</h2>
                        <div className="capture-controls">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                ref={fileInputRef}
                                style={{ display: "none" }}
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                            >
                                Upload Image
                            </button>
                            {viewMode === "streetview" && (
                                <button
                                    onClick={captureImage}
                                    className="capture-btn"
                                    disabled={isLoading || !selectedLocation}
                                >
                                    {isLoading
                                        ? "Capturing..."
                                        : "Capture Street View"}
                                </button>
                            )}
                        </div>
                        <div className="image-preview">
                            <img
                                src={uploadedImage || placeholderImage}
                                alt="Captured or uploaded"
                                className="preview-image"
                            />
                        </div>
                        {uploadedImage && (
                            <button
                                onClick={segmentImage}
                                disabled={isLoading}
                                className="action-button"
                            >
                                {isLoading ? "Processing..." : "Segment Image"}
                            </button>
                        )}
                    </section>
                </div>

                <div className="right-column">
                    <section className="segmented-section">
                        <h2>Segment Image</h2>
                        {segmentedImage ? (
                            <ImageEditor
                                image={segmentedImage}
                                onSave={handleSegmentationEdit}
                            />
                        ) : (
                            <div className="segmented-preview">
                                <img
                                    src={placeholderImage}
                                    alt="Segmented"
                                    className="preview-image"
                                />
                            </div>
                        )}

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
                                disabled={isLoading || !segmentedImage}
                                className="action-button"
                            >
                                {isLoading ? "Generating..." : "Generate Image"}
                            </button>
                        </div>
                    </section>
                </div>

                <section className="generated-section">
                    <h2>Generated Image</h2>
                    <div className="generated-preview">
                        <img
                            src={generatedImage || placeholderImage}
                            alt="Generated"
                            className="preview-image large"
                        />
                    </div>
                </section>

                {error && <div className="error-message">{error}</div>}
            </main>
        </div>
    );
}

export default App;
