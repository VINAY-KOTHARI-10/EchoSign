// CSR: Client-Side Rendering. The server sends an empty card; the browser then asks /api/time (a Route Handler).
import { getDictionary } from '@/i18n/get-dictionary';
import ClientTime from './ClientTime';

export default async function CsrPage({ params }) {
  const { locale } = await params;
  const d = await getDictionary(locale);
  return <ClientTime title={d.rendering.csr} body={d.rendering.csrBody} label={d.rendering.time} loading={d.common.loading} />;
}
