import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Eye, EyeOff, CheckCircle, X, AlertCircle, Shield } from "lucide-react";

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
  requirements: { met: boolean; text: string }[];
}

const getPasswordStrength = (password: string): PasswordStrength => {
  const requirements = [
    { met: password.length >= 8, text: "At least 8 characters" },
    { met: /[A-Z]/.test(password), text: "One uppercase letter" },
    { met: /[a-z]/.test(password), text: "One lowercase letter" },
    { met: /[0-9]/.test(password), text: "One number" },
    { met: /[^A-Za-z0-9]/.test(password), text: "One special character" },
  ];

  const score = requirements.filter((r) => r.met).length;

  if (score <= 1)
    return { score, label: "Weak", color: "bg-red-500", requirements };
  if (score <= 2)
    return { score, label: "Fair", color: "bg-orange-500", requirements };
  if (score <= 3)
    return { score, label: "Good", color: "bg-yellow-500", requirements };
  if (score <= 4)
    return { score, label: "Strong", color: "bg-green-500", requirements };
  return { score, label: "Very Strong", color: "bg-green-600", requirements };
};

export default function ChangePasswordDialog({
  open,
  onOpenChange,
}: ChangePasswordDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [fieldErrors, setFieldErrors] = useState<{
    current?: string;
    new?: string;
    confirm?: string;
  }>({});

  const passwordStrength = useMemo(
    () => getPasswordStrength(passwords.newPassword),
    [passwords.newPassword],
  );

  const validateForm = (): boolean => {
    const errors: { current?: string; new?: string; confirm?: string } = {};

    if (!passwords.currentPassword) {
      errors.current = "Current password is required";
    }

    if (!passwords.newPassword) {
      errors.new = "New password is required";
    } else if (passwords.newPassword.length < 8) {
      errors.new = "Password must be at least 8 characters";
    } else if (passwords.newPassword === passwords.currentPassword) {
      errors.new = "New password must be different from current password";
    }

    if (!passwords.confirmPassword) {
      errors.confirm = "Please confirm your new password";
    } else if (passwords.newPassword !== passwords.confirmPassword) {
      errors.confirm = "Passwords do not match";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const getEnhancedErrorMessage = (error: unknown): string => {
    const errorObj = error as { message?: string; status?: number };
    const message = errorObj?.message || "";
    const lowerMessage = message.toLowerCase();

    if (
      lowerMessage.includes("incorrect") ||
      lowerMessage.includes("invalid") ||
      lowerMessage.includes("wrong")
    ) {
      return "Your current password is incorrect. Please try again.";
    }
    if (lowerMessage.includes("same") || lowerMessage.includes("different")) {
      return "Your new password must be different from your current password.";
    }
    if (lowerMessage.includes("weak")) {
      return "Please choose a stronger password with at least 8 characters.";
    }

    return message || "Failed to change password. Please try again.";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/change-password", {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });

      toast({
        title: "Password Changed",
        description:
          "Your password has been changed successfully. Other sessions have been logged out.",
      });

      onOpenChange(false);
      setPasswords({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setFieldErrors({});
    } catch (error: unknown) {
      const errorMessage = getEnhancedErrorMessage(error);

      if (errorMessage.toLowerCase().includes("current")) {
        setFieldErrors((prev) => ({ ...prev, current: "Incorrect password" }));
      }

      toast({
        title: "Password Change Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setFieldErrors({});
    setShowPassword({ current: false, new: false, confirm: false });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
          <DialogDescription>
            Enter your current password and choose a new one. Make sure your new
            password is at least 8 characters long.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="currentPassword">Current Password</Label>
            <div className="relative">
              <Input
                id="currentPassword"
                type={showPassword.current ? "text" : "password"}
                value={passwords.currentPassword}
                onChange={(e) => {
                  setPasswords((prev) => ({
                    ...prev,
                    currentPassword: e.target.value,
                  }));
                  if (fieldErrors.current)
                    setFieldErrors((prev) => ({ ...prev, current: undefined }));
                }}
                required
                className={`pr-10 ${fieldErrors.current ? "border-destructive" : ""}`}
                data-testid="input-dialog-current-password"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() =>
                  setShowPassword((prev) => ({
                    ...prev,
                    current: !prev.current,
                  }))
                }
                data-testid="button-toggle-current-password"
              >
                {showPassword.current ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </Button>
            </div>
            {fieldErrors.current && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {fieldErrors.current}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="newPassword">New Password</Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showPassword.new ? "text" : "password"}
                value={passwords.newPassword}
                onChange={(e) => {
                  setPasswords((prev) => ({
                    ...prev,
                    newPassword: e.target.value,
                  }));
                  if (fieldErrors.new)
                    setFieldErrors((prev) => ({ ...prev, new: undefined }));
                }}
                required
                className={`pr-10 ${fieldErrors.new ? "border-destructive" : ""}`}
                data-testid="input-dialog-new-password"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() =>
                  setShowPassword((prev) => ({ ...prev, new: !prev.new }))
                }
                data-testid="button-toggle-new-password"
              >
                {showPassword.new ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </Button>
            </div>
            {passwords.newPassword && (
              <div className="space-y-2 mt-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${passwordStrength.color}`}
                      style={{
                        width: `${(passwordStrength.score / 5) * 100}%`,
                      }}
                    />
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      passwordStrength.score <= 2
                        ? "text-red-600"
                        : passwordStrength.score <= 3
                          ? "text-yellow-600"
                          : "text-green-600"
                    }`}
                  >
                    {passwordStrength.label}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {passwordStrength.requirements.map((req, i) => (
                    <div
                      key={i}
                      className={`text-xs flex items-center gap-1 ${req.met ? "text-green-600" : "text-gray-500"}`}
                    >
                      {req.met ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                      {req.text}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {fieldErrors.new && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {fieldErrors.new}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showPassword.confirm ? "text" : "password"}
                value={passwords.confirmPassword}
                onChange={(e) => {
                  setPasswords((prev) => ({
                    ...prev,
                    confirmPassword: e.target.value,
                  }));
                  if (fieldErrors.confirm)
                    setFieldErrors((prev) => ({ ...prev, confirm: undefined }));
                }}
                required
                className={`pr-10 ${fieldErrors.confirm ? "border-destructive" : ""}`}
                data-testid="input-dialog-confirm-password"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() =>
                  setShowPassword((prev) => ({
                    ...prev,
                    confirm: !prev.confirm,
                  }))
                }
                data-testid="button-toggle-confirm-password"
              >
                {showPassword.confirm ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </Button>
            </div>
            {passwords.confirmPassword &&
              passwords.newPassword === passwords.confirmPassword && (
                <p className="text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Passwords match
                </p>
              )}
            {fieldErrors.confirm && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {fieldErrors.confirm}
              </p>
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
              data-testid="button-cancel-password-change"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              data-testid="button-submit-password-change"
            >
              {loading ? "Changing..." : "Change Password"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
