import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { CSSProperties } from 'react';
import { ReportEmailSection, type ReportEmailMetric, type ReportEmailTableRow } from '../report-email.types';

interface ReportesEmailProps {
  subject: string;
  startDate: string;
  endDate: string;
  generatedAt?: string;
  generatedBy?: string;
  sections: ReportEmailSection[];
  summaryCards: ReportEmailMetric[];
  highlights: ReportEmailMetric[];
  invoiceRows?: ReportEmailTableRow[];
  ivaRows?: ReportEmailTableRow[];
  exogenousRows?: ReportEmailTableRow[];
  gmfRows?: ReportEmailTableRow[];
  lowStockRows?: ReportEmailTableRow[];
  topProductRows?: ReportEmailTableRow[];
}

const bodyStyle: CSSProperties = {
  backgroundColor: '#f5f7fb',
  fontFamily: 'Arial, Helvetica, sans-serif',
  color: '#0f172a',
  margin: 0,
  padding: '24px 12px',
};

const containerStyle: CSSProperties = {
  maxWidth: '900px',
  margin: '0 auto',
  backgroundColor: '#ffffff',
  borderRadius: '20px',
  overflow: 'hidden',
  border: '1px solid #e2e8f0',
};

const heroStyle: CSSProperties = {
  padding: '28px 32px 20px',
  background: 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)',
  color: '#ffffff',
};

const contentStyle: CSSProperties = {
  padding: '24px 32px 32px',
};

const gridTableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'separate',
  borderSpacing: '12px',
  margin: '0 -12px',
};

const metricCardStyle: CSSProperties = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  padding: '16px',
  verticalAlign: 'top',
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: '12px',
};

const cellStyle: CSSProperties = {
  border: '1px solid #e2e8f0',
  padding: '10px 12px',
  fontSize: '12px',
  lineHeight: '18px',
  verticalAlign: 'top',
};

const headCellStyle: CSSProperties = {
  ...cellStyle,
  backgroundColor: '#eff6ff',
  fontWeight: 700,
};

function normalizeRows(items: Array<Record<string, unknown>> = []): ReportEmailTableRow[] {
  return items.map((item) =>
    Object.fromEntries(Object.entries(item).map(([key, value]) => [key, value == null ? '' : String(value)])),
  )
}

