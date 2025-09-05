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
  const [canvasInitialized, setCanvasInitialized] = useState(0); // Counter to track canvas initialization
  const containerRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const isDrawingRef = useRef(false);
  const isLoadingHistory = useRef(false);
  const loadedImageRef = useRef<string | null>(null);
  const [showNewFrameDialog, setShowNewFrameDialog] = useState(false);
  const [selectedNewFrameAspectRatio, setSelectedNewFrameAspectRatio] = useState(0);
  const [cropAspectRatio, setCropAspectRatio] = useState<number>(0); // Default to 16:9
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [hasCanvas, setHasCanvas] = useState(!!initialImage);
  const cropRectRef = useRef<fabric.Rect | null>(null);
  const cropOverlayRef = useRef<fabric.Group | null>(null);
  const [hasCropSelection, setHasCropSelection] = useState(false);

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
    
    // Save canvas state including dimensions
    const state = {
      canvas: canvas.toJSON(),
      width: canvas.width,
      height: canvas.height
    };
    const json = JSON.stringify(state);
    
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
      
      // Restore canvas dimensions first
      canvas.setDimensions({
        width: state.width,
        height: state.height
      });
      
      canvas.loadFromJSON(state.canvas).then(() => {
        canvas.renderAll();
        updateHistory(history, newIndex);
        isLoadingHistory.current = false;
        updateCanvasScale();
      });
    }
  }, [updateCanvasScale]);

  const redo = useCallback(() => {
    const currentIndex = historyIndexRef.current;
    const history = historyRef.current;
    
    if (currentIndex < history.length - 1 && fabricCanvasRef.current) {
      isLoadingHistory.current = true;
      const newIndex = currentIndex + 1;
      const canvas = fabricCanvasRef.current;
      const state = JSON.parse(history[newIndex]);
      
      // Restore canvas dimensions first
      canvas.setDimensions({
        width: state.width,
        height: state.height
      });
      
      canvas.loadFromJSON(state.canvas).then(() => {
        canvas.renderAll();
        updateHistory(history, newIndex);
        isLoadingHistory.current = false;
        updateCanvasScale();
      });
    }
  }, [updateCanvasScale]);

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
            evented: false,  // Don't capture mouse events
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
          // Don't clear loadedImageRef when resetting to initialImage
          setTimeout(() => {
            if (fabricCanvasRef.current) {
              saveHistory();
              updateCanvasScale();
            }
          }, 100);
        };
        
        imgElement.src = initialImage;
      } else {
        // No initial image, clear to white
        canvas.clear();
        canvas.backgroundColor = "white";
        canvas.renderAll();
        
        // Clear loaded image reference since we're resetting
        loadedImageRef.current = null;
        
        // Reset history to just this state
        historyRef.current = [];
        historyIndexRef.current = -1;
        setTimeout(() => {
          if (fabricCanvasRef.current) {
            saveHistory();
          }
        }, 100);
      }
    }
  }, [saveHistory, initialImage, updateCanvasScale]);

  const createNewFrame = () => {
    const aspectRatio = ASPECT_RATIOS[selectedNewFrameAspectRatio];
    
    // Clear loaded image reference since we're creating a new frame
    loadedImageRef.current = null;
    
    // Close dialog and show canvas
    setShowNewFrameDialog(false);
    setHasCanvas(true);
    
    // Wait for canvas element to be rendered in DOM
    setTimeout(() => {
      if (!canvasRef.current) {
        console.error("Canvas element not found in DOM");
        return;
      }
      
      // Create fabric canvas if it doesn't exist
      if (!fabricCanvasRef.current) {
        const canvas = new fabric.Canvas(canvasRef.current, {
          width: aspectRatio.width,
          height: aspectRatio.height,
          backgroundColor: "white",
          selection: false,
        });
        fabricCanvasRef.current = canvas;
        setCanvasInitialized(prev => prev + 1); // Trigger tool effect re-run
      } else {
        // Reuse existing canvas
        const canvas = fabricCanvasRef.current;
        canvas.clear();
        canvas.setDimensions({
          width: aspectRatio.width,
          height: aspectRatio.height,
        });
      }
      
      const canvas = fabricCanvasRef.current;
      
      // Add white background
      const bg = new fabric.Rect({
        left: 0,
        top: 0,
        width: aspectRatio.width,
        height: aspectRatio.height,
        fill: 'white',
        selectable: false,
        evented: false,  // Don't capture mouse events
      });
      canvas.add(bg);
      canvas.renderAll();
      
      // Reset history
      historyRef.current = [];
      historyIndexRef.current = -1;
      
      setTimeout(() => {
        // Check canvas still exists before saving history
        if (fabricCanvasRef.current) {
          saveHistory();
          updateCanvasScale();
        }
      }, 100);
    }, 50); // Small delay to ensure DOM is rendered
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const imgUrl = event.target?.result as string;
      if (!imgUrl) return;
      
      // Clear loaded image reference
      loadedImageRef.current = null;
      
      // Show canvas
      setHasCanvas(true);
      
      // Wait for canvas element to be rendered in DOM
      setTimeout(() => {
        if (!canvasRef.current) {
          console.error("Canvas element not found in DOM");
          return;
        }
        
        // Create fabric canvas if it doesn't exist
        if (!fabricCanvasRef.current) {
          const canvas = new fabric.Canvas(canvasRef.current, {
            width: ASPECT_RATIOS[0].width,
            height: ASPECT_RATIOS[0].height,
            backgroundColor: "white",
            selection: false,
          });
          fabricCanvasRef.current = canvas;
          setCanvasInitialized(prev => prev + 1); // Trigger tool effect re-run
        }
        
        const canvas = fabricCanvasRef.current;
        const imgElement = new Image();
        imgElement.crossOrigin = 'anonymous';
        
        imgElement.onload = () => {
          // Clear canvas
          canvas.clear();
          
          // Create fabric image
          const fabricImg = new fabric.Image(imgElement, {
            selectable: false,
            evented: false,  // Don't capture mouse events
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
          setTimeout(() => {
            // Check canvas still exists before saving history
            if (fabricCanvasRef.current) {
              saveHistory();
              updateCanvasScale();
            }
          }, 100);
          
          if (onImageImport) onImageImport();
        };
        
        imgElement.src = imgUrl;
      }, 50); // Small delay to ensure DOM is rendered
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

  const createCropOverlay = useCallback((canvas: fabric.Canvas) => {
    if (!cropRectRef.current) return;
    
    // Remove existing overlay
    if (cropOverlayRef.current) {
      canvas.remove(cropOverlayRef.current);
    }
    
    const cropRect = cropRectRef.current;
    const canvasWidth = canvas.width!;
    const canvasHeight = canvas.height!;
    
    // Create four rectangles for the darkened areas
    const overlayRects = [
      // Top
      new fabric.Rect({
        left: 0,
        top: 0,
        width: canvasWidth,
        height: cropRect.top!,
        fill: 'rgba(0, 0, 0, 0.5)',
        selectable: false,
        evented: false,
      }),
      // Right
      new fabric.Rect({
        left: cropRect.left! + cropRect.width!,
        top: cropRect.top!,
        width: canvasWidth - (cropRect.left! + cropRect.width!),
        height: cropRect.height!,
        fill: 'rgba(0, 0, 0, 0.5)',
        selectable: false,
        evented: false,
      }),
      // Bottom
      new fabric.Rect({
        left: 0,
        top: cropRect.top! + cropRect.height!,
        width: canvasWidth,
        height: canvasHeight - (cropRect.top! + cropRect.height!),
        fill: 'rgba(0, 0, 0, 0.5)',
        selectable: false,
        evented: false,
      }),
      // Left
      new fabric.Rect({
        left: 0,
        top: cropRect.top!,
        width: cropRect.left!,
        height: cropRect.height!,
        fill: 'rgba(0, 0, 0, 0.5)',
        selectable: false,
        evented: false,
      }),
    ];
    
    // Group the overlay rectangles
    cropOverlayRef.current = new fabric.Group(overlayRects, {
      selectable: false,
      evented: false,
    });
    
    canvas.add(cropOverlayRef.current);
    canvas.bringObjectToFront(cropRectRef.current);
    canvas.renderAll();
  }, []);

  const applyCrop = useCallback(() => {
    if (!fabricCanvasRef.current || !cropRectRef.current) return;
    const canvas = fabricCanvasRef.current;
    const cropRect = cropRectRef.current;
    
    // Get crop dimensions
    const cropLeft = Math.max(0, cropRect.left!);
    const cropTop = Math.max(0, cropRect.top!);
    const cropWidth = Math.min(cropRect.width!, canvas.width! - cropLeft);
    const cropHeight = Math.min(cropRect.height!, canvas.height! - cropTop);
    
    // Remove crop UI elements before exporting
    if (cropRectRef.current) {
      canvas.remove(cropRectRef.current);
    }
    if (cropOverlayRef.current) {
      canvas.remove(cropOverlayRef.current);
    }
    
    // Export the cropped area
    const croppedDataURL = canvas.toDataURL({
      left: cropLeft,
      top: cropTop,
      width: cropWidth,
      height: cropHeight,
      format: 'png',
      multiplier: 1,
    });
    
    // Clear canvas and resize
    canvas.clear();
    canvas.setDimensions({
      width: cropWidth,
      height: cropHeight
    });
    
    // Load the cropped image back
    const imgElement = new Image();
    imgElement.onload = () => {
      const fabricImg = new fabric.Image(imgElement, {
        left: 0,
        top: 0,
        selectable: false,
        evented: false,  // Don't capture mouse events
      });
      canvas.add(fabricImg);
      canvas.renderAll();
      
      // Clean up crop UI
      cropRectRef.current = null;
      cropOverlayRef.current = null;
      setHasCropSelection(false);
      
      // Reset cursor after crop
      canvas.defaultCursor = 'default';
      canvas.hoverCursor = 'default';
      canvas.renderAll();
      
      // Switch back to draw tool after crop
      setSelectedTool('draw');
      
      // Save the cropped state to history (without clearing previous history)
      // Use setTimeout to ensure canvas is fully rendered before saving
      setTimeout(() => {
        if (fabricCanvasRef.current) {
          saveHistory();
        }
      }, 100);
      updateCanvasScale();
    };
    imgElement.src = croppedDataURL;
  }, [saveHistory, updateCanvasScale, setSelectedTool]);

    // Canvas is now created on-demand in createNewFrame, handleFileUpload, and image loading
  // This prevents initialization issues on page refresh

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
    if (!initialImage) return;
    
    // Check if this is a new image different from what's currently loaded
    if (initialImage === loadedImageRef.current) {
      return;
    }
    
    // Clear the canvas before loading new image
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.clear();
    }
    
    // Mark this image as being loaded
    loadedImageRef.current = initialImage;
    
    // Show canvas first
    setHasCanvas(true);
    
    // Function to load the image
    const loadImage = () => {
      // Check if canvas container exists
      if (!canvasRef.current) {
        // Retry after a short delay if DOM not ready
        setTimeout(loadImage, 100);
        return;
      }
      
      // Ensure canvas is created first if it doesn't exist
      if (!fabricCanvasRef.current) {
        const canvas = new fabric.Canvas(canvasRef.current, {
          width: ASPECT_RATIOS[0].width,
          height: ASPECT_RATIOS[0].height,
          backgroundColor: "white",
          selection: false,
        });
        fabricCanvasRef.current = canvas;
        setCanvasInitialized(prev => prev + 1); // Trigger tool effect re-run
        
        // Initialize history for new canvas
        historyRef.current = [];
        historyIndexRef.current = -1;
      }
      
      const canvas = fabricCanvasRef.current;
      if (!canvas) {
        console.error("Failed to create canvas for image loading");
        return;
      }
      
      // Create an image element first
      const imgElement = new Image();
      imgElement.crossOrigin = 'anonymous';
      
      imgElement.onload = () => {
        const fabricImg = new fabric.Image(imgElement, {
          selectable: false,
          evented: false,  // Don't capture mouse events
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
        
        // Reset history when loading a new image
        historyRef.current = [];
        historyIndexRef.current = -1;
        
        // Save history after image is loaded
        setTimeout(() => {
          if (fabricCanvasRef.current) {
            saveHistory();
            updateCanvasScale();
          }
        }, 100);
        // Don't call onImageImport when loading from Frame Grabber
      };
      
      imgElement.onerror = (err) => {
        console.error("Error loading image:", err);
      };
      
      imgElement.src = initialImage;
    };
    
    // Start loading after a short delay
    setTimeout(loadImage, 200);
  }, [initialImage, saveHistory, updateCanvasScale, setHasCanvas]);



  // Tool selection effect
  useEffect(() => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;

    // Reset canvas state
    canvas.isDrawingMode = false;
    canvas.selection = false; // Disable selection by default
    canvas.discardActiveObject(); // Clear any selection
    canvas.off("mouse:down");
    canvas.off("mouse:move");
    canvas.off("mouse:up");

    // Reset cursors first
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'default';
    canvas.renderAll(); // Apply cursor changes

    switch (selectedTool) {
      case "draw":
        canvas.isDrawingMode = true;
        canvas.defaultCursor = 'crosshair';
        canvas.hoverCursor = 'crosshair';
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
        canvas.defaultCursor = 'crosshair';
        canvas.hoverCursor = 'crosshair';
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
        // Keep default cursor for text tool
        canvas.defaultCursor = 'text';
        canvas.hoverCursor = 'text';
        // Prevent selecting existing objects
        canvas.forEachObject((obj) => {
          obj.set('selectable', false);
          // Only make non-background objects evented
          if (!(obj instanceof fabric.Rect && obj.width === canvas.width && obj.height === canvas.height) &&
              !(obj instanceof fabric.Image)) {
            obj.set('evented', true);
          } else {
            obj.set('evented', false);  // Keep background objects non-evented
          }
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
        canvas.selection = false;
        canvas.discardActiveObject();
        canvas.defaultCursor = 'crosshair';
        canvas.hoverCursor = 'crosshair';
        
        // Make all objects non-selectable during crop
        canvas.forEachObject((obj) => {
          obj.set('selectable', false);
          obj.set('evented', false);
        });
        
        // Clean up any existing crop overlay
        if (cropOverlayRef.current) {
          canvas.remove(cropOverlayRef.current);
          cropOverlayRef.current = null;
        }
        if (cropRectRef.current) {
          canvas.remove(cropRectRef.current);
          cropRectRef.current = null;
        }
        
        canvas.renderAll();
        
        let cropStartX = 0, cropStartY = 0;
        let isDrawingCrop = false;
        
        canvas.on("mouse:down", (opt) => {
          if (opt.target) return; // Don't start new crop if clicking on existing object
          
          const pointer = canvas.getPointer(opt.e);
          cropStartX = pointer.x;
          cropStartY = pointer.y;
          isDrawingCrop = true;
          
          // Remove existing crop rectangle
          if (cropRectRef.current) {
            canvas.remove(cropRectRef.current);
          }
          if (cropOverlayRef.current) {
            canvas.remove(cropOverlayRef.current);
          }
          
          // Create new crop rectangle
          cropRectRef.current = new fabric.Rect({
            left: cropStartX,
            top: cropStartY,
            width: 0,
            height: 0,
            fill: 'transparent',
            stroke: '#fff',
            strokeWidth: 2,
            strokeDashArray: [5, 5],
            selectable: false,
            evented: false,
          });
          canvas.add(cropRectRef.current);
        });
        
        canvas.on("mouse:move", (opt) => {
          if (!isDrawingCrop || !cropRectRef.current) return;
          
          const pointer = canvas.getPointer(opt.e);
          let width = pointer.x - cropStartX;
          let height = pointer.y - cropStartY;
          
          // Always apply aspect ratio constraint
          const ratio = ASPECT_RATIOS[cropAspectRatio];
          const targetAspect = ratio.width / ratio.height;
          
          // Adjust dimensions to maintain aspect ratio
          if (Math.abs(width) / Math.abs(height) > targetAspect) {
            width = Math.sign(width) * Math.abs(height) * targetAspect;
          } else {
            height = Math.sign(height) * Math.abs(width) / targetAspect;
          }
          
          // Update rectangle position and size
          cropRectRef.current.set({
            left: width < 0 ? cropStartX + width : cropStartX,
            top: height < 0 ? cropStartY + height : cropStartY,
            width: Math.abs(width),
            height: Math.abs(height),
          });
          
          canvas.renderAll();
        });
        
        canvas.on("mouse:up", () => {
          if (!isDrawingCrop || !cropRectRef.current) return;
          isDrawingCrop = false;
          
          // Only create overlay if crop rectangle has size
          if (cropRectRef.current.width! > 0 && cropRectRef.current.height! > 0) {
            createCropOverlay(canvas);
            setHasCropSelection(true);
          } else {
            // Remove empty crop rectangle
            canvas.remove(cropRectRef.current);
            cropRectRef.current = null;
            setHasCropSelection(false);
          }
        });
        break;
    }
    
    // Force render to apply all changes
    canvas.renderAll();
    
    // Clean up when switching tools
    return () => {
      canvas.off();
      
      // Clean up crop UI elements if leaving crop tool
      if (selectedTool === "crop") {
        if (cropRectRef.current) {
          canvas.remove(cropRectRef.current);
          cropRectRef.current = null;
        }
        if (cropOverlayRef.current) {
          canvas.remove(cropOverlayRef.current);
          cropOverlayRef.current = null;
        }
        setHasCropSelection(false);
      }
      
      // Restore event handling on interactive objects only
      canvas.forEachObject((obj) => {
        obj.set('selectable', false);  // Keep non-selectable
        // Only restore events for non-background objects
        if (!(obj instanceof fabric.Rect && obj.width === canvas.width && obj.height === canvas.height) &&
            !(obj instanceof fabric.Image)) {
          obj.set('evented', true);
        }
      });
      
      canvas.renderAll();
    };
  }, [selectedTool, selectedColor, saveHistory, createCropOverlay, cropAspectRatio, canvasInitialized]);

  // Update brush color when color changes
  useEffect(() => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;
    
    if (canvas.isDrawingMode && canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = selectedColor;
    }
  }, [selectedColor, selectedTool]);
  
  // Clear crop selection when aspect ratio changes
  useEffect(() => {
    if (!fabricCanvasRef.current || selectedTool !== 'crop') return;
    const canvas = fabricCanvasRef.current;
    
    // Clear existing crop selection
    if (cropRectRef.current) {
      canvas.remove(cropRectRef.current);
      cropRectRef.current = null;
    }
    if (cropOverlayRef.current) {
      canvas.remove(cropOverlayRef.current);
      cropOverlayRef.current = null;
    }
    setHasCropSelection(false);
    canvas.renderAll();
  }, [cropAspectRatio, selectedTool]);

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
  
  // Clean up canvas on component unmount
  useEffect(() => {
    return () => {
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
        fabricCanvasRef.current = null;
      }
    };
  }, []); // Empty deps - only run on unmount

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
                value={cropAspectRatio}
                onChange={(e) => setCropAspectRatio(Number(e.target.value))}
                className="px-2 py-1 border rounded"
              >
                {ASPECT_RATIOS.map((ratio, index) => (
                  <option key={index} value={index}>
                    {ratio.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => applyCrop()}
                className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                disabled={!hasCropSelection}
              >
                Apply Crop
              </button>
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
              Reset
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
