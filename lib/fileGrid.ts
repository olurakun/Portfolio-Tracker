// Dosya → hücre ızgarası. Hem doğrudan içe aktarma hem de yapay zekâ ile
// dönüştürme yolunda kullanılır; ExcelJS sunucu tarafı olduğu için bu modül
// yalnızca route handler'lardan çağrılır.
import ExcelJS from "exceljs";

export function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map(c => c.trim());
}

export function parseCsv(text: string): unknown[][] {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];
  const candidates = [';', ',', '\t'];
  const delimiter = candidates.reduce((best, d) =>
    splitCsvLine(lines[0], d).length > splitCsvLine(lines[0], best).length ? d : best, candidates[0]);
  return lines.map(line => splitCsvLine(line, delimiter));
}

// Excel'de tek sayfa yeterli değil: banka/aracı kurum çıktılarında işlemler
// çoğu zaman ikinci ya da üçüncü sayfada durur. Dönüştürme yolunda tüm
// sayfaları okuruz; doğrudan içe aktarmada ilk sayfa yeter.
export async function parseXlsx(buffer: ArrayBuffer, allSheets = false): Promise<unknown[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheets = allSheets ? workbook.worksheets : workbook.worksheets.slice(0, 1);
  const grid: unknown[][] = [];
  for (const sheet of sheets) {
    if (allSheets && workbook.worksheets.length > 1) grid.push([`### Sayfa: ${sheet.name}`]);
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: unknown[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        const v = cell.value;
        if (v && typeof v === "object" && "result" in v) cells.push((v as { result: unknown }).result);
        else if (v && typeof v === "object" && "text" in v) cells.push((v as { text: unknown }).text);
        else cells.push(v);
      });
      grid.push(cells);
    });
  }
  return grid;
}

/** Izgarayı modele verilecek düz metne çevirir. */
export function gridToText(grid: unknown[][]): string {
  return grid.map(row => row.map(cell => {
    if (cell instanceof Date) return cell.toISOString().slice(0, 10);
    return (cell ?? '').toString().trim();
  }).join(' | ')).join('\n');
}
