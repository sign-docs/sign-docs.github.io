import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SignaturePad } from './SignaturePad';
import type { Signature, DocumentPage } from '../types';
import { DownloadIcon, SignatureIcon, TrashIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';

interface DraggableSignatureProps {
  signature: Signature;
  onUpdate: (pos: { x: number; y: number }) => void;
  viewerBounds: DOMRect;
  pageData: DocumentPage;
}

const DraggableSignature: React.FC<DraggableSignatureProps> = ({ signature, onUpdate, viewerBounds, pageData }) => {
    const sigRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0, sigX: 0, sigY: 0 });

    // Calculate conversion factors
    const viewerAspectRatio = viewerBounds.width / viewerBounds.height;
    const pageAspectRatio = pageData.width / pageData.height;

    let renderWidth, renderHeight;
    if (viewerAspectRatio > pageAspectRatio) {
        renderHeight = viewerBounds.height;
        renderWidth = renderHeight * pageAspectRatio;
    } else {
        renderWidth = viewerBounds.width;
        renderHeight = renderWidth / pageAspectRatio;
    }

    const scale = renderWidth / pageData.width;
    const offsetX = (viewerBounds.width - renderWidth) / 2;
    const offsetY = (viewerBounds.height - renderHeight) / 2;

    // Convert PDF points to screen pixels for rendering
    const pixelPos = {
        x: signature.x * scale + offsetX,
        y: signature.y * scale + offsetY,
        width: signature.width * scale,
        height: signature.height * scale,
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!sigRef.current || !viewerBounds) return;
        e.preventDefault();
        setIsDragging(true);
        setDragStart({
            x: e.clientX,
            y: e.clientY,
            sigX: pixelPos.x,
            sigY: pixelPos.y,
        });
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging || !viewerBounds) return;
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        
        let newX = dragStart.sigX + dx;
        let newY = dragStart.sigY + dy;
        
        // Constrain within rendered page bounds
        newX = Math.max(offsetX, Math.min(newX, offsetX + renderWidth - pixelPos.width));
        newY = Math.max(offsetY, Math.min(newY, offsetY + renderHeight - pixelPos.height));

        const newPdfPos = {
            x: (newX - offsetX) / scale,
            y: (newY - offsetY) / scale,
        };

        onUpdate(newPdfPos);
    }, [isDragging, dragStart, viewerBounds, onUpdate, scale, offsetX, offsetY, renderWidth, renderHeight, pixelPos.width, pixelPos.height]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);
    
    return (
        <div
            ref={sigRef}
            onMouseDown={handleMouseDown}
            className="absolute cursor-move border-2 border-dashed border-cyan-400/0 hover:border-cyan-400/80 transition-all duration-200"
            style={{
                left: `${pixelPos.x}px`,
                top: `${pixelPos.y}px`,
                width: `${pixelPos.width}px`,
                height: `${pixelPos.height}px`,
            }}
        >
            <img src={signature.dataUrl} alt="Signature" className="w-full h-full" draggable="false" />
        </div>
    );
};

// FIX: Define DocumentEditorProps interface
interface DocumentEditorProps {
  pages: DocumentPage[];
  signature: Signature | null;
  onSignatureChange: (signature: Signature | null) => void;
  onDownload: () => void;
}

