import { useState } from "react";
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
  sellers,
  sellerName,
  onClose,
  onDone,
}) {
  const [documentNumber] = useState(() => `AB-${client.id}-${Date.now()}`);
  const configuredRetention = client.retention?.isActive ? client.retention : null;
  const rows = credits
    .filter((credit) => credit.balance > 0)
    .map((credit) => ({
      id: credit.id,
      number: credit.invoice?.consecutive ?? `CR-${String(credit.id).padStart(6, "0")}`,
      issuedAt: credit.createdAt,
      dueAt: credit.dueDate,
      balance: credit.balance,
      retentionRate: resolveRetentionRate(configuredRetention, credit.balance),
      retentionRanges: configuredRetention?.ranges ?? [],
      retentionLabel: configuredRetention?.code ?? "",
    }));
  return (
    <AllocationFlow
      title="PAGOS O ABONOS A CUENTAS"
      party={clientDisplayName(client)}
      rows={rows}
      initialId={initialCreditId}
      withRetention
      totalLabel="Total recibido"
      bankAccounts={bankAccounts}
      sellers={sellers}
      initialDocumentNumber={documentNumber}
      initialDetail={`Abono de cartera · ${clientDisplayName(client)}${rows.length === 1 ? ` · ${rows[0].number}` : ""}`}
      initialOperationType="Abono a crédito"
      client={client}
      previousBalance={credits.reduce((sum, credit) => sum + Number(credit.balance ?? 0), 0)}
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

function resolveRetentionRate(retention, base) {
  if (!retention?.isActive) return 0;
  const match = (retention.ranges ?? []).find((range) => {
    const minimum = Number(range.minimum ?? 0);
    const maximum = Number(range.maximum ?? Number.MAX_SAFE_INTEGER);
    return Number(base) >= minimum && Number(base) <= maximum;
  });
  return Math.max(0, Math.min(99.99, Number(match?.percentage ?? 0)));
}
