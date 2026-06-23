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

@Injectable()
export class R2StorageService {
  private readonly logger = new Logger(R2StorageService.name);
  private readonly maxSizeInBytes = 5 * 1024 * 1024;
  private readonly allowedMimeTypes = new Map([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
  ]);
  private readonly client = new S3Client({
    region: 'auto',
    endpoint: `https://${envs.cloudflareR2.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: envs.cloudflareR2.accessKeyId,
      secretAccessKey: envs.cloudflareR2.secretAccessKey,
    },
  });

  async uploadProductImage(
    file: Express.Multer.File,
    productId?: number,
  ): Promise<UploadedFileResult> {
    this.validateImage(file);

    const extension = this.allowedMimeTypes.get(file.mimetype)!;
    const owner = productId ? String(productId) : 'temp';
    const key = `products/${owner}/${Date.now()}-${randomUUID()}.${extension}`;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: envs.cloudflareR2.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
    } catch (error) {
      const errorMessage = this.getStorageErrorMessage(error);
      this.logger.error(
        `Error subiendo imagen a Cloudflare R2. bucket=${envs.cloudflareR2.bucket} key=${key} error=${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadRequestException(
        `No se pudo subir la imagen a Cloudflare R2: ${errorMessage}`,
      );
    }

    return {
      key,
      url: `${envs.cloudflareR2.publicUrl}/${key}`,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  async deleteFile(keyOrUrl?: string | null) {
    const key = this.extractKey(keyOrUrl);
    if (!key) return;

    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: envs.cloudflareR2.bucket,
          Key: key,
        }),
      );
    } catch (error) {
      const errorMessage = this.getStorageErrorMessage(error);
      this.logger.error(
        `Error eliminando imagen de Cloudflare R2. bucket=${envs.cloudflareR2.bucket} key=${key} error=${errorMessage}`,
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

    const publicUrl = `${envs.cloudflareR2.publicUrl}/`;
    if (keyOrUrl.startsWith(publicUrl)) {
      return keyOrUrl.slice(publicUrl.length);
    }

    if (!keyOrUrl.startsWith('http://') && !keyOrUrl.startsWith('https://')) {
      return keyOrUrl;
    }

    try {
      return new URL(keyOrUrl).pathname.replace(/^\//, '');
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
}
