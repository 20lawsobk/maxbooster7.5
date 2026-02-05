import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, AlertTriangle, Shield, User, Bell, Eye, Link as LinkIcon, Loader2 } from 'lucide-react';

export type SettingsCategory = 'profile' | 'security' | 'notifications' | 'privacy' | 'connected_accounts';

export type OutcomeType = 
  | 'profile_updated' | 'avatar_uploaded' | 'avatar_removed' | 'username_changed' | 'username_unavailable' | 'bio_updated' | 'display_name_changed'
  | 'password_changed' | 'password_change_failed' | 'password_requirements_not_met' | '2fa_enabled' | '2fa_disabled' | 'session_terminated' | 'all_sessions_terminated' | 'suspicious_activity_detected' | 'security_alerts_configured' | 'recovery_email_added' | 'recovery_codes_generated'
  | 'email_preferences_saved' | 'push_notification_toggled' | 'frequency_updated' | 'unsubscribed' | 'marketing_preferences_updated'
  | 'visibility_changed' | 'data_export_requested' | 'data_export_ready' | 'account_deletion_initiated' | 'account_deletion_cancelled' | 'gdpr_consent_updated'
  | 'account_connected' | 'account_disconnected' | 'connection_expired' | 'permissions_updated' | 'connection_refreshed';

interface OutcomeConfig {
  title: string;
  description: string;
  icon: React.ReactNode;
  variant: 'default' | 'destructive';
  category: SettingsCategory;
}

