import React, { useState, useRef, useEffect } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import SignaturePad from 'signature_pad';
import { 
  Upload, 
  PenTool, 
  Users, 
  Download, 
  Mail, 
  Trash2, 
  Plus, 
  CheckCircle2, 
  X,
  FileText,
  AlertCircle,
  Eye,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface RecipientField {
  id: string;
  x: number;
  y: number;
  pageIndex: number;
  isSigned?: boolean;
  filledDataUrl?: string; // Image of the signature placed on this specific field
  width?: number; // Base pixel geometry scale width
  showBaseline?: boolean; // Toggles 'X _____Name' visibility
  isBurned?: boolean; // Flag for imported fields that already have the baseline burned physically into the PDF
}

interface Recipient {
  id: string;
  name: string;
  email: string;
  fields: RecipientField[];
}

interface SignatureData {
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  pageIndex: number;
}

interface MySignatureMarker {
  id: string;
  x: number;
  y: number;
  pageIndex: number;
  width: number;
  showBaseline: boolean;
}

// --- Main Component ---
export default function App() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [stage, setStage] = useState<'upload' | 'edit' | 'finalize'>('upload');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const [selectedId, setSelectedId] = useState<string | 'base' | null>(null);
  const [mySignatureBase, setMySignatureBase] = useState<string | null>(null);
  const [mySignatureMarkers, setMySignatureMarkers] = useState<MySignatureMarker[]>([]);
  const [myName, setMyName] = useState(''); // Default empty for primary signer
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [penWidth, setPenWidth] = useState(2.5);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const sigPadRef = useRef<SignaturePad | null>(null);

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [activeRecipientId, setActiveRecipientId] = useState<string | null>(null);
  const [placementMode, setPlacementMode] = useState<'mine_marker' | 'relocate_mine' | 'other' | null>(null);

  // --- Handlers ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setError(null);
    setIsLoading(true);

    try {
      const bufferForPdfJs = await file.arrayBuffer();
      const bufferForPdfLib = await file.arrayBuffer();

      if (!(window as any).pdfjsLib) {
          throw new Error("PDF rendering engine (PDF.js) not found. Check your internet connection.");
      }
      
      const loadingTask = (window as any).pdfjsLib.getDocument({ data: bufferForPdfJs });
      const loadedDoc = await loadingTask.promise;

      let existingFields: Recipient[] = [];
      try {
          const pdfLibDoc = await PDFDocument.load(bufferForPdfLib, { ignoreEncryption: true });
          const keywords = pdfLibDoc.getKeywords();
          if (keywords && keywords.includes('SIGNFLOW:')) {
              const jsonPart = keywords.split('SIGNFLOW:')[1];
              const parsed = JSON.parse(jsonPart);
              existingFields = parsed.map((r: any) => ({
                 ...r,
                 fields: r.fields.map((f: any) => ({ ...f, isBurned: true }))
              }));
          }
      } catch (err) {
          console.warn("Metadata extraction failed or not found:", err);
      }

      setPdfFile(file);
      setNumPages(loadedDoc.numPages);
      setPdfDoc(loadedDoc);
      setRecipients(existingFields);
      setStage('edit');
    } catch (err: any) {
      setError(err.message || "Failed to load PDF.");
    } finally {
      setIsLoading(false);
    }
  };

  const startDrawing = (targetFieldId?: string) => {
    setSelectedId(targetFieldId || 'base');
    setIsDrawing(true);
    setTimeout(() => {
      if (sigCanvasRef.current) {
        const canvas = sigCanvasRef.current;
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext("2d")?.scale(ratio, ratio);
        
        sigPadRef.current = new SignaturePad(canvas, {
          backgroundColor: 'rgba(255, 255, 255, 0)',
          penColor: 'rgb(0, 0, 0)',
          velocityFilterWeight: 0.7,
          minWidth: penWidth * 0.5,
          maxWidth: penWidth * 1.5,
        });
      }
    }, 200);
  };

  const saveSignature = () => {
    if (sigPadRef.current && sigCanvasRef.current && !sigPadRef.current.isEmpty()) {
      const croppedCanvas = getCroppedCanvas(sigCanvasRef.current);
      const dataUrl = croppedCanvas.toDataURL();
      
      if (selectedId && selectedId !== 'base') {
          // Auto-fill ALL fields for the recipient who owns this selected marker
          setRecipients(recipients.map(r => {
             const ownsSelectedField = r.fields.some(f => f.id === selectedId);
             if (ownsSelectedField) {
                 return {
                     ...r,
                     fields: r.fields.map(f => ({ ...f, isSigned: true, filledDataUrl: dataUrl }))
                 };
             }
             return r;
          }));
      } else {
          // Create standalone base signature and enter placement mode
          setMySignatureBase(dataUrl);
          setPlacementMode('mine_marker');
      }
      setIsDrawing(false);
    }
  };

  const addRecipient = () => {
    const newRecipient: Recipient = { id: crypto.randomUUID(), name: '', email: '', fields: [] };
    setRecipients([...recipients, newRecipient]);
    setActiveRecipientId(newRecipient.id);
  };

  const removeField = (fieldId: string) => {
    setRecipients(recipients.map(r => ({ ...r, fields: r.fields.filter(f => f.id !== fieldId) })));
  };

  const handlePageClick = (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (!placementMode) {
      setSelectedId(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    if (placementMode === 'mine_marker') {
      const newMarkerId = crypto.randomUUID();
      setMySignatureMarkers([...mySignatureMarkers, { id: newMarkerId, x, y, pageIndex, width: 140, showBaseline: true }]);
      setSelectedId(newMarkerId);
      setPlacementMode(null);
    } else if (placementMode === 'relocate_mine' && selectedId) {
      setMySignatureMarkers(mySignatureMarkers.map(m => m.id === selectedId ? { ...m, x, y, pageIndex } : m));
      setPlacementMode(null);
    } else if (placementMode === 'other' && activeRecipientId) {
      if (selectedId) {
          // Relocate existing field
          setRecipients(recipients.map(r => ({
            ...r,
            fields: r.fields.map(f => f.id === selectedId ? { ...f, x, y, pageIndex } : f)
          })));
      } else {
          // Add new field
          const fieldId = crypto.randomUUID();
          setRecipients(recipients.map(r => {
            if (r.id === activeRecipientId) {
              return { ...r, fields: [...r.fields, { id: fieldId, x, y, pageIndex, width: 140, showBaseline: true }] };
            }
            return r;
          }));
          setSelectedId(fieldId);
      }
      setPlacementMode(null);
    }
  };

  const generateFinalPdf = async () => {
    if (!pdfFile) return;
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdfLibDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const helveticaFont = await pdfLibDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfLibDoc.getPages();
    
    // 1. Embed My Standalone Signature Markers
    if (mySignatureBase) {
      const image = await pdfLibDoc.embedPng(mySignatureBase);
      for (const marker of mySignatureMarkers) {
        const page = pages[marker.pageIndex];
        const { width, height } = page.getSize();
        const imgWidth = marker.width;
        const imgHeight = (image.height / image.width) * imgWidth;
        
        const sigX = marker.x * width;
        const sigY = (1 - marker.y) * height;
        const startX = sigX - (imgWidth / 2) + 10;
        const endX = sigX + (imgWidth / 2) - 10;
        const baselineY = sigY - (imgHeight / 2) + 2; 

        if (marker.showBaseline) {
            page.drawText('X', { x: startX, y: baselineY + 2, size: 8, font: helveticaFont, color: rgb(0.0, 0.3, 0.5) });
            page.drawLine({
                start: { x: startX + 10, y: baselineY },
                end: { x: endX, y: baselineY },
                thickness: 0.5, color: rgb(0.1, 0.1, 0.1)
            });
            page.drawText(`${myName || 'Signer'}`, { x: startX + 10, y: baselineY - 8, size: 6, font: helveticaFont, color: rgb(0.3, 0.3, 0.3) });
        }

        page.drawImage(image, {
          x: sigX - (imgWidth / 2),
          y: sigY - (imgHeight / 2),
          width: imgWidth, height: imgHeight,
        });
      }
    }

    // 2. Embed Recipient Fields & Filled Signatures
    for (const rec of recipients) {
      for (const field of rec.fields) {
        const page = pages[field.pageIndex];
        const { width, height } = page.getSize();
        const markerX = field.x * width;
        const markerY = (1 - field.y) * height;
        const imgWidth = field.width || 140;
        const showBaseline = field.showBaseline !== false;
        const isBurned = field.isBurned;

        if (field.isSigned && field.filledDataUrl) {
            const image = await pdfLibDoc.embedPng(field.filledDataUrl);
            const imgHeight = (image.height / image.width) * imgWidth;
            
            const startX = markerX - (imgWidth / 2) + 10;
            const endX = markerX + (imgWidth / 2) - 10;
            const baselineY = markerY - (imgHeight / 2) + 2;

            if (showBaseline && !isBurned) {
                page.drawText('X', { x: startX, y: baselineY + 2, size: 8, font: helveticaFont, color: rgb(0.0, 0.3, 0.5) });
                page.drawLine({
                    start: { x: startX + 10, y: baselineY },
                    end: { x: endX, y: baselineY },
                    thickness: 0.5, color: rgb(0.1, 0.1, 0.1)
                });
                page.drawText(`${rec.name || 'Signer'}`, { x: startX + 10, y: baselineY - 8, size: 6, font: helveticaFont, color: rgb(0.3, 0.3, 0.3) });
            }

            page.drawImage(image, {
              x: markerX - (imgWidth / 2),
              y: markerY - (imgHeight / 2),
              width: imgWidth, height: imgHeight,
            });
        } else {
            const startX = markerX - (imgWidth / 2) + 10;
            const endX = markerX + (imgWidth / 2) - 10;
            const baselineY = markerY - 20;

            if (showBaseline && !isBurned) {
                page.drawText('X', { x: startX, y: baselineY + 2, size: 8, font: helveticaFont, color: rgb(0.0, 0.3, 0.5) });
                page.drawLine({
                    start: { x: startX + 10, y: baselineY },
                    end: { x: endX, y: baselineY },
                    thickness: 0.5, color: rgb(0.1, 0.1, 0.1)
                });
                page.drawText(`${rec.name || 'Signer'}`, { x: startX + 10, y: baselineY - 8, size: 6, font: helveticaFont, color: rgb(0.3, 0.3, 0.3) });
            }
        }
      }
    }

    // Strip filledDataUrls out of Metadata for privacy/size before embedding.
    // Also, once signed, the field is permanently flattened, so don't persist its metadata context further.
    const cleanRecipients = recipients.map(r => ({
       ...r, fields: r.fields.filter(f => !f.isSigned).map(f => ({ id: f.id, x: f.x, y: f.y, pageIndex: f.pageIndex, width: f.width, showBaseline: f.showBaseline }))
    })).filter(r => r.fields.length > 0);
    pdfLibDoc.setKeywords([`SIGNFLOW:${JSON.stringify(cleanRecipients)}`]);
    
    // Save PDF
    const pdfBytes = await pdfLibDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Ensure accurate .pdf extension
    let fileName = `signflow_${pdfFile.name}`;
    if (!fileName.toLowerCase().endsWith('.pdf')) fileName += '.pdf';
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    
    setStage('finalize');
  };

  return (
    <div className="min-h-screen text-slate-200 font-sans selection:bg-brand/30">
      <div className="fixed inset-0 -z-10 bg-[#0c111d]" />
      
      <nav className="border-b border-white/5 bg-slate-900/60 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1700px] mx-auto px-8 h-20 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-gradient-to-br from-brand to-brand-dark rounded-xl flex items-center justify-center shadow-lg shadow-brand/20"><PenTool className="text-white" size={24} /></div>
              <h1 className="text-xl font-bold font-outfit tracking-tighter text-white">SignFlow</h1>
            </div>
            {pdfFile && <button onClick={() => setStage('upload')} className="text-slate-500 hover:text-white transition-all text-xs font-bold uppercase tracking-widest">Quit Editor</button>}
        </div>
      </nav>

      <main className="max-w-[1700px] mx-auto px-8 py-10">
        <AnimatePresence mode="wait">
          {stage === 'upload' && (
            <motion.div key="upload" className="max-w-3xl mx-auto mt-20 text-center relative z-10">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[150%] bg-brand/10 blur-[150px] -z-10 rounded-full pointer-events-none"></div>
              <h2 className="text-6xl font-black mb-8 font-outfit text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-slate-500 tracking-tight leading-none drop-shadow-xl">Your Private <br/><span className="text-brand drop-shadow-[0_0_30px_rgba(45,212,191,0.5)]">Signature Studio.</span></h2>
              <div className="glass p-16 rounded-[3rem] bg-[#0c1322] relative group shadow-2xl">
                {isLoading && <div className="absolute inset-0 z-20 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center rounded-[3rem]"><div className="w-16 h-16 border-4 border-brand border-t-transparent rounded-full animate-spin mb-6" /><p className="text-brand font-black uppercase tracking-widest text-[10px]">Analyzing PDF...</p></div>}
                {error && <div className="mb-10 p-5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-500 text-sm"><AlertCircle size={20} /> {error}</div>}
                <div className="w-24 h-24 bg-brand/10 rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 border border-brand/20 group-hover:scale-110 group-hover:bg-brand transition-all duration-300 shadow-[0_10px_40px_-5px_rgba(45,212,191,0.3)]"><Upload className="text-white drop-shadow-md" size={40} /></div>
                <label className="btn-primary inline-flex items-center gap-4 cursor-pointer py-4 px-10 text-lg font-black tracking-wide shadow-2xl shadow-brand/20 hover:scale-105 transition-transform"><Plus size={24} strokeWidth={3} /> Choose Document<input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} /></label>
                <div className="mt-8 text-sm font-medium text-slate-500">Only PDF files are supported</div>
              </div>
            </motion.div>
          )}

          {stage === 'edit' && (
            <motion.div key="edit" className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              <aside className="lg:col-span-3 space-y-8">
                
                <section className="glass rounded-[2rem] bg-slate-900/40 border border-white/5 overflow-hidden shadow-xl">
                  <div className="px-8 py-5 border-b border-white/5 text-[10px] font-black uppercase text-slate-500 bg-white/[0.01]">My Signature</div>
                  <div className="p-8 space-y-6 relative">
                    <input type="text" placeholder="Your Name" value={myName} onChange={(e) => setMyName(e.target.value)} className="modern-input w-full" />
                    
                    {!mySignatureBase ? (
                      <button onClick={() => startDrawing('base')} className="w-full aspect-[4/3] border-[3px] border-dashed border-white/20 rounded-[2rem] flex flex-col items-center justify-center gap-3 hover:border-brand/60 text-slate-400 hover:text-brand hover:bg-brand/10 shadow-inner transition-all bg-black/20">
                        <Plus size={28} strokeWidth={3} /> <span className="font-bold text-sm tracking-wide">Create Signature</span>
                      </button>
                    ) : (
                      <div className="space-y-4">
                        <div className="bg-[#0b1221] p-4 rounded-[2rem] h-32 flex items-center justify-center relative shadow-inner border-2 border-white/5 overflow-hidden group">
                           <img src={mySignatureBase} className="max-h-full invert drop-shadow-[0_4px_10px_rgba(255,255,255,0.2)] z-10 opacity-90" />
                           <button onClick={() => { setMySignatureBase(null); setMySignatureMarkers([]); }} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white z-30 shadow-lg"><Trash2 size={14}/></button>
                        </div>
                        
                        <div className="p-5 bg-white/[0.02] border border-white/5 rounded-[1.5rem]">
                           <div className="flex flex-wrap gap-2">
                             {mySignatureMarkers.map((m, idx) => (
                                <button key={m.id} onClick={() => setSelectedId(m.id)} className={cn("text-[9px] px-3.5 py-2 rounded-xl border font-black uppercase tracking-widest transition-all", selectedId === m.id ? "bg-brand border-brand text-white shadow-lg shadow-brand/40 scale-105" : "text-slate-400 border-white/10 hover:bg-white/10 hover:text-white bg-white/5")}>Sign {idx+1}</button>
                             ))}
                             <button onClick={() => { setPlacementMode('mine_marker'); setSelectedId(null); }} className="text-[10px] font-black border border-dashed border-white/20 px-4 py-2 rounded-xl text-brand hover:bg-brand/10 hover:border-brand/50 transition-all">+ Add Signature Instance</button>
                           </div>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                <section className="glass rounded-[2rem] overflow-hidden shadow-xl">
                   <div className="px-8 py-5 border-b border-white/5 text-[10px] font-black uppercase text-slate-500 bg-white/[0.01]">Recipient Workflow</div>
                   <div className="p-8 space-y-6">
                      {recipients.map(rec => (
                        <div key={rec.id} className="p-6 bg-[#080d1a]/50 border border-white/10 rounded-[1.5rem] shadow-inner relative group">
                           <input type="text" placeholder="Signer Name" value={rec.name} onChange={(e) => setRecipients(recipients.map(r => r.id === rec.id ? { ...r, name: e.target.value } : r))} className="modern-input w-full mb-5" />
                           <div className="flex flex-wrap gap-2">
                             {rec.fields.map((f, idx) => <button key={f.id} onClick={() => setSelectedId(f.id)} className={cn("text-[9px] px-3 py-1.5 rounded-xl border font-black uppercase tracking-widest transition-all", selectedId === f.id ? "bg-brand border-brand text-white" : "text-slate-600 border-white/5", f.isSigned && "opacity-50 line-through")}>Mark {idx+1}</button>)}
                             <button onClick={() => { setActiveRecipientId(rec.id); setSelectedId(null); setPlacementMode('other'); }} className="text-[10px] font-black border border-dashed border-white/10 px-4 py-2 rounded-xl text-slate-500 hover:text-brand hover:border-brand transition-all">+ Marker</button>
                           </div>
                        </div>
                      ))}
                      <button onClick={addRecipient} className="w-full py-4 border border-dashed border-white/10 rounded-[1.5rem] text-[10px] font-black uppercase text-slate-600 hover:text-brand transition-all">+ Add Recipient</button>
                   </div>
                </section>
                
                <button onClick={generateFinalPdf} className="btn-primary w-full py-5 text-sm font-black uppercase tracking-widest shadow-2xl">Finalize PDF</button>
              </aside>

                  <div className="lg:col-span-9 bg-slate-950/20 rounded-[3rem] border border-white/5 p-12 h-[calc(100vh-12rem)] overflow-y-auto custom-scrollbar relative shadow-inner">
                 <div className="flex flex-col items-center gap-16 relative">
                    {Array.from({ length: numPages }).map((_, i) => (
                      <div key={i} className="pdf-page-container relative w-fit mx-auto group/page transition-all duration-700" onClick={(e) => handlePageClick(i, e)} style={{ cursor: placementMode ? 'crosshair' : 'default' }}>
                         <div className={cn("transition-all duration-700", placementMode ? "blur-[2px] opacity-80 hover:blur-0 hover:opacity-100" : "")}>
                           <PdfPage pdfDoc={pdfDoc} pageNumber={i + 1} />
                         </div>
                         
                         {/* My Signature Markers */}
                         {mySignatureBase && mySignatureMarkers.filter(m => m.pageIndex === i).map(m => (
                              <div 
                                key={m.id}
                                onClick={(e) => { e.stopPropagation(); setSelectedId(m.id); }}
                                className={cn(
                                  "absolute transition-all flex flex-col items-center justify-center cursor-pointer pointer-events-auto group/sig z-30",
                                  selectedId === m.id ? "ring-2 ring-brand shadow-xl scale-105 bg-brand/5 rounded-lg" : ""
                                )}
                                style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.width}px`, transform: 'translate(-50%, -50%)' }}
                               >
                                <div className="absolute inset-0 border-2 border-transparent group-hover/sig:border-brand/40 transition-all pointer-events-none rounded" />
                                <div className="relative w-full">
                                  <img src={mySignatureBase} className="w-full h-auto mix-blend-multiply drop-shadow-sm pb-4" alt="signed" />
                                  {/* Visual Preview of the Line */}
                                  {m.showBaseline && (
                                    <div className="absolute bottom-1 left-2 right-2 pointer-events-none flex flex-col opacity-80">
                                        <div className="flex items-end">
                                            <span className="text-[12px] font-bold text-[#004e80] mr-1 leading-none font-helvetica pb-[1px]">X</span>
                                            <div className="flex-1 border-b border-slate-900"></div>
                                        </div>
                                        <span className="text-[8px] font-semibold text-slate-700 self-start ml-4 leading-none mt-0.5">{myName || 'Signer'}</span>
                                    </div>
                                  )}
                                </div>
                                
                                {selectedId === m.id && (
                                    <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-1.5 flex items-center gap-1 z-50">
                                        <button onClick={(e) => { e.stopPropagation(); setMySignatureMarkers(mySignatureMarkers.map(mark => mark.id === m.id ? {...mark, width: mark.width + 15} : mark)); }} className="px-4 py-2 text-[14px] font-black text-brand hover:bg-brand/10 rounded-xl">+</button>
                                        <button onClick={(e) => { e.stopPropagation(); setMySignatureMarkers(mySignatureMarkers.map(mark => mark.id === m.id ? {...mark, width: Math.max(50, mark.width - 15)} : mark)); }} className="px-4 py-2 text-[14px] font-black text-brand hover:bg-brand/10 rounded-xl">-</button>
                                        
                                        <div className="w-[1px] h-5 bg-white/20 mx-1"></div>
                                        
                                        <button onClick={(e) => { e.stopPropagation(); setMySignatureMarkers(mySignatureMarkers.map(mark => mark.id === m.id ? {...mark, showBaseline: !mark.showBaseline} : mark)); }} className="px-4 py-2 text-[10px] font-black uppercase text-cyan-400 hover:bg-cyan-400/10 rounded-xl whitespace-nowrap hover:scale-105 transition-transform">Line: {m.showBaseline ? 'ON' : 'OFF'}</button>
                                        
                                        <div className="w-[1px] h-5 bg-white/20 mx-1"></div>

                                        <button onClick={(e) => { e.stopPropagation(); setPlacementMode('relocate_mine'); }} className="px-4 py-2 text-[10px] font-black uppercase text-white hover:bg-white/10 rounded-xl whitespace-nowrap hover:scale-105 transition-transform">Move</button>
                                        <button onClick={(e) => { e.stopPropagation(); setMySignatureMarkers(mySignatureMarkers.filter(mark => mark.id !== m.id)); setSelectedId(null); }} className="px-4 py-2 text-[10px] font-black uppercase text-red-500 hover:bg-red-500/10 rounded-xl whitespace-nowrap hover:scale-105 transition-transform">Clear</button>
                                    </div>
                                )}
                              </div>
                         ))}

                         {/* Markers (X _______) */}
                         {recipients.flatMap(r => r.fields.map(f => ({ ...f, name: r.name, recipientId: r.id }))).filter(f => f.pageIndex === i).map(f => {
                            const fw = f.width || 140;
                            const showB = f.showBaseline !== false;
                            
                            return (
                            <div 
                                key={f.id} 
                                onClick={(e) => { e.stopPropagation(); setSelectedId(f.id); }}
                                className={cn(
                                    "absolute border-2 transition-all flex flex-col items-center justify-center bg-cyan-400/5 group/field",
                                    selectedId === f.id ? "border-brand shadow-xl z-40 bg-brand/5" : "border-cyan-400/20 z-10",
                                    "cursor-pointer"
                                )} 
                                style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${fw}px`, minHeight: '50px', transform: 'translate(-50%, -50%)' }}
                            >
                               {selectedId === f.id && (
                                   <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-1.5 flex items-center gap-1 z-50">
                                       {!f.isSigned && (
                                          <button onClick={(e) => { e.stopPropagation(); startDrawing(f.id); }} className="px-4 py-2 text-[10px] font-black uppercase text-brand hover:bg-brand/10 rounded-xl whitespace-nowrap hover:scale-105 transition-transform">Sign</button>
                                       )}
                                       
                                       <button onClick={(e) => { e.stopPropagation(); setRecipients(recipients.map(r => r.id === f.recipientId ? {...r, fields: r.fields.map(fld => fld.id === f.id ? {...fld, width: (fld.width || 140) + 15} : fld)} : r)); }} className="px-4 py-2 text-[14px] font-black text-brand hover:bg-brand/10 rounded-xl">+</button>
                                       <button onClick={(e) => { e.stopPropagation(); setRecipients(recipients.map(r => r.id === f.recipientId ? {...r, fields: r.fields.map(fld => fld.id === f.id ? {...fld, width: Math.max(80, (fld.width || 140) - 15)} : fld)} : r)); }} className="px-4 py-2 text-[14px] font-black text-brand hover:bg-brand/10 rounded-xl">-</button>
                                       
                                       <div className="w-[1px] h-5 bg-white/20 mx-1"></div>
                                       
                                       <button onClick={(e) => { e.stopPropagation(); setRecipients(recipients.map(r => r.id === f.recipientId ? {...r, fields: r.fields.map(fld => fld.id === f.id ? {...fld, showBaseline: !showB} : fld)} : r)); }} className="px-4 py-2 text-[10px] font-black uppercase text-cyan-400 hover:bg-cyan-400/10 rounded-xl whitespace-nowrap hover:scale-105 transition-transform">Line: {showB ? 'ON' : 'OFF'}</button>
                                       
                                       <div className="w-[1px] h-5 bg-white/20 mx-1"></div>
                                       
                                       <button onClick={(e) => { 
                                          e.stopPropagation(); 
                                          setActiveRecipientId(f.recipientId); 
                                          setPlacementMode('other'); 
                                       }} className="px-4 py-2 text-[10px] font-black uppercase text-white hover:bg-white/10 rounded-xl whitespace-nowrap hover:scale-105 transition-transform">Move</button>

                                       {f.isSigned ? (
                                           <button onClick={(e) => {
                                               e.stopPropagation();
                                               setRecipients(recipients.map(r => ({...r, fields: r.fields.map(fld => fld.id === f.id ? {...fld, isSigned: false, filledDataUrl: undefined } : fld)})))
                                           }} className="px-4 py-2 text-[10px] font-black uppercase text-red-500 hover:bg-red-500/10 rounded-xl whitespace-nowrap hover:scale-105 transition-transform">Clear</button>
                                       ) : (
                                           <button onClick={(e) => { e.stopPropagation(); removeField(f.id); }} className="px-4 py-2 text-[10px] font-black uppercase text-red-500 hover:bg-red-500/10 rounded-xl whitespace-nowrap hover:scale-105 transition-transform">Delete</button>
                                       )}
                                   </div>
                               )}
                               
                                    {f.isSigned && f.filledDataUrl ? (
                                        <div className="relative w-full">
                                           <img src={f.filledDataUrl} className="w-full h-auto mix-blend-multiply drop-shadow-sm pb-4 relative z-10" alt="filled signature" />
                                           {showB && !f.isBurned && (
                                             <div className="absolute bottom-1 left-2 right-2 pointer-events-none flex flex-col opacity-80 z-0">
                                                 <div className="flex items-end">
                                                     <span className="text-[12px] font-bold text-[#004e80] mr-1 leading-none font-helvetica pb-[1px]">X</span>
                                                     <div className="flex-1 border-b border-slate-900"></div>
                                                 </div>
                                                 <span className="text-[8px] font-semibold text-slate-700 self-start ml-4 leading-none mt-0.5">{f.name || 'Signer'}</span>
                                             </div>
                                           )}
                                        </div>
                                    ) : (
                                        <div className="relative w-full h-[50px]">
                                           <div className={cn("absolute inset-0 pointer-events-none rounded flex flex-col items-center justify-start pt-2 backdrop-blur-[1px]", f.isBurned ? "bg-cyan-500/0 transparent" : "bg-cyan-500/5 text-cyan-700/80")}>
                                              {!f.isBurned && <div className="text-[12px] font-black tracking-widest leading-none mb-1">SIGN HERE</div>}
                                           </div>
                                           {showB && !f.isBurned && (
                                             <div className="absolute bottom-2 left-2 right-2 pointer-events-none flex flex-col opacity-80 z-0">
                                                 <div className="flex items-end">
                                                     <span className="text-[12px] font-bold text-[#004e80] mr-1 leading-none font-helvetica pb-[1px]">X</span>
                                                     <div className="flex-1 border-b border-slate-900"></div>
                                                 </div>
                                                 <span className="text-[8px] font-semibold text-slate-700 self-start ml-4 leading-none mt-0.5">{f.name || 'Signer'}</span>
                                             </div>
                                           )}
                                        </div>
                                    )}
                            </div>
                         )})}
                         
                         {placementMode && <div className="absolute inset-0 bg-brand/5 pointer-events-none flex items-center justify-center"><div className="bg-slate-900 border border-brand/50 shadow-2xl shadow-brand/20 px-8 py-3 rounded-full text-[10px] font-black uppercase text-brand animate-pulse">Click Document to place</div></div>}
                      </div>
                    ))}
                 </div>
              </div>
            </motion.div>
          )}

          {stage === 'finalize' && (
            <motion.div key="finalize" className="max-w-4xl mx-auto mt-20 text-center relative z-10">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[150%] bg-emerald-500/10 blur-[150px] -z-10 rounded-full pointer-events-none"></div>
                <div className="w-24 h-24 bg-emerald-500/20 border border-emerald-500/30 rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 text-emerald-400 shadow-[0_10px_60px_-10px_rgba(16,185,129,0.5)] animate-bounce"><CheckCircle2 size={56} /></div>
                <h2 className="text-6xl font-black mb-10 text-transparent bg-clip-text bg-gradient-to-tr from-white to-slate-400 font-outfit tracking-tight drop-shadow-lg">Secured & Downloaded.</h2>
                <p className="text-slate-400 font-medium max-w-sm mx-auto mb-12">Your client-side document has been perfectly assembled without ever touching a server.</p>
                <button onClick={() => setStage('upload')} className="glass-button px-10 py-5 text-xs font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 hover:border-emerald-500/40 shadow-xl inline-flex items-center gap-3"><Plus size={16}/> Start New Document</button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
      {isDrawing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-slate-950/90 backdrop-blur-[60px]">
           <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="glass p-16 rounded-[4rem] w-full max-w-3xl bg-slate-900 border border-white/10 shadow-3xl">
              <div className="flex justify-between items-center mb-10"><div><h3 className="text-3xl font-bold text-white font-outfit">Signature</h3><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">{selectedId === 'base' ? 'Drawing your primary signature' : 'Filling recipient marker'}</p></div><button onClick={() => setIsDrawing(false)} className="text-slate-500 hover:text-white transition-all"><X size={36}/></button></div>
              <div className="bg-white rounded-[3.5rem] p-8 mb-10 shadow-3xl relative border-[8px] border-slate-950 group">
                 <div className="absolute inset-0 border-2 border-slate-200 border-dashed rounded-[2.8rem] m-2 pointer-events-none opacity-50" />
                 <canvas ref={sigCanvasRef} className="signature-canvas w-full h-80 touch-none cursor-crosshair relative z-10" />
              </div>
              <div className="flex gap-6"><button onClick={() => sigPadRef.current?.clear()} className="flex-1 py-5 text-[10px] font-black uppercase tracking-widest bg-white/5 text-slate-500 rounded-[2rem] hover:bg-white/10 hover:text-white transition-colors">Clear Pad</button><button onClick={saveSignature} className="flex-2 py-5 text-[10px] font-black uppercase tracking-widest bg-brand text-white rounded-[2rem] shadow-2xl shadow-brand/20 hover:scale-[1.02] active:scale-95 transition-all">Adopt & Place</button></div>
           </motion.div>
        </div>
      )}
      </AnimatePresence>
    </div>
  );
}

function getCroppedCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
  
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const alpha = data[(y * canvas.width + x) * 4 + 3];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  
  if (minX > maxX) return canvas;

  const padding = 10;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(canvas.width, maxX + padding);
  maxY = Math.min(canvas.height, maxY + padding);

  const croppedW = maxX - minX;
  const croppedH = maxY - minY;
  
  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = croppedW;
  croppedCanvas.height = croppedH;
  const croppedCtx = croppedCanvas.getContext('2d');
  if (croppedCtx) {
    croppedCtx.putImageData(ctx.getImageData(minX, minY, croppedW, croppedH), 0, 0);
  }
  return croppedCanvas;
}

function PdfPage({ pdfDoc, pageNumber }: { pdfDoc: any, pageNumber: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (!pdfDoc || !canvasRef.current) return;
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (!isMounted) return;
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current; if (!canvas) return;
        const context = canvas.getContext('2d'); if (!context) return;
        canvas.height = viewport.height; canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport: viewport }).promise;
      } catch (err) {}
    })();
    return () => { isMounted = false; };
  }, [pdfDoc, pageNumber]);
  return (<div className="bg-white shadow-[0_40px_80px_rgba(0,0,0,0.5)] relative overflow-hidden"><canvas ref={canvasRef} className="max-w-full h-auto" /></div>);
}