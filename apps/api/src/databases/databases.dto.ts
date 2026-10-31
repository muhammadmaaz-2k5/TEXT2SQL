import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class TestExternalConnectionDto {
  @ApiPropertyOptional({ enum: ['POSTGRESQL', 'MYSQL', 'SQLITE', 'CSV'], default: 'POSTGRESQL' })
  @IsOptional()
  @IsIn(['POSTGRESQL', 'MYSQL', 'SQLITE', 'CSV'])
  engine?: 'POSTGRESQL' | 'MYSQL' | 'SQLITE' | 'CSV';

  @ApiProperty({ example: 'localhost' })
  @IsString()
  @MinLength(1)
  host: string;

  @ApiProperty({ example: 5433 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @ApiProperty({ example: 'shop_analytics' })
  @IsString()
  @MinLength(1)
  databaseName: string;

  @ApiProperty({ example: 'dp_readonly_shop' })
  @IsString()
  @MinLength(1)
  username: string;

  @ApiProperty({ example: 'dp_readonly_secret' })
  @IsString()
  @MinLength(1)
  password: string;

  @ApiPropertyOptional({ enum: ['disable', 'prefer', 'require'], default: 'prefer' })
  @IsOptional()
  @IsIn(['disable', 'prefer', 'require'])
  sslMode?: 'disable' | 'prefer' | 'require';
}

export class ConnectExternalDatabaseDto extends TestExternalConnectionDto {
  @ApiProperty({ example: 'Production Analytics Replica' })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  name: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  readOnlyDefault?: boolean;
}

export class CreateManagedDatabaseDto {
  @ApiProperty({ example: 'Growth Sandbox DB' })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  name: string;

  @ApiPropertyOptional({ enum: ['blank', 'shop_analytics', 'saas_metrics'], default: 'shop_analytics' })
  @IsOptional()
  @IsIn(['blank', 'shop_analytics', 'saas_metrics'])
  template?: 'blank' | 'shop_analytics' | 'saas_metrics';

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  readOnlyDefault?: boolean;
}

export class DesignerColumnDto {
  @ApiProperty({ example: 'id' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'serial' })
  @IsIn([
    'uuid',
    'serial',
    'bigserial',
    'integer',
    'bigint',
    'numeric(12,2)',
    'text',
    'varchar(255)',
    'boolean',
    'timestamptz',
    'date',
    'jsonb',
  ])
  dataType:
    | 'uuid'
    | 'serial'
    | 'bigserial'
    | 'integer'
    | 'bigint'
    | 'numeric(12,2)'
    | 'text'
    | 'varchar(255)'
    | 'boolean'
    | 'timestamptz'
    | 'date'
    | 'jsonb';

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isNullable?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimaryKey?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isUnique?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultValue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referencesTable?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referencesColumn?: string;
}

export class DesignerIndexDto {
  @ApiProperty({ example: 'idx_events_created_at' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ type: [String], example: ['created_at'] })
  @IsArray()
  @IsString({ each: true })
  columns: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isUnique?: boolean;
}

export class DesignerCreateTableDto {
  @ApiProperty({ example: 'feature_flags' })
  @IsString()
  @MinLength(1)
  tableName: string;

  @ApiProperty({ type: [DesignerColumnDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DesignerColumnDto)
  columns: DesignerColumnDto[];

  @ApiPropertyOptional({ type: [DesignerIndexDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DesignerIndexDto)
  indexes?: DesignerIndexDto[];
}

export class ExecuteSqlDto {
  @ApiProperty({ example: 'SELECT id, full_name, segment FROM customers ORDER BY id ASC LIMIT 25;' })
  @IsString()
  @MinLength(1)
  sql: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowWrite?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  confirmedWrite?: boolean;

  @ApiPropertyOptional({ default: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  rowLimit?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  bypassCache?: boolean;
}

export class ExplainSqlDto {
  @ApiProperty({ example: 'SELECT c.segment, COUNT(*) FROM customers c JOIN orders o ON o.customer_id = c.id GROUP BY c.segment;' })
  @IsString()
  @MinLength(1)
  sql: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  analyze?: boolean;
}

export class FormatSqlDto {
  @ApiProperty({ example: "select id, email from customers where segment = 'Enterprise B2B'" })
  @IsString()
  @MinLength(1)
  sql: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowWrite?: boolean;
}

export class SchemaAiProposeDto {
  @ApiProperty({
    example: 'Online bookstore with books, store members, and verified member reviews',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  description: string;
}

export class SchemaAiApplyDto {
  @ApiProperty({
    example: 'BEGIN; CREATE TABLE IF NOT EXISTS books (id SERIAL PRIMARY KEY, title VARCHAR(255) NOT NULL); COMMIT;',
  })
  @IsString()
  @MinLength(10)
  ddlSql: string;
}

export class GenerateSeedDataDto {
  @ApiProperty({ example: 'customers' })
  @IsString()
  @MinLength(1)
  tableName: string;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  rowCount?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  previewOnly?: boolean;
}

export class CsvPreviewDto {
  @ApiProperty({ example: 'imported_leads' })
  @IsString()
  @MinLength(2)
  @MaxLength(48)
  tableName: string;

  @ApiProperty({
    example: 'full_name,email,deal_size_usd,is_qualified\nElena Vance,elena@acme.io,24500.50,true',
  })
  @IsString()
  @MinLength(5)
  csvContent: string;
}

export class CsvConfirmImportDto extends CsvPreviewDto {
  @ApiPropertyOptional({
    example: { deal_size_usd: 'numeric(12,2)', is_qualified: 'boolean' },
  })
  @IsOptional()
  @IsObject()
  columnTypes?: Record<string, string>;
}



