declare module 'pdf-parse/lib/pdf-parse.js' {
  type PdfParseFn = (
    buffer: Buffer,
    options?: unknown
  ) => Promise<{ text?: string } & Record<string, unknown>>;
  const pdfParse: PdfParseFn;
  export default pdfParse;
}
