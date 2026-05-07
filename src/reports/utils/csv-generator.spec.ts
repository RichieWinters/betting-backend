import { CsvGenerator } from './csv-generator';

describe('CsvGenerator', () => {
  describe('escapeField', () => {
    it('returns a plain string unchanged', () => {
      expect(CsvGenerator.escapeField('hello')).toBe('hello');
    });

    it('wraps a string containing a comma in quotes', () => {
      expect(CsvGenerator.escapeField('a,b')).toBe('"a,b"');
    });

    it('wraps a string containing double-quotes and escapes them', () => {
      expect(CsvGenerator.escapeField('say "hi"')).toBe('"say ""hi"""');
    });

    it('wraps a string containing a newline in quotes', () => {
      expect(CsvGenerator.escapeField('line1\nline2')).toBe('"line1\nline2"');
    });

    it('returns empty string for null', () => {
      expect(CsvGenerator.escapeField(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(CsvGenerator.escapeField(undefined)).toBe('');
    });

    it('converts a number to its string representation', () => {
      expect(CsvGenerator.escapeField(42)).toBe('42');
    });
  });

  describe('generate', () => {
    const headers = ['ID', 'Name', 'Amount'];
    const rows: (string | number)[][] = [
      [1, 'Alice', 100],
      [2, 'Bob', 200],
    ];

    it('first line equals the headers joined with commas', () => {
      const output = CsvGenerator.generate(headers, rows);
      expect(output.split('\n')[0]).toBe('ID,Name,Amount');
    });

    it('line count equals rows.length + 1', () => {
      const output = CsvGenerator.generate(headers, rows);
      expect(output.split('\n').length).toBe(rows.length + 1);
    });

    it('data row fields match the source values', () => {
      const output = CsvGenerator.generate(headers, rows);
      expect(output.split('\n')[1]).toBe('1,Alice,100');
    });

    it('returns only the header line when rows array is empty', () => {
      const output = CsvGenerator.generate(headers, []);
      expect(output.split('\n').length).toBe(1);
      expect(output).toBe('ID,Name,Amount');
    });
  });
});
