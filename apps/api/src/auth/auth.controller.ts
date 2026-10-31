import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  ForgotPasswordDto,
  LoginDto,
  SignupDto,
  SwitchOrganizationDto,
} from './auth.dto';
import { type AuthenticatedRequest, JwtAuthGuard } from './auth.guard';
import { AuthService, type IssuedAuthTokens } from './auth.service';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  private attachCookies(res: Response, issued: IssuedAuthTokens): void {
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('dp_access_token', issued.session.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: issued.accessMaxAgeMs,
      path: '/',
    });
    res.cookie('dp_refresh_token', issued.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: issued.refreshMaxAgeMs,
      path: '/',
    });
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password' })
  login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const issued = this.authService.login(dto);
    this.attachCookies(res, issued);
    return issued.session;
  }

  @Post('demo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'One-click sign in to the pre-seeded Demo Workspace' })
  loginDemo(@Res({ passthrough: true }) res: Response) {
    const issued = this.authService.loginDemo();
    this.attachCookies(res, issued);
    return issued.session;
  }

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new account and default organization' })
  signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    const issued = this.authService.signup(dto);
    this.attachCookies(res, issued);
    return issued.session;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and issue a fresh access token' })
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = (req.cookies as Record<string, string | undefined> | undefined)?.[
      'dp_refresh_token'
    ];
    const issued = this.authService.refresh(refreshToken);
    this.attachCookies(res, issued);
    return issued.session;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke refresh token and clear httpOnly session cookies' })
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = (req.cookies as Record<string, string | undefined> | undefined)?.[
      'dp_refresh_token'
    ];
    this.authService.logout(refreshToken);
    res.clearCookie('dp_access_token', { path: '/' });
    res.clearCookie('dp_refresh_token', { path: '/' });
    return { success: true };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send password reset instructions' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return {
      success: true,
      message: `If an account exists for ${dto.email}, a password reset link has been queued.`,
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get authenticated user profile and organizations' })
  me(@Req() req: AuthenticatedRequest) {
    const userId = req.user?.sub ?? '';
    return {
      user: this.authService.getProfile(userId),
    };
  }

  @Patch('active-org')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Switch active organization for current session' })
  switchOrg(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SwitchOrganizationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user?.sub ?? '';
    const issued = this.authService.switchOrganization(userId, dto.organizationId);
    this.attachCookies(res, issued);
    return issued.session;
  }
}

