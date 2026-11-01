import { useState, useCallback, useMemo, useEffect, useRef } from "react";

export type ValidationRule<T> = {
  validate: (value: T, formValues?: Record<string, unknown>) => boolean;
  message: string;
  guidance?: string;
};

export type FieldValidation<T> = {
  rules: ValidationRule<T>[];
  required?: boolean;
  requiredMessage?: string;
  debounceMs?: number;
};

export type ValidationSchema = Record<string, FieldValidation<unknown>>;

export interface FieldError {
  message: string;
  guidance?: string;
}

export interface FieldState {
  value: unknown;
  error: FieldError | null;
  isValid: boolean;
  isDirty: boolean;
  isTouched: boolean;
  isValidating: boolean;
}

export interface FormState {
  fields: Record<string, FieldState>;
  isValid: boolean;
  isDirty: boolean;
  isSubmitting: boolean;
  hasErrors: boolean;
  errors: Record<string, FieldError>;
}

export interface UseFormValidationOptions {
  schema: ValidationSchema;
  initialValues?: Record<string, unknown>;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  validateOnMount?: boolean;
}

export interface UseFormValidationResult {
  formState: FormState;
  setValue: (field: string, value: unknown) => void;
  setValues: (values: Record<string, unknown>) => void;
  setFieldTouched: (field: string, touched?: boolean) => void;
  validateField: (field: string) => Promise<FieldError | null>;
  validateForm: () => Promise<boolean>;
  resetForm: () => void;
  resetField: (field: string) => void;
  getFieldProps: (field: string) => {
    value: unknown;
    onChange: (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => void;
    onBlur: () => void;
    "aria-invalid": boolean;
    "aria-describedby": string;
  };
  getFieldError: (field: string) => FieldError | null;
  getFieldGuidance: (field: string) => string | undefined;
  isFieldValid: (field: string) => boolean;
  handleSubmit: (
    onSubmit: (values: Record<string, unknown>) => Promise<void>,
  ) => (e: React.FormEvent) => Promise<void>;
}

const commonValidators = {
  email: {
    validate: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    message: "Please enter a valid email address",
    guidance: "Example: name@example.com",
  },
  minLength: (min: number): ValidationRule<string> => ({
    validate: (value) => value.length >= min,
    message: `Must be at least ${min} characters`,
    guidance: `Enter ${min} or more characters`,
  }),
  maxLength: (max: number): ValidationRule<string> => ({
    validate: (value) => value.length <= max,
    message: `Must be no more than ${max} characters`,
    guidance: `Maximum ${max} characters allowed`,
  }),
  pattern: (
    regex: RegExp,
    message: string,
    guidance?: string,
  ): ValidationRule<string> => ({
    validate: (value) => regex.test(value),
    message,
    guidance,
  }),
  match: (fieldName: string, fieldLabel: string): ValidationRule<string> => ({
    validate: (value, formValues) => value === formValues?.[fieldName],
    message: `Must match ${fieldLabel}`,
    guidance: `Enter the same value as ${fieldLabel}`,
  }),
  url: {
    validate: (value: string) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    },
    message: "Please enter a valid URL",
    guidance: "Example: https://example.com",
  },
  phone: {
    validate: (value: string) =>
      /^\+?[\d\s\-()]+$/.test(value) && value.replace(/\D/g, "").length >= 10,
    message: "Please enter a valid phone number",
    guidance: "Include country code for international numbers",
  },
  password: {
    validate: (value: string) =>
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(
        value,
      ),
    message: "Password must be stronger",
    guidance:
      "Use at least 8 characters with uppercase, lowercase, number, and special character",
  },
  number: {
    validate: (value: string) =>
      !isNaN(parseFloat(value)) && isFinite(Number(value)),
    message: "Please enter a valid number",
    guidance: "Enter numbers only",
  },
  positiveNumber: {
    validate: (value: string) => !isNaN(parseFloat(value)) && Number(value) > 0,
    message: "Please enter a positive number",
    guidance: "Enter a number greater than 0",
  },
  date: {
    validate: (value: string) => !isNaN(Date.parse(value)),
    message: "Please enter a valid date",
    guidance: "Format: YYYY-MM-DD",
  },
  futureDate: {
    validate: (value: string) => new Date(value) > new Date(),
    message: "Date must be in the future",
    guidance: "Select a date after today",
  },
  pastDate: {
    validate: (value: string) => new Date(value) < new Date(),
    message: "Date must be in the past",
    guidance: "Select a date before today",
  },
};

