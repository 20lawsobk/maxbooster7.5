import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Lock,
  Key,
  Smartphone,
  Mail,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ArrowRight,
} from 'lucide-react';

interface SecurityFactor {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  weight: number;
  icon: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface SecurityScoreIndicatorProps {
  hasPassword: boolean;
  has2FA: boolean;
  hasRecoveryEmail: boolean;
  hasRecentPasswordChange: boolean;
  hasMultipleSessions: boolean;
  hasSuspiciousActivity: boolean;
  onEnable2FA?: () => void;
  onChangePassword?: () => void;
  onReviewSessions?: () => void;
}

export function SecurityScoreIndicator({
  hasPassword,
  has2FA,
  hasRecoveryEmail,
  hasRecentPasswordChange,
  hasMultipleSessions,
  hasSuspiciousActivity,
  onEnable2FA,
  onChangePassword,
  onReviewSessions,
}: SecurityScoreIndicatorProps) {
  const factors: SecurityFactor[] = useMemo(() => [
    {
      id: 'password',
      name: 'Password Set',
      description: 'Account has a password configured',
      enabled: hasPassword,
      weight: 20,
      icon: <Lock className="h-4 w-4" />,
    },
    {
      id: '2fa',
      name: 'Two-Factor Authentication',
      description: 'Extra layer of security with 2FA',
      enabled: has2FA,
      weight: 30,
      icon: <Smartphone className="h-4 w-4" />,
      action: !has2FA ? { label: 'Enable', onClick: () => onEnable2FA?.() } : undefined,
    },
    {
      id: 'recovery',
      name: 'Recovery Email',
      description: 'Email verified for account recovery',
      enabled: hasRecoveryEmail,
      weight: 15,
      icon: <Mail className="h-4 w-4" />,
    },
    {
      id: 'password_recent',
      name: 'Password Updated Recently',
      description: 'Password changed within the last 90 days',
      enabled: hasRecentPasswordChange,
      weight: 15,
      icon: <Key className="h-4 w-4" />,
      action: !hasRecentPasswordChange ? { label: 'Update', onClick: () => onChangePassword?.() } : undefined,
    },
    {
      id: 'single_session',
      name: 'Single Active Session',
      description: 'Only one device is currently logged in',
      enabled: !hasMultipleSessions,
      weight: 10,
      icon: <Shield className="h-4 w-4" />,
      action: hasMultipleSessions ? { label: 'Review', onClick: () => onReviewSessions?.() } : undefined,
    },
    {
      id: 'no_suspicious',
      name: 'No Suspicious Activity',
      description: 'No unusual login attempts detected',
      enabled: !hasSuspiciousActivity,
      weight: 10,
      icon: <ShieldCheck className="h-4 w-4" />,
      action: hasSuspiciousActivity ? { label: 'Review', onClick: () => onReviewSessions?.() } : undefined,
    },
  ], [hasPassword, has2FA, hasRecoveryEmail, hasRecentPasswordChange, hasMultipleSessions, hasSuspiciousActivity, onEnable2FA, onChangePassword, onReviewSessions]);

  const score = useMemo(() => {
    return factors.reduce((total, factor) => {
      return total + (factor.enabled ? factor.weight : 0);
    }, 0);
  }, [factors]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    if (score >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Needs Improvement';
  };

  const getScoreIcon = (score: number) => {
    if (score >= 80) return <ShieldCheck className="h-8 w-8 text-green-600" />;
    if (score >= 60) return <Shield className="h-8 w-8 text-yellow-600" />;
    if (score >= 40) return <ShieldAlert className="h-8 w-8 text-orange-600" />;
    return <ShieldX className="h-8 w-8 text-red-600" />;
  };

  const getProgressColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    if (score >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const enabledCount = factors.filter(f => f.enabled).length;
  const recommendations = factors.filter(f => !f.enabled && f.action);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Security Score
        </CardTitle>
        <CardDescription>
          Your account security health at a glance
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0">
            {getScoreIcon(score)}
          </div>
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <span className={`text-4xl font-bold ${getScoreColor(score)}`}>{score}</span>
              <span className="text-muted-foreground text-sm">/100</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={score >= 60 ? 'default' : 'destructive'} className="text-xs">
                {getScoreLabel(score)}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {enabledCount} of {factors.length} security features enabled
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Security Level</span>
            <span className={`font-medium ${getScoreColor(score)}`}>{score}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${getProgressColor(score)}`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-medium">Security Factors</h4>
          <div className="grid gap-2">
            {factors.map((factor) => (
              <div
                key={factor.id}
                className={`flex items-center justify-between p-2.5 rounded-lg border ${
                  factor.enabled 
                    ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900' 
                    : 'bg-muted/30 border-muted'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-full ${
                    factor.enabled 
                      ? 'bg-green-100 dark:bg-green-900/50 text-green-600' 
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {factor.enabled ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${factor.enabled ? 'text-green-700 dark:text-green-400' : ''}`}>
                      {factor.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{factor.description}</p>
                  </div>
                </div>
                {factor.action && (
                  <Button size="sm" variant="ghost" onClick={factor.action.onClick} className="h-7 text-xs">
                    {factor.action.label}
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                )}
                {factor.enabled && (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                )}
              </div>
            ))}
          </div>
        </div>

        {recommendations.length > 0 && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                  Improve Your Security
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">
                  Enable {recommendations.length} more feature{recommendations.length > 1 ? 's' : ''} to increase your security score.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SecurityScoreIndicator;
