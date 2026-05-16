/**
 * AI & Agents settings — barrel re-export.
 * Import from 'client/src/pages/settings/ai' to access all extracted pieces.
 */

// Foundation
export * from './types';
export * from './constants';
export * from './helpers';

// UI components
export { StatusPill, ProviderCard } from './ProviderCard';
export type { ProviderCardProps } from './ProviderCard';

export { ProviderProbe } from './ProviderProbe';
export type { ProviderProbeProps } from './ProviderProbe';

export { ModelPicker } from './ModelPicker';
export type { ModelPickerProps } from './ModelPicker';

export { OpenAICompatibleDetail } from './OpenAICompatibleDetail';
export type { OpenAICompatibleDetailProps } from './OpenAICompatibleDetail';

export { ClaudeAccountDetail } from './ClaudeAccountDetail';
export { CodexAccountDetail } from './CodexAccountDetail';

export { PrivacyNotice } from './PrivacyNotice';

export { FeatureRoutingSection } from './FeatureRoutingSection';
export type { FeatureRoutingSectionProps } from './FeatureRoutingSection';

export { GuardrailsSection } from './GuardrailsSection';
export type { GuardrailsSectionProps } from './GuardrailsSection';

export { UsageAuditSection } from './UsageAuditSection';
export type { UsageAuditSectionProps } from './UsageAuditSection';

export { ProviderDetailForm } from './ProviderDetailForm';
export type { ProviderDetailFormProps, ProviderDetailFormField } from './ProviderDetailForm';
