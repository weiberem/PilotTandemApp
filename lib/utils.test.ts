import { describe, it, expect } from 'vitest';
import { extractDriveId, isoDate, monthStart } from './utils';

describe('extractDriveId', () => {
  it('returns a bare ID unchanged', () => {
    expect(extractDriveId('12OdgU9fnpo3XINR6GeE3zVNJg7TG5HIQ')).toBe('12OdgU9fnpo3XINR6GeE3zVNJg7TG5HIQ');
  });
  it('extracts from /folders/ URL', () => {
    expect(extractDriveId('https://drive.google.com/drive/u/0/folders/12OdgU9fnpo3XINR6GeE3zVNJg7TG5HIQ'))
      .toBe('12OdgU9fnpo3XINR6GeE3zVNJg7TG5HIQ');
    expect(extractDriveId('https://drive.google.com/drive/folders/1V9jMqz_3iTZnlD3LMH_Rg1LSt0Equ9zk?usp=share_link'))
      .toBe('1V9jMqz_3iTZnlD3LMH_Rg1LSt0Equ9zk');
  });
  it('extracts from /file/d/ URL', () => {
    expect(extractDriveId('https://docs.google.com/spreadsheets/d/abcDEF1234567890_xyz-abc1/edit#gid=0'))
      .toBe('abcDEF1234567890_xyz-abc1');
  });
  it('extracts from open?id= URL', () => {
    expect(extractDriveId('https://drive.google.com/open?id=abcDEF1234567890_xyzABCD12'))
      .toBe('abcDEF1234567890_xyzABCD12');
  });
  it('trims whitespace', () => {
    expect(extractDriveId('  12OdgU9fnpo3XINR6GeE3zVNJg7TG5HIQ\n')).toBe('12OdgU9fnpo3XINR6GeE3zVNJg7TG5HIQ');
  });
});

describe('isoDate', () => {
  it('zero-pads month and day', () => {
    expect(isoDate(new Date(2025, 0, 5))).toBe('2025-01-05');
  });
});

describe('monthStart', () => {
  it('returns first of month in ISO', () => {
    expect(monthStart(new Date(2025, 5, 17))).toBe('2025-06-01');
  });
});
