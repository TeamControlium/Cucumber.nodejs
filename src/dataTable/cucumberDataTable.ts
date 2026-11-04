import type { DataTable } from '@cucumber/cucumber';
import { Utils } from '@controlium/utils';

/**
 * The only place in this package that ever calls a Cucumber `DataTable`'s own methods.
 * Converts it to a plain `Record<string, string>[]` (one plain object per row, keyed by
 * column header) via its native `.hashes()` — the shape expected by column-headered tables
 * like `Header Key | Value` — and validates every `expectedColumnNames` entry is actually
 * present as a column, so a typo'd column name fails here with a clear message rather than
 * silently producing `undefined` wherever that column is read downstream.
 *
 * Deliberately returns a plain array of plain objects rather than the `DataTable` itself —
 * everything downstream of this function (`JsonUtils.buildObjectFromRows`, and whatever
 * calls it) knows nothing about Cucumber and never needs to. Any other test runner's own
 * tabular construct that can be converted to this same shape gets identical behaviour from
 * that point on, with nothing runner-specific past this one conversion.
 *
 * @param dataTable - The `DataTable` Cucumber passes as a step function's trailing argument.
 *   Pass this through exactly as received — do not pre-process it.
 * @param expectedColumnNames - Column names the table must have. Every row must contain
 *   each of these as an actual property; extra, unexpected columns are not an error.
 * @returns One plain object per data row (the header row itself is never included),
 *   keyed by column name.
 * @throws {Error} If `dataTable` is not a real `DataTable` (missing `.hashes()`/`.raw()`),
 *   if the table has no data rows (only a header row, or nothing at all), or if any
 *   `expectedColumnNames` entry is missing from the table's actual columns.
 *
 * @example
 * // Given Requests to AUT will replace header data
 * //   | Header Key    | Value       |
 * //   | Authorization | Bearer abc  |
 * getDataTableRows(dataTable, ['Header Key', 'Value']);
 * // => [{ 'Header Key': 'Authorization', 'Value': 'Bearer abc' }]
 */
export function getDataTableRows(dataTable: DataTable, expectedColumnNames: string[]): Record<string, string>[] {
  if (
    dataTable === null ||
    typeof dataTable !== 'object' ||
    typeof dataTable.hashes !== 'function' ||
    typeof dataTable.raw !== 'function'
  ) {
    throw new Error(
      `getDataTableRows: [dataTable] must be a Cucumber DataTable — received ${Utils.describeValue(dataTable)}. Did this step forget to declare a dataTable parameter, or was no table attached to the step in the .feature file?`
    );
  }
  if (!Array.isArray(expectedColumnNames) || expectedColumnNames.length === 0 || !expectedColumnNames.every((name) => typeof name === 'string' && name.length > 0)) {
    throw new Error(
      `getDataTableRows: [expectedColumnNames] must be a non-empty array of non-empty strings — received ${Utils.describeValue(expectedColumnNames)}`
    );
  }

  const rawRows = dataTable.raw();
  const rows = dataTable.hashes();

  if (rows.length === 0) {
    const detail =
      rawRows.length === 1
        ? `only a header row (${JSON.stringify(rawRows[0])}), no data rows`
        : rawRows.length === 0
          ? 'no rows at all'
          : `${rawRows.length} row(s) but hashes() produced none — check for inconsistent row lengths`;
    throw new Error(`getDataTableRows: table has ${detail}. Expected at least one data row.`);
  }

  const actualColumnNames = new Set(Object.keys(rows[0]));
  const missingColumns = expectedColumnNames.filter((name) => !actualColumnNames.has(name));
  if (missingColumns.length > 0) {
    throw new Error(
      `getDataTableRows: table is missing expected column(s) [${missingColumns.join(', ')}]. Actual columns: [${[...actualColumnNames].join(', ')}]`
    );
  }

  return rows;
}