function DataTable({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: ReportEmailTableRow[];
}) {
  if (!rows.length) {
    return null;
  }

  const columns = Object.keys(rows[0] ?? {});

  return (
    <Section style={{ marginTop: '24px' }}>
      <Heading as="h3" style={{ fontSize: '18px', margin: '0 0 6px' }}>
        {title}
      </Heading>
      <Text style={{ fontSize: '13px', lineHeight: '20px', color: '#475569', margin: '0 0 12px' }}>
        {description}
      </Text>
      <table style={tableStyle}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} style={headCellStyle} align="left">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${title}-${index}`}>
              {columns.map((column) => (
                <td key={column} style={cellStyle}>
                  {row[column] || '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

export function ReportesEmail(props: ReportesEmailProps) {
  const summaryCards = props.summaryCards ?? [];
  const highlights = props.highlights ?? [];
  const invoiceRows = normalizeRows(props.invoiceRows as Array<Record<string, unknown>>);
  const ivaRows = normalizeRows(props.ivaRows as Array<Record<string, unknown>>);
  const exogenousRows = normalizeRows(props.exogenousRows as Array<Record<string, unknown>>);
  const gmfRows = normalizeRows(props.gmfRows as Array<Record<string, unknown>>);
  const lowStockRows = normalizeRows(props.lowStockRows as Array<Record<string, unknown>>);
  const topProductRows = normalizeRows(props.topProductRows as Array<Record<string, unknown>>);
  const preview = `${props.subject} · Corte ${props.startDate} a ${props.endDate}`;

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={heroStyle}>
            <Text style={{ margin: '0 0 8px', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.8 }}>
              Reportes del negocio
            </Text>
            <Heading as="h1" style={{ margin: '0 0 8px', fontSize: '28px', lineHeight: '34px', color: '#ffffff' }}>
              {props.subject}
            </Heading>
            <Text style={{ margin: 0, fontSize: '14px', lineHeight: '22px', color: '#dbeafe' }}>
              Corte desde <strong>{props.startDate}</strong> hasta <strong>{props.endDate}</strong>
              {props.generatedBy ? ` · Generado por ${props.generatedBy}` : ''}
              {props.generatedAt ? ` · ${props.generatedAt}` : ''}
            </Text>
          </Section>

          <Section style={contentStyle}>
            {props.sections.includes(ReportEmailSection.RESUMEN) ? (
              <>
                <Heading as="h2" style={{ fontSize: '20px', margin: '0 0 12px' }}>
                  Resumen ejecutivo
                </Heading>
                <table style={gridTableStyle}>
                  <tbody>
                    <tr>
                      {summaryCards.slice(0, 3).map((card) => (
                        <td key={card.label} style={metricCardStyle} width="33.33%">
                          <Text style={{ margin: '0 0 8px', fontSize: '12px', color: '#475569' }}>{card.label}</Text>
                          <Text style={{ margin: '0 0 8px', fontSize: '22px', fontWeight: 700, color: '#0f172a' }}>{card.value}</Text>
                          {card.help ? <Text style={{ margin: 0, fontSize: '12px', lineHeight: '18px', color: '#64748b' }}>{card.help}</Text> : null}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      {summaryCards.slice(3, 6).map((card) => (
                        <td key={card.label} style={metricCardStyle} width="33.33%">
                          <Text style={{ margin: '0 0 8px', fontSize: '12px', color: '#475569' }}>{card.label}</Text>
                          <Text style={{ margin: '0 0 8px', fontSize: '22px', fontWeight: 700, color: '#0f172a' }}>{card.value}</Text>
                          {card.help ? <Text style={{ margin: 0, fontSize: '12px', lineHeight: '18px', color: '#64748b' }}>{card.help}</Text> : null}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>

                {highlights.length ? (
                  <Section style={{ marginTop: '20px' }}>
                    <Heading as="h3" style={{ fontSize: '18px', margin: '0 0 8px' }}>
                      Indicadores del corte
                    </Heading>
                    {highlights.map((item) => (
                      <Text key={item.label} style={{ margin: '0 0 6px', fontSize: '13px', color: '#334155' }}>
                        <strong>{item.label}:</strong> {item.value}
                      </Text>
                    ))}
                  </Section>
                ) : null}
                <Hr style={{ margin: '24px 0', borderColor: '#e2e8f0' }} />
              </>
            ) : null}

            {props.sections.includes(ReportEmailSection.FACTURAS) ? (
              <DataTable
                title="Facturas del corte"
                description="Vista operativa con neto, contado, credito, IVA y total por factura."
                rows={invoiceRows}
              />
            ) : null}

            {props.sections.includes(ReportEmailSection.IVA) ? (
              <DataTable
                title="IVA cobrado"
                description="Consolidado por tarifa para declaraciones y revisiones contables."
                rows={ivaRows}
              />
            ) : null}

            {props.sections.includes(ReportEmailSection.EXOGENAS) ? (
              <DataTable
                title="Base para exogenas"
                description="Consolidado por cliente para exportacion y analisis contable."
                rows={exogenousRows}
              />
            ) : null}

            {props.sections.includes(ReportEmailSection.GMF) ? (
              <DataTable
                title="4x1000 segmentado"
                description="Estimacion del GMF sobre movimientos que salen de las cuentas bancarias."
                rows={gmfRows}
              />
            ) : null}

            {props.sections.includes(ReportEmailSection.STOCK) ? (
              <DataTable
                title="Stock critico y regular"
                description="Productos que requieren seguimiento o reposicion a la fecha de corte."
                rows={lowStockRows}
              />
            ) : null}

            {props.sections.includes(ReportEmailSection.PRODUCTOS) ? (
              <DataTable
                title="Top productos vendidos"
                description="Referencias con mayor rotacion y facturacion en el periodo."
                rows={topProductRows}
              />
            ) : null}

            <Hr style={{ margin: '24px 0', borderColor: '#e2e8f0' }} />
            <Text style={{ margin: 0, fontSize: '12px', lineHeight: '18px', color: '#64748b' }}>
              Este correo fue generado automaticamente desde el modulo de reportes del ERP.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
