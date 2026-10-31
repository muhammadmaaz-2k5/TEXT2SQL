import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'pilot@datapilot.ai' })
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email: string;

  @ApiProperty({ example: 'DataPilot2026!' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  password: string;
}

export class SignupDto {
  @ApiProperty({ example: 'Alex Rivera' })
  @IsString()
  @MinLength(2, { message: 'Enter your full name.' })
  @MaxLength(80)
  name: string;

  @ApiProperty({ example: 'alex@company.com' })
  @IsEmail({}, { message: 'Enter a valid work email address.' })
  email: string;

  @ApiProperty({ example: 'DataPilot2026!' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(128)
  password: string;

  @ApiProperty({ example: 'Acme Analytics' })
  @IsString()
  @MinLength(2, { message: 'Enter an organization name.' })
  @MaxLength(80)
  organizationName: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'pilot@datapilot.ai' })
  @IsEmail({}, { message: 'Enter the email address associated with your account.' })
  email: string;
}

export class SwitchOrganizationDto {
  @ApiProperty({ example: 'org_acme_data_team' })
  @IsString()
  @MinLength(1)
  organizationId: string;
}

