import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const ATTACHMENT_MIME = /^(application\/pdf|image\/(png|jpe?g|webp|gif))$/i;
const ATTACHMENT_DATA = /^data:(application\/pdf|image\/(png|jpe?g|webp|gif));base64,/i;

export class MundiAttachmentDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsString()
  @Matches(ATTACHMENT_MIME, { message: 'Solo se aceptan PDF o imágenes (PNG, JPG, WEBP, GIF).' })
  mimeType: string;

  // Data URL en base64. ~10 MB de archivo ≈ 14 MB codificado.
  @IsString()
  @MaxLength(14_000_000, { message: 'El archivo supera los 10 MB.' })
  @Matches(ATTACHMENT_DATA, { message: 'El adjunto debe ser un PDF o una imagen en base64.' })
  data: string;
}

export class MundiMessageDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  @MaxLength(20_000)
  content: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => MundiAttachmentDto)
  attachments?: MundiAttachmentDto[];
}

export class MundiChatDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => MundiMessageDto)
  messages: MundiMessageDto[];
}

export class MundiConfirmDto {
  @IsUUID()
  pendingId: string;

  @IsBoolean()
  approve: boolean;
}
