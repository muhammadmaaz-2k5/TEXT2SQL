import * as React from 'react';
import { Icon, type IconName, iconNames } from './Icon';
import { chartColors, chartTheme } from '../config/chart-theme';
import monacoLightTheme from '../config/monaco-theme-datapilot-light.json';
import monacoDarkTheme from '../config/monaco-theme-datapilot-dark.json';

export { Icon, type IconName, iconNames, chartColors, chartTheme, monacoLightTheme, monacoDarkTheme };

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'default' | 'sm';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: IconName;
  rightIcon?: IconName;
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'default',
      leftIcon,
      rightIcon,
      isLoading = false,
      className = '',
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const variantClass = `dp-btn--${variant}`;
    const sizeClass = size === 'sm' ? 'dp-btn--sm' : '';
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`dp-btn ${variantClass} ${sizeClass} ${className}`.trim()}
        {...props}
      >
        {isLoading ? (
          <span className="dp-thinking" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        ) : (
          leftIcon && <Icon name={leftIcon} size={18} />
        )}
        {children}
        {!isLoading && rightIcon && <Icon name={rightIcon} size={18} />}
      </button>
    );
  },
);
Button.displayName = 'Button';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, id, className = '', ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="dp-label">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={`dp-input ${error ? 'border-danger' : ''} ${className}`.trim()}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-xs text-danger m-0">
            {error}
          </p>
        )}
        {!error && hint && (
          <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-[var(--text-muted)] m-0">
            {hint}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';

export type BadgeVariant = 'readonly' | 'write' | 'danger' | 'engine' | 'neutral';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  icon?: IconName;
}

export function Badge({
  variant = 'neutral',
  icon,
  className = '',
  children,
  ...props
}: BadgeProps) {
  const variantClass =
    variant === 'neutral'
      ? 'bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)]'
      : `dp-badge--${variant}`;
  return (
    <span className={`dp-badge ${variantClass} ${className}`.trim()} {...props}>
      {icon && <Icon name={icon} size={13} />}
      {children}
    </span>
  );
}

export function Card({
  className = '',
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`dp-card ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

export function Skeleton({
  className = '',
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-[10px] bg-[var(--surface-2)] ${className}`.trim()}
      {...props}
    />
  );
}

