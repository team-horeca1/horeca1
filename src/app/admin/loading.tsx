export default function AdminLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-divider border-t-primary" />
        <p className="text-sm text-gray-500">Loading admin panel...</p>
      </div>
    </div>
  );
}
