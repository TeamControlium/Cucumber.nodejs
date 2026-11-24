import type { DataTable } from '@cucumber/cucumber';
import { Utils } from '@controlium/utils';

/**
 * Strips matching `"..."`/`'...'` delimiters from a single DataTable cell's raw text, if
 * present — same "quote it, get everything between verbatim, including the same quote
 * character appearing again unescaped" convention this package's own quoted Gherkin step
 * text already uses (see e.g. `headers.steps.ts`'s own class doc, "Quoted literal values"),
 * generalised to DataTable cells too, across every DataTable this package reads: it's the
 * only way a cell can carry leading/trailing whitespace through Gherkin's own cell-boundary
 * trimming, or contain text that would otherwise collide with a `ValueExpression` verb.
 *
 * Only ever removes the outermost pair — the two characters at position 0 and length-1 —
 * and only when they're both the same quote character and the cell is at least 2 characters
 * long (so a single lone `"`/`'`, which can't be its own opening *and* closing delimiter, is
 * left untouched). Everything between them is kept exactly as-is, however many further quote
 * characters of either kind it contains — a cell that merely happens to start and end with
 * the same quote character without being meant as a delimiter is not expected in practice,
 * same assumption the Gherkin step-text convention already makes.
 */
function stripMatchingQuoteDelimiters(cell: string): string {
  if (cell.length < 2) return cell;
  const first = cell[0];
  const last = cell[cell.length - 1];
  return (first === '"' || first === "'") && first === last ? cell.slice(1, -1) : cell;
}

/**
 * Duck-types a value as a genuine Cucumber `DataTable` — checked by shape (`.hashes()`/
 * `.raw()` both present), not `instanceof`, so this works against any object with the right
 * shape without this package needing a runtime (value, not type-only) import of Cucumber's
 * own `DataTable` class. The one check behind {@link resolveDataTableRows}'s own validation.
 */
function isDataTable(candidate: unknown): candidate is DataTable {
  return (
    candidate !== null &&
    typeof candidate === 'object' &&
    typeof (candidate as DataTable).hashes === 'function' &&
    typeof (candidate as DataTable).raw === 'function'
  );
}

/**
 * The only place in this package that ever calls a Cucumber `DataTable`'s own methods —
 * every step definition that accepts a DataTable calls this first, before doing anything
 * else with it, so its own logic always runs against an already-validated, already-resolved
 * row list, regardless of what that step actually does with the data afterward.
 *
 * Converts the table to a plain `Record<string, string>[]` (one plain object per row, keyed
 * by column header) via its native `.hashes()`, validates its columns against
 * `expectedColumnNames`, and resolves every cell by stripping the DataTable-level quoting
 * convention (see {@link stripMatchingQuoteDelimiters}) — nothing else. No token (`[[...]]`)
 * resolution happens here or anywhere downstream of it: a cell written as
 * `[[random|digits|2]]` reaches every caller as that literal text.
 *
 * Column names in `expectedColumnNames` are mandatory by default; prefix one with `?` (e.g.
 * `'?Description'`) to mark it optional. Every *actual* column in the table must be in the
 * combined mandatory+optional set — an unexpected extra column is an error, not silently
 * ignored, so a typo'd or forgotten column name fails here with a clear message rather than
 * silently producing `undefined` wherever that column is read downstream.
 *
 * Deliberately returns a plain array of plain objects rather than the `DataTable` itself —
 * everything downstream of this function knows nothing about Cucumber and never needs to.
 * Any other test runner's own tabular construct that can be converted to this same shape
 * gets identical behaviour from that point on, with nothing runner-specific past this one
 * conversion.
 *
 * @param dataTable - The `DataTable` Cucumber passes as a step function's trailing argument.
 *   Pass this through exactly as received — do not pre-process it.
 * @param expectedColumnNames - Column names the table must have, `?`-prefixed for optional.
 *   Every row must contain each mandatory entry as an actual property; any actual column not
 *   present in this list (mandatory or optional) is an error.
 * @returns One plain object per data row (the header row itself is never included), keyed by
 *   column name, every cell already quote-stripped — not otherwise resolved.
 * @throws {Error} If `dataTable` is not a real `DataTable` (missing `.hashes()`/`.raw()`), if
 *   the table has no data rows (only a header row, or nothing at all), if any mandatory
 *   `expectedColumnNames` entry is missing from the table's actual columns, or if the table
 *   has an actual column not listed in `expectedColumnNames` at all (mandatory or optional).
 *
 * @example
 * // Given Requests to AUT will replace header data
 * //   | Header Key    | Value       |
 * //   | Authorization | Bearer abc  |
 * await resolveDataTableRows(dataTable, ['Header Key', 'Value']);
 * // => [{ 'Header Key': 'Authorization', 'Value': 'Bearer abc' }]
 *
 * @example
 * // An optional column — present here, but a table omitting it entirely is just as valid.
 * await resolveDataTableRows(dataTable, ['Header Key', 'Value', '?Description']);
 */
