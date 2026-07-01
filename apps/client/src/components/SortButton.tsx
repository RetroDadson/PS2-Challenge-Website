export function sortMarker<TColumn extends string>(current: TColumn, column: TColumn, ascending: boolean): string {
  if (current !== column) {
    return "";
  }
  return ascending ? " ▲" : " ▼";
}

export function SortButton<TColumn extends string>({
  column,
  current,
  ascending,
  onSort,
  children
}: Readonly<{
  column: TColumn;
  current: TColumn;
  ascending: boolean;
  onSort: (column: TColumn) => void;
  children: string;
}>) {
  const marker = sortMarker(current, column, ascending);
  return <button className="table-sort-button" onClick={() => onSort(column)}>{children}{marker}</button>;
}
