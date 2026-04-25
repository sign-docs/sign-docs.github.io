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
  isSigned?: boolean; // Track if we've filled this field
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
  fieldId?: string; // If this signature fills a specific field
}

// --- Main Component ---
export default function App() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [stage, setStage] = useState<'upload' | 'edit' | 'finalize'>('upload');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const [selectedId, setSelectedId] = useState<string | 'me' | null>(null);
  const [mySignatures, setMySignatures] = useState<SignatureData[]>([]); // Support multiple signatures
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [penWidth, setPenWidth] = useState(2.5);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const sigPadRef = useRef<SignaturePad | null>(null);

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [activeRecipientId, setActiveRecipientId] = useState<string | null>(null);
  const [placementMode, setPlacementMode] = useState<'mine' | 'other' | null>(null);

  // --- Handlers ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setError(null);
    setIsLoading(true);
    console.log("Loading file:", file.name);

    try {
      // Grab two completely separate array buffers from the File object
      // to ensure neither library detaches the buffer being used by the other
      const bufferForPdfJs = await file.arrayBuffer();
      const bufferForPdfLib = await file.arrayBuffer();

      // Load for Rendering (PDF.js)
      if (!(window as any).pdfjsLib) {
          throw new Error("PDF rendering engine (PDF.js) not found. Check your internet connection.");
      }
      
      const loadingTask = (window as any).pdfjsLib.getDocument({ data: bufferForPdfJs });
      const loadedDoc = await loadingTask.promise;
      console.log("PDF loaded, numPages:", loadedDoc.numPages);

      // Load for Metadata (pdf-lib)
      let existingFields: Recipient[] = [];
      try {
          const pdfLibDoc = await PDFDocument.load(bufferForPdfLib, { ignoreEncryption: true });
          const keywords = pdfLibDoc.getKeywords();
          if (keywords && keywords.includes('SIGNFLOW:')) {
              const jsonPart = keywords.split('SIGNFLOW:')[1];
              existingFields = JSON.parse(jsonPart);
              console.log("Metadata detected:", existingFields);
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
      console.error("Upload error:", err);
      setError(err.message || "Failed to load PDF.");
    } finally {
      setIsLoading(false);
    }
  };

  const startDrawing = (targetFieldId?: string) => {
    setSelectedId(targetFieldId || 'me');
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
          velocityFilterWeight: 0.7, // Smoother strokes
          minWidth: penWidth * 0.5,
          maxWidth: penWidth * 1.5,
        });
      }
    }, 200);
  };

  const saveSignature = () => {
    if (sigPadRef.current && !sigPadRef.current.isEmpty()) {
      const dataUrl = sigPadRef.current.toDataURL();
      
      // Current selected field or "Me"
      if (selectedId && selectedId !== 'me') {
          // Fill an existing field
          const field = recipients.flatMap(r => r.fields).find(f => f.id === selectedId);
          if (field) {
              const newSig: SignatureData = {
                  dataUrl,
                  x: field.x,
                  y: field.y,
                  width: 150,
                  pageIndex: field.pageIndex,
                  fieldId: field.id
              };
              setMySignatures([...mySignatures, newSig]);
              // Mark field as "isSigned" so we don't draw the X line anymore
              setRecipients(recipients.map(r => ({
                  ...r,
                  fields: r.fields.map(f => f.id === selectedId ? { ...f, isSigned: true } : f)
              })));
          }
      } else {
          // Create new standalone signature
          const newSig: SignatureData = { dataUrl, x: 0.5, y: 0.5, width: 160, pageIndex: 0 };
          setMySignatures([...mySignatures, newSig]);
          setPlacementMode('mine');
      }
      setIsDrawing(false);
    }
  };

  const addRecipient = () => {
    const newRecipient: Recipient = { id: crypto.randomUUID(), name: '', email: '', fields: [] };
    setRecipients([...recipients, newRecipient]);
    setActiveRecipientId(newRecipient.id);
  };


  const handlePageClick = (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (!placementMode) {
      setSelectedId(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    if (placementMode === 'mine') {
      const lastIdx = mySignatures.length - 1;
      if (lastIdx >= 0) {
          const updatedSignatures = [...mySignatures];
          updatedSignatures[lastIdx] = { ...updatedSignatures[lastIdx], x, y, pageIndex };
          setMySignatures(updatedSignatures);
      }
      setPlacementMode(null);
    } else if (placementMode === 'other' && activeRecipientId) {
      const fieldId = crypto.randomUUID();
      setRecipients(recipients.map(r => {
        if (r.id === activeRecipientId) {
          return { ...r, fields: [...r.fields, { id: fieldId, x, y, pageIndex }] };
        }
        return r;
      }));
      setPlacementMode(null);
      setSelectedId(fieldId);
    }
  };

  const generateFinalPdf = async () => {
    if (!pdfFile) return;
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdfLibDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const helveticaFont = await pdfLibDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfLibDoc.getPages();
    
    // 1. Embed Signatures
    for (const sig of mySignatures) {
      const image = await pdfLibDoc.embedPng(sig.dataUrl);
      const page = pages[sig.pageIndex];
      const { width, height } = page.getSize();
      const imgWidth = sig.width;
      const imgHeight = (image.height / image.width) * imgWidth;
      
      // If filling a field, we "remove" the placeholder by drawing a white box first
      if (sig.fieldId) {
          page.drawRectangle({
              x: sig.x * width - 70,
              y: (1 - sig.y) * height - 25,
              width: 140, height: 50,
              color: rgb(1, 1, 1), opacity: 1
          });
      }

      page.drawImage(image, {
        x: sig.x * width - (imgWidth / 2),
        y: (1 - sig.y) * height - (imgHeight / 2),
        width: imgWidth, height: imgHeight,
      });
    }

    // 2. Embed Placeholder Lines (X _______) for UN-SIGNED fields
    for (const rec of recipients) {
      for (const field of rec.fields) {
        if (field.isSigned) continue;
        
        const page = pages[field.pageIndex];
        const { width, height } = page.getSize();
        const markerX = field.x * width;
        const markerY = (1 - field.y) * height;

        page.drawText('X', { x: markerX - 60, y: markerY - 3, size: 14, font: helveticaFont, color: rgb(0.1, 0.1, 0.1) });
        page.drawLine({
            start: { x: markerX - 45, y: markerY - 6 },
            end: { x: markerX + 75, y: markerY - 6 },
            thickness: 1, color: rgb(0.2, 0.2, 0.2)
        });
        page.drawText(`${rec.name || 'Signer'}`, { x: markerX - 45, y: markerY - 18, size: 7, font: helveticaFont, color: rgb(0.4, 0.4, 0.4) });
      }
    }

    // Embed Metadata
    pdfLibDoc.setKeywords([`SIGNFLOW:${JSON.stringify(recipients)}`]);
    
    const pdfBytes = await pdfLibDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `signflow_${pdfFile.name}`; link.click();
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
            <motion.div key="upload" className="max-w-3xl mx-auto mt-20 text-center">
              <h2 className="text-6xl font-bold mb-8 font-outfit text-white tracking-tight leading-none">Your Private <br/><span className="text-brand">Signature Studio.</span></h2>
              <div className="glass p-20 rounded-[4rem] border border-white/5 bg-slate-900/40 relative group shadow-3xl">
                {isLoading && <div className="absolute inset-0 z-20 bg-slate-950/80 backdrop-blur flex flex-col items-center justify-center border border-white/5 rounded-[4rem]"><div className="w-16 h-16 border-4 border-brand border-t-transparent rounded-full animate-spin mb-6" /><p className="text-brand font-bold uppercase tracking-widest text-xs">Analyzing PDF...</p></div>}
                {error && <div className="mb-10 p-5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-500 text-sm"><AlertCircle size={20} /> {error}</div>}
                <div className="w-24 h-24 bg-slate-800 rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 border border-white/10 group-hover:scale-110 transition-transform"><Upload className="text-brand" size={40} /></div>
                <label className="btn-primary inline-flex items-center gap-4 cursor-pointer py-5 px-12 text-lg font-bold shadow-2xl shadow-brand/20 hover:scale-105 transition-transform"><Plus size={24} /> Choose Document<input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} /></label>
              </div>
            </motion.div>
          )}

          {stage === 'edit' && (
            <motion.div key="edit" className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              <aside className="lg:col-span-3 space-y-8">
                
                <section className="glass rounded-[2rem] bg-slate-900/40 border border-white/5 overflow-hidden">
                  <div className="px-8 py-5 border-b border-white/5 text-[10px] font-black uppercase text-slate-500 bg-white/[0.01]">My Signature</div>
                  <div className="p-8 space-y-6">
                    <button onClick={() => startDrawing()} className="w-full py-4 bg-brand/10 text-brand border border-brand/20 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-brand hover:text-white transition-all shadow-lg shadow-brand/5">Create New Signature</button>
                    <div className="space-y-4">
                        {mySignatures.map((sig, idx) => (
                           <div key={idx} className="bg-white p-4 rounded-3xl h-32 flex items-center justify-center relative border-2 border-white/5 group hover:border-brand/40 transition-all cursor-pointer">
                              <img src={sig.dataUrl} className="max-h-full mix-blend-multiply" />
                              <button onClick={() => setMySignatures(mySignatures.filter((_, i) => i !== idx))} className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-xl shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12}/></button>
                           </div>
                        ))}
                    </div>
                  </div>
                </section>

                <section className="glass rounded-[2rem] bg-slate-900/40 border border-white/5 overflow-hidden">
                   <div className="px-8 py-5 border-b border-white/5 text-[10px] font-black uppercase text-slate-500 bg-white/[0.01]">Recipient Workflow</div>
                   <div className="p-8 space-y-5">
                      {recipients.map(rec => (
                        <div key={rec.id} className="p-6 bg-white/[0.02] border border-white/5 rounded-3xl">
                           <input type="text" placeholder="Signer Name" value={rec.name} onChange={(e) => setRecipients(recipients.map(r => r.id === rec.id ? { ...r, name: e.target.value } : r))} className="bg-slate-950/50 border border-white/5 rounded-2xl px-4 py-3 text-xs w-full text-white outline-none mb-4 focus:border-brand" />
                           <div className="flex flex-wrap gap-2">
                             {rec.fields.map((f, idx) => <button key={f.id} onClick={() => setSelectedId(f.id)} className={cn("text-[9px] px-3 py-1.5 rounded-xl border font-black uppercase tracking-widest transition-all", selectedId === f.id ? "bg-brand border-brand text-white" : "text-slate-600 border-white/5")}>Mark {idx+1}</button>)}
                             <button onClick={() => { setActiveRecipientId(rec.id); setPlacementMode('other'); }} className="text-[10px] font-black border border-dashed border-white/10 px-4 py-2 rounded-xl text-slate-500 hover:text-brand hover:border-brand transition-all">+ Marker</button>
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
                      <div key={i} className="pdf-page-container relative group/page" onClick={(e) => handlePageClick(i, e)} style={{ cursor: placementMode ? 'crosshair' : 'default' }}>
                         <PdfPage pdfDoc={pdfDoc} pageNumber={i + 1} />
                         
                         {/* My Signatures */}
                         {mySignatures.filter(s => s.pageIndex === i).map((sig, idx) => (
                             <div key={idx} className="absolute border-2 border-brand/40 bg-white/10 shadow-2xl flex items-center justify-center" style={{ left: `${sig.x * 100}%`, top: `${sig.y * 100}%`, width: `${sig.width}px`, height: 'auto', aspectRatio: '5/2', transform: 'translate(-50%, -50%)', zIndex: 30 }}>
                               <img src={sig.dataUrl} className="max-h-full mix-blend-multiply" alt="signed" />
                               <button onClick={(e) => { e.stopPropagation(); setMySignatures(mySignatures.filter(s => s !== sig)); }} className="absolute -top-3 -right-3 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg"><X size={16}/></button>
                             </div>
                         ))}

                         {/* Markers (X _______) */}
                         {recipients.flatMap(r => r.fields.map(f => ({ ...f, name: r.name }))).filter(f => f.pageIndex === i).map(f => (
                            <div 
                                key={f.id} 
                                onClick={(e) => { e.stopPropagation(); if(f.isSigned) return; startDrawing(f.id); }}
                                className={cn(
                                    "absolute border-2 transition-all flex flex-col items-center justify-center bg-cyan-400/5 cursor-pointer group/field",
                                    selectedId === f.id ? "border-brand shadow-xl z-20" : "border-cyan-400/20 z-10",
                                    f.isSigned && "opacity-0 pointer-events-none" // Hide marker if signed locally
                                )} 
                                style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: '130px', height: '50px', transform: 'translate(-50%, -50%)' }}
                            >
                               <div className="pointer-events-none text-slate-800 text-left w-full px-2">
                                  <div className="flex items-baseline gap-1"><span className="text-xl font-serif">X</span> <div className="flex-1 border-b border-slate-500"></div></div>
                                  <div className="text-[7px] text-slate-500 uppercase mt-1 font-bold">Sign: {f.name || 'Recipient'}</div>
                               </div>
                               <button onClick={(e) => { e.stopPropagation(); removeField(f.id); }} className="absolute -top-3 -right-3 w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover/field:opacity-100 transition-opacity"><Trash2 size={16}/></button>
                            </div>
                         ))}
                         
                         {placementMode && <div className="absolute inset-0 bg-brand/5 pointer-events-none flex items-center justify-center"><div className="bg-slate-900 border border-brand/50 px-8 py-3 rounded-full text-[10px] font-black uppercase text-brand animate-pulse">Click Document to place</div></div>}
                      </div>
                    ))}
                 </div>
              </div>
            </motion.div>
          )}

          {stage === 'finalize' && (
            <motion.div key="finalize" className="max-w-4xl mx-auto mt-20 text-center">
                <div className="w-24 h-24 bg-emerald-500/10 rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 text-emerald-500 shadow-3xl"><CheckCircle2 size={56} /></div>
                <h2 className="text-5xl font-bold mb-6 text-white font-outfit">Ready to share!</h2>
                <button onClick={() => setStage('upload')} className="btn-secondary px-8 py-4 text-xs font-bold uppercase tracking-widest">New Document</button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
      {isDrawing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-slate-950/90 backdrop-blur-[60px]">
           <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="glass p-16 rounded-[4rem] w-full max-w-3xl bg-slate-900 border border-white/10 shadow-3xl">
              <div className="flex justify-between items-center mb-10"><div><h3 className="text-3xl font-bold text-white font-outfit">Signature</h3><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">{selectedId === 'me' ? 'Drawing standalone signature' : 'Filling recipient marker'}</p></div><button onClick={() => setIsDrawing(false)} className="text-slate-500 hover:text-white transition-all"><X size={36}/></button></div>
              <div className="bg-white rounded-[3.5rem] p-8 mb-10 shadow-3xl relative"><canvas ref={sigCanvasRef} className="signature-canvas w-full h-80 touch-none cursor-crosshair" /></div>
              <div className="flex gap-6"><button onClick={() => sigPadRef.current?.clear()} className="flex-1 py-5 text-[10px] font-black uppercase tracking-widest bg-white/5 text-slate-500 rounded-[2rem]">Reset</button><button onClick={saveSignature} className="flex-2 py-5 text-[10px] font-black uppercase tracking-widest bg-brand text-white rounded-[2rem] shadow-xl">Adopt & Place</button></div>
           </motion.div>
        </div>
      )}
      </AnimatePresence>
    </div>
  );
}

function updateRecipient(id: string, updates: Partial<Recipient>, recipients: Recipient[], setRecipients: (rs: Recipient[]) => void) {
    setRecipients(recipients.map(r => r.id === id ? { ...r, ...updates } : r));
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