export const validators = commonValidators;

export function useFormValidation(
  options: UseFormValidationOptions,
): UseFormValidationResult {
  const {
    schema,
    initialValues = {},
    validateOnChange = true,
    validateOnBlur = true,
    validateOnMount = false,
  } = options;

  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

  const createInitialFieldState = useCallback(
    (field: string): FieldState => ({
      value: initialValues[field] ?? "",
      error: null,
      isValid: true,
      isDirty: false,
      isTouched: false,
      isValidating: false,
    }),
    [initialValues],
  );

  const [fields, setFields] = useState<Record<string, FieldState>>(() => {
    const initialFields: Record<string, FieldState> = {};
    Object.keys(schema).forEach((field) => {
      initialFields[field] = createInitialFieldState(field);
    });
    return initialFields;
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateField = useCallback(
    async (field: string): Promise<FieldError | null> => {
      const fieldSchema = schema[field];
      if (!fieldSchema) return null;

      const fieldState = fields[field];
      if (!fieldState) return null;

      const value = fieldState.value;
      const formValues = Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [k, v.value]),
      );

      setFields((prev) => ({
        ...prev,
        [field]: { ...prev[field], isValidating: true },
      }));

      if (
        fieldSchema.required &&
        (value === "" || value === null || value === undefined)
      ) {
        const error = {
          message: fieldSchema.requiredMessage || "This field is required",
          guidance: "Please fill in this field",
        };
        setFields((prev) => ({
          ...prev,
          [field]: {
            ...prev[field],
            error,
            isValid: false,
            isValidating: false,
          },
        }));
        return error;
      }

      if (value === "" || value === null || value === undefined) {
        setFields((prev) => ({
          ...prev,
          [field]: {
            ...prev[field],
            error: null,
            isValid: true,
            isValidating: false,
          },
        }));
        return null;
      }

      for (const rule of fieldSchema.rules) {
        const isValid = rule.validate(value, formValues);
        if (!isValid) {
          const error = { message: rule.message, guidance: rule.guidance };
          setFields((prev) => ({
            ...prev,
            [field]: {
              ...prev[field],
              error,
              isValid: false,
              isValidating: false,
            },
          }));
          return error;
        }
      }

      setFields((prev) => ({
        ...prev,
        [field]: {
          ...prev[field],
          error: null,
          isValid: true,
          isValidating: false,
        },
      }));
      return null;
    },
    [schema, fields],
  );

  const validateForm = useCallback(async (): Promise<boolean> => {
    const results = await Promise.all(
      Object.keys(schema).map((field) => validateField(field)),
    );
    return results.every((error) => error === null);
  }, [schema, validateField]);

  const setValue = useCallback(
    (field: string, value: unknown) => {
      setFields((prev) => ({
        ...prev,
        [field]: { ...prev[field], value, isDirty: true },
      }));

      if (validateOnChange) {
        const fieldSchema = schema[field];
        const debounceMs = fieldSchema?.debounceMs ?? 300;

        if (debounceTimers.current[field]) {
          clearTimeout(debounceTimers.current[field]);
        }

        debounceTimers.current[field] = setTimeout(() => {
          validateField(field);
        }, debounceMs);
      }
    },
    [validateOnChange, schema, validateField],
  );

  const setValues = useCallback((values: Record<string, unknown>) => {
    setFields((prev) => {
      const updated = { ...prev };
      Object.entries(values).forEach(([field, value]) => {
        if (updated[field]) {
          updated[field] = { ...updated[field], value, isDirty: true };
        }
      });
      return updated;
    });
  }, []);

  const setFieldTouched = useCallback(
    (field: string, touched = true) => {
      setFields((prev) => ({
        ...prev,
        [field]: { ...prev[field], isTouched: touched },
      }));

      if (validateOnBlur && touched) {
        validateField(field);
      }
    },
    [validateOnBlur, validateField],
  );

  const resetForm = useCallback(() => {
    const resetFields: Record<string, FieldState> = {};
    Object.keys(schema).forEach((field) => {
      resetFields[field] = createInitialFieldState(field);
    });
    setFields(resetFields);
    setIsSubmitting(false);
  }, [schema, createInitialFieldState]);

  const resetField = useCallback(
    (field: string) => {
      setFields((prev) => ({
        ...prev,
        [field]: createInitialFieldState(field),
      }));
    },
    [createInitialFieldState],
  );

  const getFieldProps = useCallback(
    (field: string) => {
      const fieldState = fields[field] || createInitialFieldState(field);
      return {
        value: fieldState.value as string,
        onChange: (
          e: React.ChangeEvent<
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
          >,
        ) => {
          setValue(field, e.target.value);
        },
        onBlur: () => {
          setFieldTouched(field, true);
        },
        "aria-invalid": fieldState.isTouched && !fieldState.isValid,
        "aria-describedby": `${field}-error ${field}-guidance`,
      };
    },
    [fields, createInitialFieldState, setValue, setFieldTouched],
  );

  const getFieldError = useCallback(
    (field: string): FieldError | null => {
      const fieldState = fields[field];
      if (!fieldState || !fieldState.isTouched) return null;
      return fieldState.error;
    },
    [fields],
  );

  const getFieldGuidance = useCallback(
    (field: string): string | undefined => {
      const fieldState = fields[field];
      if (!fieldState) return undefined;
      return fieldState.error?.guidance;
    },
    [fields],
  );

  const isFieldValid = useCallback(
    (field: string): boolean => {
      return fields[field]?.isValid ?? true;
    },
    [fields],
  );

  const handleSubmit = useCallback(
    (onSubmit: (values: Record<string, unknown>) => Promise<void>) => {
      return async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        Object.keys(fields).forEach((field) => {
          setFieldTouched(field, true);
        });

        const isValid = await validateForm();
        if (isValid) {
          const values = Object.fromEntries(
            Object.entries(fields).map(([k, v]) => [k, v.value]),
          );
          await onSubmit(values);
        }

        setIsSubmitting(false);
      };
    },
    [fields, validateForm, setFieldTouched],
  );

  useEffect(() => {
    if (validateOnMount) {
      validateForm();
    }
  }, [validateOnMount, validateForm]);

  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
    };
  }, []);

  const formState = useMemo<FormState>(() => {
    const errors: Record<string, FieldError> = {};
    let isValid = true;
    let isDirty = false;
    let hasErrors = false;

    Object.entries(fields).forEach(([field, state]) => {
      if (state.error) {
        errors[field] = state.error;
        hasErrors = true;
      }
      if (!state.isValid) {
        isValid = false;
      }
      if (state.isDirty) {
        isDirty = true;
      }
    });

    return {
      fields,
      isValid,
      isDirty,
      isSubmitting,
      hasErrors,
      errors,
    };
  }, [fields, isSubmitting]);

  return {
    formState,
    setValue,
    setValues,
    setFieldTouched,
    validateField,
    validateForm,
    resetForm,
    resetField,
    getFieldProps,
    getFieldError,
    getFieldGuidance,
    isFieldValid,
    handleSubmit,
  };
}

