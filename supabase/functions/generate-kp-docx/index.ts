import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, LevelFormat,
// @ts-ignore – esm.sh CJS shim
} = await import("https://esm.sh/docx@9.5.0");

/* ── helpers ── */

const BRAND_HEADER = "Р Е Г И С Т Р А Ц И Я  Т О В А Р Н О Г О  З Н А К А    A R T P A T E N T . R U";
const BRAND_FOOTER = "420202 | Казань | Тази Гиззата 4 | этаж 4 | +7 843 2 728 728 | info@artpatent.ru | www.artpatent.ru";

const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: "999999" };
const cellBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

function parseMarkdownTable(block: string): { headers: string[]; rows: string[][] } {
  const lines = block.trim().split('\n').filter(l => l.trim().startsWith('|'));
  if (lines.length < 2) return { headers: [], rows: [] };
  const parse = (line: string) => line.split('|').slice(1, -1).map(c => c.trim());
  const headers = parse(lines[0]);
  // skip separator line (index 1)
  const rows = lines.slice(2).map(parse);
  return { headers, rows };
}

function mdToParagraphs(md: string): any[] {
  const paragraphs: any[] = [];
  const lines = md.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // headings
    if (line.startsWith('### ')) {
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun({ text: line.slice(4).replace(/\*\*/g, ''), bold: true })],
      }));
      i++; continue;
    }
    if (line.startsWith('## ')) {
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: line.slice(3).replace(/\*\*/g, ''), bold: true })],
      }));
      i++; continue;
    }
    if (line.startsWith('# ')) {
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: line.slice(2).replace(/\*\*/g, ''), bold: true })],
      }));
      i++; continue;
    }

    // table block
    if (line.trim().startsWith('|')) {
      let tableBlock = '';
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableBlock += lines[i] + '\n';
        i++;
      }
      const { headers, rows } = parseMarkdownTable(tableBlock);
      if (headers.length > 0) {
        const colCount = headers.length;
        const colWidth = Math.floor(9360 / colCount);
        const colWidths = Array(colCount).fill(colWidth);

        const headerRow = new TableRow({
          children: headers.map((h: string, ci: number) => new TableCell({
            borders: cellBorders,
            width: { size: colWidths[ci], type: WidthType.DXA },
            shading: { fill: "D5E8F0", type: ShadingType.CLEAR },
            margins: { top: 60, bottom: 60, left: 80, right: 80 },
            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, font: "Arial", size: 18 })] })],
          })),
        });

        const dataRows = rows.map((row: string[]) => new TableRow({
          children: row.map((cell: string, ci: number) => new TableCell({
            borders: cellBorders,
            width: { size: colWidths[ci], type: WidthType.DXA },
            margins: { top: 40, bottom: 40, left: 80, right: 80 },
            children: [new Paragraph({ children: [new TextRun({ text: cell, font: "Arial", size: 18 })] })],
          })),
        }));

        paragraphs.push(new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: colWidths,
          rows: [headerRow, ...dataRows],
        }));
      }
      continue;
    }

    // bullet list
    if (/^\s*[-*] /.test(line)) {
      const text = line.replace(/^\s*[-*] /, '');
      paragraphs.push(new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: parseInlineRuns(text),
      }));
      i++; continue;
    }

    // numbered list
    if (/^\s*\d+\.\s/.test(line)) {
      const text = line.replace(/^\s*\d+\.\s/, '');
      paragraphs.push(new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        children: parseInlineRuns(text),
      }));
      i++; continue;
    }

    // empty line
    if (line.trim() === '') {
      paragraphs.push(new Paragraph({ children: [] }));
      i++; continue;
    }

    // regular paragraph
    paragraphs.push(new Paragraph({
      spacing: { after: 120 },
      children: parseInlineRuns(line),
    }));
    i++;
  }

  return paragraphs;
}

function parseInlineRuns(text: string): any[] {
  const runs: any[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index), font: "Arial", size: 22 }));
    }
    runs.push(new TextRun({ text: match[1], bold: true, font: "Arial", size: 22 }));
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex), font: "Arial", size: 22 }));
  }
  if (runs.length === 0) {
    runs.push(new TextRun({ text, font: "Arial", size: 22 }));
  }
  return runs;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { markdown, trademark_name } = await req.json();
    if (!markdown) {
      return new Response(JSON.stringify({ error: 'markdown is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const content = mdToParagraphs(markdown);

    const doc = new Document({
      styles: {
        default: { document: { run: { font: "Arial", size: 22 } } },
        paragraphStyles: [
          {
            id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
            run: { size: 28, bold: true, font: "Arial", color: "000000" },
            paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 },
          },
          {
            id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
            run: { size: 24, bold: true, font: "Arial", color: "000000" },
            paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 1 },
          },
          {
            id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
            run: { size: 22, bold: true, font: "Arial", color: "333333" },
            paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 },
          },
        ],
      },
      numbering: {
        config: [
          {
            reference: "bullets",
            levels: [{
              level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            }],
          },
          {
            reference: "numbers",
            levels: [{
              level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            }],
          },
        ],
      },
      sections: [{
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1440, right: 1134, bottom: 1440, left: 1134 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "2E75B6", space: 1 } },
                children: [new TextRun({
                  text: BRAND_HEADER,
                  font: "Arial",
                  size: 14,
                  color: "2E75B6",
                })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 1 } },
                children: [
                  new TextRun({ text: BRAND_FOOTER, font: "Arial", size: 14, color: "666666" }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 14, color: "999999" }),
                ],
              }),
            ],
          }),
        },
        children: content,
      }],
    });

    const buffer = await Packer.toBuffer(doc);

    return new Response(buffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(trademark_name || 'KP')}.docx"`,
      },
    });
  } catch (err) {
    console.error('generate-kp-docx error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
