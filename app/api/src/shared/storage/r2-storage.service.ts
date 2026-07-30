import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { envs } from '../../config/envs';

export interface UploadedFileResult {
  key: string;
  url: string;
  mimeType: string;
  size: number;
}

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
}

@Injectable()
export class R2StorageService {
  private readonly logger = new Logger(R2StorageService.name);
  private readonly maxSizeInBytes = 5 * 1024 * 1024;
  private readonly allowedMimeTypes = new Map([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
  ]);
  private readonly config = this.getR2Config();
  private readonly client = this.config
    ? new S3Client({
        region: 'auto',
        endpoint: `https://${this.config.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
      })
    : null;

  async uploadProductImage(
    file: Express.Multer.File,
    productId?: number,
  ): Promise<UploadedFileResult> {
    this.validateImage(file);
    const { client, config } = this.getRequiredStorage();

    const extension = this.allowedMimeTypes.get(file.mimetype)!;
    const owner = productId ? String(productId) : 'temp';
    const key = `products/${owner}/${Date.now()}-${randomUUID()}.${extension}`;

    try {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
    } catch (error) {
      const errorMessage = this.getStorageErrorMessage(error);
      this.logger.error(
        `Error subiendo imagen a Cloudflare R2. bucket=${config.bucket} key=${key} error=${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadRequestException(
        `No se pudo subir la imagen a Cloudflare R2: ${errorMessage}`,
      );
    }

    return {
      key,
      url: `${config.publicUrl}/${key}`,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  async deleteFile(keyOrUrl?: string | null) {
    if (!this.config || !this.client) return;

    const key = this.extractKey(keyOrUrl);
    if (!key) return;

    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
        }),
      );
    } catch (error) {
      const errorMessage = this.getStorageErrorMessage(error);
      this.logger.error(
        `Error eliminando imagen de Cloudflare R2. bucket=${this.config.bucket} key=${key} error=${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadRequestException(
        `No se pudo eliminar la imagen de Cloudflare R2: ${errorMessage}`,
      );
    }
  }

  private validateImage(file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Debe enviar una imagen');
    }

    if (!this.allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException(
        'Tipo de imagen no permitido. Use JPG, PNG o WEBP',
      );
    }

    if (file.size > this.maxSizeInBytes) {
      throw new BadRequestException('La imagen no puede superar 5 MB');
    }
  }

  private extractKey(keyOrUrl?: string | null) {
    if (!keyOrUrl) return null;

    if (!this.config) return null;

    const publicUrl = `${this.config.publicUrl}/`;
    if (keyOrUrl.startsWith(publicUrl)) {
      return keyOrUrl.slice(publicUrl.length);
    }

    if (!keyOrUrl.startsWith('http://') && !keyOrUrl.startsWith('https://')) {
      return keyOrUrl;
    }

    try {
      const parsedUrl = new URL(keyOrUrl);

      if (!this.config) return null;

      const publicUrl = new URL(this.config.publicUrl);
      if (parsedUrl.origin !== publicUrl.origin) {
        return null;
      }

      return parsedUrl.pathname.replace(/^\//, '');
    } catch {
      return null;
    }
  }

  private getStorageErrorMessage(error: unknown) {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === 'object' && error !== null && 'message' in error) {
      return String(error.message);
    }

    return 'Error desconocido del proveedor de almacenamiento';
  }

  private getRequiredStorage() {
    if (!this.config || !this.client) {
      throw new BadRequestException(
        'El almacenamiento de imagenes no esta configurado en el servidor',
      );
    }

    return {
      config: this.config,
      client: this.client,
    };
  }

  private getR2Config(): R2Config | null {
    if (!envs.cloudflareR2.enabled) {
      return null;
    }

    return {
      accountId: envs.cloudflareR2.accountId!,
      accessKeyId: envs.cloudflareR2.accessKeyId!,
      secretAccessKey: envs.cloudflareR2.secretAccessKey!,
      bucket: envs.cloudflareR2.bucket!,
      publicUrl: envs.cloudflareR2.publicUrl!,
    };
  }
}
