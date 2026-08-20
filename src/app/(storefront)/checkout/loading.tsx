export default function CheckoutLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-orange-500" />
        <p className="text-sm text-gray-500">Preparing checkout...</p>
      </div>
    </div>
  );
}
