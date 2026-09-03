import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { render } from '@react-email/render';
import { Resend } from 'resend';
import { envs } from '../../config/envs';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { SendReportEmailDto } from './dto/send-report-email.dto';
import { ReportesEmail } from './emails/reportes-email';
import type {
  ReportEmailMetric,
  ReportEmailTableRow,
} from './report-email.types';

@Injectable()
export class ReportesService {
  private readonly resend = envs.resend.apiKey
    ? new Resend(envs.resend.apiKey)
    : null;

  async sendEmail(payload: SendReportEmailDto, user: AuthUser) {
    if (!this.resend || !envs.resend.fromEmail) {
      throw new BadRequestException(
        'Configura RESEND_API_KEY y RESEND_FROM_EMAIL en el .env del API para habilitar el envio de reportes.',
      );
    }

    const html = await render(
      ReportesEmail({
        subject: payload.subject,
        startDate: payload.startDate,
        endDate: payload.endDate,
        generatedAt: payload.generatedAt,
        generatedBy: payload.generatedBy || user.username,
        sections: payload.sections,
        summaryCards: this.normalizeMetrics(payload.summaryCards),
        highlights: this.normalizeMetrics(payload.highlights),
        invoiceRows: this.normalizeRows(payload.invoiceRows),
        ivaRows: this.normalizeRows(payload.ivaRows),
        exogenousRows: this.normalizeRows(payload.exogenousRows),
        gmfRows: this.normalizeRows(payload.gmfRows),
        lowStockRows: this.normalizeRows(payload.lowStockRows),
        weeklyStockRows: this.normalizeRows(payload.weeklyStockRows),
        transferRows: this.normalizeRows(payload.transferRows),
        topProductRows: this.normalizeRows(payload.topProductRows),
      }),
    );

    const { data, error } = await this.resend.emails.send({
      from: envs.resend.fromEmail,
      to: payload.to,
      subject: payload.subject,
      html,
      replyTo: envs.resend.replyToEmail || undefined,
    });

    if (error) {
      throw new InternalServerErrorException(
        error.message || 'No se pudo enviar el correo del reporte',
      );
    }

    return {
      message: 'Reporte enviado por correo correctamente',
      id: data?.id ?? null,
      to: payload.to,
    };
  }

  private normalizeMetrics(
    items?: Array<Record<string, unknown>>,
  ): ReportEmailMetric[] {
    return (items ?? []).map((item) => ({
      label: String(item.label ?? ''),
      value: String(item.value ?? ''),
      help: item.help ? String(item.help) : undefined,
    }));
  }

  private normalizeRows(
    items?: Array<Record<string, unknown>>,
  ): ReportEmailTableRow[] {
    return (items ?? []).map((item) =>
      Object.fromEntries(
        Object.entries(item).map(([key, value]) => [
          key,
          value == null ? '' : String(value),
        ]),
      ),
    );
  }
}
