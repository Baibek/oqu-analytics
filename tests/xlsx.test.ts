import { describe, expect, it } from 'vitest';
import { generateDemo } from '../src/lib/generate';
import { topicStats } from '../src/lib/analysis';
import { exportCurriculum, exportResults, importCatalog, parseCsv, toCsv } from '../src/lib/csv';
import { pickSheets, readXlsx, writeXlsx } from '../src/lib/xlsx';

const toBuf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

describe('Excel (.xlsx)', () => {
  it('жазылған файл қайта оқылады және талдау өзгермейді', async () => {
    const ds = generateDemo();
    const results = parseCsv(exportResults(ds, 'kk')).map((r, i) => (i ? r.map((v) => (v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v)) : r));
    const plan = parseCsv(exportCurriculum(ds, 'kk'));
    const file = writeXlsx([
      { name: 'Нәтижелер', rows: results },
      { name: 'Оқу жоспары', rows: plan },
    ]);
    const sheets = await readXlsx(toBuf(file));
    expect(sheets.map((s) => s.name)).toEqual(['Нәтижелер', 'Оқу жоспары']);
    const { results: rs, plan: ps } = pickSheets(sheets);
    expect(rs!.rows.length).toBe(results.length);
    expect(rs!.rows[1]).toEqual(results[1].map(String));
    const { courses, issues } = importCatalog(toCsv(rs!.rows), toCsv(ps!.rows));
    expect(issues).toEqual([]);
    const back = courses[0].ds;
    expect(back.students.length).toBe(ds.students.length);
    expect(topicStats(back).map((s) => Math.round(s.mastery))).toEqual(topicStats(ds).map((s) => Math.round(s.mastery)));
  });

  it('парақтарды атауы немесе тақырып жолы бойынша табады', () => {
    const a = { name: 'Sheet1', rows: [['student_id', 'school', 'textbook', 'topic', 'score']] };
    const b = { name: 'Sheet2', rows: [['topic', 'planned_hours']] };
    expect(pickSheets([b, a])).toEqual({ results: a, plan: b });
    expect(pickSheets([{ name: 'Результаты', rows: [] }]).results?.name).toBe('Результаты');
  });

  it('ескі .xls пен басқа файлға түсінікті қате береді', async () => {
    const xls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    await expect(readXlsx(toBuf(xls))).rejects.toThrow('xls_legacy');
    await expect(readXlsx(toBuf(new TextEncoder().encode('a,b\n1,2')))).rejects.toThrow('not_zip');
  });
});
