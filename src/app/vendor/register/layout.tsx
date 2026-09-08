import { GoogleMapsProvider } from '@/components/providers/GoogleMapsProvider';

export default function VendorRegisterLayout({ children }: { children: React.ReactNode }) {
  return (
    <GoogleMapsProvider>
      <div className="bg-[#F8F9FB] min-h-screen">
        {children}
      </div>
    </GoogleMapsProvider>
  );
}
