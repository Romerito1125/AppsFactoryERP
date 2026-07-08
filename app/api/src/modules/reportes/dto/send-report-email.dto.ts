import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ReportEmailSection } from '../report-email.types';

export class SendReportEmailDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsEmail({}, { each: true })
  to!: string[];

  @IsString()
  @MinLength(3)
  subject!: string;

  @IsString()
  startDate!: string;

  @IsString()
  endDate!: string;

  @IsOptional()
  @IsString()
  generatedAt?: string;

  @IsOptional()
  @IsString()
  generatedBy?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(ReportEmailSection, { each: true })
  sections!: ReportEmailSection[];

  @IsArray()
  summaryCards!: Array<Record<string, unknown>>;

  @IsArray()
  highlights!: Array<Record<string, unknown>>;

  @IsOptional()
  @IsArray()
  invoiceRows?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsArray()
  ivaRows?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsArray()
  exogenousRows?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsArray()
  gmfRows?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsArray()
  lowStockRows?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsArray()
  topProductRows?: Array<Record<string, unknown>>;
}
