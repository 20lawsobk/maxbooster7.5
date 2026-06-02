import { useState, useRef, useEffect } from "react";
import { CancellationModal } from "@/components/retention/CancellationModal";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { User, Lock, Bell, Palette, Shield, CreditCard, Download, Trash2, Upload, Eye, Link as LinkIcon, RefreshCw, AlertTriangle, CheckCircle, Clock, XCircle, Loader2, Crown, Calendar, Receipt, Zap, ArrowUpRight, ArrowDownRight, Info, DollarSign, TrendingUp, HardDrive, Headphones, Check, Keyboard } from "lucide-react";
import { ShortcutCustomizer } from "@/components/shortcuts/ShortcutCustomizer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useRequireSubscription } from "@/hooks/useRequireAuth";
import { useToast } from "@/hooks/use-toast";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { PlatformConnections } from "@/components/social/platform-connections";
import ChangePasswordDialog from "@/components/dialogs/ChangePasswordDialog";
import TwoFactorSetupDialog from "@/components/dialogs/TwoFactorSetupDialog";
import PaymentUpdateDialog from "@/components/dialogs/PaymentUpdateDialog";
import DeleteAccountDialog from "@/components/dialogs/DeleteAccountDialog";
import { LoginHistory } from "@/components/settings/LoginHistory";
import { PrivacySettings } from "@/components/settings/PrivacySettings";
import { ApiKeyManagement } from "@/components/settings/ApiKeyManagement";
import { RecoveryCodes } from "@/components/settings/RecoveryCodes";
import { ConnectedAccountsManager } from "@/components/settings/ConnectedAccountsManager";
import { useSettingsOutcomes } from "@/components/settings/SettingsOutcomeHandler";
import CrossPlatformSync from "@/components/settings/CrossPlatformSync";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { NotificationPreferences } from "@/components/notifications";