export async function resolveDataTableRows(dataTable: DataTable, expectedColumnNames: string[]): Promise<Record<string, string>[]> {
  if (!isDataTable(dataTable)) {
    throw new Error(
      `resolveDataTableRows: [dataTable] must be a Cucumber DataTable — received ${Utils.describeValue(dataTable)}. Did this step forget to declare a dataTable parameter, or was no table attached to the step in the .feature file?`
    );
  }
  if (!Array.isArray(expectedColumnNames) || expectedColumnNames.length === 0 || !expectedColumnNames.every((name) => typeof name === 'string' && name.length > 0)) {
    throw new Error(
      `resolveDataTableRows: [expectedColumnNames] must be a non-empty array of non-empty strings, '?'-prefixed for optional — received ${Utils.describeValue(expectedColumnNames)}`
    );
  }

  // Split into mandatory and optional (stripping the leading '?') before any table content
  // is even looked at — this ordering (validate the *request* shape first) matches every
  // other validation step in this function.
  const mandatoryColumnNames = expectedColumnNames.filter((name) => !name.startsWith('?'));
  const optionalColumnNames = expectedColumnNames.filter((name) => name.startsWith('?')).map((name) => name.substring(1));

  const rawRows = dataTable.raw();
  const rawHashRows = dataTable.hashes();

  if (rawHashRows.length === 0) {
    const detail =
      rawRows.length === 1
        ? `only a header row (${JSON.stringify(rawRows[0])}), no data rows`
        : rawRows.length === 0
          ? 'no rows at all'
          : `${rawRows.length} row(s) but hashes() produced none — check for inconsistent row lengths`;
    throw new Error(`resolveDataTableRows: table has ${detail}. Expected at least one data row.`);
  }

  const actualColumnNames = new Set(Object.keys(rawHashRows[0]));

  const missingColumns = mandatoryColumnNames.filter((name) => !actualColumnNames.has(name));
  if (missingColumns.length > 0) {
    throw new Error(
      `resolveDataTableRows: table is missing expected column(s) [${missingColumns.join(', ')}]. Actual columns: [${[...actualColumnNames].join(', ')}]`
    );
  }

  const knownColumnNames = new Set([...mandatoryColumnNames, ...optionalColumnNames]);
  const unexpectedColumns = [...actualColumnNames].filter((name) => !knownColumnNames.has(name));
  if (unexpectedColumns.length > 0) {
    throw new Error(
      `resolveDataTableRows: table has unexpected column(s) [${unexpectedColumns.join(', ')}] not in the expected set. Expected mandatory [${mandatoryColumnNames.join(', ')}]${optionalColumnNames.length > 0 ? ` and optional [${optionalColumnNames.join(', ')}]` : ''}.`
    );
  }

  return Promise.all(
    rawHashRows.map(async (row) => {
      const resolvedEntries = await Promise.all(
        Object.entries(row).map(async ([columnName, cell]) => [columnName, stripMatchingQuoteDelimiters(cell)] as const)
      );
      return Object.fromEntries(resolvedEntries);
    })
  );
}
