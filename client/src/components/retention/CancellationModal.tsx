/**
 * CANCELLATION MODAL
 *
 * Exit survey shown when a user initiates subscription cancellation.
 * Research: 15% of users who see a cancellation survey choose to stay
 * when offered an alternative (pause, downgrade, or discount).
 * Feedback data is stored for product team analysis.
 */

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type CancelReason =
  | 'too_expensive'
  | 'missing_features'
  | 'switched_to_competitor'
  | 'not_using_enough'
  | 'technical_issues'
  | 'temporary_pause'
  | 'other';

const REASONS: Array<{ value: CancelReason; label: string }> = [
  { value: 'too_expensive', label: "It's too expensive" },
  { value: 'missing_features', label: "Missing features I need" },
  { value: 'switched_to_competitor', label: "I'm using another tool" },
  { value: 'not_using_enough', label: "I don't use it enough" },
  { value: 'technical_issues', label: "Technical problems" },
  { value: 'temporary_pause', label: "Just taking a break" },
  { value: 'other', label: "Something else" },
];

const RETENTION_OFFERS: Partial<Record<CancelReason, { title: string; description: string }>> = {
  too_expensive: {
    title: "Before you go — 30% off for 3 months?",
    description: "We'd hate to lose you over price. Use code STAY30 at checkout for 30% off your next 3 months.",
  },
  not_using_enough: {
    title: "How about pausing instead?",
    description: "You can pause your subscription for up to 3 months and resume any time — no data loss, no setup.",
  },
  temporary_pause: {
    title: "Pause, don't cancel",
    description: "No need to cancel — you can pause your subscription and come back whenever your schedule allows.",
  },
};

interface CancellationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan: string;
  onConfirmCancellation: () => void;
}

export function CancellationModal({
  open,
  onOpenChange,
  currentPlan,
  onConfirmCancellation,
}: CancellationModalProps) {
  const [step, setStep] = useState<'reason' | 'offer' | 'confirm'>('reason');
  const [selectedReason, setSelectedReason] = useState<CancelReason | null>(null);
  const [elaboration, setElaboration] = useState('');
  const [wouldReturn, setWouldReturn] = useState<boolean | null>(null);

  const feedbackMutation = useMutation({
    mutationFn: (data: object) => apiRequest('POST', '/api/retention/cancellation-feedback', data),
  });

  const handleReasonNext = () => {
    if (!selectedReason) return;
    const offer = RETENTION_OFFERS[selectedReason];
    if (offer) {
      setStep('offer');
    } else {
      setStep('confirm');
    }
  };

  const handleConfirm = async () => {
    if (selectedReason) {
      feedbackMutation.mutate({
        reason: selectedReason,
        elaboration: elaboration.trim() || undefined,
        wouldReturn: wouldReturn ?? undefined,
        planAtCancellation: currentPlan,
      });
    }
    onConfirmCancellation();
    onOpenChange(false);
  };

  const resetAndClose = () => {
    setStep('reason');
    setSelectedReason(null);
    setElaboration('');
    setWouldReturn(null);
    onOpenChange(false);
  };

  const offer = selectedReason ? RETENTION_OFFERS[selectedReason] : null;

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            {step === 'reason' && 'Before you cancel…'}
            {step === 'offer' && 'Wait — we have something for you'}
            {step === 'confirm' && 'Confirm cancellation'}
          </DialogTitle>
        </DialogHeader>

        {step === 'reason' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              We're sorry to see you go. Understanding why helps us improve for all artists.
            </p>
            <div className="space-y-2">
              {REASONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setSelectedReason(value)}
                  className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-all ${
                    selectedReason === value
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-medium'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {selectedReason && (
              <Textarea
                value={elaboration}
                onChange={(e) => setElaboration(e.target.value)}
                placeholder="Any additional details? (optional)"
                rows={2}
                className="resize-none text-sm"
                maxLength={2000}
              />
            )}
            <div className="flex gap-2">
              <Button
                onClick={handleReasonNext}
                disabled={!selectedReason}
                className="flex-1"
              >
                Continue
              </Button>
              <Button variant="ghost" onClick={resetAndClose}>
                Keep my plan
              </Button>
            </div>
          </div>
        )}

        {step === 'offer' && offer && (
          <div className="space-y-4">
            <div className="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
              <h3 className="font-semibold text-purple-800 dark:text-purple-200 mb-1">{offer.title}</h3>
              <p className="text-sm text-purple-700 dark:text-purple-300">{offer.description}</p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={resetAndClose}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
              >
                Keep my plan
              </Button>
              <Button variant="outline" onClick={() => setStep('confirm')}>
                Cancel anyway
              </Button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Are you sure you want to cancel your <strong>{currentPlan}</strong> plan? You'll lose access to premium features at the end of your billing period.
            </p>
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Would you consider returning in the future?</p>
              <div className="flex gap-2">
                {[
                  { value: true, label: 'Yes, likely' },
                  { value: false, label: 'Probably not' },
                ].map(({ value, label }) => (
                  <button
                    key={String(value)}
                    onClick={() => setWouldReturn(value)}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-all ${
                      wouldReturn === value
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-950 font-medium text-purple-700 dark:text-purple-300'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={handleConfirm}
                className="flex-1"
              >
                Yes, cancel my subscription
              </Button>
              <Button variant="ghost" onClick={resetAndClose}>
                Keep plan
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
