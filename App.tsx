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

// --- Main Component ---
export default function App() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [stage, setStage] = useState<'upload' | 'edit' | 'finalize'>('upload');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const [selectedId, setSelectedId] = useState<string | 'me' | null>(null);
  const [mySignature, setMySignature] = useState<SignatureData | null>(null);
  const [myName, setMyName] = useState('Stan Chen'); // Default for primary signer
  
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
              existingFields = JSON.parse(jsonPart);
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
      
      if (selectedId && selectedId !== 'me') {
          // Fill a specific recipient field
          setRecipients(recipients.map(r => ({
              ...r,
              fields: r.fields.map(f => f.id === selectedId ? { ...f, isSigned: true, filledDataUrl: dataUrl } : f)
          })));
      } else {
          // Create standalone signature and enter placement mode
          setMySignature(prev => prev ? { ...prev, dataUrl } : { dataUrl, x: 0.5, y: 0.5, width: 160, pageIndex: 0 });
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

    if (placementMode === 'mine' && mySignature) {
      setMySignature({ ...mySignature, x, y, pageIndex });
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
              return { ...r, fields: [...r.fields, { id: fieldId, x, y, pageIndex }] };
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
    
    // 1. Embed My Standalone Signature
    if (mySignature) {
      const image = await pdfLibDoc.embedPng(mySignature.dataUrl);
      const page = pages[mySignature.pageIndex];
      const { width, height } = page.getSize();
      const imgWidth = mySignature.width;
      const imgHeight = (image.height / image.width) * imgWidth;
      
      const sigX = mySignature.x * width;
      const sigY = (1 - mySignature.y) * height;
      const startX = sigX - (imgWidth / 2) + 10;
      const endX = sigX + (imgWidth / 2) - 10;
      const baselineY = sigY - (imgHeight / 2) + 2; // Render underline slightly above true bottom boundary

      page.drawText('X', { x: startX, y: baselineY + 2, size: 8, font: helveticaFont, color: rgb(0.0, 0.3, 0.5) }); // Professional dark blue
      page.drawLine({
          start: { x: startX + 10, y: baselineY },
          end: { x: endX, y: baselineY },
          thickness: 0.5, color: rgb(0.1, 0.1, 0.1) // crisp black line
      });
      page.drawText(`${myName || 'Signer'}`, { x: startX + 10, y: baselineY - 8, size: 6, font: helveticaFont, color: rgb(0.3, 0.3, 0.3) });

      page.drawImage(image, {
        x: sigX - (imgWidth / 2),
        y: sigY - (imgHeight / 2),
        width: imgWidth, height: imgHeight,
      });
    }

    // 2. Embed Recipient Fields & Filled Signatures
    for (const rec of recipients) {
      for (const field of rec.fields) {
        const page = pages[field.pageIndex];
        const { width, height } = page.getSize();
        const markerX = field.x * width;
        const markerY = (1 - field.y) * height;

        if (field.isSigned && field.filledDataUrl) {
            page.drawRectangle({
                x: markerX - 70, y: markerY - 25,
                width: 140, height: 50,
                color: rgb(1, 1, 1), opacity: 1
            });
            
            const baselineY = markerY - 20; // Sit perfectly near the bottom of the 50px boundary
            page.drawText('X', { x: markerX - 45, y: baselineY + 2, size: 8, font: helveticaFont, color: rgb(0.0, 0.3, 0.5) });
            page.drawLine({
                start: { x: markerX - 35, y: baselineY },
                end: { x: markerX + 65, y: baselineY },
                thickness: 0.5, color: rgb(0.1, 0.1, 0.1)
            });
            page.drawText(`${rec.name || 'Signer'}`, { x: markerX - 35, y: baselineY - 8, size: 6, font: helveticaFont, color: rgb(0.3, 0.3, 0.3) });

            const image = await pdfLibDoc.embedPng(field.filledDataUrl);
            const imgWidth = 130; 
            const imgHeight = (image.height / image.width) * imgWidth;
            page.drawImage(image, {
              x: markerX - (imgWidth / 2),
              y: markerY - (imgHeight / 2) + 2, // Slightly levitate the ink so it sits nicely near the line
              width: imgWidth, height: imgHeight,
            });
        } else {
            const baselineY = markerY - 20;
            page.drawText('X', { x: markerX - 45, y: baselineY + 2, size: 8, font: helveticaFont, color: rgb(0.0, 0.3, 0.5) });
            page.drawLine({
                start: { x: markerX - 35, y: baselineY },
                end: { x: markerX + 65, y: baselineY },
                thickness: 0.5, color: rgb(0.1, 0.1, 0.1)
            });
            page.drawText(`${rec.name || 'Signer'}`, { x: markerX - 35, y: baselineY - 8, size: 6, font: helveticaFont, color: rgb(0.3, 0.3, 0.3) });
        }
      }
    }

    // Strip filledDataUrls out of Metadata for privacy/size before embedding
    const cleanRecipients = recipients.map(r => ({
       ...r, fields: r.fields.map(f => ({ id: f.id, x: f.x, y: f.y, pageIndex: f.pageIndex, isSigned: f.isSigned }))
    }));
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
                
                <section className="glass rounded-[2rem] bg-slate-900/40 border border-white/5 overflow-hidden shadow-xl">
                  <div className="px-8 py-5 border-b border-white/5 text-[10px] font-black uppercase text-slate-500 bg-white/[0.01]">My Signature</div>
                  <div className="p-8 space-y-6">
                    <input type="text" placeholder="Your Name" value={myName} onChange={(e) => setMyName(e.target.value)} className="bg-slate-950/50 border border-white/5 rounded-2xl px-4 py-3 text-xs w-full text-white outline-none focus:border-brand" />
                    
                    {!mySignature ? (
                      <button onClick={() => startDrawing()} className="w-full aspect-[4/3] border-2 border-dashed border-white/10 rounded-[2rem] flex flex-col items-center justify-center gap-3 hover:border-brand/40 text-slate-500 hover:text-brand hover:bg-brand/5 transition-all">
                        <Plus size={24} /> Create Signature
                      </button>
                    ) : (
                      <div className="space-y-4">
                        <div onClick={() => setPlacementMode('mine')} className="bg-white p-4 rounded-[2rem] h-40 flex items-center justify-center relative shadow-inner border-2 border-transparent hover:border-brand/40 transition-all cursor-pointer">
                          <img src={mySignature.dataUrl} className="max-h-full mix-blend-multiply" />
                          <div className="absolute inset-0 bg-brand/5 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity uppercase text-[10px] font-black text-brand tracking-widest">Click to Relocate</div>
                        </div>
                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Scaling</label>
                           <input type="range" min="80" max="450" value={mySignature.width} onChange={(e) => setMySignature({...mySignature, width: parseInt(e.target.value)})} className="w-full accent-brand h-1 bg-white/5 rounded-lg appearance-none cursor-pointer" />
                        </div>
                        <div className="flex gap-3">
                           <button onClick={() => setPlacementMode('mine')} className="flex-1 py-3 bg-brand/10 text-brand rounded-2xl text-[10px] font-black tracking-widest uppercase hover:bg-brand hover:text-white transition-colors border border-brand/20">Reposition</button>
                           <button onClick={() => setMySignature(null)} className="px-5 bg-red-500/10 text-red-500 border border-red-500/10 rounded-2xl hover:bg-red-500 hover:text-white transition-all"><Trash2 size={16}/></button>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                <section className="glass rounded-[2rem] bg-slate-900/40 border border-white/5 overflow-hidden">
                   <div className="px-8 py-5 border-b border-white/5 text-[10px] font-black uppercase text-slate-500 bg-white/[0.01]">Recipient Workflow</div>
                   <div className="p-8 space-y-5">
                      {recipients.map(rec => (
                        <div key={rec.id} className="p-6 bg-white/[0.02] border border-white/5 rounded-3xl">
                           <input type="text" placeholder="Signer Name" value={rec.name} onChange={(e) => setRecipients(recipients.map(r => r.id === rec.id ? { ...r, name: e.target.value } : r))} className="bg-slate-950/50 border border-white/5 rounded-2xl px-4 py-3 text-xs w-full text-white outline-none mb-4 focus:border-brand" />
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
                      <div key={i} className="pdf-page-container relative group/page transition-all duration-700" onClick={(e) => handlePageClick(i, e)} style={{ cursor: placementMode ? 'crosshair' : 'default' }}>
                         <div className={cn("transition-all duration-700", placementMode ? "blur-[2px] opacity-80 hover:blur-0 hover:opacity-100" : "")}>
                           <PdfPage pdfDoc={pdfDoc} pageNumber={i + 1} />
                         </div>
                         
                         {/* My Signature */}
                         {mySignature?.pageIndex === i && (
                             <div 
                               onClick={(e) => { e.stopPropagation(); setPlacementMode('mine'); }}
                               className={cn(
                                 "absolute border-2 transition-all flex items-center justify-center cursor-pointer group/sig z-30",
                                 placementMode === 'mine' ? "border-brand ring-[12px] ring-brand/5 scale-110 bg-white/10 blur-[1px]" : "border-transparent hover:border-brand/40"
                               )}
                               style={{ left: `${mySignature.x * 100}%`, top: `${mySignature.y * 100}%`, width: `${mySignature.width}px`, transform: 'translate(-50%, -50%)' }}
                              >
                               <img src={mySignature.dataUrl} className="w-full h-auto mix-blend-multiply" alt="signed" />
                               <button onClick={(e) => { e.stopPropagation(); setMySignature(null); }} className="absolute -top-4 -right-4 w-9 h-9 bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover/sig:opacity-100 transition-opacity"><Trash2 size={16}/></button>
                             </div>
                         )}

                         {/* Markers (X _______) */}
                         {recipients.flatMap(r => r.fields.map(f => ({ ...f, name: r.name, recipientId: r.id }))).filter(f => f.pageIndex === i).map(f => (
                            <div 
                                key={f.id} 
                                onClick={(e) => { e.stopPropagation(); setSelectedId(f.id); }}
                                className={cn(
                                    "absolute border-2 transition-all flex flex-col items-center justify-center bg-cyan-400/5 group/field",
                                    selectedId === f.id ? "border-brand shadow-xl z-40 bg-brand/5" : "border-cyan-400/20 z-10",
                                    "cursor-pointer"
                                )} 
                                style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: '130px', height: '50px', transform: 'translate(-50%, -50%)' }}
                            >
                               {selectedId === f.id && (
                                   <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-1 flex gap-1 z-50">
                                       {!f.isSigned && (
                                          <button onClick={(e) => { e.stopPropagation(); startDrawing(f.id); }} className="px-3 py-1.5 text-[8px] font-black uppercase text-brand hover:bg-brand/10 rounded-lg whitespace-nowrap">Sign Field</button>
                                       )}
                                       {f.isSigned && (
                                          <button onClick={(e) => {
                                              e.stopPropagation();
                                              setRecipients(recipients.map(r => ({...r, fields: r.fields.map(fld => fld.id === f.id ? {...fld, isSigned: false, filledDataUrl: undefined } : fld)})))
                                          }} className="px-3 py-1.5 text-[8px] font-black uppercase text-orange-400 hover:bg-orange-400/10 rounded-lg whitespace-nowrap">Clear Sig</button>
                                       )}
                                       <button onClick={(e) => { 
                                          e.stopPropagation(); 
                                          setActiveRecipientId(f.recipientId); 
                                          setPlacementMode('other'); 
                                       }} className="px-3 py-1.5 text-[8px] font-black uppercase text-white hover:bg-white/10 rounded-lg whitespace-nowrap">Move</button>
                                   </div>
                               )}
                               
                               {f.isSigned && f.filledDataUrl ? (
                                   <img src={f.filledDataUrl} className="w-[130px] h-auto mix-blend-multiply" alt="filled signature" />
                               ) : (
                                   <div className="pointer-events-none w-full h-full bg-cyan-500/10 border border-cyan-500/40 rounded flex flex-col items-center justify-center backdrop-blur-[2px]">
                                      <div className="text-[11px] text-cyan-600 uppercase font-black tracking-widest leading-none mb-1">Sign Here</div>
                                      <div className="text-[7px] text-cyan-600/70 font-bold uppercase truncate max-w-[90%]">{f.name || 'Recipient'}</div>
                                   </div>
                               )}
                               <button onClick={(e) => { e.stopPropagation(); removeField(f.id); }} className="absolute -bottom-4 right-0 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover/field:opacity-100 transition-opacity"><Trash2 size={12}/></button>
                            </div>
                         ))}
                         
                         {placementMode && <div className="absolute inset-0 bg-brand/5 pointer-events-none flex items-center justify-center"><div className="bg-slate-900 border border-brand/50 shadow-2xl shadow-brand/20 px-8 py-3 rounded-full text-[10px] font-black uppercase text-brand animate-pulse">Click Document to place</div></div>}
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
                <button onClick={() => setStage('upload')} className="btn-secondary px-8 py-4 text-xs font-bold uppercase tracking-widest bg-white/5 hover:bg-white/10 rounded-2xl transition-colors">Start New Document</button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
      {isDrawing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-slate-950/90 backdrop-blur-[60px]">
           <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="glass p-16 rounded-[4rem] w-full max-w-3xl bg-slate-900 border border-white/10 shadow-3xl">
              <div className="flex justify-between items-center mb-10"><div><h3 className="text-3xl font-bold text-white font-outfit">Signature</h3><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">{selectedId === 'me' ? 'Drawing your primary signature' : 'Filling recipient marker'}</p></div><button onClick={() => setIsDrawing(false)} className="text-slate-500 hover:text-white transition-all"><X size={36}/></button></div>
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