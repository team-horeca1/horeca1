'use client';

export default function VendorError({ error, reset }: { error: Error; reset: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <span className="text-2xl">!</span>
            </div>
            <h2 className="text-xl font-bold text-[#181725]">Something went wrong</h2>
            <p className="text-sm text-[#7C7C7C] max-w-md text-center">{error.message}</p>
            <button onClick={reset} className="px-6 py-3 bg-primary text-white rounded-[10px] font-bold hover:bg-primary-dark transition-colors">
                Try Again
            </button>
        </div>
    );
}
