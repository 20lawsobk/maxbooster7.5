import { z } from 'zod';

// ============================================================================
// Common Schemas
// ============================================================================

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const idParamSchema = z.object({
  id: z.string().min(1, 'ID is required'),
});

export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
});

export const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required').max(200, 'Search query too long'),
  page: z.coerce.number().int().positive().default(1).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20).optional(),
});

export const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// ============================================================================
// Auth Schemas
// ============================================================================

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username cannot exceed 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string(),
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().min(1).max(255).optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export const createCheckoutSessionSchema = z.object({
  tier: z.enum(['monthly', 'yearly', 'lifetime'], {
    errorMap: () => ({ message: 'Invalid subscription tier' }),
  }),
  userEmail: z.string().email('Invalid email address'),
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username cannot exceed 50 characters'),
  birthdate: z.string().refine((date) => {
    const birthDate = new Date(date);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    const actualAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate()) ? age - 1 : age;
    return actualAge >= 13;
  }, {
    message: 'You must be at least 13 years old to create an account (COPPA compliance)',
  }),
});

export const registerAfterPaymentSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  tosAccepted: z.boolean().refine((val) => val === true, {
    message: 'You must accept the Terms of Service to create an account',
  }),
  privacyAccepted: z.boolean().refine((val) => val === true, {
    message: 'You must accept the Privacy Policy to create an account',
  }),
  marketingConsent: z.boolean().default(false),
});

// ============================================================================
// User Schemas
// ============================================================================

export const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().min(1).max(255).optional(),
  email: z.string().email('Invalid email address').max(255).optional(),
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username cannot exceed 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens')
    .optional(),
}).strict();

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'New password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmNewPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "Passwords don't match",
  path: ['confirmNewPassword'],
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: 'New password must be different from current password',
  path: ['newPassword'],
});

export const updateUserPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark']).optional(),
  language: z.string().max(10).optional(),
  timezone: z.string().max(50).optional(),
  tutorialCompleted: z.object({
    studio: z.boolean().optional(),
    dashboard: z.boolean().optional(),
    distribution: z.boolean().optional(),
  }).optional(),
}).strict();

export const updateNotificationPreferencesSchema = z.object({
  email: z.boolean().optional(),
  browser: z.boolean().optional(),
  releases: z.boolean().optional(),
  earnings: z.boolean().optional(),
  sales: z.boolean().optional(),
  marketing: z.boolean().optional(),
  system: z.boolean().optional(),
}).strict();

// ============================================================================
// Upload Schemas
// ============================================================================

export const ALLOWED_AUDIO_MIMES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/ogg',
  'audio/aac',
  'audio/flac',
  'audio/x-flac',
] as const;

export const ALLOWED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.aac', '.flac'] as const;

export const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'] as const;

export const MAX_AUDIO_SIZE = 100 * 1024 * 1024; // 100MB
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB

export const fileUploadMetadataSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  genre: z.string().max(100).optional(),
  tags: z.string().max(500).optional(),
});

export const audioUploadSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().max(2000).optional(),
  genre: z.string().max(100).optional(),
  bpm: z.coerce.number().int().min(20).max(400).optional(),
  key: z.string().max(10).optional(),
});

export const avatarUploadSchema = z.object({
  cropX: z.coerce.number().optional(),
  cropY: z.coerce.number().optional(),
  cropWidth: z.coerce.number().optional(),
  cropHeight: z.coerce.number().optional(),
});

// ============================================================================
// Project Schemas
// ============================================================================

export const createProjectSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().max(2000).optional(),
  genre: z.string().max(100).optional(),
  type: z.string().max(50).optional(),
  tags: z.string().max(500).optional(),
  isStudioProject: z.boolean().optional(),
});

export const updateProjectSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  genre: z.string().max(100).optional(),
  status: z.enum(['draft', 'in_progress', 'completed', 'published', 'archived']).optional(),
  tags: z.string().max(500).optional(),
  bpm: z.number().int().min(20).max(400).optional(),
  key: z.string().max(10).optional(),
  timeSignature: z.string().max(10).optional(),
}).strict();