const outcomeConfigs: Record<OutcomeType, OutcomeConfig> = {
  profile_updated: {
    title: 'Profile Updated',
    description: 'Your profile information has been saved successfully.',
    icon: <CheckCircle className="h-4 w-4" />,
    variant: 'default',
    category: 'profile',
  },
  avatar_uploaded: {
    title: 'Avatar Uploaded',
    description: 'Your profile picture has been updated successfully.',
    icon: <User className="h-4 w-4" />,
    variant: 'default',
    category: 'profile',
  },
  avatar_removed: {
    title: 'Avatar Removed',
    description: 'Your profile picture has been removed.',
    icon: <User className="h-4 w-4" />,
    variant: 'default',
    category: 'profile',
  },
  username_changed: {
    title: 'Username Changed',
    description: 'Your username has been updated successfully.',
    icon: <CheckCircle className="h-4 w-4" />,
    variant: 'default',
    category: 'profile',
  },
  username_unavailable: {
    title: 'Username Unavailable',
    description: 'This username is already taken. Please choose a different one.',
    icon: <XCircle className="h-4 w-4" />,
    variant: 'destructive',
    category: 'profile',
  },
  bio_updated: {
    title: 'Bio Updated',
    description: 'Your bio and links have been saved.',
    icon: <CheckCircle className="h-4 w-4" />,
    variant: 'default',
    category: 'profile',
  },
  display_name_changed: {
    title: 'Display Name Updated',
    description: 'Your display name has been changed successfully.',
    icon: <User className="h-4 w-4" />,
    variant: 'default',
    category: 'profile',
  },
  password_changed: {
    title: 'Password Changed',
    description: 'Your password has been updated. Other sessions have been logged out.',
    icon: <Shield className="h-4 w-4" />,
    variant: 'default',
    category: 'security',
  },
  password_change_failed: {
    title: 'Password Change Failed',
    description: 'Your current password is incorrect. Please try again.',
    icon: <XCircle className="h-4 w-4" />,
    variant: 'destructive',
    category: 'security',
  },
  password_requirements_not_met: {
    title: 'Password Requirements Not Met',
    description: 'Please ensure your password meets all requirements.',
    icon: <AlertTriangle className="h-4 w-4" />,
    variant: 'destructive',
    category: 'security',
  },
  '2fa_enabled': {
    title: '2FA Enabled',
    description: 'Two-factor authentication has been enabled. Your account is now more secure.',
    icon: <Shield className="h-4 w-4" />,
    variant: 'default',
    category: 'security',
  },
  '2fa_disabled': {
    title: '2FA Disabled',
    description: 'Two-factor authentication has been disabled. Consider re-enabling for better security.',
    icon: <AlertTriangle className="h-4 w-4" />,
    variant: 'default',
    category: 'security',
  },
  session_terminated: {
    title: 'Session Terminated',
    description: 'The selected device has been logged out successfully.',
    icon: <CheckCircle className="h-4 w-4" />,
    variant: 'default',
    category: 'security',
  },
  all_sessions_terminated: {
    title: 'All Sessions Terminated',
    description: 'All other devices have been logged out. Only your current session remains active.',
    icon: <Shield className="h-4 w-4" />,
    variant: 'default',
    category: 'security',
  },
  suspicious_activity_detected: {
    title: 'Suspicious Activity Detected',
    description: 'We detected unusual login activity. Please review your recent sessions.',
    icon: <AlertTriangle className="h-4 w-4" />,
    variant: 'destructive',
    category: 'security',
  },
  security_alerts_configured: {
    title: 'Security Alerts Updated',
    description: 'Your security notification preferences have been saved.',
    icon: <Shield className="h-4 w-4" />,
    variant: 'default',
    category: 'security',
  },
  recovery_email_added: {
    title: 'Recovery Email Added',
    description: 'A recovery email has been added to your account for extra security.',
    icon: <CheckCircle className="h-4 w-4" />,
    variant: 'default',
    category: 'security',
  },
  recovery_codes_generated: {
    title: 'Recovery Codes Generated',
    description: 'New backup codes have been generated. Store them in a safe place.',
    icon: <Shield className="h-4 w-4" />,
    variant: 'default',
    category: 'security',
  },
  email_preferences_saved: {
    title: 'Email Preferences Saved',
    description: 'Your email notification preferences have been updated.',
    icon: <Bell className="h-4 w-4" />,
    variant: 'default',
    category: 'notifications',
  },
  push_notification_toggled: {
    title: 'Push Notifications Updated',
    description: 'Your push notification settings have been saved.',
    icon: <Bell className="h-4 w-4" />,
    variant: 'default',
    category: 'notifications',
  },
  frequency_updated: {
    title: 'Frequency Updated',
    description: 'Your notification frequency preferences have been saved.',
    icon: <CheckCircle className="h-4 w-4" />,
    variant: 'default',
    category: 'notifications',
  },
  unsubscribed: {
    title: 'Unsubscribed',
    description: 'You have been unsubscribed from the selected email type.',
    icon: <CheckCircle className="h-4 w-4" />,
    variant: 'default',
    category: 'notifications',
  },
  marketing_preferences_updated: {
    title: 'Marketing Preferences Updated',
    description: 'Your marketing communication preferences have been saved.',
    icon: <Bell className="h-4 w-4" />,
    variant: 'default',
    category: 'notifications',
  },
  visibility_changed: {
    title: 'Profile Visibility Changed',
    description: 'Your profile visibility settings have been updated.',
    icon: <Eye className="h-4 w-4" />,
    variant: 'default',
    category: 'privacy',
  },
  data_export_requested: {
    title: 'Data Export Requested',
    description: 'Your data export is being prepared. You will receive an email when it is ready.',
    icon: <CheckCircle className="h-4 w-4" />,
    variant: 'default',
    category: 'privacy',
  },
  data_export_ready: {
    title: 'Data Export Ready',
    description: 'Your data export is ready for download. Check your email for the link.',
    icon: <CheckCircle className="h-4 w-4" />,
    variant: 'default',
    category: 'privacy',
  },
  account_deletion_initiated: {
    title: 'Account Deletion Initiated',
    description: 'Your account deletion request has been submitted. You have 30 days to cancel.',
    icon: <AlertTriangle className="h-4 w-4" />,
    variant: 'destructive',
    category: 'privacy',
  },
  account_deletion_cancelled: {
    title: 'Account Deletion Cancelled',
    description: 'Your account deletion request has been cancelled. Your account will remain active.',
    icon: <CheckCircle className="h-4 w-4" />,
    variant: 'default',
    category: 'privacy',
  },
  gdpr_consent_updated: {
    title: 'Consent Updated',
    description: 'Your data processing consent preferences have been saved.',
    icon: <CheckCircle className="h-4 w-4" />,
    variant: 'default',
    category: 'privacy',
  },
  account_connected: {
    title: 'Account Connected',
    description: 'The account has been successfully connected.',
    icon: <LinkIcon className="h-4 w-4" />,
    variant: 'default',
    category: 'connected_accounts',
  },
  account_disconnected: {
    title: 'Account Disconnected',
    description: 'The account has been disconnected from your profile.',
    icon: <CheckCircle className="h-4 w-4" />,
    variant: 'default',
    category: 'connected_accounts',
  },
  connection_expired: {
    title: 'Connection Expired',
    description: 'The connection has expired. Please reconnect to continue using this service.',
    icon: <AlertTriangle className="h-4 w-4" />,
    variant: 'destructive',
    category: 'connected_accounts',
  },
  permissions_updated: {
    title: 'Permissions Updated',
    description: 'The permissions for this connected account have been updated.',
    icon: <CheckCircle className="h-4 w-4" />,
    variant: 'default',
    category: 'connected_accounts',
  },
  connection_refreshed: {
    title: 'Connection Refreshed',
    description: 'The connection has been refreshed and is now active.',
    icon: <CheckCircle className="h-4 w-4" />,
    variant: 'default',
    category: 'connected_accounts',
  },
};

