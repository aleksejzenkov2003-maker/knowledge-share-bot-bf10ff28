import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, LevelFormat, ImageRun, VerticalAlign,
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

async function fetchImageBytes(url?: string | null): Promise<Uint8Array | null> {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const arrayBuffer = await resp.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch {
    return null;
  }
}

function buildMetaTable(params: {
  trademarkName?: string;
  companyName?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
}): any {
  const rows: [string, string][] = [
    ["Заявитель", params.companyName || "-"],
    ["Товарный знак", params.trademarkName || "-"],
    ["Контактное лицо", params.contactPerson || "-"],
    ["Телефон", params.phone || "-"],
    ["Email", params.email || "-"],
    ["Дата", new Date().toLocaleDateString("ru-RU")],
  ];
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    rows: rows.map(([key, value]) =>
      new TableRow({
        children: [
          new TableCell({
            borders: cellBorders,
            shading: { fill: "EDF4F8", type: ShadingType.CLEAR },
            width: { size: 2500, type: WidthType.DXA },
            children: [
              new Paragraph({
                children: [new TextRun({ text: key, bold: true, font: "Arial", size: 20 })],
              }),
            ],
          }),
          new TableCell({
            borders: cellBorders,
            width: { size: 6860, type: WidthType.DXA },
            children: [
              new Paragraph({
                children: [new TextRun({ text: value, font: "Arial", size: 20 })],
              }),
            ],
          }),
        ],
      }),
    ),
  });
}

