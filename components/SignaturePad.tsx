import React, { useRef, useEffect, useState } from 'react';
import { CheckIcon, EraserIcon } from './icons';

interface SignaturePadProps {
  onApply: (dataUrl: string) => void;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({ onApply }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [color, setColor] = useState<'#FFFFFF' | '#000000'>('#000000');
  
  const getContext = () => canvasRef.current?.getContext('2d');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Set canvas size based on its container, for high DPI displays
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    
    const ctx = getContext();
    if (!ctx) return;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const ctx = getContext();
    if (!ctx) return;
    
    // Ensure the current color is used for the new line
    ctx.strokeStyle = color;

    const pos = getEventPosition(e);
    if (!pos) return;

    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
    setHasDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const ctx = getContext();
    if (!ctx) return;

    const pos = getEventPosition(e);
    if (!pos) return;
    
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    const ctx = getContext();
    if (!ctx) return;
    ctx.closePath();
    setIsDrawing(false);
  };

  const getEventPosition = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e.nativeEvent) {
      return {
        x: e.nativeEvent.touches[0].clientX - rect.left,
        y: e.nativeEvent.touches[0].clientY - rect.top,
      };
    }
    return {
      x: e.nativeEvent.offsetX,
      y: e.nativeEvent.offsetY,
    };
  };

  const clearPad = () => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasDrawing(false);
    }
  };

  const handleApply = () => {
    const canvas = canvasRef.current;
    if (canvas && hasDrawing) {
      onApply(canvas.toDataURL('image/png'));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-gray-300">Draw your signature below:</p>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-400">Color:</span>
        <div className="flex gap-2">
            <button
                type="button"
                aria-label="Select white color"
                onClick={() => setColor('#FFFFFF')}
                className={`w-8 h-8 rounded-full bg-white transition-all ${color === '#FFFFFF' ? 'ring-2 ring-offset-2 ring-offset-gray-800 ring-cyan-400' : 'ring-1 ring-gray-500'}`}
            />
            <button
                type="button"
                aria-label="Select black color"
                onClick={() => setColor('#000000')}
                className={`w-8 h-8 rounded-full bg-black transition-all ${color === '#000000' ? 'ring-2 ring-offset-2 ring-offset-gray-800 ring-cyan-400' : 'ring-1 ring-gray-500'}`}
            />
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="bg-gray-700/50 rounded-md cursor-crosshair w-full h-40"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />
      <div className="flex gap-2">
        <button
          onClick={clearPad}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold bg-gray-600 hover:bg-gray-500 rounded-md transition-colors duration-200"
        >
          <EraserIcon /> Clear
        </button>
        <button
          onClick={handleApply}
          disabled={!hasDrawing}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold bg-green-600 hover:bg-green-700 rounded-md transition-colors duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed"
        >
          <CheckIcon /> Apply
        </button>
      </div>
    </div>
  );
};