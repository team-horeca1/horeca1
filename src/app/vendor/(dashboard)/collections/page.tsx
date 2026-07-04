import { redirect } from 'next/navigation';

export default function VendorCollectionsRedirect() {
  redirect('/vendor/credit?tab=collections');
}
