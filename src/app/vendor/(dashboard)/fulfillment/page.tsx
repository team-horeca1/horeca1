import { redirect } from 'next/navigation';

type SearchParams = Record<string, string | string[] | undefined>;

type Props = {
  searchParams: Promise<SearchParams>;
};

export default async function VendorFulfilmentRedirect({ searchParams }: Props) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') qs.set(key, value);
    else if (Array.isArray(value)) {
      for (const item of value) qs.append(key, item);
    }
  }
  const query = qs.toString();
  redirect(query ? `/vendor/delivery?${query}` : '/vendor/delivery');
}
