import { useState, useCallback, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AlertCircle, CheckCircle2, Edit, Loader2, AlertTriangle, Minus } from 'lucide-react';

const MULTIPLE_VALUES_PLACEHOLDER = '< Multiple Values >';

export interface BulkEditField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea' | 'checkbox' | 'date' | 'tags';
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  description?: string;
  validation?: (value: Record<string, unknown>) => string | null;
  min?: number;
  max?: number;
  step?: number;
}

export interface FieldValue {
  enabled: boolean;
  value: Record<string, unknown>;
  hasMultipleValues: boolean;
  originalValues?: Record<string, unknown>[];
}

export interface BulkEditFormProps<T extends Record<string, any>> {
  fields: BulkEditField[];
  items: T[];
  onSubmit: (changes: Record<string, any>) => Promise<void>;
  isLoading?: boolean;
  className?: string;
  title?: string;
  submitLabel?: string;
}

export function BulkEditForm<T extends Record<string, any>>({
  fields,
  items,
  onSubmit,
  isLoading = false,
  className,
  title = 'Bulk Edit',
  submitLabel = 'Apply Changes',
}: BulkEditFormProps<T>) {
  const [fieldValues, setFieldValues] = useState<Record<string, FieldValue>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const initialValues: Record<string, FieldValue> = {};

    for (const field of fields) {
      const values = items.map((item) => item[field.key]);
      const uniqueValues = [...new Set(values.map((v) => JSON.stringify(v)))].map((v) => JSON.parse(v));
      const hasMultipleValues = uniqueValues.length > 1;
      const commonValue = hasMultipleValues ? getDefaultValue(field) : uniqueValues[0];

      initialValues[field.key] = {
        enabled: false,
        value: commonValue,
        hasMultipleValues,
        originalValues: uniqueValues,
      };
    }

    setFieldValues(initialValues);
  }, [fields, items]);

  const enabledChangesCount = useMemo(
    () => Object.values(fieldValues).filter((f) => f.enabled).length,
    [fieldValues]
  );

  const toggleField = useCallback((key: string) => {
    setFieldValues((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key].enabled },
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const updateValue = useCallback(
    (key: string, value: Record<string, unknown>) => {
      setFieldValues((prev) => ({
        ...prev,
        [key]: { ...prev[key], value, hasMultipleValues: false },
      }));

      const field = fields.find((f) => f.key === key);
      if (field?.validation) {
        const error = field.validation(value);
        setErrors((prev) => {
          if (error) {
            return { ...prev, [key]: error };
          }
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    },
    [fields]
  );

  const handleSubmit = useCallback(async () => {
    const enabledChanges = Object.entries(fieldValues)
      .filter(([_, fieldValue]) => fieldValue.enabled)
      .reduce((acc, [key, fieldValue]) => {
        acc[key] = fieldValue.value;
        return acc;
      }, {} as Record<string, any>);

    if (Object.keys(enabledChanges).length === 0) return;

    let hasErrors = false;
    for (const [key, value] of Object.entries(enabledChanges)) {
      const field = fields.find((f) => f.key === key);
      if (field?.validation) {
        const error = field.validation(value);
        if (error) {
          setErrors((prev) => ({ ...prev, [key]: error }));
          hasErrors = true;
        }
      }
    }

    if (hasErrors) return;

    await onSubmit(enabledChanges);
  }, [fieldValues, fields, onSubmit]);

  const handleReset = useCallback(() => {
    const resetValues: Record<string, FieldValue> = {};

    for (const field of fields) {
      const values = items.map((item) => item[field.key]);
      const uniqueValues = [...new Set(values.map((v) => JSON.stringify(v)))].map((v) => JSON.parse(v));
      const hasMultipleValues = uniqueValues.length > 1;
      const commonValue = hasMultipleValues ? getDefaultValue(field) : uniqueValues[0];

      resetValues[field.key] = {
        enabled: false,
        value: commonValue,
        hasMultipleValues,
        originalValues: uniqueValues,
      };
    }

    setFieldValues(resetValues);
    setErrors({});
  }, [fields, items]);

  return (
    <TooltipProvider>
      <div className={cn('space-y-4', className)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            <h3 className="font-semibold">{title}</h3>
            <Badge variant="secondary">{items.length} items</Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={handleReset} disabled={isLoading}>
            Reset
          </Button>
        </div>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 pr-4">
            {fields.map((field) => {
              const fieldValue = fieldValues[field.key];
              if (!fieldValue) return null;

              const error = errors[field.key];

              return (
                <div key={field.key} className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id={`enable-${field.key}`}
                      checked={fieldValue.enabled}
                      onCheckedChange={() => toggleField(field.key)}
                    />
                    <Label
                      htmlFor={`enable-${field.key}`}
                      className={cn(
                        'cursor-pointer font-medium flex items-center gap-2',
                        !fieldValue.enabled && 'text-muted-foreground'
                      )}
                    >
                      {field.label}
                      {fieldValue.hasMultipleValues && !fieldValue.enabled && (
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="outline" className="text-xs gap-1">
                              <Minus className="h-3 w-3" />
                              Multiple
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Selected items have different values:</p>
                            <ul className="mt-1 text-xs">
                              {fieldValue.originalValues?.slice(0, 5).map((v, i) => (
                                <li key={i}>{formatValue(v, field.type)}</li>
                              ))}
                              {(fieldValue.originalValues?.length || 0) > 5 && (
                                <li>...and {(fieldValue.originalValues?.length || 0) - 5} more</li>
                              )}
                            </ul>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </Label>
                    {fieldValue.enabled && (
                      <Badge variant="secondary" className="text-xs">
                        Will update
                      </Badge>
                    )}
                  </div>

                  {fieldValue.enabled && (
                    <div className="ml-7 space-y-2">
                      {field.description && (
                        <p className="text-sm text-muted-foreground">{field.description}</p>
                      )}

                      {renderFieldInput(field, fieldValue, (value) => updateValue(field.key, value))}

                      {error && (
                        <p className="text-sm text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {error}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <Separator />

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {enabledChangesCount} field{enabledChangesCount !== 1 ? 's' : ''} will be updated on{' '}
            {items.length} item{items.length !== 1 ? 's' : ''}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || enabledChangesCount === 0 || Object.keys(errors).length > 0}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {submitLabel}
              </>
            )}
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}

function getDefaultValue(field: BulkEditField): unknown {
  switch (field.type) {
    case 'checkbox':
      return false;
    case 'number':
      return field.min ?? 0;
    case 'select':
      return field.options?.[0]?.value || '';
    case 'tags':
      return [];
    default:
      return '';
  }
}

function formatValue(value: Record<string, unknown>, type: string): string {
  if (value === null || value === undefined) return '(empty)';
  if (type === 'checkbox') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ') || '(empty)';
  return String(value);
}

function renderFieldInput(
  field: BulkEditField,
  fieldValue: FieldValue,
  onChange: (value: Record<string, unknown>) => void
) {
  const { value, hasMultipleValues } = fieldValue;

  switch (field.type) {
    case 'select':
      return (
        <Select
          value={hasMultipleValues ? '' : value}
          onValueChange={onChange}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={hasMultipleValues ? MULTIPLE_VALUES_PLACEHOLDER : field.placeholder || 'Select...'}
            />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'textarea':
      return (
        <Textarea
          value={hasMultipleValues ? '' : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={hasMultipleValues ? MULTIPLE_VALUES_PLACEHOLDER : field.placeholder}
          rows={3}
        />
      );

    case 'checkbox':
      return (
        <div className="flex items-center gap-2">
          {hasMultipleValues && (
            <Badge variant="outline" className="text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Currently mixed
            </Badge>
          )}
          <Checkbox
            checked={value}
            onCheckedChange={onChange}
            id={`value-${field.key}`}
          />
          <Label htmlFor={`value-${field.key}`} className="text-sm cursor-pointer">
            {field.placeholder || 'Enabled'}
          </Label>
        </div>
      );

    case 'number':
      return (
        <Input
          type="number"
          value={hasMultipleValues ? '' : value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          placeholder={hasMultipleValues ? MULTIPLE_VALUES_PLACEHOLDER : field.placeholder}
          min={field.min}
          max={field.max}
          step={field.step}
        />
      );

    case 'date':
      return (
        <Input
          type="date"
          value={hasMultipleValues ? '' : value}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'tags':
      return (
        <Input
          type="text"
          value={hasMultipleValues ? '' : (value || []).join(', ')}
          onChange={(e) => onChange(e.target.value.split(',').map((t: string) => t.trim()).filter(Boolean))}
          placeholder={hasMultipleValues ? MULTIPLE_VALUES_PLACEHOLDER : field.placeholder || 'Enter tags separated by commas'}
        />
      );

    default:
      return (
        <Input
          type="text"
          value={hasMultipleValues ? '' : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={hasMultipleValues ? MULTIPLE_VALUES_PLACEHOLDER : field.placeholder}
        />
      );
  }
}

export const releaseEditFields: BulkEditField[] = [
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'draft', label: 'Draft' },
      { value: 'pending', label: 'Pending Review' },
      { value: 'live', label: 'Live' },
      { value: 'takedown', label: 'Takedown' },
    ],
  },
  { key: 'genre', label: 'Genre', type: 'select', options: [
    { value: 'pop', label: 'Pop' },
    { value: 'rock', label: 'Rock' },
    { value: 'hiphop', label: 'Hip Hop' },
    { value: 'electronic', label: 'Electronic' },
    { value: 'rnb', label: 'R&B' },
    { value: 'country', label: 'Country' },
    { value: 'jazz', label: 'Jazz' },
    { value: 'classical', label: 'Classical' },
  ]},
  { key: 'explicit', label: 'Explicit Content', type: 'checkbox' },
  { key: 'label', label: 'Label Name', type: 'text', placeholder: 'Enter label name' },
  { key: 'releaseDate', label: 'Release Date', type: 'date' },
  { key: 'territories', label: 'Territories', type: 'text', placeholder: 'e.g., Worldwide, US, EU' },
];

export const postEditFields: BulkEditField[] = [
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'draft', label: 'Draft' },
      { value: 'scheduled', label: 'Scheduled' },
      { value: 'published', label: 'Published' },
    ],
  },
  { key: 'scheduledDate', label: 'Schedule Date', type: 'date' },
  { key: 'hashtags', label: 'Hashtags', type: 'tags', placeholder: 'Enter hashtags' },
  { key: 'platforms', label: 'Platforms', type: 'tags', placeholder: 'e.g., twitter, instagram, facebook' },
];

export const beatEditFields: BulkEditField[] = [
  { key: 'price', label: 'Price', type: 'number', placeholder: '0.00', min: 0, step: 0.01 },
  {
    key: 'status',
    label: 'Listing Status',
    type: 'select',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'paused', label: 'Paused' },
      { value: 'sold', label: 'Sold' },
    ],
  },
  {
    key: 'licenseType',
    label: 'License Type',
    type: 'select',
    options: [
      { value: 'basic', label: 'Basic Lease' },
      { value: 'premium', label: 'Premium Lease' },
      { value: 'unlimited', label: 'Unlimited' },
      { value: 'exclusive', label: 'Exclusive' },
    ],
  },
  { key: 'featured', label: 'Featured', type: 'checkbox' },
  { key: 'genre', label: 'Genre', type: 'select', options: [
    { value: 'hiphop', label: 'Hip Hop' },
    { value: 'trap', label: 'Trap' },
    { value: 'rnb', label: 'R&B' },
    { value: 'pop', label: 'Pop' },
    { value: 'drill', label: 'Drill' },
    { value: 'afrobeats', label: 'Afrobeats' },
  ]},
  { key: 'tags', label: 'Tags', type: 'tags', placeholder: 'Enter tags' },
];

export const fileEditFields: BulkEditField[] = [
  { key: 'folder', label: 'Move to Folder', type: 'text', placeholder: 'Enter folder path' },
  { key: 'tags', label: 'Tags', type: 'tags', placeholder: 'Enter tags' },
  { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Enter description' },
];

export const analyticsExportFields: BulkEditField[] = [
  {
    key: 'format',
    label: 'Export Format',
    type: 'select',
    options: [
      { value: 'csv', label: 'CSV' },
      { value: 'xlsx', label: 'Excel (XLSX)' },
      { value: 'json', label: 'JSON' },
      { value: 'pdf', label: 'PDF Report' },
    ],
  },
  {
    key: 'dateRange',
    label: 'Date Range',
    type: 'select',
    options: [
      { value: '7d', label: 'Last 7 days' },
      { value: '30d', label: 'Last 30 days' },
      { value: '90d', label: 'Last 90 days' },
      { value: 'year', label: 'Last year' },
      { value: 'all', label: 'All time' },
    ],
  },
  { key: 'includeCharts', label: 'Include Charts', type: 'checkbox' },
];
