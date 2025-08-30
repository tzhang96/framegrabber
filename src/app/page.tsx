"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

// Dynamically import FrameEditor to avoid SSR issues with Fabric.js
const FrameEditor = dynamic(() => import("./FrameEditor"), { ssr: false });

type Tab = "grabber" | "editor";

export default function Home() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [position, setPosition] = useState<number>(0);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<Tab>("grabber");
  const [frameToEdit, setFrameToEdit] = useState<string | null>(null);
  const frameToEditRef = useRef<string | null>(null);
  const [hasExistingFrame, setHasExistingFrame] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Clean up object URLs
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (frameUrl) URL.revokeObjectURL(frameUrl);
    };
  }, [videoUrl, frameUrl]);

  const onChooseFile = (file: File | null) => {
    setFrameUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    setVideoFile(file);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setPosition(0);
      setDuration(0);
      // The duration will be updated on loadedmetadata
    } else {
      setVideoUrl(null);
      setDuration(0);
      setPosition(0);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    onChooseFile(file);
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      // Check if it's a video file
      if (file.type.startsWith('video/')) {
        onChooseFile(file);
      } else {
        alert('Please drop a video file');
      }
    }
  };

  const onLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    if (!Number.isFinite(video.duration)) return;
    setDuration(video.duration);
  };

  const onSeekSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    setPosition(t);
    const video = videoRef.current;
    if (video && !Number.isNaN(t)) {
      try {
        video.currentTime = t;
      } catch {}
    }
  };

  const extractFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !videoFile) return;
    
    setIsExtracting(true);
    
    // Ensure video is at the correct time
    video.currentTime = position;
    
    const handleSeeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not get canvas context");
        
        ctx.drawImage(video, 0, 0);
        
        canvas.toBlob((blob) => {
          if (!blob) {
            console.error("Failed to create blob from canvas");
            setIsExtracting(false);
            return;
          }
          
          const url = URL.createObjectURL(blob);
          setFrameUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
          setIsExtracting(false);
        }, 'image/jpeg', 0.9);
      } catch (err) {
        console.error("Canvas extraction failed:", err);
        alert("Failed to extract frame. Please try again.");
        setIsExtracting(false);
      }
      
      // Remove the event listener
      video.removeEventListener('seeked', handleSeeked);
    };
    
    video.addEventListener('seeked', handleSeeked);
    video.currentTime = position; // Trigger seek
  }, [position, videoFile]);

  const handleEditFrame = () => {
    if (!frameUrl) return;
    
    if (hasExistingFrame) {
      if (confirm("This will overwrite your existing frame in the editor. Do you want to proceed?")) {
        frameToEditRef.current = frameUrl;
        setFrameToEdit(frameUrl);
        setActiveTab("editor");
      }
    } else {
      frameToEditRef.current = frameUrl;
      setFrameToEdit(frameUrl);
      setActiveTab("editor");
    }
  };

  return (
    <div className="min-h-screen p-6 sm:p-10">
      <div className="max-w-5xl mx-auto w-full">
        <h1 className="text-2xl font-semibold mb-4">FrameGrabber</h1>
        
        {/* Tabs */}
        <div className="flex gap-1 mb-6">
          <button
            onClick={() => {
              setActiveTab("grabber");
              // Clear frameToEdit when switching back to grabber
              if (frameToEdit || frameToEditRef.current) {
                setFrameToEdit(null);
                frameToEditRef.current = null;
              }
            }}
            className={`px-4 py-2 rounded-t-lg transition-colors ${
              activeTab === "grabber"
                ? "bg-black/[.08] dark:bg-white/[.08] border-b-2 border-blue-500"
                : "hover:bg-black/[.04] dark:hover:bg-white/[.04]"
            }`}
          >
            Frame Grabber
          </button>
          <button
            onClick={() => setActiveTab("editor")}
            className={`px-4 py-2 rounded-t-lg transition-colors ${
              activeTab === "editor"
                ? "bg-black/[.08] dark:bg-white/[.08] border-b-2 border-blue-500"
                : "hover:bg-black/[.04] dark:hover:bg-white/[.04]"
            }`}
          >
            Frame Editor
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "grabber" ? (
          <div>
            <p className="text-sm opacity-80 mb-6">
              Upload a video, pick a time, preview the exact frame, and download it.
            </p>

            <div className="grid gap-6">
          <div 
            className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              isDragging 
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' 
                : 'border-black/[.08] dark:border-white/[.145] hover:border-black/[.16] dark:hover:border-white/[.24] hover:bg-black/[.02] dark:hover:bg-white/[.02]'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileInput}
              className="hidden"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="space-y-2">
              <div className="text-lg font-medium">
                {videoFile ? videoFile.name : 'Drop a video file here'}
              </div>
              <div className="text-sm opacity-60">
                or click to browse files
              </div>
              <div className="text-xs opacity-40">
                Supports MP4, WebM, MOV, and other video formats
              </div>
            </div>
          </div>

          {videoUrl && (
            <div className="grid gap-4">
              <video
                ref={videoRef}
                src={videoUrl}
                onLoadedMetadata={onLoadedMetadata}
                className="w-full rounded border border-black/[.08] dark:border-white/[.145]"
                controls
              />

              <div className="grid gap-2">
                <input
                  type="range"
                  min={0}
                  max={Math.max(0.01, duration)}
                  step={0.04}
                  value={position}
                  onChange={onSeekSlider}
                />
                <div className="text-sm opacity-80">
                  Time: {position.toFixed(2)}s / {duration.toFixed(2)}s
                </div>
              </div>

              <div>
                <button
                  disabled={isExtracting}
                  onClick={extractFrame}
                  className="px-4 h-10 rounded border border-black/[.08] dark:border-white/[.145] hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] disabled:opacity-60"
                >
                  {isExtracting ? "Extracting…" : "Get Frame"}
                </button>
              </div>

              {frameUrl && (
                <div className="grid gap-3">
                  <img
                    src={frameUrl}
                    alt="Extracted frame preview"
                    className="w-full max-h-[480px] object-contain rounded border border-black/[.08] dark:border-white/[.145]"
                  />
                  <div className="flex gap-3">
                    <a
                      href={frameUrl}
                      download={`frame_${position.toFixed(2)}s.jpg`}
                      className="inline-flex items-center px-4 h-10 rounded border border-black/[.08] dark:border-white/[.145] hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a]"
                    >
                      Download frame
                    </a>
                    <button
                      onClick={handleEditFrame}
                      className="px-4 h-10 rounded border border-black/[.08] dark:border-white/[.145] hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a]"
                    >
                      Edit Frame
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
          </div>
        ) : (
          <FrameEditor 
            key={frameToEditRef.current || "editor"}
            initialImage={frameToEdit || frameToEditRef.current} 
            onImageImport={() => {
              setHasExistingFrame(true);
            }}
          />
        )}
      </div>
    </div>
  );
}