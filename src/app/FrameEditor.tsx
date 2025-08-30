"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as fabric from "fabric";
import type { Canvas, FabricObject } from "fabric";

interface FrameEditorProps {
  initialImage?: string | null;
  onImageImport?: () => void;
}

const ASPECT_RATIOS = [
  { label: "16:9", width: 1280, height: 720 },
  { label: "4:3", width: 960, height: 720 },
  { label: "1:1", width: 720, height: 720 },
  { label: "3:4", width: 720, height: 960 },
  { label: "9:16", width: 720, height: 1280 },
];

type Tool = "draw" | "rectangle" | "circle" | "line" | "text" | "crop";

export default function FrameEditor({ initialImage, onImageImport }: FrameEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const [selectedTool, setSelectedTool] = useState<Tool>("draw");
  const [selectedColor, setSelectedColor] = useState("#ff0000");
  const [, forceUpdate] = useState({});
  const [canvasScale, setCanvasScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const isDrawingRef = useRef(false);
  const isLoadingHistory = useRef(false);
  const loadedImageRef = useRef<string | null>(null);
  const [showNewFrameDialog, setShowNewFrameDialog] = useState(false);
  const [selectedNewFrameAspectRatio, setSelectedNewFrameAspectRatio] = useState(0);
  const [cropAspectRatio, setCropAspectRatio] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [hasCanvas, setHasCanvas] = useState(!!initialImage);

  // Helper to trigger re-render when history changes
  const updateHistory = (newHistory: string[], newIndex: number) => {
    historyRef.current = newHistory;
    historyIndexRef.current = newIndex;
    forceUpdate({});
  };

  // Calculate scale to fit canvas in viewport
  const updateCanvasScale = useCallback(() => {
    if (!containerRef.current || !fabricCanvasRef.current) return;
    
    const container = containerRef.current;
    const canvas = fabricCanvasRef.current;
    
    // Get container dimensions
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    // Get canvas dimensions
    const canvasWidth = canvas.width || 1;
    const canvasHeight = canvas.height || 1;
    
    // Calculate scale to fit
    const scaleX = containerWidth / canvasWidth;
    const scaleY = containerHeight / canvasHeight;
    const scale = Math.min(scaleX, scaleY, 1); // Don't scale up, only down
    
    // Add some padding
    const paddedScale = scale * 0.9;
    
    setCanvasScale(paddedScale);
  }, []);

  // History management functions (defined before effects that use them)
  const saveHistory = useCallback(() => {
    if (!fabricCanvasRef.current || isLoadingHistory.current) return;
    const canvas = fabricCanvasRef.current;
    const json = JSON.stringify(canvas.toJSON());
    
    // Remove any history after current index
    const currentIndex = historyIndexRef.current;
    const newHistory = [...historyRef.current.slice(0, currentIndex + 1), json];
    
    // Keep only last 50 states
    while (newHistory.length > 50) {
      newHistory.shift();
    }
    
    updateHistory(newHistory, newHistory.length - 1);
  }, []);

  const undo = useCallback(() => {
    const currentIndex = historyIndexRef.current;
    const history = historyRef.current;
    
    if (currentIndex > 0 && fabricCanvasRef.current) {
      isLoadingHistory.current = true;
      const newIndex = currentIndex - 1;
      const canvas = fabricCanvasRef.current;
      const state = JSON.parse(history[newIndex]);
      
      canvas.loadFromJSON(state).then(() => {
        canvas.renderAll();
        updateHistory(history, newIndex);
        isLoadingHistory.current = false;
      });
    }
  }, []);

  const redo = useCallback(() => {
    const currentIndex = historyIndexRef.current;
    const history = historyRef.current;
    
    if (currentIndex < history.length - 1 && fabricCanvasRef.current) {
      isLoadingHistory.current = true;
      const newIndex = currentIndex + 1;
      const canvas = fabricCanvasRef.current;
      const state = JSON.parse(history[newIndex]);
      
      canvas.loadFromJSON(state).then(() => {
        canvas.renderAll();
        updateHistory(history, newIndex);
        isLoadingHistory.current = false;
      });
    }
  }, []);

  const clearCanvas = useCallback(() => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;
    
    if (confirm("Are you sure you want to clear the canvas?")) {
      if (initialImage) {
        // If we have an initial image, restore it instead of clearing to white
        canvas.clear();
        
        const imgElement = new Image();
        imgElement.crossOrigin = 'anonymous';
        
        imgElement.onload = () => {
          const fabricImg = new fabric.Image(imgElement, {
            selectable: false,
          });
          
          // For uploaded images, we need to maintain the canvas dimensions that were set
          // The canvas already has the right dimensions from the initial load
          const imageWidth = fabricImg.width!;
          const imageHeight = fabricImg.height!;
          
          // Maintain reasonable size
          let scale = 1;
          const maxHeight = 720;
          if (imageHeight > maxHeight) {
            scale = maxHeight / imageHeight;
          }
          
          const newWidth = Math.ceil(imageWidth * scale) + 1;
          const newHeight = Math.ceil(imageHeight * scale) + 1;
          
          // Only resize canvas if dimensions don't match (for uploaded images)
          if (canvas.width !== newWidth || canvas.height !== newHeight) {
            canvas.setDimensions({
              width: newWidth,
              height: newHeight
            });
          }
          
          const exactScale = newWidth / imageWidth;
          fabricImg.scale(exactScale);
          fabricImg.set({
            left: 0,
            top: 0,
            originX: 'left',
            originY: 'top'
          });
          
          canvas.add(fabricImg);
          canvas.renderAll();
          
          // Reset history to just this state
          historyRef.current = [];
          historyIndexRef.current = -1;
          setTimeout(() => {
            saveHistory();
            updateCanvasScale();
          }, 100);
        };
        
        imgElement.src = initialImage;
      } else {
        // No initial image, clear to white
        canvas.clear();
        canvas.backgroundColor = "white";
        canvas.renderAll();
        setTimeout(() => {
          saveHistory();
        }, 100);
      }
    }
  }, [saveHistory, initialImage, updateCanvasScale]);

  const createNewFrame = () => {
    const aspectRatio = ASPECT_RATIOS[selectedNewFrameAspectRatio];
    if (!fabricCanvasRef.current) return;
    
    const canvas = fabricCanvasRef.current;
    canvas.clear();
    canvas.setDimensions({
      width: aspectRatio.width,
      height: aspectRatio.height,
    });
    
    // Add white background
    const bg = new fabric.Rect({
      left: 0,
      top: 0,
      width: aspectRatio.width,
      height: aspectRatio.height,
      fill: 'white',
      selectable: false,
    });
    canvas.add(bg);
    canvas.renderAll();
    
    // Reset history
    historyRef.current = [];
    historyIndexRef.current = -1;
    saveHistory();
    updateCanvasScale();
    setShowNewFrameDialog(false);
    setHasCanvas(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const imgUrl = event.target?.result as string;
      if (!imgUrl || !fabricCanvasRef.current) return;
      
      const canvas = fabricCanvasRef.current;
      const imgElement = new Image();
      imgElement.crossOrigin = 'anonymous';
      
      imgElement.onload = () => {
        // Clear canvas
        canvas.clear();
        
        // Create fabric image
        const fabricImg = new fabric.Image(imgElement, {
          selectable: false,
        });
        
        // Resize canvas to match image
        const imageWidth = fabricImg.width!;
        const imageHeight = fabricImg.height!;
        
        // Maintain reasonable size
        let scale = 1;
        const maxHeight = 720;
        if (imageHeight > maxHeight) {
          scale = maxHeight / imageHeight;
        }
        
        const newWidth = Math.ceil(imageWidth * scale) + 1;
        const newHeight = Math.ceil(imageHeight * scale) + 1;
        
        canvas.setDimensions({
          width: newWidth,
          height: newHeight
        });
        
        const exactScale = newWidth / imageWidth;
        fabricImg.scale(exactScale);
        fabricImg.set({
          left: 0,
          top: 0,
          originX: 'left',
          originY: 'top'
        });
        
        canvas.add(fabricImg);
        canvas.renderAll();
        
        // Reset history
        historyRef.current = [];
        historyIndexRef.current = -1;
        saveHistory();
        updateCanvasScale();
        setHasCanvas(true);
        if (onImageImport) onImageImport();
      };
      
      imgElement.src = imgUrl;
    };
    
    reader.readAsDataURL(file);
    
    // Clear input value to allow re-uploading same file
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const downloadCanvas = () => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;
          const dataURL = canvas.toDataURL({
        format: "jpeg",
        quality: 0.9,
        multiplier: 1, // Export at original size, not display scale
      });
    const link = document.createElement("a");
    link.download = "edited-frame.jpg";
    link.href = dataURL;
    link.click();
  };

  const applyCrop = () => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;
    
    // TODO: Implement actual crop functionality
    // This will involve:
    // 1. Getting the crop rectangle bounds
    // 2. Creating a new canvas with those dimensions
    // 3. Copying the cropped area to the new canvas
    // 4. Replacing the current canvas content
    
    alert("Crop functionality coming soon!");
  };

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current) return;
    if (!hasCanvas && !initialImage) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: ASPECT_RATIOS[0].width, // Default to 16:9
      height: ASPECT_RATIOS[0].height,
      backgroundColor: "white",
      selection: false,
    });

    fabricCanvasRef.current = canvas;

    // Save initial state after a brief delay to ensure canvas is ready
    setTimeout(() => {
      const json = JSON.stringify(canvas.toJSON());
      updateHistory([json], 0);
    }, 100);

    // Event handlers are set up in separate effects

    return () => {
      canvas.dispose();
    };
  }, [hasCanvas, initialImage]);

  // Set up canvas event handlers
  useEffect(() => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;

    // Path created event (for drawing)
    const handlePathCreated = () => {
      saveHistory();
    };

    canvas.on("path:created", handlePathCreated);

    return () => {
      canvas.off("path:created", handlePathCreated);
    };
  }, [saveHistory]);

  // Load initial image if provided
  useEffect(() => {
    if (!initialImage || initialImage === loadedImageRef.current) return;
    
    // Mark this image as being loaded
    loadedImageRef.current = initialImage;
    
    // Add a delay to ensure canvas is fully initialized
    const loadImage = () => {
      const canvas = fabricCanvasRef.current;
      if (!canvas) {
        setTimeout(loadImage, 100);
        return;
      }
      
      // Create an image element first
      const imgElement = new Image();
      imgElement.crossOrigin = 'anonymous';
      
      imgElement.onload = () => {
        const fabricImg = new fabric.Image(imgElement, {
          selectable: false,
        });
        
        // Resize canvas to match image dimensions
        const imageWidth = fabricImg.width!;
        const imageHeight = fabricImg.height!;
        
        // Maintain a reasonable size - scale down if too large
        let scale = 1;
        const maxHeight = 720;
        if (imageHeight > maxHeight) {
          scale = maxHeight / imageHeight;
        }
        
        // Use ceil to ensure no gaps and add 1px buffer for edge rendering
        const newWidth = Math.ceil(imageWidth * scale) + 1;
        const newHeight = Math.ceil(imageHeight * scale) + 1;
        
        // Update canvas dimensions
        canvas.setDimensions({
          width: newWidth,
          height: newHeight
        });
        
        // Calculate exact scale to fill canvas width
        const exactScale = newWidth / imageWidth;
        
        // Scale and position image to fill canvas exactly
        fabricImg.scale(exactScale);
        fabricImg.set({
          left: 0,
          top: 0,
          originX: 'left',
          originY: 'top'
        });
        
        canvas.add(fabricImg);
        canvas.renderAll();
        
        // Save history after image is loaded
        setTimeout(() => {
          saveHistory();
          updateCanvasScale();
          setHasCanvas(true);
        }, 100);
        if (onImageImport) onImageImport();
      };
      
      imgElement.onerror = (err) => {
        console.error("Error loading image:", err);
      };
      
      imgElement.src = initialImage;
    };
    
    // Start loading after a short delay
    setTimeout(loadImage, 200);
  }, [initialImage, onImageImport, saveHistory, updateCanvasScale]);



  // Tool selection effect
  useEffect(() => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;

    // Reset canvas state
    canvas.isDrawingMode = false;
    canvas.selection = selectedTool === "text"; // Enable selection only for text tool
    canvas.off("mouse:down");
    canvas.off("mouse:move");
    canvas.off("mouse:up");

    switch (selectedTool) {
      case "draw":
        canvas.isDrawingMode = true;
        if (!canvas.freeDrawingBrush) {
          const brush = new fabric.PencilBrush(canvas);
          canvas.freeDrawingBrush = brush;
        }
        canvas.freeDrawingBrush.color = selectedColor;
        canvas.freeDrawingBrush.width = 5;
        break;

      case "rectangle":
      case "circle":
      case "line":
        canvas.selection = false;
        let startX = 0, startY = 0;
        let shape: FabricObject | null = null;

        canvas.on("mouse:down", (opt) => {
          isDrawingRef.current = true;
          const pointer = canvas.getPointer(opt.e);
          startX = pointer.x;
          startY = pointer.y;

          if (selectedTool === "rectangle") {
                            shape = new fabric.Rect({
              left: startX,
              top: startY,
              width: 0,
              height: 0,
              fill: "transparent",
              stroke: selectedColor,
              strokeWidth: 5,
              selectable: false,
            });
          } else if (selectedTool === "circle") {
                            shape = new fabric.Circle({
              left: startX,
              top: startY,
              radius: 0,
              fill: "transparent",
              stroke: selectedColor,
              strokeWidth: 5,
              selectable: false,
            });
          } else if (selectedTool === "line") {
                shape = new fabric.Line([startX, startY, startX, startY], {
              stroke: selectedColor,
              strokeWidth: 5,
              selectable: false,
            });
          }

          if (shape) {
            canvas.add(shape);
          }
        });

        canvas.on("mouse:move", (opt) => {
          if (!isDrawingRef.current || !shape) return;
          const pointer = canvas.getPointer(opt.e);

          if (selectedTool === "rectangle" && shape instanceof fabric.Rect) {
            shape.set({
              width: Math.abs(pointer.x - startX),
              height: Math.abs(pointer.y - startY),
              left: Math.min(startX, pointer.x),
              top: Math.min(startY, pointer.y),
            });
          } else if (selectedTool === "circle" && shape instanceof fabric.Circle) {
            const radius = Math.sqrt(
              Math.pow(pointer.x - startX, 2) + Math.pow(pointer.y - startY, 2)
            ) / 2;
            shape.set({
              radius: radius,
              left: Math.min(startX, pointer.x),
              top: Math.min(startY, pointer.y),
            });
          } else if (selectedTool === "line" && shape instanceof fabric.Line) {
            shape.set({ x2: pointer.x, y2: pointer.y });
          }

          canvas.renderAll();
        });

        canvas.on("mouse:up", () => {
          isDrawingRef.current = false;
          if (shape) {
            saveHistory();
          }
          shape = null;
        });
        break;

      case "text":
        // Prevent selecting existing objects
        canvas.forEachObject((obj) => {
          obj.set('selectable', false);
        });
        
        canvas.on("mouse:down", (opt) => {
          // Only create new text if clicking on empty space
          if (opt.target) return;
          
          const pointer = canvas.getPointer(opt.e);
          const text = new fabric.IText("", {
            left: pointer.x,
            top: pointer.y,
            fontFamily: "Arial",
            fontSize: 24,
            fill: selectedColor,
            selectable: true,  // Temporarily selectable for editing
            editable: true,     // Allow editing
          });
          
          canvas.add(text);
          canvas.setActiveObject(text);
          text.enterEditing();
          canvas.renderAll();
          
          // When editing is done, make it non-selectable
          text.on('editing:exited', () => {
            // Remove empty text
            if (text.text === "") {
              canvas.remove(text);
            } else {
              text.set({
                selectable: false,
                editable: false,
              });
              saveHistory();
            }
            canvas.discardActiveObject();
            canvas.renderAll();
          });
        });
        break;

      case "crop":
        canvas.isDrawingMode = false;
        
        // Show crop aspect ratio selector if needed
        if (cropAspectRatio === null) {
          // For now, we'll implement the crop overlay drawing
          // The aspect ratio selection will be handled in the UI
        }
        
        // TODO: Implement crop rectangle drawing with aspect ratio constraints
        break;
    }
  }, [selectedTool, selectedColor, saveHistory]);

  // Update brush color when color changes
  useEffect(() => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;
    
    if (canvas.isDrawingMode && canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = selectedColor;
    }
  }, [selectedColor, selectedTool]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!fabricCanvasRef.current) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }

    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [undo, redo, saveHistory]);

  // Update scale on window resize
  useEffect(() => {
    const handleResize = () => {
      updateCanvasScale();
    };
    
    window.addEventListener('resize', handleResize);
    // Initial scale calculation
    setTimeout(updateCanvasScale, 100);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [updateCanvasScale]);

  return (
    <div className="space-y-4">
      {/* Frame Actions */}
      <div className="border border-black/[.08] dark:border-white/[.145] rounded-lg p-4">
        <div className="flex gap-2">
          <button
            onClick={() => setShowNewFrameDialog(true)}
            className="px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Create New Frame
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Upload Frame
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Toolbar */}
      {hasCanvas && (
        <div className="border border-black/[.08] dark:border-white/[.145] rounded-lg p-4">
          <div className="flex flex-wrap gap-4 items-center">
          {/* Tool Buttons */}
          <div className="flex gap-2">

            <button
              onClick={() => setSelectedTool("draw")}
              className={`p-2 rounded ${
                selectedTool === "draw"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 dark:bg-gray-700"
              }`}
              title="Draw"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
              </svg>
            </button>
            <button
              onClick={() => setSelectedTool("rectangle")}
              className={`p-2 rounded ${
                selectedTool === "rectangle"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 dark:bg-gray-700"
              }`}
              title="Rectangle"
            >
              □
            </button>
            <button
              onClick={() => setSelectedTool("circle")}
              className={`p-2 rounded ${
                selectedTool === "circle"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 dark:bg-gray-700"
              }`}
              title="Circle"
            >
              ○
            </button>
            <button
              onClick={() => setSelectedTool("line")}
              className={`p-2 rounded ${
                selectedTool === "line"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 dark:bg-gray-700"
              }`}
              title="Line"
            >
              /
            </button>
            <button
              onClick={() => setSelectedTool("text")}
              className={`p-2 rounded ${
                selectedTool === "text"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 dark:bg-gray-700"
              }`}
              title="Text"
            >
              T
            </button>
            <button
              onClick={() => setSelectedTool("crop")}
              className={`p-2 rounded ${
                selectedTool === "crop"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 dark:bg-gray-700"
              }`}
              title="Crop"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/>
                <path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/>
              </svg>
            </button>
          </div>

          {/* Color Picker */}
          <div className="flex gap-2 items-center">
            <span className="text-sm">Color:</span>
            <input
              type="color"
              value={selectedColor}
              onChange={(e) => setSelectedColor(e.target.value)}
              className="w-8 h-8 border rounded cursor-pointer"
            />
          </div>

          {/* Crop Aspect Ratio Selector (only show when crop tool is selected) */}
          {selectedTool === "crop" && (
            <div className="flex gap-2 items-center">
              <span className="text-sm">Crop Ratio:</span>
              <select
                value={cropAspectRatio === null ? "" : cropAspectRatio}
                onChange={(e) => setCropAspectRatio(e.target.value === "" ? null : Number(e.target.value))}
                className="px-2 py-1 border rounded"
              >
                <option value="">Free</option>
                {ASPECT_RATIOS.map((ratio, index) => (
                  <option key={index} value={index}>
                    {ratio.label}
                  </option>
                ))}
              </select>
              {cropAspectRatio !== null && (
                <button
                  onClick={() => applyCrop()}
                  className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                >
                  Apply Crop
                </button>
              )}
            </div>
          )}

          {/* Undo/Redo */}
          <div className="flex gap-2">
            <button
              onClick={undo}
              disabled={historyIndexRef.current <= 0}
              className="p-2 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
              title="Undo (Ctrl/Cmd+Z)"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7v6h6"/>
                <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>
              </svg>
            </button>
            <button
              onClick={redo}
              disabled={historyIndexRef.current >= historyRef.current.length - 1}
              className="p-2 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
              title="Redo (Ctrl/Cmd+Shift+Z)"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 7v6h-6"/>
                <path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7"/>
              </svg>
            </button>
          </div>

          {/* Clear & Download */}
          <div className="flex gap-2 ml-auto">
            <button
              onClick={clearCanvas}
              className="px-3 py-1 rounded bg-red-500 text-white hover:bg-red-600"
            >
              Clear
            </button>
            <button
              onClick={downloadCanvas}
              className="px-3 py-1 rounded bg-green-500 text-white hover:bg-green-600"
            >
              Download
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Canvas Container */}
      {hasCanvas && (
        <div className="border border-black/[.08] dark:border-white/[.145] rounded-lg p-4 bg-gray-100 dark:bg-gray-900">
          <div 
            ref={containerRef}
            className="relative w-full flex items-center justify-center overflow-hidden"
            style={{ minHeight: '400px', maxHeight: 'calc(100vh - 400px)' }}
          >
            <div 
              className="relative"
              style={{
                transform: `scale(${canvasScale})`,
                transformOrigin: 'center',
              }}
            >
              <canvas ref={canvasRef} className="border border-gray-300 dark:border-gray-600" />
            </div>
          </div>
        </div>
      )}

      {/* New Frame Dialog */}
      {showNewFrameDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
            <h3 className="text-lg font-semibold mb-4">Create New Frame</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Select Aspect Ratio:</label>
                <select
                  value={selectedNewFrameAspectRatio}
                  onChange={(e) => setSelectedNewFrameAspectRatio(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded"
                >
                  {ASPECT_RATIOS.map((ratio, index) => (
                    <option key={index} value={index}>
                      {ratio.label} ({ratio.width}x{ratio.height})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowNewFrameDialog(false)}
                  className="px-4 py-2 border rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={createNewFrame}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
