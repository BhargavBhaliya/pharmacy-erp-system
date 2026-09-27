import type { DocumentType } from "@prisma/client";
import type { Db } from "./permissionsCatalog";

// e.g. startMonth=4 (April): a date in Jan-Mar 2027 belongs to FY "2026-27", not "2027-28".
export function getFinancialYearLabel(date: Date, financialYearStartMonth: number): string {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const fyStartYear = month >= financialYearStartMonth ? year : year - 1;
  const fyEndYearShort = (fyStartYear + 1) % 100;
  return `${fyStartYear}-${String(fyEndYearShort).padStart(2, "0")}`;
}

interface NextDocumentNumberParams {
  tenantId: string;
  branchId: string;
  docType: DocumentType;
  prefix: string;
  now?: Date;
}

// Atomically increments a per-(tenant, branch, docType, financial-year) counter and returns a
// formatted document number like "PUR/2026-27/000001" (spec section 46). Must be called inside
// the same transaction as the document it numbers, so a rollback doesn't burn a number.
export async function getNextDocumentNumber(db: Db, params: NextDocumentNumberParams): Promise<string> {
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: params.tenantId }, select: { financialYearStartMonth: true } });
  const financialYear = getFinancialYearLabel(params.now ?? new Date(), tenant.financialYearStartMonth);

  const existing = await db.invoiceSequence.findUnique({
    where: {
      tenantId_branchId_docType_financialYear: {
        tenantId: params.tenantId,
        branchId: params.branchId,
        docType: params.docType,
        financialYear,
      },
    },
  });

  const sequence = existing
    ? await db.invoiceSequence.update({ where: { id: existing.id }, data: { lastNumber: { increment: 1 } } })
    : await db.invoiceSequence.create({
        data: {
          tenantId: params.tenantId,
          branchId: params.branchId,
          docType: params.docType,
          financialYear,
          prefix: params.prefix,
          lastNumber: 1,
        },
      });

  return `${sequence.prefix}/${financialYear}/${String(sequence.lastNumber).padStart(6, "0")}`;
}
