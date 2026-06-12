'use client';

import type { FormEvent, RefObject } from 'react';
import { DisclaimerSection } from './DisclaimerSection';
import { Alert, Button, FormGroup, Input, Select, Textarea } from '@/components/ui';
import { STORE_CODES } from '@/lib/config/stores';
import { getStoreDisplayId, getStoreDisplayName } from '@/lib/config/store-display';
import { inDemoMode } from '@/lib/config/demo';
import { OfferStatus, VehicleCondition } from '@/lib/domain/offer-status';
import { OFFER_TYPE_ACTIVE } from '@/lib/domain/offer-type';
import type { FinanceRateRow } from '@/lib/domain/offer-form';
import { formatOfferDateInput } from '@/lib/domain/offer-form-dates';
import type { OfferInput } from '@/lib/domain/validation';

type OfferDefaults = Record<string, unknown> & {
  storeCode?: string;
  make?: string | null;
  model?: string;
  year?: number | null;
  trim?: string | null;
  status?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  fuelType?: string | null;
  perExcessMile?: unknown;
  disclaimer?: string | null;
  disclaimerSource?: string;
};

export interface OfferFormProps {
  formRef: RefObject<HTMLFormElement | null>;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  errors: Array<{ field: string; message: string }>;
  mode: 'create' | 'edit';
  offer?: OfferDefaults | null;
  condition: VehicleCondition;
  setCondition: (c: VehicleCondition) => void;
  offerType: string;
  setOfferType: (t: string) => void;
  financeRatesRows: FinanceRateRow[];
  setFinanceRatesRows: React.Dispatch<React.SetStateAction<FinanceRateRow[]>>;
  includeFuelType?: boolean;
  buildOfferInput: () => OfferInput;
  footer: React.ReactNode;
}

const LEASE_FIELDS = [
  ['leasePayment', 'Lease payment', 'number'],
  ['leaseTerm', 'Term (months)', 'number'],
  ['leaseMiles', 'Lease mi/yr', 'number'],
  ['dueAtSigning', 'Due at signing', 'number'],
  ['capCostReduction', 'Cap cost reduction', 'number'],
  ['grossCapCost', 'Gross cap cost', 'number'],
  ['netCapCost', 'Net cap cost', 'number'],
  ['securityDeposit', 'Security deposit', 'number'],
  ['acquisitionFee', 'Acquisition fee', 'number'],
  ['downPayment', 'Down payment', 'number'],
] as const;

