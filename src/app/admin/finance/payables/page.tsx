import { redirect } from 'next/navigation';

export default function SupplierPayablesRedirect() {
  redirect('/admin/finance');
}