function buildCoverBlock(params: {
  trademarkName?: string;
  companyName?: string;
  logoBytes?: Uint8Array | null;
}): any {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: "23272E", type: ShadingType.CLEAR },
            margins: { top: 540, left: 560, right: 560, bottom: 540 },
            children: [
              ...(params.logoBytes
                ? [
                    new Paragraph({
                      alignment: AlignmentType.LEFT,
                      spacing: { after: 260 },
                      children: [
                        new ImageRun({
                          type: "jpg",
                          data: params.logoBytes,
                          transformation: { width: 180, height: 56 },
                        } as any),
                      ],
                    }),
                  ]
                : []),
              new Paragraph({
                spacing: { after: 140 },
                children: [
                  new TextRun({
                    text: "РЕГИСТРАЦИЯ",
                    bold: false,
                    font: "Arial",
                    color: "FFFFFF",
                    size: 72,
                  }),
                ],
              }),
              new Paragraph({
                spacing: { after: 140 },
                children: [
                  new TextRun({
                    text: "ТОВАРНОГО",
                    bold: false,
                    font: "Arial",
                    color: "FFFFFF",
                    size: 72,
                  }),
                ],
              }),
              new Paragraph({
                spacing: { after: 260 },
                children: [
                  new TextRun({
                    text: "ЗНАКА",
                    bold: false,
                    font: "Arial",
                    color: "FFFFFF",
                    size: 72,
                  }),
                ],
              }),
              new Paragraph({
                spacing: { after: 100 },
                children: [
                  new TextRun({
                    text: `Коммерческое предложение для знака «${params.trademarkName || "-"}»`,
                    font: "Arial",
                    color: "F0F2F5",
                    size: 24,
                  }),
                ],
              }),
              new Paragraph({
                spacing: { after: 260 },
                children: [
                  new TextRun({
                    text: `Подготовлено: ${params.companyName || "ARTPATENT"}`,
                    font: "Arial",
                    color: "CFD4DC",
                    size: 22,
                  }),
                ],
              }),
              new Paragraph({
                spacing: { after: 60 },
                children: [new TextRun({ text: "Анализ охраноспособности", font: "Arial", color: "FFFFFF", size: 28 })],
              }),
              new Paragraph({
                spacing: { after: 60 },
                children: [new TextRun({ text: "Подбор классов МКТУ", font: "Arial", color: "FFFFFF", size: 28 })],
              }),
              new Paragraph({
                spacing: { after: 60 },
                children: [new TextRun({ text: "Результаты бесплатного поиска", font: "Arial", color: "FFFFFF", size: 28 })],
              }),
              new Paragraph({
                spacing: { after: 200 },
                children: [new TextRun({ text: "Детальный расчет стоимости", font: "Arial", color: "FFFFFF", size: 28 })],
              }),
              new Paragraph({
                spacing: { before: 200, after: 40 },
                children: [new TextRun({ text: "ARTPATENT", font: "Arial", color: "FFFFFF", size: 36 })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      markdown,
      trademark_name,
      company_name,
      contact_person,
      email,
      phone,
      logo_url,
      screenshots,
    } = await req.json();
    if (!markdown) {
      return new Response(JSON.stringify({ error: 'markdown is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const content = mdToParagraphs(markdown);
    const logoBytes = await fetchImageBytes(typeof logo_url === "string" ? logo_url : null);
    const screenshotItems = Array.isArray(screenshots) ? screenshots.slice(0, 10) : [];

    const coverBlock = buildCoverBlock({
      trademarkName: trademark_name,
      companyName: company_name,
      logoBytes,
    });

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
      sections: [
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: { top: 720, right: 720, bottom: 720, left: 720 },
            },
          },
          headers: { default: new Header({ children: [] }) },
          footers: { default: new Footer({ children: [] }) },
          children: [coverBlock],
        },
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: { top: 1440, right: 1134, bottom: 1440, left: 1134 },
            },
          },
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "2E75B6", space: 1 } },
                  children: [new TextRun({ text: BRAND_HEADER, font: "Arial", size: 14, color: "2E75B6" })],
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
                  children: [new TextRun({ text: BRAND_FOOTER, font: "Arial", size: 14, color: "666666" })],
                }),
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 14, color: "999999" })],
                }),
              ],
            }),
          },
          children: [
        ...(logoBytes
          ? [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 180 },
                children: [
                  new ImageRun({
                    data: logoBytes,
                    transformation: { width: 220, height: 70 },
                  }),
                ],
              }),
            ]
          : []),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 140 },
          children: [new TextRun({ text: "КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ", bold: true, font: "Arial", size: 34 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 260 },
          children: [new TextRun({ text: "По регистрации товарного знака", font: "Arial", size: 24 })],
        }),
        buildMetaTable({
          trademarkName: trademark_name,
          companyName: company_name,
          contactPerson: contact_person,
          phone,
          email,
        }),
        new Paragraph({ children: [], spacing: { after: 200 } }),
        new Paragraph({
          children: [
            new TextRun({
              text: "Структура документа включает анализ охраноспособности, подбор классов МКТУ, результаты поиска и детальный расчет затрат.",
              font: "Arial",
              size: 22,
            }),
          ],
        }),
        ...content,
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: "Приложение: скриншоты из открытых источников", bold: true })],
        }),
        ...(await Promise.all(
          screenshotItems.map(async (item: any, idx: number) => {
            const url = typeof item?.url === "string" ? item.url : null;
            const title = typeof item?.title === "string" ? item.title : `Скриншот ${idx + 1}`;
            const sourceUrl = typeof item?.source_url === "string" ? item.source_url : "";
            const bytes = await fetchImageBytes(url);
            const chunk: any[] = [
              new Paragraph({
                spacing: { before: 220, after: 80 },
                children: [new TextRun({ text: `${idx + 1}. ${title}`, bold: true, font: "Arial", size: 20 })],
              }),
            ];
            if (sourceUrl) {
              chunk.push(
                new Paragraph({
                  spacing: { after: 120 },
                  children: [new TextRun({ text: sourceUrl, italics: true, color: "666666", size: 18 })],
                }),
              );
            }
            if (bytes) {
              chunk.push(
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 180 },
                  children: [new ImageRun({ data: bytes, transformation: { width: 500, height: 300 } })],
                }),
              );
            }
            return chunk;
          }),
        )).flat(),
          ],
        },
      ],
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
