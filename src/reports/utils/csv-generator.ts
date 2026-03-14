export class CsvGenerator {
  static escapeField(field: string | number | null | undefined): string {
    if (field === null || field === undefined) {
      return '';
    }

    const stringValue = String(field);

    if (
      stringValue.includes(',') ||
      stringValue.includes('"') ||
      stringValue.includes('\n') ||
      stringValue.includes('\r')
    ) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  }

  static generateRow(values: (string | number)[]): string {
    return values.map((value) => this.escapeField(value)).join(',');
  }

  static generate(headers: string[], rows: (string | number)[][]): string {
    const csvLines = [this.generateRow(headers)];

    for (const row of rows) {
      csvLines.push(this.generateRow(row));
    }

    return csvLines.join('\n');
  }
}
