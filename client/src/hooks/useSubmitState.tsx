import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import { ApiError } from "@/lib/queryClient";

export type SubmitState = "idle" | "submitting" | "success" | "error";

export interface FieldError {
  field: string;
  message: string;
}

export interface UseSubmitStateOptions<T> {
  onSuccess?: (result: T) => void;
  onError?: (error: Error | ApiError) => void;
  successMessage?: string;
  errorMessage?: string;
  showToasts?: boolean;
  resetOnSuccess?: boolean;
  successDuration?: number;
  validateBeforeSubmit?: () => boolean | Promise<boolean>;
}

export interface UseSubmitStateResult<T> {
  state: SubmitState;
  isIdle: boolean;
  isSubmitting: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: Error | ApiError | null;
  fieldErrors: FieldError[];
  submitCount: number;
  isDisabled: boolean;
  submit: (fn: () => Promise<T>) => Promise<T | null>;
  reset: () => void;
  retry: () => Promise<T | null>;
  setFieldErrors: (errors: FieldError[]) => void;
  clearFieldError: (field: string) => void;
  getFieldError: (field: string) => string | undefined;
  hasFieldError: (field: string) => boolean;
}

export function useSubmitState<T = unknown>(
  options: UseSubmitStateOptions<T> = {},
): UseSubmitStateResult<T> {
  const {
    onSuccess,
    onError,
    successMessage = "Saved successfully",
    errorMessage = "Something went wrong",
    showToasts = true,
    resetOnSuccess = true,
    successDuration = 2000,
    validateBeforeSubmit,
  } = options;

  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState<Error | ApiError | null>(null);
  const [fieldErrors, setFieldErrorsState] = useState<FieldError[]>([]);
  const [submitCount, setSubmitCount] = useState(0);

  const lastSubmitFnRef = useRef<(() => Promise<T>) | null>(null);
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  const submit = useCallback(
    async (fn: () => Promise<T>): Promise<T | null> => {
      if (validateBeforeSubmit) {
        const isValid = await validateBeforeSubmit();
        if (!isValid) {
          return null;
        }
      }

      lastSubmitFnRef.current = fn;
      setSubmitCount((prev) => prev + 1);
      setState("submitting");
      setError(null);
      setFieldErrorsState([]);

      try {
        const result = await fn();

        if (!mountedRef.current) return null;

        setState("success");

        if (showToasts) {
          toast({
            title: successMessage,
            variant: "success",
          });
        }

        onSuccess?.(result);

        if (resetOnSuccess) {
          successTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              setState("idle");
            }
          }, successDuration);
        }

        return result;
      } catch (err) {
        if (!mountedRef.current) return null;

        const apiError = err instanceof ApiError ? err : null;
        const genericError =
          err instanceof Error ? err : new Error(String(err));

        setState("error");
        setError(apiError || genericError);

        if (apiError?.details && typeof apiError.details === "object") {
          const errors: FieldError[] = [];
          for (const [field, message] of Object.entries(apiError.details)) {
            if (typeof message === "string") {
              errors.push({ field, message });
            } else if (Array.isArray(message)) {
              errors.push({ field, message: message.join(", ") });
            }
          }
          setFieldErrorsState(errors);
        }

        if (showToasts) {
          const toastMessage =
            apiError?.userMessage || genericError.message || errorMessage;

          if (apiError?.retryable) {
            toast({
              title: "Error",
              description: toastMessage,
              variant: "destructive",
              action: (
                <button
                  onClick={() => retry()}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-transparent bg-destructive-foreground/20 px-3 text-sm font-medium hover:bg-destructive-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  Retry
                </button>
              ) as unknown as React.ReactNode,
            });
          } else {
            toast({
              title: "Error",
              description: toastMessage,
              variant: "destructive",
            });
          }
        }

        onError?.(apiError || genericError);

        return null;
      }
    },
    [
      validateBeforeSubmit,
      showToasts,
      successMessage,
      errorMessage,
      onSuccess,
      onError,
      resetOnSuccess,
      successDuration,
    ],
  );

  const reset = useCallback(() => {
    setState("idle");
    setError(null);
    setFieldErrorsState([]);
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
    }
  }, []);

  const retry = useCallback(async (): Promise<T | null> => {
    if (lastSubmitFnRef.current) {
      return submit(lastSubmitFnRef.current);
    }
    return null;
  }, [submit]);

  const setFieldErrors = useCallback((errors: FieldError[]) => {
    setFieldErrorsState(errors);
  }, []);

  const clearFieldError = useCallback((field: string) => {
    setFieldErrorsState((prev) => prev.filter((e) => e.field !== field));
  }, []);

  const getFieldError = useCallback(
    (field: string): string | undefined => {
      return fieldErrors.find((e) => e.field === field)?.message;
    },
    [fieldErrors],
  );

  const hasFieldError = useCallback(
    (field: string): boolean => {
      return fieldErrors.some((e) => e.field === field);
    },
    [fieldErrors],
  );

  return {
    state,
    isIdle: state === "idle",
    isSubmitting: state === "submitting",
    isSuccess: state === "success",
    isError: state === "error",
    error,
    fieldErrors,
    submitCount,
    isDisabled: state === "submitting",
    submit,
    reset,
    retry,
    setFieldErrors,
    clearFieldError,
    getFieldError,
    hasFieldError,
  };
}

