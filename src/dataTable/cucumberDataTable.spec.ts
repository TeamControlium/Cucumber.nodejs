import { DataTable } from '@cucumber/cucumber';

import { getDataTableRows } from './cucumberDataTable.js';

function makeDataTable(rows: string[][]): DataTable {
  return new DataTable(rows);
}

describe('getDataTableRows', () => {

  it('converts a real DataTable into plain row objects via hashes()', () => {
    const table = makeDataTable([
      ['Header Key', 'Value'],
      ['Authorization', 'Bearer abc'],
      ['X-Trace', '123'],
    ]);
    expect(getDataTableRows(table, ['Header Key', 'Value'])).toEqual([
      { 'Header Key': 'Authorization', Value: 'Bearer abc' },
      { 'Header Key': 'X-Trace', Value: '123' },
    ]);
  });

  it('does not require expectedColumnNames to cover every actual column', () => {
    const table = makeDataTable([
      ['Header Key', 'Value', 'Notes'],
      ['Authorization', 'Bearer abc', 'rotates daily'],
    ]);
    expect(getDataTableRows(table, ['Header Key', 'Value'])).toEqual([
      { 'Header Key': 'Authorization', Value: 'Bearer abc', Notes: 'rotates daily' },
    ]);
  });

  it('rejects a table with only a header row and no data rows', () => {
    const table = makeDataTable([['Header Key', 'Value']]);
    expect(() => getDataTableRows(table, ['Header Key', 'Value'])).toThrow(/only a header row/);
  });

  it('rejects a missing expected column', () => {
    const table = makeDataTable([
      ['Header Key', 'Value'],
      ['Authorization', 'Bearer abc'],
    ]);
    expect(() => getDataTableRows(table, ['Header Key', 'Value', 'Notes'])).toThrow(/missing expected column\(s\) \[Notes\]/);
  });

  it('rejects null', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => getDataTableRows(null as any, ['Header Key', 'Value'])).toThrow(/\[dataTable\] must be a Cucumber DataTable/);
  });

  it('rejects a plain object that is not a real DataTable (e.g. a step that forgot to declare the parameter)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => getDataTableRows(undefined as any, ['Header Key', 'Value'])).toThrow(/\[dataTable\] must be a Cucumber DataTable/);
  });

  it('rejects an empty expectedColumnNames array', () => {
    const table = makeDataTable([
      ['Header Key', 'Value'],
      ['Authorization', 'Bearer abc'],
    ]);
    expect(() => getDataTableRows(table, [])).toThrow(/\[expectedColumnNames\] must be a non-empty array/);
  });
});
