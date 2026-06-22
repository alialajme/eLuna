"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

type LoadMoreButtonProps = {
  currentPage: number;
  totalCount: number;
  loadedCount: number;
};

export function LoadMoreButton({ currentPage, totalCount, loadedCount }: LoadMoreButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (loadedCount >= totalCount) return null;

  function handleLoadMore() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(currentPage + 1));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <button
      type="button"
      onClick={handleLoadMore}
      className="rounded-full border border-sand px-8 py-3 text-body-md text-ink hover:bg-sand transition-colors"
    >
      Load more ({totalCount - loadedCount} remaining)
    </button>
  );
}
