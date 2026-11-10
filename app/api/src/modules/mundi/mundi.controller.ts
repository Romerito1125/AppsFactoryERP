import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { MundiChatDto, MundiConfirmDto } from './dto/mundi-chat.dto';
import { MundiService, type MundiEvent } from './mundi.service';

type AuthRequest = Request & { user: AuthUser };

const STAFF = [Role.ADMIN, Role.CONTADOR, Role.CAJERO, Role.VENDEDOR, Role.BODEGA];

@Controller('mundi')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...STAFF)
export class MundiController {
  constructor(private readonly mundiService: MundiService) {}

  @Get('estado')
  status(@Req() request: AuthRequest) {
    return this.mundiService.status(request.user);
  }

  @Get('herramientas')
  tools() {
    return this.mundiService.listTools();
  }

  /** Respuesta en streaming NDJSON: un evento JSON por línea. */
  @Post('chat')
  async chat(@Body() dto: MundiChatDto, @Req() request: AuthRequest, @Res() response: Response) {
    await this.pipe(response, (signal) => this.mundiService.chat(request.user, dto, signal));
  }

  @Post('confirmar')
  async confirm(@Body() dto: MundiConfirmDto, @Req() request: AuthRequest, @Res() response: Response) {
    // Valida dueño/expiración antes de abrir el stream para responder 403/404 normales.
    const resume = this.mundiService.confirm(request.user, dto.pendingId, dto.approve);
    await this.pipe(response, resume);
  }

  private async pipe(
    response: Response,
    source: (signal: AbortSignal) => AsyncGenerator<MundiEvent>,
  ) {
    const controller = new AbortController();
    response.on('close', () => {
      if (!response.writableFinished) controller.abort();
    });
    response.status(200);
    response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    try {
      for await (const event of source(controller.signal)) {
        if (controller.signal.aborted) break;
        response.write(`${JSON.stringify(event)}\n`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado';
      response.write(`${JSON.stringify({ type: 'error', message })}\n`);
    } finally {
      response.end();
    }
  }
}