export function OfferForm({
  formRef,
  onSubmit,
  errors,
  mode,
  offer,
  condition,
  setCondition,
  offerType,
  setOfferType,
  financeRatesRows,
  setFinanceRatesRows,
  includeFuelType = false,
  buildOfferInput,
  footer,
}: OfferFormProps) {
  const val = (key: string) => {
    const x = offer?.[key];
    return x != null ? String(x) : '';
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-6">
      {errors.length > 0 && (
        <Alert tone="error" title="Please fix the following">
          <ul className="list-disc pl-5 space-y-1">
            {errors.map((e, i) => (
              <li key={i}>{e.field}: {e.message}</li>
            ))}
          </ul>
        </Alert>
      )}

      <Section title="Vehicle">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormGroup label="Store" htmlFor="storeCode" required>
            <Select
              id="storeCode"
              name="storeCode"
              required
              defaultValue={mode === 'edit' ? offer?.storeCode : undefined}
            >
              {mode === 'create' && <option value="">Select store</option>}
              {STORE_CODES.map((c) => (
                <option key={c} value={c}>
                  {inDemoMode() ? getStoreDisplayId(c) : getStoreDisplayName(c)}
                </option>
              ))}
            </Select>
          </FormGroup>
          <FormGroup label="Condition" htmlFor="condition" required>
            <Select
              id="condition"
              name="condition"
              value={condition}
              onChange={(e) => setCondition(e.target.value as VehicleCondition)}
              required
            >
              <option value={VehicleCondition.NEW}>New</option>
              <option value={VehicleCondition.USED}>Used</option>
              <option value={VehicleCondition.CERTIFIED}>Certified</option>
            </Select>
          </FormGroup>
          <FormGroup
            label={condition === VehicleCondition.CERTIFIED && offerType === 'Finance' ? 'Year (optional for Certified Finance)' : 'Year'}
            htmlFor="year"
            required={!(condition === VehicleCondition.CERTIFIED && offerType === 'Finance')}
          >
            <Input
              id="year"
              name="year"
              type="number"
              required={!(condition === VehicleCondition.CERTIFIED && offerType === 'Finance')}
              min={2000}
              max={2100}
              defaultValue={mode === 'edit' ? (offer?.year ?? '') : undefined}
              placeholder={condition === VehicleCondition.CERTIFIED && offerType === 'Finance' ? 'Leave blank' : undefined}
            />
          </FormGroup>
          {condition === VehicleCondition.USED && (
            <FormGroup label="Make" htmlFor="make" required>
              <Input id="make" name="make" required defaultValue={mode === 'edit' ? (offer?.make ?? '') : undefined} />
            </FormGroup>
          )}
          <FormGroup label="Model" htmlFor="model" required>
            <Input id="model" name="model" required defaultValue={mode === 'edit' ? offer?.model : undefined} />
          </FormGroup>
          <FormGroup label="Trim" htmlFor="trim">
            <Input id="trim" name="trim" defaultValue={mode === 'edit' ? (offer?.trim ?? '') : undefined} />
          </FormGroup>
          {includeFuelType && (
            <FormGroup label="Fuel type" htmlFor="fuelType" hint="Used to match finance APR rows (gas / hybrid / plug-in).">
              <Select id="fuelType" name="fuelType" defaultValue={offer?.fuelType ?? ''}>
                <option value="">—</option>
                <option value="GAS">Gas</option>
                <option value="HYBRID">Hybrid</option>
                <option value="PLUG_IN_HYBRID">Plug-in hybrid</option>
              </Select>
            </FormGroup>
          )}
        </div>
      </Section>

      <Section title="Dates & status" hint="Start: when offer is published. End: when it is unpublished.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormGroup label="Start date" htmlFor="startDate" required>
            <Input
              id="startDate"
              name="startDate"
              type="date"
              required
              defaultValue={mode === 'edit' && offer?.startDate ? formatOfferDateInput(offer.startDate) : undefined}
            />
          </FormGroup>
          <FormGroup label="End date" htmlFor="endDate" required>
            <Input
              id="endDate"
              name="endDate"
              type="date"
              required
              defaultValue={mode === 'edit' && offer?.endDate ? formatOfferDateInput(offer.endDate) : undefined}
            />
          </FormGroup>
          <FormGroup label="Status" htmlFor="status">
            <Select
              id="status"
              name="status"
              defaultValue={mode === 'edit' ? offer?.status : OfferStatus.INACTIVE}
            >
              <option value={OfferStatus.INACTIVE}>INACTIVE</option>
              <option value={OfferStatus.LIVE}>LIVE</option>
            </Select>
          </FormGroup>
        </div>
      </Section>

      <Section title="Offer type">
        <FormGroup label="Type" htmlFor="offerType">
          <Select id="offerType" name="offerType" value={offerType} onChange={(e) => setOfferType(e.target.value)}>
            <option value="">—</option>
            {OFFER_TYPE_ACTIVE.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </Select>
        </FormGroup>
      </Section>

      <Section title="Lease" className={offerType === 'Finance' || offerType === 'Cash' ? 'opacity-75' : undefined}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LEASE_FIELDS.map((entry) => (
            <FormGroup key={entry[0]} label={entry[1]} htmlFor={entry[0]}>
              <Input
                id={entry[0]}
                name={entry[0]}
                type={entry[2]}
                min={0}
                defaultValue={mode === 'edit' ? val(entry[0]) : undefined}
              />
            </FormGroup>
          ))}
          <FormGroup label="Per excess mile ($)" htmlFor="perExcessMile">
            <Input
              id="perExcessMile"
              name="perExcessMile"
              type="number"
              step={0.01}
              min={0}
              placeholder="e.g. 0.25"
              defaultValue={mode === 'edit' && offer?.perExcessMile != null ? String(offer.perExcessMile) : undefined}
            />
          </FormGroup>
        </div>
      </Section>

      <Section title="APR (Finance)" className={offerType === 'Lease' || offerType === 'Cash' ? 'opacity-75' : undefined}>
        {offerType === 'Finance' ? (
          <div className="space-y-3">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {includeFuelType
                ? 'Add one or more rate/term options. Best rate uses vehicle fuel type when set; optional per-row fuel tags match OEM programs.'
                : 'Add one or more rate/term options. Best (lowest rate, longest term) is used on the list and dashboard.'}
            </p>
            {financeRatesRows.map((row, i) => (
              <div key={i} className="flex flex-wrap items-end gap-3 rounded border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
                <FormGroup label="APR rate (%)" htmlFor={`financeRate_${i}_aprRate`} className="min-w-[8rem]">
                  <Input id={`financeRate_${i}_aprRate`} name={`financeRate_${i}_aprRate`} type="number" step={0.1} min={0} max={25} placeholder="e.g., 3.9" defaultValue={row.aprRate} />
                </FormGroup>
                <FormGroup label="Term (mo.)" htmlFor={`financeRate_${i}_aprTermMonths`} className="min-w-[8rem]">
                  <Input id={`financeRate_${i}_aprTermMonths`} name={`financeRate_${i}_aprTermMonths`} type="number" min={1} placeholder="e.g., 60" defaultValue={row.aprTermMonths} />
                </FormGroup>
                {includeFuelType && (
                  <FormGroup label="Fuel (row)" htmlFor={`financeRate_${i}_fuelType`} className="min-w-[10rem]">
                    <Select id={`financeRate_${i}_fuelType`} name={`financeRate_${i}_fuelType`} defaultValue={row.fuelType ?? ''}>
                      <option value="">Any</option>
                      <option value="GAS">Gas</option>
                      <option value="HYBRID">Hybrid</option>
                      <option value="PLUG_IN_HYBRID">Plug-in hybrid</option>
                    </Select>
                  </FormGroup>
                )}
                <Button type="button" variant="tertiary" size="sm" onClick={() => setFinanceRatesRows((prev) => prev.filter((_, j) => j !== i))} disabled={financeRatesRows.length <= 1}>
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setFinanceRatesRows((prev) => [
                  ...prev,
                  { aprRate: '', aprTermMonths: '', ...(includeFuelType ? { fuelType: '' } : {}) },
                ])
              }
            >
              Add rate/term
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormGroup label="APR rate (%)" htmlFor="aprRate">
              <Input id="aprRate" name="aprRate" type="number" step={0.1} min={0} max={25} placeholder="e.g., 3.9" defaultValue={mode === 'edit' ? val('aprRate') : undefined} />
            </FormGroup>
            <FormGroup label="APR term (months)" htmlFor="aprTermMonths">
              <Input id="aprTermMonths" name="aprTermMonths" type="number" min={1} placeholder="e.g., 60" defaultValue={mode === 'edit' ? val('aprTermMonths') : undefined} />
            </FormGroup>
          </div>
        )}
      </Section>

      <Section title="Rebates & incentives" hint="Amounts as numbers (no $). Rebate total is auto-calculated if blank and any cash field is present.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(['customerCash', 'leaseCash', 'aprCash', 'bonusCash', 'rebateTotal'] as const).map((field) => (
            <FormGroup
              key={field}
              label={field === 'rebateTotal' ? 'Rebate total' : field.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
              htmlFor={field}
              hint={field === 'rebateTotal' ? 'Auto-calculated if blank' : undefined}
            >
              <Input id={field} name={field} type="number" min={0} step={0.01} defaultValue={mode === 'edit' ? val(field) : undefined} />
            </FormGroup>
          ))}
        </div>
      </Section>

      <Section title="Buy / Cash" hint={offerType === 'Cash' ? 'Primary fields for Cash offers: MSRP, discount, buy for' : undefined}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormGroup label="MSRP" htmlFor="msrp">
            <Input id="msrp" name="msrp" type="number" min={0} defaultValue={mode === 'edit' ? val('msrp') : undefined} />
          </FormGroup>
          <FormGroup label="Discount" htmlFor="discount">
            <Input id="discount" name="discount" type="number" min={0} defaultValue={mode === 'edit' ? val('discount') : undefined} />
          </FormGroup>
          <FormGroup label="Buy for" htmlFor="buyFor">
            <Input id="buyFor" name="buyFor" type="number" min={0} defaultValue={mode === 'edit' ? val('buyFor') : undefined} />
          </FormGroup>
          <FormGroup label="Stock #" htmlFor="stockNumber">
            <Input id="stockNumber" name="stockNumber" defaultValue={mode === 'edit' ? val('stockNumber') : undefined} />
          </FormGroup>
        </div>
      </Section>

      <Section title="Disclaimer" hint="Auto mode regenerates from offer data and global templates on save.">
        <DisclaimerSection
          defaultDisclaimer={mode === 'edit' ? (offer?.disclaimer as string | null) : undefined}
          defaultSource={mode === 'edit' && offer?.disclaimerSource === 'MANUAL' ? 'MANUAL' : 'AUTO'}
          buildOfferInput={buildOfferInput}
        />
      </Section>

      <Section title="Additional notes">
        <FormGroup label="Notes" htmlFor="additionalNotes">
          <Textarea id="additionalNotes" name="additionalNotes" rows={3} placeholder="Optional medium-length notes" defaultValue={mode === 'edit' ? val('additionalNotes') : undefined} />
        </FormGroup>
      </Section>

      <Section title="Assets">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormGroup label="Inventory URL" htmlFor="inventoryUrl">
            <Input id="inventoryUrl" name="inventoryUrl" type="url" defaultValue={mode === 'edit' ? val('inventoryUrl') : undefined} />
          </FormGroup>
          <FormGroup label="Image URL" htmlFor="imageUrl">
            <Input id="imageUrl" name="imageUrl" type="url" defaultValue={mode === 'edit' ? val('imageUrl') : undefined} />
          </FormGroup>
        </div>
      </Section>

      <div className="flex flex-wrap justify-end gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-700">
        {footer}
      </div>
    </form>
  );
}

function Section({
  title,
  hint,
  className,
  children,
}: { title: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={['rounded-md border border-neutral-200 bg-surface-amber/70 px-4 py-4 dark:border-neutral-700 dark:bg-surface-amber-dark/60 sm:px-6', className].filter(Boolean).join(' ')}>
      <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
      {hint && <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{hint}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}
