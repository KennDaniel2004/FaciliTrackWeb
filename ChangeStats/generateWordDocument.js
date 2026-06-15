/* =============================================
   FaciliTrack – generateWordDocument()
   Produces a proper .docx matching the official
   ISUFST "Request Form for University Facilities"
   ============================================= */

import { HEADER_BASE64 } from './headerBase64.js';

// Image dimensions in PIXELS (docx.js JS API expects px, not EMU)
// 4.00 in × 96 dpi = 384 px wide
// 1.25 in × 96 dpi = 120 px tall
// Wider header: ~6.5 inches × 96 dpi = 624 px wide (fills A4 content area)
// Height scaled proportionally: original ratio 4:1.25 → 624:195
const HEADER_IMG_WIDTH_PX  = 624;
const HEADER_IMG_HEIGHT_PX = 195;

// Page geometry (A4, 1-inch margins) in twips — used by docx page props
const PAGE_W  = 11906;
const PAGE_H  = 16838;
const MARGIN  = 1440;

// ─────────────────────────────────────────────────────────────────────────────
// base64ToArrayBuffer — synchronous, no Promise wrapper needed
// ─────────────────────────────────────────────────────────────────────────────
function base64ToArrayBuffer(base64) {
  const b64 = base64.includes('base64,') ? base64.split('base64,')[1] : base64;
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// ─────────────────────────────────────────────────────────────────────────────
// loadDocxLibrary
// All external CDNs (jsdelivr, unpkg, cdnjs) are blocked on this network.
// Solution: ship docx-bundle.js alongside this file — it is a self-contained
// UMD bundle of docx@8.5.0 + FileSaver@2.0.5 that sets window.docx and
// window.saveAs with zero network requests.
// ─────────────────────────────────────────────────────────────────────────────
function loadDocxLibrary() {
  return new Promise((resolve, reject) => {
    // Already loaded — nothing to do
    if (typeof window.docx !== 'undefined') { resolve(); return; }

    const script    = document.createElement('script');
    // Resolve the bundle path relative to this module's own URL so it works
    // regardless of where the app is deployed.
    const moduleURL = import.meta.url;                        // e.g. .../ChangeStats/generateWordDocument.js
    const bundleURL = moduleURL.replace(/\/[^/]+$/, '/docx-bundle.js');
    script.src      = bundleURL;
    script.onload   = resolve;
    script.onerror  = () => reject(new Error(
      'Could not load docx-bundle.js. ' +
      'Make sure docx-bundle.js is in the same folder as generateWordDocument.js.'
    ));
    document.head.appendChild(script);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// generateWordDocument — main export
// ─────────────────────────────────────────────────────────────────────────────
export async function generateWordDocument(requestData) {
  console.log('Generating document for:', requestData);

  try {
    await loadDocxLibrary();
  } catch (err) {
    console.error('Library load failed:', err);
    alert(err.message);
    return;
  }

  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    ImageRun, Header, AlignmentType, BorderStyle, WidthType, ShadingType,
    VerticalAlign, UnderlineType
  } = window.docx;

  // ── Format date ─────────────────────────────────────────────────────────────
  let formattedDate = '';
  if (requestData.date) {
    try {
      formattedDate = new Date(requestData.date)
        .toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        .toUpperCase();
    } catch (_) { formattedDate = requestData.date; }
  }

  const userName = (requestData._fullName  || requestData.fullname  || '___________________').trim();
  const userPos  = (requestData._position  || requestData.position  || 'Faculty').trim();
  const venue    = (requestData.venue      || '___________________').trim();
  const purpose  = (requestData.eventDescription || requestData.event || '').trim();

  // ── Border / cell helpers ────────────────────────────────────────────────────
  const sgl    = (sz = 4) => ({ style: BorderStyle.SINGLE, size: sz, color: '000000', space: 1 });
  const allBdr = { top: sgl(), bottom: sgl(), left: sgl(), right: sgl() };

  const cell = (text, width, opts = {}) => new TableCell({
    width:         { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    borders:       allBdr,
    shading:       opts.shade ? { fill: 'F0F0F0', type: ShadingType.CLEAR } : undefined,
    margins:       { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
      children:  [new TextRun({ text: String(text ?? ''), bold: !!opts.bold, size: opts.size || 20 })]
    })]
  });

  // ── Equipment table ──────────────────────────────────────────────────────────
  const COLS = [2826, 1500, 1100, 1800, 1800];

  let dataRows = [];
  if (requestData.item && requestData.item !== '—') {
    dataRows = requestData.item.split(',').map(i => i.trim()).filter(Boolean)
      .map(item => new TableRow({
        children: [
          cell(item,          COLS[0]),
          cell('',            COLS[1], { center: true }),
          cell('N/A',         COLS[2], { center: true }),
          cell(formattedDate, COLS[3], { center: true }),
          cell('',            COLS[4], { center: true })
        ]
      }));
  }
  if (!dataRows.length) {
    dataRows = [new TableRow({ children: COLS.map(w => cell('', w)) })];
  }

  const equipTable = new Table({
    width:        { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: COLS,
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          cell('Item Description', COLS[0], { bold: true, center: true, shade: true, size: 19 }),
          cell('Unit Measure',     COLS[1], { bold: true, center: true, shade: true, size: 19 }),
          cell('Quantity',         COLS[2], { bold: true, center: true, shade: true, size: 19 }),
          cell('Date Borrowed',    COLS[3], { bold: true, center: true, shade: true, size: 19 }),
          cell('Date Returned',    COLS[4], { bold: true, center: true, shade: true, size: 19 })
        ]
      }),
      ...dataRows
    ]
  });

  // ── Page header image ────────────────────────────────────────────────────────
  const pageHeader = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing:   { after: 80 },
        children: [
          new ImageRun({
            data: base64ToArrayBuffer(HEADER_BASE64),
            transformation: { width: HEADER_IMG_WIDTH_PX, height: HEADER_IMG_HEIGHT_PX },
            altText: { title: 'ISUFST Header', description: 'University header', name: 'header' }
          })
        ]
      })
    ]
  });

  // ── Assemble and download ────────────────────────────────────────────────────
  try {
    const doc = new Document({
      styles: {
        default: {
          document: {
            run:       { font: 'Times New Roman', size: 20 },
            paragraph: { spacing: { line: 240 } }
          }
        }
      },
      sections: [{
        properties: {
          page: {
            size:   { width: PAGE_W, height: PAGE_H },
            margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN }
          }
        },
        headers: { default: pageHeader, first: pageHeader, even: pageHeader },
        children: [

          // Title
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing:   { before: 120, after: 80 },
            children:  [new TextRun({ text: 'REQUEST FORM FOR UNIVERSITY FACILITIES', bold: true, size: 26 })]
          }),

          // For the use of:
          new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: 'For the use of:', bold: true })] }),

          // Facilities checkbox
          new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: '☒   Facilities', bold: true })] }),

          // Single blank space after Facilities
          new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: '' })] }),

          // Building/Venue + Date/Time — borderless 2-column table for reliable alignment
          new Table({
            width:        { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: [4500, 4526],
            borders: {
              top:             { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              bottom:          { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              left:            { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              right:           { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              insideHorizontal:{ style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              insideVertical:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            },
            rows: [
              // Label row
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 4500, type: WidthType.DXA },
                    borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
                    margins: { top: 40, bottom: 0, left: 400, right: 100 },
                    children: [new Paragraph({ children: [new TextRun({ text: 'Building/Venue', size: 20 })] })]
                  }),
                  new TableCell({
                    width: { size: 4526, type: WidthType.DXA },
                    borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
                    margins: { top: 40, bottom: 0, left: 100, right: 100 },
                    children: [new Paragraph({ children: [new TextRun({ text: 'Date/Time', size: 20 })] })]
                  }),
                ]
              }),
              // Value row
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 4500, type: WidthType.DXA },
                    borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
                    margins: { top: 0, bottom: 40, left: 400, right: 100 },
                    children: [new Paragraph({ children: [new TextRun({ text: venue, bold: true, underline: { type: UnderlineType.SINGLE } })] })]
                  }),
                  new TableCell({
                    width: { size: 4526, type: WidthType.DXA },
                    borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
                    margins: { top: 0, bottom: 40, left: 100, right: 100 },
                    children: [new Paragraph({ children: [new TextRun({ text: formattedDate, bold: true, underline: { type: UnderlineType.SINGLE } })] })]
                  }),
                ]
              }),
            ]
          }),

          new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: '' })] }),

          // Equipment checkbox
          new Paragraph({
            spacing:  { after: 60 },
            children: [new TextRun({
              text: (requestData.item && requestData.item !== '—') ? '☒   Equipment' : '☐   Equipment',
              bold: true
            })]
          }),

          // Single blank space after Equipment checkbox
          new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: '' })] }),

          equipTable,

          // Others
          new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: '☐   Others', bold: true })] }),


          // new Paragraph({
          //   spacing:  { after: 80 },
          //   children: [
          //     new TextRun({ text: 'Event Tittle:', bold: true }),
          //     new TextRun({ text: ' ' }),
          //     new TextRun({ text: purpose || '_________________________________________', underline: { type: UnderlineType.SINGLE } })
          //   ]
          // }),


          // Purpose
          new Paragraph({
            spacing:  { after: 80 },
            children: [
              new TextRun({ text: 'Purpose:', bold: true }),
              new TextRun({ text: ' ' }),
              new TextRun({ text: purpose || '_________________________________________', underline: { type: UnderlineType.SINGLE } })
            ]
          }),

          // Liability note
          new Paragraph({
            spacing:  { after: 200 },
            children: [new TextRun({
              text: '     I/ We shall extend due care and diligence on the use of said facility (ies) of the university and shall be held jointly and severally liable for damage (s) it may cause in whole subject to actual assessment payable to university.',
              size: 18
            })]
          }),

          // Requested by
          new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 30 },  children: [new TextRun({ text: 'Requested by:', bold: true })] }),
          new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 10 },  children: [new TextRun({ text: userName, bold: true, underline: { type: UnderlineType.SINGLE } })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: userPos, size: 18 })] }),

          // Recommending Approval
          new Paragraph({ spacing: { after: 30 },  children: [new TextRun({ text: 'Recommending Approval:', bold: true })] }),
          new Paragraph({ spacing: { after: 10 },  children: [new TextRun({ text: 'RIEJOHN M. PARANGAN', bold: true, underline: { type: UnderlineType.SINGLE } })] }),
          new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: 'Supply Officer', size: 18 })] }),

          // Approved
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 30 }, children: [new TextRun({ text: 'Approved:', bold: true })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 10 },  children: [new TextRun({ text: 'JOHNNY B. DOLOR, EDD', bold: true, underline: { type: UnderlineType.SINGLE } })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Campus C', size: 18 })] })

        ]
      }]
    });

    const blob     = await Packer.toBlob(doc);
    const filename = `Request_Form_${requestData.requestId || requestData._docId || 'document'}.docx`;

    // Use anchor-click download — works in all browsers without FileSaver race condition
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href          = url;
    link.download      = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(url); }, 1000);

    console.log('✅ Document downloaded:', filename);

  } catch (err) {
    console.error('Document build error:', err);
    alert('Failed to generate document: ' + err.message);
  }
}