// ============================================================================
// Admin Schemas
// ============================================================================

export const updateContentFlagSchema = z.object({
  status: z.enum(['pending', 'under_review', 'resolved', 'dismissed']).optional(),
  actionTaken: z.enum(['content_removed', 'warning_issued', 'no_action', 'user_banned', 'referred_to_legal']).optional(),
  resolution: z.string().max(2000).optional(),
}).strict();

export const manualDeleteAccountSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  reason: z.string()
    .min(10, 'Deletion reason must be at least 10 characters')
    .max(500, 'Deletion reason too long'),
}).strict();

// ============================================================================
// Social Media Schemas
// ============================================================================

export const schedulePostSchema = z.object({
  platform: z.enum(['facebook', 'instagram', 'twitter', 'tiktok', 'youtube', 'linkedin', 'threads']),
  content: z.string().min(1, 'Content is required').max(5000),
  scheduledAt: z.string().datetime('Invalid date format'),
  mediaUrls: z.array(z.string().url()).max(10).optional(),
});

export const generateContentSchema = z.object({
  platform: z.enum(['facebook', 'instagram', 'twitter', 'tiktok', 'youtube', 'linkedin', 'threads']),
  topic: z.string().min(1, 'Topic is required').max(500),
  tone: z.enum(['professional', 'casual', 'humorous', 'inspirational', 'promotional']).optional(),
  includeHashtags: z.boolean().default(true),
  includeEmojis: z.boolean().default(true),
});

// ============================================================================
// Marketplace Schemas
// ============================================================================

export const createListingSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().max(5000).optional(),
  price: z.coerce.number().positive('Price must be positive').max(10000),
  genre: z.string().max(100).optional(),
  bpm: z.coerce.number().int().min(20).max(400).optional(),
  key: z.string().max(10).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  licenseType: z.enum(['basic', 'premium', 'exclusive']).optional(),
});

export const purchaseBeatSchema = z.object({
  listingId: z.string().min(1, 'Listing ID is required'),
  licenseType: z.enum(['basic', 'premium', 'exclusive']),
});

// ============================================================================
// Royalties Schemas
// ============================================================================

export const createRoyaltySplitSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  splits: z.array(z.object({
    userId: z.string().optional(),
    email: z.string().email().optional(),
    name: z.string().min(1).max(255),
    percentage: z.number().min(0.01).max(100),
    role: z.string().max(100).optional(),
  })).min(1, 'At least one split is required'),
}).refine((data) => {
  const totalPercentage = data.splits.reduce((sum, split) => sum + split.percentage, 0);
  return Math.abs(totalPercentage - 100) < 0.01;
}, {
  message: 'Split percentages must total 100%',
  path: ['splits'],
});

export const requestPayoutSchema = z.object({
  amount: z.number().positive('Amount must be positive').min(10, 'Minimum payout is $10'),
  method: z.enum(['stripe', 'paypal', 'bank_transfer']),
});

// ============================================================================
// Type Exports
// ============================================================================

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type CreateCheckoutSessionInput = z.infer<typeof createCheckoutSessionSchema>;
export type RegisterAfterPaymentInput = z.infer<typeof registerAfterPaymentSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateUserPreferencesInput = z.infer<typeof updateUserPreferencesSchema>;
export type UpdateNotificationPreferencesInput = z.infer<typeof updateNotificationPreferencesSchema>;
export type AudioUploadInput = z.infer<typeof audioUploadSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type SchedulePostInput = z.infer<typeof schedulePostSchema>;
export type GenerateContentInput = z.infer<typeof generateContentSchema>;
export type CreateListingInput = z.infer<typeof createListingSchema>;
export type PurchaseBeatInput = z.infer<typeof purchaseBeatSchema>;
export type CreateRoyaltySplitInput = z.infer<typeof createRoyaltySplitSchema>;
export type RequestPayoutInput = z.infer<typeof requestPayoutSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type SearchInput = z.infer<typeof searchQuerySchema>;