export function FormFieldError({
  error,
  guidance,
  fieldId,
}: {
  error: string | null;
  guidance?: string;
  fieldId: string;
}) {
  if (!error) return null;

  return (
    <div className="mt-1 space-y-1">
      <p
        id={`${fieldId}-error`}
        className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1"
      >
        <span className="inline-block w-1 h-1 rounded-full bg-red-500" />
        {error}
      </p>
      {guidance && (
        <p id={`${fieldId}-guidance`} className="text-xs text-muted-foreground">
          {guidance}
        </p>
      )}
    </div>
  );
}

export function FormFieldSuccess({
  message,
  fieldId,
}: {
  message: string;
  fieldId: string;
}) {
  return (
    <p
      id={`${fieldId}-success`}
      className="mt-1 text-sm text-green-600 dark:text-green-400 flex items-center gap-1"
    >
      <span className="inline-block w-1 h-1 rounded-full bg-green-500" />
      {message}
    </p>
  );
}

export function PasswordStrengthIndicator({ password }: { password: string }) {
  const getStrength = (
    pwd: string,
  ): { level: number; label: string; color: string } => {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^a-zA-Z\d]/.test(pwd)) score++;

    if (score <= 2) return { level: 1, label: "Weak", color: "bg-red-500" };
    if (score <= 4) return { level: 2, label: "Fair", color: "bg-yellow-500" };
    if (score <= 5) return { level: 3, label: "Good", color: "bg-blue-500" };
    return { level: 4, label: "Strong", color: "bg-green-500" };
  };

  const strength = getStrength(password);

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className={`h-1 flex-1 rounded-full transition-colors ${
              level <= strength.level
                ? strength.color
                : "bg-gray-200 dark:bg-gray-700"
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Password strength: <span className="font-medium">{strength.label}</span>
      </p>
    </div>
  );
}
