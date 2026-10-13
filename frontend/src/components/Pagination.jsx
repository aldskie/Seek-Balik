import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Shared table pagination footer — every list page uses this so paging
 * looks and behaves the same everywhere:
 *
 *   Showing 11 to 20 of 53 entries        [< Previous]  Page 2 of 6  [Next >]
 *
 * Props
 *   currentPage   1-based page being shown
 *   totalItems    total number of rows (after filters/search)
 *   pageSize      rows per page (default 10)
 *   onPageChange  called with the new page number
 *   extra         optional node shown after the "Showing ..." text
 *   className     optional extra classes for the outer bar
 *
 * Renders nothing when there are no rows.
 */
const Pagination = ({
  currentPage,
  totalItems,
  pageSize = 10,
  onPageChange,
  extra = null,
  className = "",
}) => {
  if (!totalItems || totalItems <= 0) return null;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(Math.max(1, currentPage || 1), totalPages);
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  const go = (next) => {
    const target = Math.min(Math.max(1, next), totalPages);
    if (target !== page) onPageChange?.(target);
  };

  const btn =
    "inline-flex h-8 items-center gap-1 rounded-lg border border-[#CBD8E8] bg-white px-3 text-xs font-bold text-[#071E3D] transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div
      className={`shrink-0 flex flex-col items-center justify-between gap-3 border-t border-[#D8E2EF] bg-slate-50 px-6 py-3 sm:flex-row ${className}`}
    >
      <p className="text-xs font-semibold text-[#7B8AA6]">
        Showing {from} to {to} of {totalItems} {totalItems === 1 ? "entry" : "entries"}
        {extra}
      </p>

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => go(page - 1)} disabled={page === 1} className={btn}>
          <ChevronLeft size={16} /> Previous
        </button>

        <span className="px-2 text-xs font-bold text-[#071E3D]">
          Page {page} of {totalPages}
        </span>

        <button type="button" onClick={() => go(page + 1)} disabled={page === totalPages} className={btn}>
          Next <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
