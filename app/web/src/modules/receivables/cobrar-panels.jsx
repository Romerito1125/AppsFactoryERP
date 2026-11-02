import { AllocationFlow } from "@/components/payments/allocation-flow";
import { apiClient } from "@/lib/api-client";
import { clientDisplayName } from "./receivable-utils";

/* ------------------------------ Pagos o abonos ------------------------------- */

/** "PAGOS O ABONOS A CUENTAS" del cliente: registra el recibo de cobro (banco + cartera). */
export function CollectionFlow({
  client,
  credits,
  initialCreditId,
  bankAccounts,
  sellerName,
  onClose,
  onDone,
}) {
  const rows = credits
    .filter((credit) => credit.balance > 0)
    .map((credit) => ({
      id: credit.id,
      number: credit.invoice?.consecutive ?? `CR-${String(credit.id).padStart(6, "0")}`,
      issuedAt: credit.createdAt,
      dueAt: credit.dueDate,
      balance: credit.balance,
    }));
  return (
    <AllocationFlow
      title="PAGOS O ABONOS A CUENTAS"
      party={clientDisplayName(client)}
      rows={rows}
      initialId={initialCreditId}
      withRetention
      bankAccounts={bankAccounts}
      sellerName={sellerName}
      onClose={onClose}
      onDone={onDone}
      submit={(allocations, result) =>
        apiClient.post("/recibos/cobro", {
          clientId: client.id,
          documentNumber: result.documentNumber,
          detail: result.detail,
          paidAt: result.paidAt ? new Date(`${result.paidAt}T12:00:00`).toISOString() : undefined,
          allocations: allocations.map((line) => ({
            creditId: line.id,
            amount: line.amount,
            ...(line.retention ? { retention: line.retention } : {}),
          })),
          cashAmount: result.cashAmount || undefined,
          cashAccountId: result.cashAccountId,
          instruments: result.instruments,
          comments: result.comments || undefined,
          operationType: result.operationType || undefined,
          sellerName: result.sellerName || undefined,
          ...(result.support ?? {}),
        })
      }
    />
  );
}
