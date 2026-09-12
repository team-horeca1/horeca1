import { redirect } from 'next/navigation';

export default function VendorBusinessesRedirect() {
  redirect('/businesses?type=supplier');
}