export default function Settings() {
  const { user, isLoading: authLoading } = useRequireSubscription();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    trackProfileComplete,
    trackSocialAccountConnected,
  } = useOnboardingProgress();
  const [location, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    const validTabs = [
      "profile",
      "account",
      "notifications",
      "preferences",
      "studio",
      "billing",
      "privacy",
      "platforms",
      "sync",
      "shortcuts",
    ];
    return tab && validTabs.includes(tab) ? tab : "profile";
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    const validTabs = [
      "profile",
      "account",
      "notifications",
      "preferences",
      "studio",
      "billing",
      "privacy",
      "platforms",
      "sync",
      "shortcuts",
    ];
    if (tab && validTabs.includes(tab)) {
      setActiveTab(tab);
    }
  }, [location]);

  const [showPassword, setShowPassword] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [twoFactorOpen, setTwoFactorOpen] = useState(false);
  const [paymentUpdateOpen, setPaymentUpdateOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [cancelSubscriptionOpen, setCancelSubscriptionOpen] = useState(false);
  const [cancellationFeedbackOpen, setCancellationFeedbackOpen] =
    useState(false);
  const [terminateSessionOpen, setTerminateSessionOpen] = useState(false);
  const [sessionToTerminate, setSessionToTerminate] = useState<string | null>(
    null,
  );
  const [terminatingSession, setTerminatingSession] = useState(false);
  const [twoFactorDisableOpen, setTwoFactorDisableOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(
    user?.avatarUrl || user?.profileImageUrl || "",
  );
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [planComparisonOpen, setPlanComparisonOpen] = useState(false);
  const [retryingPayment, setRetryingPayment] = useState(false);
  const [refundsExpanded, setRefundsExpanded] = useState(false);
  const [shortcutCustomizerOpen, setShortcutCustomizerOpen] = useState(false);

  useEffect(() => {
    setAvatarUrl(user?.avatarUrl || user?.profileImageUrl || "");
  }, [user?.avatarUrl, user?.profileImageUrl]);

  // Query for full profile data (supplemental — user from useRequireSubscription is the auth source)
  const { data: fullProfile } = useQuery({
    queryKey: ["/api/auth/profile"],
    enabled: !!user,
    retry: 1,
    staleTime: 60_000,
  });

  // Query for notification settings
  const { data: notificationData } = useQuery({
    queryKey: ["/api/auth/notifications"],
    enabled: !!user,
  });

  // Query for preferences
  const { data: preferencesData } = useQuery({
    queryKey: ["/api/auth/preferences"],
    enabled: !!user,
  });

  // Query for subscription data
  const { data: subscriptionData } = useQuery({
    queryKey: ["/api/billing/subscription"],
    enabled: !!user,
  });

  // Query for payment method
  const { data: paymentMethod } = useQuery({
    queryKey: ["/api/billing/payment-method"],
    enabled: !!user,
  });

  // Query for billing history
  const { data: billingHistory = [], isLoading: billingLoading } = useQuery({
    queryKey: ["/api/billing/history"],
    enabled: !!user,
  });

  // Query for refunds
  const { data: refundsData, isLoading: refundsLoading } = useQuery({
    queryKey: ["/api/billing/refunds"],
    enabled: !!user && refundsExpanded,
  });

  // Query for login sessions
  useQuery({
    queryKey: ["/api/auth/sessions"],
    enabled: !!user,
  });

  const [profileData, setProfileData] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    artistName: (user as Record<string, unknown>)?.artistName || "",
    email: user?.email || "",
    bio: "",
    website: "",
    location: "",
  });

  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    pushNotifications: true,
    weeklyReports: true,
    salesAlerts: true,
    royaltyUpdates: true,
  });

  const [preferences, setPreferences] = useState({
    theme: "dark",
    defaultBPM: 120,
    defaultKey: "C",
    autoSave: true,
    betaFeatures: false,
  });

  // Update profileData when fullProfile loads
  useEffect(() => {
    if (fullProfile) {
      setProfileData({
        firstName: fullProfile.firstName || "",
        lastName: fullProfile.lastName || "",
        artistName: (fullProfile as Record<string, unknown>).artistName || "",
        email: fullProfile.email || "",
        bio: fullProfile.bio || "",
        website: fullProfile.website || "",
        location: fullProfile.location || "",
      });
    }
  }, [fullProfile]);

  // Update notificationSettings when notificationData loads
  useEffect(() => {
    if (notificationData) {
      setNotificationSettings({
        emailNotifications: notificationData.emailNotifications ?? true,
        pushNotifications: notificationData.pushNotifications ?? true,
        weeklyReports: notificationData.weeklyReports ?? true,
        salesAlerts: notificationData.salesAlerts ?? true,
        royaltyUpdates: notificationData.royaltyUpdates ?? true,
      });
    }
  }, [notificationData]);

  // Update preferences when preferencesData loads
  useEffect(() => {
    if (preferencesData) {
      setPreferences({
        theme: preferencesData.theme || "dark",
        defaultBPM: preferencesData.defaultBPM || 120,
        defaultKey: preferencesData.defaultKey || "C",
        autoSave: preferencesData.autoSave ?? true,
        betaFeatures: preferencesData.betaFeatures ?? false,
      });
    }
  }, [preferencesData]);

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: unknown) => {
      const response = await apiRequest("PUT", "/api/auth/profile", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully.",
      });
      trackProfileComplete();
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate(profileData);
  };

  async (key: string, value: boolean) => {
    const previousSettings = { ...notificationSettings };

    // Optimistic update
    setNotificationSettings((prev) => ({ ...prev, [key]: value }));

    try {
      await apiRequest("PUT", "/api/auth/notifications", { [key]: value });

      // CRITICAL: Invalidate cache to refetch updated data
      queryClient.invalidateQueries({ queryKey: ["/api/auth/notifications"] });

      toast({
        title: "Updated",
        description: "Notification settings updated",
      });
    } catch (error: unknown) {
      // Rollback on failure
      setNotificationSettings(previousSettings);

      toast({
        title: "Error",
        description: "Failed to update notification settings",
        variant: "destructive",
      });
    }
  };

  const handlePreferenceChange = async (key: string, value: unknown) => {
    const previousPreferences = { ...preferences };

    // Optimistic update
    setPreferences((prev) => ({ ...prev, [key]: value }));

    try {
      await apiRequest("PUT", "/api/auth/preferences", { [key]: value });

      // CRITICAL: Invalidate cache to refetch updated data
      queryClient.invalidateQueries({ queryKey: ["/api/auth/preferences"] });

      toast({
        title: "Updated",
        description: "Preferences updated",
      });
    } catch (error: unknown) {
      // Rollback on failure
      setPreferences(previousPreferences);

      toast({
        title: "Error",
        description: "Failed to update preferences",
        variant: "destructive",
      });
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (avatarLoading) return;
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "Image size should be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("avatar", file);

    setAvatarLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/avatar", formData);
      const data = (await response.json()) as {
        avatarUrl?: string;
        profileImageUrl?: string;
      };
      const newUrl = data.avatarUrl || data.profileImageUrl || "";
      if (newUrl) {
        setAvatarUrl(newUrl);
        const cached = queryClient.getQueryData<Record<string, unknown>>([
          "/api/auth/me",
        ]);
        if (cached) {
          queryClient.setQueryData(["/api/auth/me"], {
            ...cached,
            avatarUrl: newUrl,
            profileImageUrl: newUrl,
          });
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });

      toast({
        title: "Success",
        description: "Profile picture updated successfully",
      });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: "Failed to upload profile picture",
        variant: "destructive",
      });
    } finally {
      setAvatarLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAvatarRemove = async () => {
    if (avatarLoading) return;
    setAvatarLoading(true);
    try {
      await apiRequest("DELETE", "/api/auth/avatar");
      setAvatarUrl("");
      const cached = queryClient.getQueryData<Record<string, unknown>>([
        "/api/auth/me",
      ]);
      if (cached) {
        queryClient.setQueryData(["/api/auth/me"], {
          ...cached,
          avatarUrl: null,
          profileImageUrl: null,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });

      toast({
        title: "Success",
        description: "Profile picture removed",
      });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: "Failed to remove profile picture",
        variant: "destructive",
      });
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    try {
      await apiRequest("DELETE", "/api/auth/google-connection");
      toast({
        title: "Success",
        description: "Google account disconnected",
      });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: "Failed to disconnect Google account",
        variant: "destructive",
      });
    }
  };

  const handleCancelSubscription = async () => {
    try {
      const response = await apiRequest(
        "POST",
        "/api/billing/cancel-subscription",
      );
      const data = await response.json();

      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/billing/subscription"],
      });

      toast({
        title: "Subscription Cancelled",
        description: data.cancelAt
          ? `Your subscription will remain active until ${new Date(data.cancelAt).toLocaleDateString()}`
          : "Your subscription will remain active until the end of the billing period",
      });
      setCancelSubscriptionOpen(false);
    } catch (error) {
      const errorData = error.body || error;
      const errorMessage =
        errorData.code === "SUBSCRIPTION_ALREADY_CANCELLED"
          ? "Your subscription is already cancelled"
          : errorData.code === "SUBSCRIPTION_ALREADY_CANCELLING"
            ? `Your subscription is already set to cancel on ${errorData.cancelAt ? new Date(errorData.cancelAt).toLocaleDateString() : "the end of your billing period"}`
            : errorData.code === "LIFETIME_CANNOT_CANCEL"
              ? "Lifetime subscriptions cannot be cancelled"
              : errorData.message || "Failed to cancel subscription";

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const [reactivating, setReactivating] = useState(false);

  const handleReactivateSubscription = async () => {
    setReactivating(true);
    try {
      const response = await apiRequest(
        "POST",
        "/api/billing/reactivate-subscription",
      );
      const data = await response.json();

      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/billing/subscription"],
      });

      toast({
        title: "Subscription Reactivated",
        description: data.nextBillingDate
          ? `Your subscription will renew on ${new Date(data.nextBillingDate).toLocaleDateString()}`
          : "Your subscription has been reactivated!",
      });
    } catch (error) {
      const errorData = error.body || error;

      if (errorData.code === "PAYMENT_METHOD_REQUIRED") {
        toast({
          title: "Payment Method Required",
          description:
            "Please add a payment method before reactivating your subscription.",
          variant: "destructive",
        });
        setPaymentUpdateOpen(true);
      } else if (errorData.code === "SUBSCRIPTION_FULLY_CANCELLED") {
        toast({
          title: "Cannot Reactivate",
          description:
            "Your subscription has been fully cancelled. Please create a new subscription.",
        });
        navigate("/pricing");
      } else {
        toast({
          title: "Reactivation Failed",
          description:
            errorData.message ||
            "Failed to reactivate subscription. Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setReactivating(false);
    }
  };

  const handleRetryPayment = async () => {
    setRetryingPayment(true);
    try {
      const response = await apiRequest("POST", "/api/billing/retry-payment");
      const data = await response.json();

      if (data.code === "REQUIRES_3D_SECURE" && data.clientSecret) {
        toast({
          title: "3D Secure Required",
          description:
            "Your bank requires additional verification. Please complete authentication.",
        });
        return;
      }

      queryClient.invalidateQueries({
        queryKey: ["/api/billing/subscription"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/history"] });

      toast({
        title: "Payment Successful",
        description:
          data.message || "Your payment has been processed successfully.",
      });
    } catch (error) {
      const errorData = error.body || error;

      if (errorData.code === "PAYMENT_DECLINED") {
        toast({
          title: "Payment Declined",
          description:
            "Your card was declined. Please update your payment method.",
          variant: "destructive",
        });
        setPaymentUpdateOpen(true);
      } else if (errorData.code === "NO_PAST_DUE_PAYMENT") {
        toast({
          title: "No Payment Due",
          description: "There are no outstanding payments to retry.",
        });
      } else {
        toast({
          title: "Payment Failed",
          description:
            errorData.message ||
            "Failed to retry payment. Please try again or update your payment method.",
          variant: "destructive",
        });
      }
    } finally {
      setRetryingPayment(false);
    }
  };

  const handleDownloadInvoice = async (invoiceId: string) => {
    try {
      const response = await fetch(
        `/api/billing/invoices/${invoiceId}/download`,
        {
          credentials: "include",
        },
      );

      if (!response.ok) throw new Error("Download failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${invoiceId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Success",
        description: "Invoice downloaded successfully",
      });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: "Failed to download invoice",
        variant: "destructive",
      });
    }
  };

  ((sessionId: string) => {
    setSessionToTerminate(sessionId);
    setTerminateSessionOpen(true);
  });

  const handleTerminateSession = async () => {
    if (!sessionToTerminate) return;

    setTerminatingSession(true);
    try {
      await apiRequest("POST", "/api/auth/sessions/terminate", {
        sessionId: sessionToTerminate,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/auth/sessions"] });

      toast({
        title: "Session Terminated",
        description: "The device has been logged out successfully.",
      });
      setTerminateSessionOpen(false);
      setSessionToTerminate(null);
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: "Failed to terminate session. Please try again.",
        variant: "destructive",
      });
    } finally {
      setTerminatingSession(false);
    }
  };

  async () => {
    try {
      const response = await fetch("/api/auth/export-data", {
        credentials: "include",
      });

      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `maxbooster-data-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Success",
        description: "Your data has been exported successfully",
      });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: "Failed to export data",
        variant: "destructive",
      });
    }
  };

  if (!user) return null;

  return (
    <AppLayout>
      {authLoading ? (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-900">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading your preferences…</p>
          </div>
        </div>
      ) : (
        <div className="p-6 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1
                className="text-3xl font-bold gradient-text mb-2"
                data-testid="text-settings-title"
              >
                Settings
              </h1>
              <p className="text-muted-foreground">
                Manage your account settings and preferences
              </p>
            </div>
          </div>

          {/* Main Content */}
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="space-y-6"
          >
            <div className="overflow-x-auto pb-1">
              <TabsList className="inline-flex h-auto w-max gap-1 p-1 flex-wrap">
                <TabsTrigger
                  value="profile"
                  data-testid="tab-profile"
                  className="flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap"
                >
                  <User className="w-4 h-4" />
                  Profile
                </TabsTrigger>
                <TabsTrigger
                  value="account"
                  data-testid="tab-account"
                  className="flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap"
                >
                  <Lock className="w-4 h-4" />
                  Account
                </TabsTrigger>
                <TabsTrigger
                  value="notifications"
                  data-testid="tab-notifications"
                  className="flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap"
                >
                  <Bell className="w-4 h-4" />
                  Notifications
                </TabsTrigger>
                <TabsTrigger
                  value="preferences"
                  data-testid="tab-preferences"
                  className="flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap"
                >
                  <Palette className="w-4 h-4" />
                  Preferences
                </TabsTrigger>
                <TabsTrigger
                  value="billing"
                  data-testid="tab-billing"
                  className="flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap"
                >
                  <CreditCard className="w-4 h-4" />
                  Billing
                </TabsTrigger>
                <TabsTrigger
                  value="security"
                  data-testid="tab-security"
                  className="flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap"
                >
                  <Shield className="w-4 h-4" />
                  Security
                </TabsTrigger>
                <TabsTrigger
                  value="privacy"
                  data-testid="tab-privacy"
                  className="flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap"
                >
                  <Eye className="w-4 h-4" />
                  Privacy
                </TabsTrigger>
                <TabsTrigger
                  value="platforms"
                  data-testid="tab-platforms"
                  className="flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap"
                >
                  <LinkIcon className="w-4 h-4" />
                  Platforms
                </TabsTrigger>
                <TabsTrigger
                  value="sync"
                  data-testid="tab-sync"
                  className="flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap"
                >
                  <RefreshCw className="w-4 h-4" />
                  Sync
                </TabsTrigger>
                <TabsTrigger
                  value="shortcuts"
                  data-testid="tab-shortcuts"
                  className="flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap"
                >
                  <Keyboard className="w-4 h-4" />
                  Shortcuts
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="profile" className="space-y-6">
              <Card className="glassmorphism">
                <CardHeader>
                  <CardTitle>Profile Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleProfileSubmit} className="space-y-6">
                    {/* Profile Picture */}
                    <div className="flex items-center space-x-6">
                      <Avatar
                        key={avatarUrl || "no-avatar"}
                        className="w-24 h-24"
                      >
                        <AvatarImage
                          src={
                            avatarUrl ||
                            user?.avatarUrl ||
                            user?.profileImageUrl ||
                            undefined
                          }
                          alt="Profile picture"
                          className="object-cover"
                        />
                        <AvatarFallback className="text-2xl">
                          {user?.firstName?.[0] ||
                            user?.username?.[0]?.toUpperCase()}
                          {user?.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="space-y-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleAvatarUpload}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            !avatarLoading && fileInputRef.current?.click()
                          }
                          disabled={avatarLoading}
                          data-testid="button-upload-avatar"
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          {avatarLoading ? "Uploading..." : "Upload Photo"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleAvatarRemove}
                          disabled={avatarLoading || !avatarUrl}
                          data-testid="button-remove-avatar"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Remove
                        </Button>
                      </div>
                    </div>

                    {/* Basic Information */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label htmlFor="firstName">First Name</Label>
                        <Input
                          id="firstName"
                          value={profileData.firstName}
                          onChange={(e) =>
                            setProfileData((prev) => ({
                              ...prev,
                              firstName: e.target.value,
                            }))
                          }
                          data-testid="input-first-name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input
                          id="lastName"
                          value={profileData.lastName}
                          onChange={(e) =>
                            setProfileData((prev) => ({
                              ...prev,
                              lastName: e.target.value,
                            }))
                          }
                          data-testid="input-last-name"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="artistName">Artist Name</Label>
                      <Input
                        id="artistName"
                        placeholder="Your artist or stage name"
                        value={profileData.artistName}
                        onChange={(e) =>
                          setProfileData((prev) => ({
                            ...prev,
                            artistName: e.target.value,
                          }))
                        }
                        data-testid="input-artist-name"
                      />
                    </div>

                    <div>
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        value={profileData.email}
                        onChange={(e) =>
                          setProfileData((prev) => ({
                            ...prev,
                            email: e.target.value,
                          }))
                        }
                        data-testid="input-email"
                      />
                    </div>

                    <div>
                      <Label htmlFor="bio">Bio</Label>
                      <Textarea
                        id="bio"
                        placeholder="Tell us about yourself and your music..."
                        value={profileData.bio}
                        onChange={(e) =>
                          setProfileData((prev) => ({
                            ...prev,
                            bio: e.target.value,
                          }))
                        }
                        data-testid="textarea-bio"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label htmlFor="website">Website</Label>
                        <Input
                          id="website"
                          placeholder="https://yourwebsite.com"
                          value={profileData.website}
                          onChange={(e) =>
                            setProfileData((prev) => ({
                              ...prev,
                              website: e.target.value,
                            }))
                          }
                          data-testid="input-website"
                        />
                      </div>
                      <div>
                        <Label htmlFor="location">Location</Label>
                        <Input
                          id="location"
                          placeholder="City, Country"
                          value={profileData.location}
                          onChange={(e) =>
                            setProfileData((prev) => ({
                              ...prev,
                              location: e.target.value,
                            }))
                          }
                          data-testid="input-location"
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={updateProfileMutation.isPending}
                      data-testid="button-save-profile"
                    >
                      {updateProfileMutation.isPending
                        ? "Saving..."
                        : "Save Changes"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="account" className="space-y-6">
              <Card className="glassmorphism">
                <CardHeader>
                  <CardTitle>Account Security</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Change Password */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">
                      Change Password
                    </h3>
                    <div className="flex items-center justify-between p-4 bg-muted/20 rounded-lg">
                      <div>
                        <p className="font-medium">Password</p>
                        <p className="text-sm text-muted-foreground">
                          Secure your account with a strong password
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => setChangePasswordOpen(true)}
                        data-testid="button-change-password"
                      >
                        <Lock className="w-4 h-4 mr-2" />
                        Change Password
                      </Button>
                    </div>
                  </div>

                  {/* Two-Factor Authentication */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">
                      Two-Factor Authentication
                    </h3>
                    <div className="flex items-center justify-between p-4 bg-muted/20 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-full ${user?.twoFactorEnabled ? "bg-green-100 dark:bg-green-900/30" : "bg-muted"}`}
                        >
                          <Shield
                            className={`w-5 h-5 ${user?.twoFactorEnabled ? "text-green-600" : "text-muted-foreground"}`}
                          />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">Authenticator App</p>
                            {user?.twoFactorEnabled && (
                              <Badge variant="default" className="bg-green-600">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Enabled
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {user?.twoFactorEnabled
                              ? "Your account is protected with 2FA"
                              : "Use an authenticator app for additional security"}
                          </p>
                        </div>
                      </div>
                      {user?.twoFactorEnabled ? (
                        <Button
                          variant="outline"
                          onClick={() => setTwoFactorDisableOpen(true)}
                          data-testid="button-disable-2fa"
                        >
                          Disable 2FA
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() => setTwoFactorOpen(true)}
                          data-testid="button-setup-2fa"
                        >
                          <Shield className="w-4 h-4 mr-2" />
                          Setup
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Connected Accounts */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">
                      Connected Accounts
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-4 bg-muted/20 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center">
                            <span className="text-white text-sm font-bold">
                              G
                            </span>
                          </div>
                          <div>
                            <p className="font-medium">Google</p>
                            <p className="text-sm text-muted-foreground">
                              Connected for login
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleGoogleDisconnect}
                          data-testid="button-disconnect-google"
                        >
                          Disconnect
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notifications" className="space-y-6">
              <NotificationPreferences />
            </TabsContent>

            <TabsContent value="preferences" className="space-y-6">
              <Card className="glassmorphism">
                <CardHeader>
                  <CardTitle>Studio Preferences</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Theme Settings */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Appearance</h3>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Theme</p>
                        <p className="text-sm text-muted-foreground">
                          Choose your preferred theme
                        </p>
                      </div>
                      <Select
                        value={preferences.theme}
                        onValueChange={(value) =>
                          handlePreferenceChange("theme", value)
                        }
                      >
                        <SelectTrigger
                          className="w-32"
                          data-testid="select-theme"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem
                            value="dark"
                            data-testid="select-theme-dark"
                          >
                            Dark
                          </SelectItem>
                          <SelectItem
                            value="light"
                            data-testid="select-theme-light"
                          >
                            Light
                          </SelectItem>
                          <SelectItem
                            value="system"
                            data-testid="select-theme-system"
                          >
                            System
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Studio Defaults */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">
                      Studio Defaults
                    </h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Default BPM</p>
                          <p className="text-sm text-muted-foreground">
                            Default tempo for new projects
                          </p>
                        </div>
                        <Input
                          type="number"
                          className="w-24"
                          value={preferences.defaultBPM}
                          onChange={(e) =>
                            handlePreferenceChange(
                              "defaultBPM",
                              parseInt(e.target.value),
                            )
                          }
                          data-testid="input-default-bpm"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Default Key</p>
                          <p className="text-sm text-muted-foreground">
                            Default key signature for new projects
                          </p>
                        </div>
                        <Select
                          value={preferences.defaultKey}
                          onValueChange={(value) =>
                            handlePreferenceChange("defaultKey", value)
                          }
                        >
                          <SelectTrigger
                            className="w-32"
                            data-testid="select-default-key"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="C">C Major</SelectItem>
                            <SelectItem value="Db">D♭ Major</SelectItem>
                            <SelectItem value="D">D Major</SelectItem>
                            <SelectItem value="Eb">E♭ Major</SelectItem>
                            <SelectItem value="E">E Major</SelectItem>
                            <SelectItem value="F">F Major</SelectItem>
                            <SelectItem value="Gb">G♭ Major</SelectItem>
                            <SelectItem value="G">G Major</SelectItem>
                            <SelectItem value="Ab">A♭ Major</SelectItem>
                            <SelectItem value="A">A Major</SelectItem>
                            <SelectItem value="Bb">B♭ Major</SelectItem>
                            <SelectItem value="B">B Major</SelectItem>
                            <SelectItem value="Cm">C Minor</SelectItem>
                            <SelectItem value="C#m">C# Minor</SelectItem>
                            <SelectItem value="Dm">D Minor</SelectItem>
                            <SelectItem value="D#m">D# Minor</SelectItem>
                            <SelectItem value="Em">E Minor</SelectItem>
                            <SelectItem value="Fm">F Minor</SelectItem>
                            <SelectItem value="F#m">F# Minor</SelectItem>
                            <SelectItem value="Gm">G Minor</SelectItem>
                            <SelectItem value="G#m">G# Minor</SelectItem>
                            <SelectItem value="Am">A Minor</SelectItem>
                            <SelectItem value="Bbm">B♭ Minor</SelectItem>
                            <SelectItem value="Bm">B Minor</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* Advanced Settings */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Advanced</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Auto-save Projects</p>
                          <p className="text-sm text-muted-foreground">
                            Automatically save your work every few minutes
                          </p>
                        </div>
                        <Switch
                          checked={preferences.autoSave}
                          onCheckedChange={(checked) =>
                            handlePreferenceChange("autoSave", checked)
                          }
                          data-testid="switch-auto-save"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Beta Features</p>
                          <p className="text-sm text-muted-foreground">
                            Enable experimental features and early access
                          </p>
                        </div>
                        <Switch
                          checked={preferences.betaFeatures}
                          onCheckedChange={(checked) =>
                            handlePreferenceChange("betaFeatures", checked)
                          }
                          data-testid="switch-beta-features"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="billing" className="space-y-6">
              <Card className="glassmorphism">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Billing & Subscription
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {subscriptionData?.syncError && (
                    <Alert variant="destructive" className="mb-4">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Sync Issue</AlertTitle>
                      <AlertDescription>
                        {subscriptionData.syncError}
                        <Button
                          variant="outline"
                          size="sm"
                          className="ml-2"
                          onClick={() =>
                            queryClient.invalidateQueries({
                              queryKey: ["/api/billing/subscription"],
                            })
                          }
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Retry
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}

                  {subscriptionData?.isPastDue && (
                    <Alert variant="destructive" className="mb-4">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Payment Past Due</AlertTitle>
                      <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <span>
                          Your payment is past due. Please retry or update your
                          payment method to continue using Max Booster Pro
                          features.
                        </span>
                        <div className="flex gap-2 mt-2 sm:mt-0">
                          <Button
                            size="sm"
                            onClick={handleRetryPayment}
                            disabled={retryingPayment}
                            className="bg-white text-red-600 hover:bg-red-50"
                          >
                            {retryingPayment ? (
                              <>
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Retrying...
                              </>
                            ) : (
                              <>
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Retry Payment
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPaymentUpdateOpen(true)}
                          >
                            <CreditCard className="h-3 w-3 mr-1" />
                            Update Card
                          </Button>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  {subscriptionData?.isTrialing && (
                    <Alert className="mb-4 border-blue-200 bg-blue-50 dark:bg-blue-900/20">
                      <Zap className="h-4 w-4 text-blue-600" />
                      <AlertTitle className="text-blue-800 dark:text-blue-400">
                        Trial Active
                      </AlertTitle>
                      <AlertDescription className="text-blue-700 dark:text-blue-300">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <div className="flex-1">
                            <p>
                              Your free trial ends in{" "}
                              <strong>
                                {subscriptionData.trialDaysRemaining} days
                              </strong>{" "}
                              (
                              {subscriptionData.trialEndsAt
                                ? new Date(
                                    subscriptionData.trialEndsAt,
                                  ).toLocaleDateString()
                                : "soon"}
                              ).
                            </p>
                            {subscriptionData.trialDaysRemaining &&
                              subscriptionData.trialDaysRemaining <= 3 && (
                                <p className="text-sm mt-1">
                                  Your card will be charged after the trial
                                  ends. Update your plan anytime.
                                </p>
                              )}
                          </div>
                          {subscriptionData.trialDaysRemaining && (
                            <Progress
                              value={Math.max(
                                0,
                                100 -
                                  (subscriptionData.trialDaysRemaining / 14) *
                                    100,
                              )}
                              className="w-full sm:w-24 h-2 mt-2 sm:mt-0"
                            />
                          )}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  {subscriptionData?.cancelAtPeriodEnd && (
                    <Alert className="mb-4 border-orange-200 bg-orange-50 dark:bg-orange-900/20">
                      <Clock className="h-4 w-4 text-orange-600" />
                      <AlertTitle className="text-orange-800 dark:text-orange-400">
                        Subscription Ending
                      </AlertTitle>
                      <AlertDescription className="text-orange-700 dark:text-orange-300">
                        Your subscription will end on{" "}
                        {subscriptionData.currentPeriodEnd
                          ? new Date(
                              subscriptionData.currentPeriodEnd,
                            ).toLocaleDateString()
                          : "the end of your billing period"}
                        .
                        {subscriptionData.daysUntilRenewal &&
                          ` (${subscriptionData.daysUntilRenewal} days remaining)`}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Current Plan */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      Current Plan
                      {subscriptionData?.statusBadge && (
                        <Badge
                          variant={
                            subscriptionData.statusColor === "green"
                              ? "default"
                              : subscriptionData.statusColor === "red"
                                ? "destructive"
                                : subscriptionData.statusColor === "orange"
                                  ? "secondary"
                                  : subscriptionData.statusColor === "gold"
                                    ? "default"
                                    : "outline"
                          }
                          className={
                            subscriptionData.statusColor === "gold"
                              ? "bg-gradient-to-r from-yellow-400 to-amber-500 text-black"
                              : ""
                          }
                        >
                          {subscriptionData.statusColor === "gold" && (
                            <Crown className="h-3 w-3 mr-1" />
                          )}
                          {subscriptionData.statusColor === "green" && (
                            <CheckCircle className="h-3 w-3 mr-1" />
                          )}
                          {subscriptionData.statusColor === "orange" && (
                            <Clock className="h-3 w-3 mr-1" />
                          )}
                          {subscriptionData.statusColor === "red" && (
                            <XCircle className="h-3 w-3 mr-1" />
                          )}
                          {subscriptionData.statusBadge}
                        </Badge>
                      )}
                    </h3>
                    <div
                      className={`p-4 rounded-lg border ${
                        subscriptionData?.isLifetime
                          ? "bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 border-yellow-300"
                          : subscriptionData?.tier !== "free"
                            ? "bg-primary/10 border-primary/20"
                            : "bg-muted/20 border-muted/40"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p
                            className={`font-medium ${subscriptionData?.isLifetime ? "text-yellow-700 dark:text-yellow-400" : "text-primary"}`}
                          >
                            {subscriptionData?.isLifetime
                              ? "Lifetime Access"
                              : subscriptionData?.tier === "yearly"
                                ? "Yearly Plan"
                                : subscriptionData?.tier === "monthly"
                                  ? "Monthly Plan"
                                  : "Free Plan"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {subscriptionData?.isLifetime
                              ? "Permanent access to all features"
                              : subscriptionData?.tier !== "free"
                                ? "Full access to all features"
                                : "Limited access"}
                          </p>
                          {subscriptionData?.currentPeriodEnd &&
                            !subscriptionData?.isLifetime && (
                              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {subscriptionData.cancelAtPeriodEnd
                                  ? "Ends"
                                  : "Renews"}
                                :{" "}
                                {new Date(
                                  subscriptionData.currentPeriodEnd,
                                ).toLocaleDateString()}
                              </p>
                            )}
                        </div>
                        <div className="text-right">
                          {subscriptionData?.isLifetime ? (
                            <p className="text-xl font-bold text-yellow-700 dark:text-yellow-400">
                              Lifetime
                            </p>
                          ) : (
                            <>
                              <p className="text-2xl font-bold">
                                $
                                {subscriptionData?.pricing?.[
                                  subscriptionData?.tier as keyof typeof subscriptionData.pricing
                                ] ||
                                  subscriptionData?.price ||
                                  0}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                per{" "}
                                {subscriptionData?.tier === "yearly"
                                  ? "month (billed yearly)"
                                  : "month"}
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {subscriptionData?.canReactivate ? (
                          <Button
                            onClick={handleReactivateSubscription}
                            className="bg-green-600 hover:bg-green-700"
                            data-testid="button-reactivate-subscription"
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Reactivate Subscription
                          </Button>
                        ) : (
                          !subscriptionData?.isLifetime && (
                            <>
                              <Button
                                variant="outline"
                                onClick={() => navigate("/pricing")}
                                data-testid="button-change-plan"
                              >
                                {subscriptionData?.tier === "free"
                                  ? "Upgrade Plan"
                                  : "Change Plan"}
                              </Button>
                              {subscriptionData?.tier !== "free" && (
                                <Button
                                  variant="ghost"
                                  onClick={() =>
                                    setCancellationFeedbackOpen(true)
                                  }
                                  data-testid="button-cancel-subscription"
                                >
                                  Cancel Subscription
                                </Button>
                              )}
                            </>
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Payment Method */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">
                      Payment Method
                    </h3>
                    <div className="p-4 bg-muted/20 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center">
                            <CreditCard className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {paymentMethod?.last4
                                ? `•••• •••• •••• ${paymentMethod.last4}`
                                : "No payment method"}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {paymentMethod?.expiry
                                ? `Expires ${paymentMethod.expiry}`
                                : "Add payment method"}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPaymentUpdateOpen(true)}
                          data-testid="button-update-payment"
                        >
                          Update
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Billing History */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Receipt className="h-4 w-4" />
                      Billing History
                    </h3>
                    {billingLoading ? (
                      <div className="space-y-3">
                        {[...Array(3)].map((_, i) => (
                          <div
                            key={i}
                            className="animate-pulse p-3 bg-muted/20 rounded"
                          >
                            <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/3 mb-2"></div>
                            <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-1/4"></div>
                          </div>
                        ))}
                      </div>
                    ) : billingHistory.length === 0 ? (
                      <div className="text-center py-8 bg-muted/10 rounded-lg">
                        <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                        <p className="text-gray-500 dark:text-gray-400">
                          No billing history yet
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Your payment history will appear here
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {billingHistory.map(
                          (billing: Record<string, unknown>) => (
                            <div
                              key={billing.id || billing.invoiceId}
                              className="flex items-center justify-between p-4 bg-muted/10 rounded-lg border border-muted/20 hover:bg-muted/20 transition-colors"
                              data-testid={`billing-${billing.invoiceId}`}
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className={`p-2 rounded-full ${
                                    billing.status === "paid"
                                      ? "bg-green-100 dark:bg-green-900/30"
                                      : billing.status === "pending"
                                        ? "bg-yellow-100 dark:bg-yellow-900/30"
                                        : billing.status === "failed"
                                          ? "bg-red-100 dark:bg-red-900/30"
                                          : "bg-muted"
                                  }`}
                                >
                                  {billing.status === "paid" ? (
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                  ) : billing.status === "pending" ? (
                                    <Clock className="h-4 w-4 text-yellow-600" />
                                  ) : billing.status === "failed" ? (
                                    <XCircle className="h-4 w-4 text-red-600" />
                                  ) : (
                                    <Receipt className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </div>
                                <div>
                                  <p className="font-medium">
                                    {new Date(billing.date).toLocaleDateString(
                                      "en-US",
                                      {
                                        year: "numeric",
                                        month: "long",
                                        day: "numeric",
                                      },
                                    )}
                                  </p>
                                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                                    {billing.description || billing.invoiceId}
                                    {billing.status && (
                                      <Badge
                                        variant={
                                          billing.status === "paid"
                                            ? "default"
                                            : billing.status === "failed"
                                              ? "destructive"
                                              : "secondary"
                                        }
                                        className="text-xs"
                                      >
                                        {billing.status
                                          .charAt(0)
                                          .toUpperCase() +
                                          billing.status.slice(1)}
                                      </Badge>
                                    )}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <p className="font-semibold text-lg">
                                  $
                                  {typeof billing.amount === "number"
                                    ? billing.amount.toFixed(2)
                                    : billing.amount}
                                </p>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    handleDownloadInvoice(billing.invoiceId)
                                  }
                                  title="Download Invoice"
                                  data-testid={`button-download-invoice-${billing.invoiceId}`}
                                >
                                  <Download className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </div>

                  {/* Refund History */}
                  <div>
                    <Button
                      variant="ghost"
                      className="w-full flex items-center justify-between py-2 px-0 hover:bg-transparent"
                      onClick={() => setRefundsExpanded(!refundsExpanded)}
                    >
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Refund History
                      </h3>
                      <ArrowDownRight
                        className={`h-4 w-4 transition-transform ${refundsExpanded ? "rotate-180" : ""}`}
                      />
                    </Button>

                    {refundsExpanded && (
                      <div className="mt-4">
                        {refundsLoading ? (
                          <div className="space-y-3">
                            {[...Array(2)].map((_, i) => (
                              <div
                                key={i}
                                className="animate-pulse p-3 bg-muted/20 rounded"
                              >
                                <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/3 mb-2"></div>
                                <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-1/4"></div>
                              </div>
                            ))}
                          </div>
                        ) : !refundsData?.refunds ||
                          refundsData.refunds.length === 0 ? (
                          <div className="text-center py-6 bg-muted/10 rounded-lg">
                            <DollarSign className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                            <p className="text-gray-500 dark:text-gray-400">
                              No refunds yet
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Your refund history will appear here
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {refundsData.refunds.map(
                              (refund: Record<string, unknown>) => (
                                <div
                                  key={refund.id}
                                  className="flex items-center justify-between p-4 bg-muted/10 rounded-lg border border-muted/20"
                                >
                                  <div className="flex items-center gap-3">
                                    <div
                                      className={`p-2 rounded-full ${
                                        refund.statusColor === "green"
                                          ? "bg-green-100 dark:bg-green-900/30"
                                          : refund.statusColor === "yellow"
                                            ? "bg-yellow-100 dark:bg-yellow-900/30"
                                            : refund.statusColor === "red"
                                              ? "bg-red-100 dark:bg-red-900/30"
                                              : "bg-blue-100 dark:bg-blue-900/30"
                                      }`}
                                    >
                                      {refund.status === "succeeded" ? (
                                        <CheckCircle className="h-4 w-4 text-green-600" />
                                      ) : refund.status === "pending" ? (
                                        <Clock className="h-4 w-4 text-yellow-600" />
                                      ) : refund.status === "failed" ? (
                                        <XCircle className="h-4 w-4 text-red-600" />
                                      ) : (
                                        <RefreshCw className="h-4 w-4 text-blue-600" />
                                      )}
                                    </div>
                                    <div>
                                      <p className="font-medium">
                                        {new Date(
                                          refund.created,
                                        ).toLocaleDateString("en-US", {
                                          year: "numeric",
                                          month: "long",
                                          day: "numeric",
                                        })}
                                      </p>
                                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                                        {refund.description}
                                        <Badge
                                          variant={
                                            refund.status === "succeeded"
                                              ? "default"
                                              : refund.status === "failed"
                                                ? "destructive"
                                                : "secondary"
                                          }
                                          className="text-xs"
                                        >
                                          {refund.statusDisplay}
                                        </Badge>
                                      </p>
                                      {refund.reason && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                          Reason: {refund.reason}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <p className="font-semibold text-lg text-green-600">
                                    +${refund.amount.toFixed(2)}
                                  </p>
                                </div>
                              ),
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Plan Comparison Button */}
                  {!subscriptionData?.isLifetime &&
                    subscriptionData?.tier !== "free" && (
                      <div className="pt-4 border-t">
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => setPlanComparisonOpen(true)}
                        >
                          <Info className="h-4 w-4 mr-2" />
                          View Plan Benefits & Compare
                        </Button>
                      </div>
                    )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="security" className="space-y-6">
              <div className="grid gap-6">
                <LoginHistory />
                <RecoveryCodes />
                <ApiKeyManagement />
                <ConnectedAccountsManager />
              </div>
            </TabsContent>

            <TabsContent value="privacy" className="space-y-6">
              <PrivacySettings />
            </TabsContent>

            <TabsContent value="platforms" className="space-y-6">
              <PlatformConnections />
            </TabsContent>

            <TabsContent value="sync" className="space-y-6">
              <CrossPlatformSync />
            </TabsContent>

            <TabsContent value="shortcuts" className="space-y-6">
              <Card className="glassmorphism">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Keyboard className="w-5 h-5" />
                    Keyboard Shortcuts
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Customize keyboard shortcuts to match your workflow. Click
                    any shortcut to rebind it.
                  </p>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => setShortcutCustomizerOpen(true)}
                    className="w-full sm:w-auto"
                  >
                    <Keyboard className="w-4 h-4 mr-2" />
                    Open Shortcut Editor
                  </Button>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Shortcuts are saved to your account and synced across
                    devices.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Dialogs */}
          <ShortcutCustomizer
            open={shortcutCustomizerOpen}
            onOpenChange={setShortcutCustomizerOpen}
          />
          <ChangePasswordDialog
            open={changePasswordOpen}
            onOpenChange={setChangePasswordOpen}
          />

          <TwoFactorSetupDialog
            open={twoFactorOpen}
            onOpenChange={setTwoFactorOpen}
          />

          <PaymentUpdateDialog
            open={paymentUpdateOpen}
            onOpenChange={setPaymentUpdateOpen}
          />

          <DeleteAccountDialog
            open={deleteAccountOpen}
            onOpenChange={setDeleteAccountOpen}
          />

          <CancellationModal
            open={cancellationFeedbackOpen}
            onOpenChange={setCancellationFeedbackOpen}
            currentPlan={subscriptionData?.tier ?? "Pro"}
            onConfirmCancellation={handleCancelSubscription}
          />

          <AlertDialog
            open={cancelSubscriptionOpen}
            onOpenChange={setCancelSubscriptionOpen}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel Subscription</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to cancel your subscription? You'll
                  continue to have access to Max Booster Pro features until the
                  end of your current billing period.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                <AlertDialogAction onClick={handleCancelSubscription}>
                  Cancel Subscription
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog
            open={terminateSessionOpen}
            onOpenChange={setTerminateSessionOpen}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Terminate Session</AlertDialogTitle>
                <AlertDialogDescription>
                  This will immediately log out the selected device. The user
                  will need to sign in again to access the account.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={terminatingSession}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleTerminateSession}
                  disabled={terminatingSession}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {terminatingSession ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Terminating...
                    </>
                  ) : (
                    "Terminate Session"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog
            open={twoFactorDisableOpen}
            onOpenChange={setTwoFactorDisableOpen}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Disable Two-Factor Authentication
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-3">
                  <p>
                    Disabling 2FA will make your account less secure. You will
                    only need your password to log in.
                  </p>
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <p className="text-sm text-amber-800 dark:text-amber-300">
                      <strong>Warning:</strong> Anyone who obtains your password
                      will be able to access your account without additional
                      verification.
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep 2FA Enabled</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={async () => {
                    try {
                      await apiRequest("POST", "/api/auth/2fa/disable");
                      queryClient.invalidateQueries({
                        queryKey: ["/api/auth/me"],
                      });
                      toast({
                        title: "2FA Disabled",
                        description:
                          "Two-factor authentication has been disabled on your account.",
                      });
                      setTwoFactorDisableOpen(false);
                    } catch (error) {
                      toast({
                        title: "Error",
                        description: "Failed to disable 2FA. Please try again.",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  Disable 2FA
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Plan Comparison Dialog */}
          <Dialog
            open={planComparisonOpen}
            onOpenChange={setPlanComparisonOpen}
          >
            <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Your Plan Benefits
                </DialogTitle>
                <DialogDescription>
                  Compare features across all available plans
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                {/* Current Plan Benefits */}
                {subscriptionData?.planBenefits && (
                  <div className="p-4 rounded-lg border-2 border-primary bg-primary/5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Crown className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold text-lg">
                          Current: {subscriptionData.planBenefits.name} Plan
                        </h3>
                      </div>
                      <Badge variant="default">Active</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          Storage: {subscriptionData.planBenefits.cloudStorage}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Headphones className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          Support: {subscriptionData.planBenefits.support}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {subscriptionData.planBenefits.features
                        ?.slice(0, 5)
                        .map((feature: string, index: number) => (
                          <div
                            key={index}
                            className="flex items-center gap-2 text-sm"
                          >
                            <Check className="h-4 w-4 text-green-500" />
                            <span>{feature}</span>
                          </div>
                        ))}
                      {subscriptionData.planBenefits.features?.length > 5 && (
                        <p className="text-sm text-muted-foreground ml-6">
                          + {subscriptionData.planBenefits.features.length - 5}{" "}
                          more features
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Upgrade Options */}
                {subscriptionData?.upgradeOptions &&
                  subscriptionData.upgradeOptions.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <ArrowUpRight className="h-4 w-4 text-green-500" />
                        Upgrade Options
                      </h4>
                      <div className="grid gap-3">
                        {subscriptionData.upgradeOptions.map(
                          (option: Record<string, unknown>) => (
                            <div
                              key={option.tier}
                              className="p-4 rounded-lg border bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <h5 className="font-medium">
                                    {option.name} Plan
                                  </h5>
                                  <p className="text-sm text-muted-foreground">
                                    {option.period === "once"
                                      ? `$${option.price} one-time`
                                      : `$${option.price}/${option.period}`}
                                    {option.savings && (
                                      <span className="text-green-600 ml-2">
                                        Save ${option.savings}/year
                                      </span>
                                    )}
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setPlanComparisonOpen(false);
                                    navigate(`/subscribe?plan=${option.tier}`);
                                  }}
                                >
                                  Upgrade
                                  <ArrowUpRight className="h-3 w-3 ml-1" />
                                </Button>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {option.features
                                  ?.slice(0, 3)
                                  .map((feature: string, index: number) => (
                                    <Badge
                                      key={index}
                                      variant="secondary"
                                      className="text-xs"
                                    >
                                      {feature}
                                    </Badge>
                                  ))}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                {/* Downgrade Options */}
                {subscriptionData?.downgradeOptions &&
                  subscriptionData.downgradeOptions.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <ArrowDownRight className="h-4 w-4 text-orange-500" />
                        Downgrade Options
                      </h4>
                      <div className="grid gap-3">
                        {subscriptionData.downgradeOptions.map(
                          (option: Record<string, unknown>) => (
                            <div
                              key={option.tier}
                              className="p-4 rounded-lg border bg-orange-50/50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <h5 className="font-medium">
                                    {option.name} Plan
                                  </h5>
                                  <p className="text-sm text-muted-foreground">
                                    {option.price === 0
                                      ? "Free"
                                      : `$${option.price}/${option.period}`}
                                  </p>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setPlanComparisonOpen(false);
                                    if (option.tier === "free") {
                                      setCancelSubscriptionOpen(true);
                                    } else {
                                      navigate(
                                        `/subscribe?plan=${option.tier}`,
                                      );
                                    }
                                  }}
                                >
                                  Downgrade
                                  <ArrowDownRight className="h-3 w-3 ml-1" />
                                </Button>
                              </div>
                              <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
                                You may lose access to:{" "}
                                {subscriptionData.planBenefits.cloudStorage}{" "}
                                storage, {subscriptionData.planBenefits.support}{" "}
                                support
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}
              </div>

              <DialogFooter className="mt-4">
                <Button
                  variant="outline"
                  onClick={() => setPlanComparisonOpen(false)}
                >
                  Close
                </Button>
                <Button
                  onClick={() => {
                    setPlanComparisonOpen(false);
                    navigate("/pricing");
                  }}
                >
                  View All Plans
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </AppLayout>
  );
}
