declare module "pdfkit" {
  import { Readable } from "stream";

  interface PDFDocumentOptions {
    size?: [number, number] | string;
    margins?: { top: number; bottom: number; left: number; right: number };
    info?: {
      Title?: string;
      Author?: string;
      Subject?: string;
    };
    autoFirstPage?: boolean;
  }

  interface ImageOpenResult {
    width: number;
    height: number;
  }

  class PDFDocument extends Readable {
    constructor(options?: PDFDocumentOptions);
    addPage(options?: PDFDocumentOptions): this;
    end(): void;
    save(): this;
    restore(): this;
    rect(x: number, y: number, w: number, h: number): this;
    roundedRect(x: number, y: number, w: number, h: number, r: number): this;
    circle(x: number, y: number, r: number): this;
    fill(color: string): this;
    stroke(): this;
    clip(): this;
    path(d: string): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): this;
    closePath(): this;
    dash(length: number, options?: { space?: number }): this;
    undash(): this;
    strokeColor(color: string): this;
    lineWidth(w: number): this;
    fillColor(color: string): this;
    fontSize(size: number): this;
    font(name: string): this;
    text(text: string, x?: number, y?: number, options?: Record<string, unknown>): this;
    heightOfString(text: string, options?: Record<string, unknown>): number;
    image(src: Buffer | string, x?: number, y?: number, options?: Record<string, unknown>): this;
    openImage(src: Buffer | string): ImageOpenResult;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  export = PDFDocument;
}
