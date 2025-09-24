import React, { useCallback, useState } from 'react';
import { UploadCloudIcon } from './icons';

interface FileUploadProps {
  onFileChange: (file: File) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileChange }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragging(true);
    } else if (e.type === "dragleave") {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileChange(e.dataTransfer.files[0]);
    }
  }, [onFileChange]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileChange(e.target.files[0]);
    }
  };

  return (
    <div className="w-full max-w-2xl text-center">
      <label
        htmlFor="file-upload"
        className={`relative block w-full rounded-lg border-2 border-dashed p-12 text-center hover:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-colors duration-300 cursor-pointer ${
          isDragging ? 'border-cyan-400 bg-gray-800/50' : 'border-gray-600'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <UploadCloudIcon className="mx-auto h-12 w-12 text-gray-400" />
        <span className="mt-2 block text-lg font-semibold text-white">Upload a document</span>
        <span className="mt-1 block text-sm text-gray-400">Drag & drop or click to upload a PDF or image file.</span>
        <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleChange} accept="application/pdf,image/*" />
      </label>
      <p className="mt-6 text-xs text-gray-500">
        All processing is done on your device. Your files are never uploaded to a server.
      </p>
    </div>
  );
};