export interface SettingsOutcome {
  type: OutcomeType;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export function useSettingsOutcomes() {
  const { toast } = useToast();
  const [recentOutcomes, setRecentOutcomes] = useState<SettingsOutcome[]>([]);
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});

  const showOutcome = useCallback((type: OutcomeType, metadata?: Record<string, unknown>) => {
    const config = outcomeConfigs[type];
    
    toast({
      title: config.title,
      description: metadata?.customMessage as string || config.description,
      variant: config.variant,
    });

    setRecentOutcomes(prev => [
      { type, timestamp: new Date(), metadata },
      ...prev.slice(0, 9),
    ]);
  }, [toast]);

  const setProcessing = useCallback((key: string, processing: boolean) => {
    setIsProcessing(prev => ({ ...prev, [key]: processing }));
  }, []);

  const getProcessing = useCallback((key: string) => {
    return isProcessing[key] || false;
  }, [isProcessing]);

  return {
    showOutcome,
    recentOutcomes,
    setProcessing,
    getProcessing,
    outcomeConfigs,
  };
}

interface LoadingButtonState {
  isLoading: boolean;
  loadingText?: string;
}

export function useLoadingState(initialStates: Record<string, boolean> = {}) {
  const [states, setStates] = useState<Record<string, LoadingButtonState>>(
    Object.fromEntries(Object.entries(initialStates).map(([k, v]) => [k, { isLoading: v }]))
  );

  const setLoading = useCallback((key: string, isLoading: boolean, loadingText?: string) => {
    setStates(prev => ({
      ...prev,
      [key]: { isLoading, loadingText },
    }));
  }, []);

  const isLoading = useCallback((key: string) => {
    return states[key]?.isLoading || false;
  }, [states]);

  const getLoadingText = useCallback((key: string) => {
    return states[key]?.loadingText;
  }, [states]);

  return { setLoading, isLoading, getLoadingText };
}

interface FormValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export function useFormValidation() {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateUsername = useCallback((username: string): FormValidationResult => {
    const newErrors: Record<string, string> = {};
    
    if (!username) {
      newErrors.username = 'Username is required';
    } else if (username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
    } else if (username.length > 30) {
      newErrors.username = 'Username must be less than 30 characters';
    } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      newErrors.username = 'Username can only contain letters, numbers, and underscores';
    }

    setErrors(prev => ({ ...prev, ...newErrors }));
    return { isValid: Object.keys(newErrors).length === 0, errors: newErrors };
  }, []);

  const validateEmail = useCallback((email: string): FormValidationResult => {
    const newErrors: Record<string, string> = {};
    
    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    setErrors(prev => ({ ...prev, ...newErrors }));
    return { isValid: Object.keys(newErrors).length === 0, errors: newErrors };
  }, []);

  const validateBio = useCallback((bio: string): FormValidationResult => {
    const newErrors: Record<string, string> = {};
    
    if (bio.length > 500) {
      newErrors.bio = 'Bio must be less than 500 characters';
    }

    setErrors(prev => ({ ...prev, ...newErrors }));
    return { isValid: Object.keys(newErrors).length === 0, errors: newErrors };
  }, []);

  const validateWebsite = useCallback((website: string): FormValidationResult => {
    const newErrors: Record<string, string> = {};
    
    if (website && !/^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/.test(website)) {
      newErrors.website = 'Please enter a valid URL';
    }

    setErrors(prev => ({ ...prev, ...newErrors }));
    return { isValid: Object.keys(newErrors).length === 0, errors: newErrors };
  }, []);

  const clearError = useCallback((field: string) => {
    setErrors(prev => {
      const { [field]: removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const clearAllErrors = useCallback(() => {
    setErrors({});
  }, []);

  return {
    errors,
    validateUsername,
    validateEmail,
    validateBio,
    validateWebsite,
    clearError,
    clearAllErrors,
  };
}

export { outcomeConfigs };
