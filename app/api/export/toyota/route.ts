import { requireUserId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { renderOffersCsvFull } from '@/lib/renderers/csv';

export async function GET() {
  // Admin auth (Clerk). If you need secret-based auth for CI, add it later.
  await requireUserId();

  const offers = await prisma.offer.findMany({
    where: { storeCode: 'TOY' },
    orderBy: [{ updatedAt: 'desc' }],
  });

  const csv = renderOffersCsvFull(offers);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename=\"toyota-offers.csv\"',
      'Cache-Control': 'no-store',
    },
  });
}

