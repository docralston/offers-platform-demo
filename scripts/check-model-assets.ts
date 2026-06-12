import { runAssetHealthChecks } from '@/lib/domain/dashboard/asset-health';
import type { ModelCoverageBrand } from '@/lib/domain/dashboard/summary';

async function main() {
  const [brandArg, yearArg] = process.argv.slice(2);
  if (!brandArg || !yearArg) {
    // eslint-disable-next-line no-console
    console.error('Usage: tsx scripts/check-model-assets.ts <brand: toyota|lexus|bmw> <year>');
    process.exit(1);
  }

  const brand = brandArg as ModelCoverageBrand;
  const year = Number(yearArg);
  if (!Number.isInteger(year)) {
    // eslint-disable-next-line no-console
    console.error('Year must be an integer, received:', yearArg);
    process.exit(1);
  }

  await runAssetHealthChecks({ brand, year });
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();

