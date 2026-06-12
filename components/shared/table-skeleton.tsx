import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";

type TableSkeletonRowsProps = {
	rows?: number;
	columns: number;
};

/**
 * Skeleton rows rendered inside an existing <TableBody> so the table keeps
 * its shape (header, column widths) while data loads.
 */
export function TableSkeletonRows({ rows = 5, columns }: TableSkeletonRowsProps) {
	return (
		<>
			{Array.from({ length: rows }).map((_, rowIndex) => (
				<TableRow key={rowIndex}>
					{Array.from({ length: columns }).map((_, colIndex) => (
						<TableCell key={colIndex}>
							<Skeleton className="h-4 w-full max-w-40" />
						</TableCell>
					))}
				</TableRow>
			))}
		</>
	);
}
