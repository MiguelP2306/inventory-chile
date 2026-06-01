'use client';

/* ============================================================================
 *  TablePagination — footer de paginación reutilizable, idéntico al que ya usan
 *  Productos / Inventario / Gastos (borde superior dentro de la card de tabla).
 *
 *  Pensado para paginación del lado del cliente: el padre calcula totalPages a
 *  partir del array completo y controla `page` (en URL o estado). No hace fetch.
 * ========================================================================== */

export function TablePagination({
  page,
  totalPages,
  total,
  shown,
  noun,
  nounSingular,
  onPageChange,
}: {
  /** Página actual (1-based). */
  page: number;
  /** Total de páginas (>= 1). */
  totalPages: number;
  /** Total de filas en todo el período. */
  total: number;
  /** Filas mostradas en la página actual. */
  shown: number;
  /** Sustantivo en plural, ej: "ventas". */
  noun: string;
  /** Sustantivo en singular, ej: "venta" (default: `noun`). */
  nounSingular?: string;
  /** Cambia de página (recibe el número destino ya clamped por el padre). */
  onPageChange: (next: number) => void;
}) {
  if (total === 0) return null;
  const word = total === 1 ? (nounSingular ?? noun) : noun;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/10">
      <span className="text-[11.5px] font-medium text-slate-500 dark:text-slate-400">
        Mostrando{' '}
        <strong className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
          {shown}
        </strong>{' '}
        de{' '}
        <strong className="font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
          {total.toLocaleString('es-CL')}
        </strong>{' '}
        {word} · página {page} de {totalPages}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="rounded-xl border border-slate-200 bg-white px-4 py-1.5 text-[11px] font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        >
          Anterior
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="rounded-xl border border-slate-200 bg-white px-4 py-1.5 text-[11px] font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