export interface FormFieldState {
  value: string;
  touched: boolean;
  dirty: boolean;
  error: string | null;
  isValidating: boolean;
}

export interface UseFormFieldOptions {
  name: string;
  initialValue?: string;
  required?: boolean;
  validate?: (value: string) => string | null | Promise<string | null>;
  validateOnBlur?: boolean;
  validateOnChange?: boolean;
  debounceMs?: number;
}

export function useFormField(options: UseFormFieldOptions) {
  const {
    name,
    initialValue = "",
    required = false,
    validate,
    validateOnBlur = true,
    validateOnChange = false,
    debounceMs = 300,
  } = options;

  const [state, setState] = useState<FormFieldState>({
    value: initialValue,
    touched: false,
    dirty: false,
    error: null,
    isValidating: false,
  });

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const runValidation = useCallback(
    async (value: string): Promise<string | null> => {
      if (required && !value.trim()) {
        return `${name} is required`;
      }

      if (validate) {
        setState((prev) => ({ ...prev, isValidating: true }));
        try {
          const result = await validate(value);
          if (mountedRef.current) {
            setState((prev) => ({
              ...prev,
              isValidating: false,
              error: result,
            }));
          }
          return result;
        } catch {
          if (mountedRef.current) {
            setState((prev) => ({ ...prev, isValidating: false }));
          }
          return null;
        }
      }

      return null;
    },
    [name, required, validate],
  );

  const handleChange = useCallback(
    (value: string) => {
      setState((prev) => ({
        ...prev,
        value,
        dirty: value !== initialValue,
        error: validateOnChange ? prev.error : null,
      }));

      if (validateOnChange) {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }
        debounceRef.current = setTimeout(() => {
          runValidation(value);
        }, debounceMs);
      }
    },
    [initialValue, validateOnChange, debounceMs, runValidation],
  );

  const handleBlur = useCallback(() => {
    setState((prev) => ({ ...prev, touched: true }));

    if (validateOnBlur) {
      runValidation(state.value);
    }
  }, [validateOnBlur, runValidation, state.value]);

  const reset = useCallback(() => {
    setState({
      value: initialValue,
      touched: false,
      dirty: false,
      error: null,
      isValidating: false,
    });
  }, [initialValue]);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  const setValue = useCallback(
    (value: string) => {
      setState((prev) => ({ ...prev, value, dirty: value !== initialValue }));
    },
    [initialValue],
  );

  return {
    ...state,
    name,
    onChange: handleChange,
    onBlur: handleBlur,
    reset,
    setError,
    setValue,
    validate: () => runValidation(state.value),
    inputProps: {
      name,
      value: state.value,
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => handleChange(e.target.value),
      onBlur: handleBlur,
      "aria-invalid": !!state.error,
      "aria-describedby": state.error ? `${name}-error` : undefined,
    },
  };
}

export function useButtonState(
  isLoading: boolean,
  isSuccess: boolean,
  isError: boolean,
) {
  const getButtonVariant = useCallback(():
    | "default"
    | "destructive"
    | "outline" => {
    if (isError) return "destructive";
    return "default";
  }, [isError]);

  const getButtonClass = useCallback((): string => {
    if (isSuccess) return "bg-green-600 hover:bg-green-700";
    if (isError) return "";
    return "";
  }, [isSuccess, isError]);

  return {
    isDisabled: isLoading,
    variant: getButtonVariant(),
    className: getButtonClass(),
  };
}
