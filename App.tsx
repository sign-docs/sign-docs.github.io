import React, { useState, useCallback, useEffect } from 'react';
import { FileUpload } from './components/FileUpload';
import { DocumentEditor } from './components/DocumentEditor';
import { Spinner } from './components/Spinner';
import { HeaderIcon } from './components/icons';
import type { Signature, DocumentPage } from './types';

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [documentPages, setDocumentPages] = useState<DocumentPage[]>([]);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  
  useEffect(() => {
    // Set up pdf.js worker
    if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
    }
  }, []);

  const resetState = () => {
    setFile(null);
    setDocumentPages([]);
    setSignature(null);
  };

  const handleFileChange = useCallback(async (selectedFile: File) => {
    if (!selectedFile) return;
    
    resetState();
    setFile(selectedFile);
    setIsLoading(true);

    try {
      if (selectedFile.type.startsWith('image/')) {
        setLoadingMessage('Processing image...');
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = (e) => reject(e);
          reader.readAsDataURL(selectedFile);
        });

        const img = new Image();
        img.onload = () => {
            // 1 point = 1/72 inch. Let's assume 96 DPI for screen images
            const widthInPoints = img.width * 72 / 96;
            const heightInPoints = img.height * 72 / 96;
            setDocumentPages([{ dataUrl, width: widthInPoints, height: heightInPoints }]);
        }
        img.src = dataUrl;

      } else if (selectedFile.type === 'application/pdf') {
        setLoadingMessage('Rendering PDF...');
        const reader = new FileReader();
        reader.readAsArrayBuffer(selectedFile);
        reader.onload = async (e) => {
          const pdfData = new Uint8Array(e.target?.result as ArrayBuffer);
          const pdf = await window.pdfjsLib.getDocument({ data: pdfData }).promise;
          const pages: DocumentPage[] = [];

          for (let i = 1; i <= pdf.numPages; i++) {
            setLoadingMessage(`Rendering page ${i} of ${pdf.numPages}...`);
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2 }); // Higher scale for better quality
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            if(context) {
                await page.render({ canvasContext: context, viewport }).promise;
                const originalViewport = page.getViewport({ scale: 1 });
                pages.push({ 
                    dataUrl: canvas.toDataURL('image/png'),
                    width: originalViewport.width,
                    height: originalViewport.height
                });
            }
          }
          setDocumentPages(pages);
        };
      } else {
        alert('Unsupported file type. Please upload an image or PDF.');
      }
    } catch (error) {
      console.error("Error processing file:", error);
      alert("There was an error processing your file. Please try again.");
      resetState();
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, []);

  const handleDownload = useCallback(async () => {
    if (documentPages.length === 0 || !signature) {
      alert("Please upload a document and apply a signature before downloading.");
      return;
    }

    setIsLoading(true);
    setLoadingMessage('Generating signed PDF...');

    try {
        const { jsPDF } = window.jspdf;
        // The first page's orientation and format determines the PDF settings
        const orientation = documentPages[0].width > documentPages[0].height ? 'l' : 'p';
        const doc = new jsPDF(orientation, 'pt', [documentPages[0].width, documentPages[0].height]);
        doc.deletePage(1); // Remove default page

        for(let i = 0; i < documentPages.length; i++) {
            const pageData = documentPages[i];
            doc.addPage([pageData.width, pageData.height], pageData.width > pageData.height ? 'l' : 'p');
            doc.addImage(pageData.dataUrl, 'PNG', 0, 0, pageData.width, pageData.height);

            if(i === signature.pageIndex) {
                 doc.addImage(signature.dataUrl, 'PNG', signature.x, signature.y, signature.width, signature.height);
            }
        }
        
        const fileName = file?.name.replace(/\.[^/.]+$/, "") || 'document';
        doc.save(`${fileName}-signed.pdf`);
    } catch (error) {
        console.error("Error generating PDF:", error);
        alert("An error occurred while generating the PDF. Please try again.");
    } finally {
        setIsLoading(false);
        setLoadingMessage('');
    }
  }, [documentPages, signature, file]);


  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col font-sans">
      <header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 p-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
            <HeaderIcon />
            <div>
              <h1 className="text-xl font-bold tracking-tight text-cyan-400">sign-docs</h1>
              <p className="text-xs text-gray-400">sign-docs.github.io, free unlimited document signing.</p>
            </div>
        </div>
        {file && (
            <button
                onClick={resetState}
                className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 rounded-md transition-colors duration-200"
            >
                Start Over
            </button>
        )}
      </header>
      
      <main className="flex-grow flex items-center justify-center p-4">
        {isLoading && <Spinner message={loadingMessage} />}
        {!file && !isLoading && <FileUpload onFileChange={handleFileChange} />}
        {file && documentPages.length > 0 && !isLoading && (
          <DocumentEditor 
            pages={documentPages}
            signature={signature}
            onSignatureChange={setSignature}
            onDownload={handleDownload}
          />
        )}
      </main>
    </div>
  );
};

export default App;