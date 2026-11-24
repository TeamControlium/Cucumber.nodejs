import { DataTable } from '@cucumber/cucumber';

import { resolveDataTableRows } from './cucumberDataTable.js';

function makeDataTable(rows: string[][]): DataTable {
  return new DataTable(rows);
}

describe('resolveDataTableRows', () => {
  it('converts a real DataTable into plain row objects via hashes()', async () => {
    const table = makeDataTable([
      ['Header Key', 'Value'],
      ['Authorization', 'Bearer abc'],
      ['X-Trace', '123'],
    ]);
    await expect(resolveDataTableRows(table, ['Header Key', 'Value'])).resolves.toEqual([
      { 'Header Key': 'Authorization', Value: 'Bearer abc' },
      { 'Header Key': 'X-Trace', Value: '123' },
    ]);
  });

  it('rejects a table with an actual column not in the expected set', async () => {
    const table = makeDataTable([
      ['Header Key', 'Value', 'Notes'],
      ['Authorization', 'Bearer abc', 'rotates daily'],
    ]);
    await expect(resolveDataTableRows(table, ['Header Key', 'Value'])).rejects.toThrow(/unexpected column\(s\) \[Notes\]/);
  });

  it('accepts an optional column (?-prefixed) when present', async () => {
    const table = makeDataTable([
      ['Header Key', 'Value', 'Notes'],
      ['Authorization', 'Bearer abc', 'rotates daily'],
    ]);
    await expect(resolveDataTableRows(table, ['Header Key', 'Value', '?Notes'])).resolves.toEqual([
      { 'Header Key': 'Authorization', Value: 'Bearer abc', Notes: 'rotates daily' },
    ]);
  });

  it('accepts an optional column (?-prefixed) when absent', async () => {
    const table = makeDataTable([
      ['Header Key', 'Value'],
      ['Authorization', 'Bearer abc'],
    ]);
    await expect(resolveDataTableRows(table, ['Header Key', 'Value', '?Notes'])).resolves.toEqual([
      { 'Header Key': 'Authorization', Value: 'Bearer abc' },
    ]);
  });

  it('rejects a table with only a header row and no data rows', async () => {
    const table = makeDataTable([['Header Key', 'Value']]);
    await expect(resolveDataTableRows(table, ['Header Key', 'Value'])).rejects.toThrow(/only a header row/);
  });

  it('rejects a missing mandatory expected column', async () => {
    const table = makeDataTable([
      ['Header Key', 'Value'],
      ['Authorization', 'Bearer abc'],
    ]);
    await expect(resolveDataTableRows(table, ['Header Key', 'Value', 'Notes'])).rejects.toThrow(/missing expected column\(s\) \[Notes\]/);
  });

  it('rejects null', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(resolveDataTableRows(null as any, ['Header Key', 'Value'])).rejects.toThrow(/\[dataTable\] must be a Cucumber DataTable/);
  });

  it('rejects a plain object that is not a real DataTable (e.g. a step that forgot to declare the parameter)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(resolveDataTableRows(undefined as any, ['Header Key', 'Value'])).rejects.toThrow(/\[dataTable\] must be a Cucumber DataTable/);
  });

  it('rejects an empty expectedColumnNames array', async () => {
    const table = makeDataTable([
      ['Header Key', 'Value'],
      ['Authorization', 'Bearer abc'],
    ]);
    await expect(resolveDataTableRows(table, [])).rejects.toThrow(/\[expectedColumnNames\] must be a non-empty array/);
  });

  it('does not resolve a token-shaped cell value — it passes through literally', async () => {
    const table = makeDataTable([
      ['Header Key', 'Value'],
      ['X-Ref', '[[random|digits|4]]'],
    ]);
    const rows = await resolveDataTableRows(table, ['Header Key', 'Value']);
    expect(rows[0].Value).toBe('[[random|digits|4]]');
  });

  it('strips DataTable-level quoting around a plain value', async () => {
    const table = makeDataTable([
      ['Header Key', 'Value'],
      ['X-Ref', "' padded '"],
    ]);
    const rows = await resolveDataTableRows(table, ['Header Key', 'Value']);
    expect(rows[0].Value).toBe(' padded ');
  });

  it('leaves a cell with no token in it completely unchanged', async () => {
    const table = makeDataTable([
      ['Header Key', 'Value'],
      ['Authorization', 'Bearer abc'],
    ]);
    const rows = await resolveDataTableRows(table, ['Header Key', 'Value']);
    expect(rows[0].Value).toBe('Bearer abc');
  });
});
