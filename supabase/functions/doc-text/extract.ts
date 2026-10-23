// Text extraction for doc-text: PDFs page by page (pdf.js, via unpdf), Word and PowerPoint files from their XML.
import { getDocumentProxy } from "npm:unpdf@1.8.1";
import { strFromU8, unzipSync } from "npm:fflate@0.8.2";

export const BUDGET_MS = 900;      // page reading per call; download and parsing come on top, well inside the 2s CPU limit
export const MAX_PAGES = 80;       // per call
export const PART_WORDS = 2500;    // Word documents are stored in parts of about this many words

// ------------------------------------------------------------------ text clean-up
export function clean(s: string) {
  return s.normalize("NFKC")                                  // ligatures (ﬁ -> fi), non-breaking spaces
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD\uE000-\uF8FF]/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/([a-z])-\n([a-z])/g, "$1$2")                    // words hyphenated across a line break
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ------------------------------------------------------------------ PDF: one row per page
type Item = { str?: string; hasEOL?: boolean };
export function pageText(items: Item[]) {
  let s = "";
  for (const it of items) {
    if (typeof it.str !== "string") continue;
    s += it.str;
    if (it.hasEOL) s += "\n";
  }
  return clean(s);
}

export async function pdfChunk(buf: Uint8Array, from: number, careful: boolean) {
  const pdf = await getDocumentProxy(buf);
  const total = pdf.numPages;
  const pages: { p: number; t: string }[] = [];
  const t0 = performance.now();
  let p = Math.max(1, from);
  const limit = careful ? 1 : MAX_PAGES;
  while (p <= total && pages.length < limit) {
    let t = "";
    try {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      t = pageText(tc.items as Item[]);
      page.cleanup();
    } catch (_e) { t = ""; }                                  // a damaged page is left out, the rest is read
    pages.push({ p, t });
    p++;
    if (performance.now() - t0 > BUDGET_MS) break;
  }
  try { await pdf.destroy(); } catch (_e) { /* ignore */ }
  return { total, next: p, pages };
}

// ------------------------------------------------------------------ Word / PowerPoint (Office Open XML)
const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e.toLowerCase()] ?? m));

export function wordXmlText(xml: string) {
  return decode(xml
    .replace(/<w:(instrText|delText)\b[^>]*>[\s\S]*?<\/w:\1>/g, "")   // field codes and deleted (tracked) text
    .replace(/<w:tab\/>/g, "\t").replace(/<w:(br|cr)\b[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n").replace(/<\/w:tc>/g, "\t")
    .replace(/<[^>]+>/g, ""));
}
export function drawingXmlText(xml: string) {
  return decode(xml.replace(/<a:br\b[^>]*\/>/g, "\n").replace(/<\/a:p>/g, "\n").replace(/<[^>]+>/g, ""));
}

// Word: the body (plus footnotes / endnotes) cut into parts at paragraph breaks
export function docxParts(buf: Uint8Array) {
  const want = /^word\/(document|footnotes|endnotes)\.xml$/;
  const files = unzipSync(buf, { filter: (f) => want.test(f.name) });
  if (!files["word/document.xml"]) throw new Error("not a Word document (no word/document.xml)");
  const text = ["word/document.xml", "word/footnotes.xml", "word/endnotes.xml"].filter((n) => files[n])
    .map((n) => wordXmlText(strFromU8(files[n]))).join("\n");
  const paras = text.split("\n");
  const parts: string[] = [];
  let cur: string[] = [], words = 0;
  for (const para of paras) {
    cur.push(para);
    words += para.split(/\s+/).filter(Boolean).length;
    if (words >= PART_WORDS) { parts.push(cur.join("\n")); cur = []; words = 0; }
  }
  if (cur.join("").trim()) parts.push(cur.join("\n"));
  return parts.map((t, i) => ({ p: i + 1, t: clean(t) }));
}

// PowerPoint: one row per slide (slide numbers kept), with the speaker notes
export function pptxSlides(buf: Uint8Array) {
  const files = unzipSync(buf, { filter: (f) => /^ppt\/(slides|notesSlides)\/(slide|notesSlide)\d+\.xml$/.test(f.name) });
  const nums = Object.keys(files).map((n) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(n)).filter(Boolean).map((m) => +m![1]).sort((a, b) => a - b);
  if (!nums.length) throw new Error("not a PowerPoint file (no slides)");
  return nums.map((n) => {
    const notes = files[`ppt/notesSlides/notesSlide${n}.xml`];
    return { p: n, t: clean(drawingXmlText(strFromU8(files[`ppt/slides/slide${n}.xml`])) + (notes ? "\n" + drawingXmlText(strFromU8(notes)) : "")) };
  });
}

