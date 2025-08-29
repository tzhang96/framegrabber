"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function Home() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [position, setPosition] = useState<number>(0);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [isLoadingFFmpeg, setIsLoadingFFmpeg] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Using 'unknown' to avoid eslint 'any'; it will hold an FFmpeg instance
  const ffmpegRef = useRef<unknown>(null);

  const loadFFmpeg = useCallback(async () => {
    if (isReady || isLoadingFFmpeg) return;
    setIsLoadingFFmpeg(true);
    try {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import("@ffmpeg/ffmpeg"),
        import("@ffmpeg/util"),
      ]);
      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });
      ffmpegRef.current = ffmpeg;
      setIsReady(true);
    } catch (err) {
      console.error("Failed to load FFmpeg", err);
    } finally {
      setIsLoadingFFmpeg(false);
    }
  }, [isLoadingFFmpeg, isReady]);

  useEffect(() => {
    // Preload ffmpeg so it's ready when the user needs it
    loadFFmpeg();
  }, [loadFFmpeg]);

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

  const extractFrame = useCallback(async () => {
    if (!videoFile) return;
    setIsExtracting(true);
    try {
      const ffmpeg = ffmpegRef.current as { writeFile: (p: string, d: Uint8Array) => Promise<void>; exec: (args: string[]) => Promise<void>; readFile: (p: string) => Promise<Uint8Array>; deleteFile: (p: string) => Promise<void> } | null;
      if (!ffmpeg) {
        await loadFFmpeg();
      }
      const ff = ffmpegRef.current as { writeFile: (p: string, d: Uint8Array) => Promise<void>; exec: (args: string[]) => Promise<void>; readFile: (p: string) => Promise<Uint8Array>; deleteFile: (p: string) => Promise<void> } | null;
      if (!ff) throw new Error("FFmpeg not ready");
      // Choose an extension for the input file
      const ext = videoFile.name.includes(".")
        ? videoFile.name.slice(videoFile.name.lastIndexOf("."))
        : ".mp4";
      const inputName = `input${ext}`;
      const outputName = "frame.jpg";

      // Write input into ffmpeg FS
      const inputBytes = new Uint8Array(await videoFile.arrayBuffer());
      await ff.writeFile(inputName, inputBytes);

      // Run extraction; -ss before -i is faster seeking
      await ff.exec([
        "-ss",
        `${Math.max(0, Math.min(position, Math.max(0.001, duration)))}`,
        "-i",
        inputName,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        outputName,
      ]);

      const data = (await ff.readFile(outputName)) as Uint8Array;
      const ab = (data.buffer as ArrayBuffer).slice(
        data.byteOffset,
        data.byteOffset + data.byteLength
      );
      const blob = new Blob([ab], { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);
      setFrameUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });

      // Cleanup FS to save memory
      try {
        await ff.deleteFile(inputName);
        await ff.deleteFile(outputName);
      } catch {}
    } catch (err) {
      console.error("Failed to extract frame", err);
    } finally {
      setIsExtracting(false);
    }
  }, [duration, loadFFmpeg, position, videoFile]);

  return (
    <div className="min-h-screen p-6 sm:p-10">
      <div className="max-w-3xl mx-auto w-full">
        <h1 className="text-2xl font-semibold mb-4">FrameGrabber</h1>
        <p className="text-sm opacity-80 mb-6">
          Upload a video, pick a time, preview the exact frame, and download it.
        </p>

        <div className="grid gap-6">
          <div>
            <input
              type="file"
              accept="video/*"
              onChange={handleFileInput}
            />
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

              <div className="flex gap-3 items-center">
                <button
                  disabled={!isReady || isExtracting}
                  onClick={extractFrame}
                  className="px-4 h-10 rounded border border-black/[.08] dark:border-white/[.145] hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] disabled:opacity-60"
                >
                  {isExtracting ? "Extracting…" : "Update preview"}
                </button>
                {!isReady && (
                  <span className="text-sm opacity-80">Loading FFmpeg…</span>
                )}
              </div>

              {frameUrl && (
                <div className="grid gap-3">
                  <img
                    src={frameUrl}
                    alt="Extracted frame preview"
                    className="w-full max-h-[480px] object-contain rounded border border-black/[.08] dark:border-white/[.145]"
                  />
                  <div>
                    <a
                      href={frameUrl}
                      download={`frame_${position.toFixed(2)}s.jpg`}
                      className="inline-flex items-center px-4 h-10 rounded border border-black/[.08] dark:border-white/[.145] hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a]"
                    >
                      Download frame
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
