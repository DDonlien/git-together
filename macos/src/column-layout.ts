export type ColumnRatios = readonly [number, number, number];
export type ColumnBoundary = 0 | 1;

// Ten shares keep the visible widths on 10% stops. The gaps are not shares.
export const defaultColumnRatios: ColumnRatios = [3, 4, 3];
export const columnMinimums = [230, 290, 216] as const;
export const columnGap = 12;

export function columnLayoutMinimum(ratios: ColumnRatios): number {
  return Math.ceil(Math.max(...columnMinimums.map((minimum, index) => minimum * 10 / ratios[index])) + columnGap * 2);
}

export function columnResizeBounds(ratios: ColumnRatios, boundary: ColumnBoundary, width: number) {
  const minimum = Math.ceil(columnMinimums[boundary] * 10 / width - 1e-8);
  const maximum = ratios[boundary] + ratios[boundary + 1] - Math.ceil(columnMinimums[boundary + 1] * 10 / width - 1e-8);
  return { minimum, maximum };
}

export function resizeColumns(ratios: ColumnRatios, boundary: ColumnBoundary, leftShares: number, width: number): ColumnRatios {
  const { minimum, maximum } = columnResizeBounds(ratios, boundary, width);
  const left = Math.min(maximum, Math.max(minimum, Math.round(leftShares)));
  if (left === ratios[boundary]) return ratios;
  const next: [number, number, number] = [...ratios];
  next[boundary] = left;
  next[boundary + 1] = ratios[boundary] + ratios[boundary + 1] - left;
  return next;
}
