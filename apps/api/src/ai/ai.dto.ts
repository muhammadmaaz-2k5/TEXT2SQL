import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ConversationTurnDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @ApiProperty()
  @IsString()
  prompt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sql?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  explanation?: string;
}

export class AiAskDto {
  @ApiProperty({
    example: 'Show total revenue and completed order count by customer segment',
  })
  @IsString()
  @MinLength(2, { message: 'Enter a question in plain English.' })
  @MaxLength(2000)
  prompt: string;

  @ApiPropertyOptional({ type: [ConversationTurnDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConversationTurnDto)
  history?: ConversationTurnDto[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowWrite?: boolean;
}

export class OptimizeSqlDto {
  @ApiProperty({
    example:
      "SELECT c.full_name, c.segment, o.total_cents FROM customers c JOIN orders o ON o.customer_id = c.id WHERE c.country_code = 'US' ORDER BY o.total_cents DESC;",
  })
  @IsString()
  @MinLength(1)
  sql: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  analyze?: boolean;
}

export class BenchmarkIndexDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  sql: string;

  @ApiProperty({
    example: 'CREATE INDEX IF NOT EXISTS idx_customers_country_code ON customers (country_code);',
  })
  @IsString()
  @MinLength(1)
  createIndexSql: string;
}

export class GenerateDashboardDto {
  @ApiProperty({ example: 'db_shop_analytics' })
  @IsString()
  @MinLength(1)
  databaseId: string;

  @ApiProperty({
    example: 'sales dashboard with revenue, monthly trend, top customers, failed orders',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  prompt: string;

  @ApiPropertyOptional({ example: 'Q4 Sales & Fulfillment Board' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}

export class WidgetLayoutPatchDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position: number;

  @ApiProperty({ enum: ['sm', 'md', 'lg'] })
  @IsIn(['sm', 'md', 'lg'])
  size: 'sm' | 'md' | 'lg';

  @ApiPropertyOptional({ enum: ['bar', 'line', 'area', 'pie', 'scatter', 'kpi', 'table'] })
  @IsOptional()
  @IsIn(['bar', 'line', 'area', 'pie', 'scatter', 'kpi', 'table'])
  chartType?: 'bar' | 'line' | 'area' | 'pie' | 'scatter' | 'kpi' | 'table';
}

export class UpdateDashboardLayoutDto {
  @ApiProperty({ type: [WidgetLayoutPatchDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WidgetLayoutPatchDto)
  widgets: WidgetLayoutPatchDto[];
}

export class ShareDashboardDto {
  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER'], default: 'VIEWER' })
  @IsIn(['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER'])
  minRole: 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER';

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  revoke?: boolean;
}

export class InviteTeamMemberDto {
  @ApiProperty({ example: 'elena.vance@acme.dev' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: 'Elena Vance' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ enum: ['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER'], default: 'DEVELOPER' })
  @IsOptional()
  @IsIn(['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER'])
  role?: 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER';
}

export class UpdateTeamMemberRoleDto {
  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER'] })
  @IsIn(['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER'])
  role: 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER';
}

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Looker Studio & BI Connector' })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  name: string;

  @ApiPropertyOptional({ type: [String], example: ['read'] })
  @IsOptional()
  @IsArray()
  @IsIn(['read', 'write'], { each: true })
  scopes?: Array<'read' | 'write'>;
}

export class PublicAiQueryDto {
  @ApiProperty({ example: 'db_shop_analytics' })
  @IsString()
  @MinLength(1)
  databaseId: string;

  @ApiProperty({
    example: 'Show total revenue and completed order count by customer segment',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  prompt: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowWrite?: boolean;

  @ApiPropertyOptional({ default: 250 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  rowLimit?: number;
}



