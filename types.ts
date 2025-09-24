
import { jsPDF } from 'jspdf';

declare global {
  interface Window {
    pdfjsLib: any;
    jspdf: { 
        jsPDF: typeof jsPDF 
    };
  }
}

export interface Signature {
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageIndex: number; // 0-based index
}

export interface DocumentPage {
  dataUrl: string;
  width: number; // Original width in points
  height: number; // Original height in points
}