export const DocumentEditor: React.FC<DocumentEditorProps> = ({ pages, signature, onSignatureChange, onDownload }) => {
  const [currentPage, setCurrentPage] = useState(0);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [viewerBounds, setViewerBounds] = useState<DOMRect>();

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        setViewerBounds(entry.contentRect);
      }
    });
    if (viewerRef.current) {
      observer.observe(viewerRef.current);
      setViewerBounds(viewerRef.current.getBoundingClientRect());
    }
    return () => observer.disconnect();
  }, []);

  const handleApplySignature = (dataUrl: string) => {
    const img = new Image();
    img.onload = () => {
        if (!viewerRef.current) return;
        const viewerWidth = viewerRef.current.clientWidth;
        const viewerHeight = viewerRef.current.clientHeight;

        const aspectRatio = img.width / img.height;
        const sigWidthPx = viewerWidth / 5; // Start at 20% of viewer width
        const sigHeightPx = sigWidthPx / aspectRatio;

        const xPx = (viewerWidth - sigWidthPx) / 2;
        const yPx = (viewerHeight - sigHeightPx) / 2;

        const currentPageData = pages[currentPage];
        const viewerAspectRatio = viewerWidth / viewerHeight;
        const pageAspectRatio = currentPageData.width / currentPageData.height;

        let renderWidth, renderHeight;
        if (viewerAspectRatio > pageAspectRatio) {
            renderHeight = viewerHeight;
            renderWidth = renderHeight * pageAspectRatio;
        } else {
            renderWidth = viewerWidth;
            renderHeight = renderWidth / pageAspectRatio;
        }

        const scale = renderWidth / currentPageData.width;
        
        const offsetX = (viewerWidth - renderWidth) / 2;
        const offsetY = (viewerHeight - renderHeight) / 2;

        onSignatureChange({
            dataUrl,
            x: (xPx - offsetX) / scale,
            y: (yPx - offsetY) / scale,
            width: sigWidthPx / scale,
            height: sigHeightPx / scale,
            pageIndex: currentPage,
        });
    }
    img.src = dataUrl;
  };
  
  const currentPageData = pages[currentPage];

  return (
    <div className="w-full h-full flex flex-col md:flex-row gap-4">
      {/* Left Sidebar: Page Thumbnails */}
      {pages.length > 1 && (
        <div className="w-full md:w-48 bg-gray-800/50 rounded-lg p-2 flex md:flex-col gap-2 overflow-x-auto md:overflow-y-auto flex-shrink-0">
          {pages.map((page, index) => (
            <div
              key={index}
              onClick={() => setCurrentPage(index)}
              className={`cursor-pointer rounded-md p-1 border-2 ${currentPage === index ? 'border-cyan-400' : 'border-transparent'} hover:border-cyan-300`}
            >
              <img src={page.dataUrl} alt={`Page ${index + 1}`} className="rounded-sm" />
              <p className="text-center text-xs mt-1">{index + 1}</p>
            </div>
          ))}
        </div>
      )}

      {/* Center: Document Viewer */}
      <div className="flex-grow flex flex-col items-center justify-center gap-2">
        <div 
          ref={viewerRef} 
          className="relative w-full flex-grow bg-gray-800 rounded-lg flex items-center justify-center overflow-hidden"
        >
          <img 
            src={currentPageData.dataUrl} 
            alt={`Document Page ${currentPage + 1}`} 
            className="max-w-full max-h-full object-contain"
          />
          {signature && signature.pageIndex === currentPage && viewerBounds && (
            <DraggableSignature 
                signature={signature}
                onUpdate={(pos) => {
                    if (!signature) return;
                    onSignatureChange({ ...signature, ...pos, pageIndex: currentPage });
                }}
                viewerBounds={viewerBounds}
                pageData={currentPageData}
             />
          )}
        </div>
        {pages.length > 1 && (
          <div className="flex items-center gap-4 bg-gray-800/50 p-2 rounded-lg">
            <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0} className="disabled:opacity-50"><ChevronLeftIcon /></button>
            <span>Page {currentPage + 1} of {pages.length}</span>
            <button onClick={() => setCurrentPage(p => Math.min(pages.length - 1, p + 1))} disabled={currentPage === pages.length - 1} className="disabled:opacity-50"><ChevronRightIcon /></button>
          </div>
        )}
      </div>

      {/* Right Sidebar: Actions & Signature */}
      <div className="w-full md:w-72 bg-gray-800/50 rounded-lg p-4 flex flex-col gap-4 flex-shrink-0">
        <h2 className="text-lg font-semibold flex items-center gap-2"><SignatureIcon /> Sign Document</h2>
        <SignaturePad onApply={handleApplySignature} />

        {signature && (
          <div className="bg-gray-700/50 rounded-md p-3 text-center">
            <p className="text-sm">Signature applied to page {signature.pageIndex + 1}.</p>
            <p className="text-xs text-gray-400">Drag to move it.</p>
             <button
                onClick={() => onSignatureChange(null)}
                className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 rounded-md transition-colors duration-200"
             >
                <TrashIcon className="w-4 h-4" /> Remove Signature
            </button>
          </div>
        )}

        <div className="mt-auto">
             <p className="text-xs text-center text-gray-400 mb-2">
                Your documents won't be stored. Please remember to download your document when this session is done.
            </p>
            <button
                onClick={onDownload}
                disabled={!signature}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-base font-semibold bg-cyan-600 hover:bg-cyan-700 rounded-md transition-colors duration-200 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
                <DownloadIcon /> Download as PDF
            </button>
        </div>
      </div>
    </div>
  );
};