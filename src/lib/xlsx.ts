// Excel (.xlsx) файлдарын оқу және жазу — сыртқы кітапханасыз.
// .xlsx — ішінде XML файлдары бар zip архиві. Оқу үшін браузердің кірістірілген
// DecompressionStream('deflate-raw') құралы қолданылады; жазғанда файлдар сығылмай
// (STORE) салынады, сондықтан тек CRC32 қажет. Ескі екілік .xls форматы қолдау таппайды.

export interface Sheet {
  name: string;
  rows: string[][];
}

const dec = new TextDecoder();
const enc = new TextEncoder();

// ---------- ZIP ----------

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buf);
  const dv = new DataView(buf);
  // Архивтің соңындағы «End of central directory» жазбасын іздейміз
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not_zip');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad_zip');
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    // Тек XML файлдары керек
    if (!name.endsWith('.xml') && !name.endsWith('.rels')) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, await inflateRaw(raw));
    else throw new Error('zip_method');
  }
  return out;
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (d: Uint8Array) => {
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function zip(files: [string, string][]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of files) {
    const nb = enc.encode(name);
    const data = enc.encode(text);
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true); // атаулар UTF-8
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(lh.buffer), nb, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true);
    ch.setUint16(28, nb.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nb);
    offset += 30 + nb.length + data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const res = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let o = 0;
  for (const a of all) {
    res.set(a, o);
    o += a.length;
  }
  return res;
}

// ---------- XML ----------

const unescape = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
/** Элемент ішіндегі барлық <t> мәтіндерін біріктіру (форматталған «run»-дар да) */
const texts = (xml: string) => [...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => unescape(m[1])).join('');

const colIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};
const colName = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

/** Сан мәтінін Excel-дің ұзын бөлшектерінсіз көрсету (мысалы 52.400000000000006 → 52.4) */
const num = (v: string) => {
  const x = Number(v);
  return Number.isFinite(x) ? String(Number(x.toPrecision(12))) : v;
};

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const rm of xml.matchAll(/<(?:\w+:)?row\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const r = Number(attr(rm[1], 'r') ?? rows.length + 1) - 1;
    const row: string[] = [];
    let next = 0;
    for (const cm of rm[2].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const ref = attr(cm[1], 'r');
      const ci = ref ? colIndex(ref) : next;
      next = ci + 1;
      const type = attr(cm[1], 't');
      const body = cm[2] ?? '';
      const v = body.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1];
      let val = '';
      if (type === 's') val = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') val = texts(body);
      else if (type === 'str' || type === 'e') val = v !== undefined ? unescape(v) : '';
      else if (type === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
      else val = v !== undefined ? num(unescape(v)) : '';
      row[ci] = val.trim();
    }
    for (let i = 0; i < row.length; i++) row[i] ??= '';
    rows[r] = row;
  }
  // Бос жолдарды алып тастаймыз
  return rows.filter((r) => r && r.some((x) => x !== ''));
}

/** .xlsx файлының барлық парақтарын оқу */
export async function readXlsx(buf: ArrayBuffer): Promise<Sheet[]> {
  const head = new Uint8Array(buf.slice(0, 8));
  // Ескі .xls (OLE2) файлының қолтаңбасы
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) throw new Error('xls_legacy');
  const files = await unzip(buf);
  const wb = files.get('xl/workbook.xml');
  if (!wb) throw new Error('not_xlsx');
  const sharedXml = files.get('xl/sharedStrings.xml');
  const shared = sharedXml ? [...dec.decode(sharedXml).matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => texts(m[1])) : [];
  const relsXml = files.get('xl/_rels/workbook.xml.rels');
  const rels = new Map<string, string>();
  if (relsXml) for (const m of dec.decode(relsXml).matchAll(/<Relationship\b[^>]*>/g)) rels.set(attr(m[0], 'Id') ?? '', attr(m[0], 'Target') ?? '');
  const sheets: Sheet[] = [];
  for (const m of dec.decode(wb).matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
    const name = unescape(attr(m[0], 'name') ?? `Sheet${sheets.length + 1}`);
    const target = rels.get(attr(m[0], 'r:id') ?? '') ?? `worksheets/sheet${sheets.length + 1}.xml`;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const xml = files.get(path);
    if (xml) sheets.push({ name, rows: parseSheet(dec.decode(xml), shared) });
  }
  return sheets;
}

/** Парақтардан .xlsx файлын жасау (бірінші жол — қалың тақырып жолы, бағандар ені мазмұнға қарай) */
export function writeXlsx(sheets: { name: string; rows: (string | number)[][] }[]): Uint8Array {
  const sheetXml = (rows: (string | number)[][]) => {
    const widths = rows[0]?.map((_, c) => Math.min(48, Math.max(8, ...rows.slice(0, 200).map((r) => String(r[c] ?? '').length + 2)))) ?? [];
    const body = rows
      .map(
        (r, ri) =>
          `<row r="${ri + 1}">` +
          r
            .map((v, ci) => {
              const ref = `${colName(ci)}${ri + 1}`;
              const style = ri === 0 ? ' s="1"' : '';
              if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${style}><v>${v}</v></c>`;
              const s = String(v ?? '');
              return s === '' ? '' : `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escape(s)}</t></is></c>`;
            })
            .join('') +
          '</row>',
      )
      .join('');
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      (widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '') +
      `<sheetData>${body}</sheetData></worksheet>`
    );
  };
  const files: [string, string][] = [
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        '</Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ],
    [
      'xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        sheets.map((s, i) => `<sheet name="${escape(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets></workbook>',
    ],
    [
      'xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    [
      'xl/styles.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        '</styleSheet>',
    ],
    ...sheets.map((s, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows)]),
  ];
  return zip(files);
}

const RESULTS_NAMES = /^(results?|нәтиже|нәтижелер|результат|результаты)$/i;
const PLAN_NAMES = /^(curriculum|plan|жоспар|оқу жоспары|план|учебный план|программа)$/i;

/**
 * Жұмыс кітабынан нәтижелер мен оқу жоспары парақтарын табу. Атауы бойынша, болмаса
 * тақырып жолы бойынша: нәтижелерде `score`, жоспарда `planned_hours` бағаны бар.
 */
export function pickSheets(sheets: Sheet[]): { results: Sheet | null; plan: Sheet | null } {
  const head = (s: Sheet) => (s.rows[0] ?? []).map((h) => h.toLowerCase());
  const results = sheets.find((s) => RESULTS_NAMES.test(s.name.trim())) ?? sheets.find((s) => head(s).includes('score')) ?? null;
  const plan = sheets.find((s) => s !== results && PLAN_NAMES.test(s.name.trim())) ?? sheets.find((s) => s !== results && head(s).includes('planned_hours')) ?? null;
  return { results, plan };
}
