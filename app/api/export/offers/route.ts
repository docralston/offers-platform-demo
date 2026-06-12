import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { renderOffersCsvFull } from '@/lib/renderers/csv';
import { OfferStatus } from '@prisma/client';

export async function GET() {
  await requireAdmin();

  const offers = await prisma.offer.findMany({
    where: { status: OfferStatus.LIVE },
    orderBy: [{ updatedAt: 'desc' }],
  });

  // One row per store when offer has storeCodes (e.g. Lexus LEXDT+LEXWG)
  const expanded = offers.flatMap((o) => {
    const codes = o.storeCodes?.length ? o.storeCodes : [o.storeCode];
    return codes.map((sc) => ({ ...o, storeCode: sc }));
  });

  const csv = renderOffersCsvFull(expanded);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="offers.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
