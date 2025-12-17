import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Users, Plus, Trash2, AlertCircle, CheckCircle, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface RoyaltySplit {
  id: string;
  name: string;
  email: string;
  role: 'songwriter' | 'producer' | 'performer' | 'manager' | 'featured_artist';
  percentage: number;
  inviteStatus: 'pending' | 'accepted' | 'declined';
}

interface RoyaltySplitManagerProps {
  splits: RoyaltySplit[];
  onChange: (splits: RoyaltySplit[]) => void;
  onSendInvites?: (splits: RoyaltySplit[]) => Promise<void>;
}

const ROLES = [
  { value: 'songwriter', label: 'Songwriter' },
  { value: 'producer', label: 'Producer' },
  { value: 'performer', label: 'Performer' },
  { value: 'featured_artist', label: 'Featured Artist' },
  { value: 'manager', label: 'Manager' },
];

/**
 * TODO: Add function documentation
 */
export function RoyaltySplitManager({ splits, onChange, onSendInvites }: RoyaltySplitManagerProps) {
  const [newSplit, setNewSplit] = useState({
    name: '',
    email: '',
    role: 'songwriter' as const,
    percentage: 0,
  });
  const { toast } = useToast();

  const totalPercentage = splits.reduce((sum, split) => sum + split.percentage, 0);
  const remainingPercentage = 100 - totalPercentage;
  const isValid = totalPercentage === 100;

  const addSplit = () => {
    if (!newSplit.name.trim()) {
      toast({
        title: 'Name required',
        description: 'Please enter collaborator name',
        variant: 'destructive',
      });
      return;
    }

    if (!newSplit.email.trim() || !newSplit.email.includes('@')) {
      toast({
        title: 'Valid email required',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return;
    }

    if (newSplit.percentage <= 0 || newSplit.percentage > remainingPercentage) {
      toast({
        title: 'Invalid percentage',
        description: `Must be between 1 and ${remainingPercentage}%`,
        variant: 'destructive',
      });
      return;
    }

    const split: RoyaltySplit = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...newSplit,
      inviteStatus: 'pending',
    };

    onChange([...splits, split]);

    setNewSplit({
      name: '',
      email: '',
      role: 'songwriter',
      percentage: 0,
    });

    toast({
      title: 'Collaborator added',
      description: `${split.name} will receive ${split.percentage}% of royalties`,
    });
  };

  const removeSplit = (id: string) => {
    onChange(splits.filter((s) => s.id !== id));
  };

  const updateSplit = (id: string, updates: Partial<RoyaltySplit>) => {
    onChange(splits.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const handleSendInvites = async () => {
    if (!isValid) {
      toast({
        title: 'Invalid splits',
        description: 'Percentages must total 100% before sending invites',
        variant: 'destructive',
      });
      return;
    }

    const pendingSplits = splits.filter((s) => s.inviteStatus === 'pending');

    if (pendingSplits.length === 0) {
      toast({
        title: 'No pending invites',
        description: 'All collaborators have been invited',
      });
      return;
    }

    try {
      if (onSendInvites) {
        await onSendInvites(pendingSplits);
      }
      toast({
        title: 'Invites sent',
        description: `${pendingSplits.length} email invitation(s) sent successfully`,
      });
    } catch (error: unknown) {
      toast({
        title: 'Failed to send invites',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Royalty Splits
        </CardTitle>
        <CardDescription>
          Share royalties with collaborators. Total must equal 100%.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Percentage Summary */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total Allocated</span>
            <span className={`font-medium ${isValid ? 'text-green-600' : 'text-orange-600'}`}>
              {totalPercentage}%
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                totalPercentage > 100 ? 'bg-destructive' : isValid ? 'bg-green-600' : 'bg-primary'
              }`}
              style={{ width: `${Math.min(totalPercentage, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Validation Alert */}
        {splits.length > 0 && (
          <Alert variant={isValid ? 'default' : 'destructive'}>
            {isValid ? (
              <>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>Royalty splits are valid and total 100%</AlertDescription>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {totalPercentage > 100
                    ? `Over-allocated by ${totalPercentage - 100}%. Remove some percentage to reach 100%.`
                    : `${remainingPercentage}% remaining. Add more collaborators or adjust percentages.`}
                </AlertDescription>
              </>
            )}
          </Alert>
        )}

        {/* Existing Splits */}
        {splits.length > 0 && (
          <div className="space-y-2">
            <Label>Collaborators ({splits.length})</Label>
            <div className="space-y-2">
              {splits.map((split) => (
                <div key={split.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{split.name}</p>
                      <Badge variant="outline" className="text-xs">
                        {ROLES.find((r) => r.value === split.role)?.label}
                      </Badge>
                      {split.inviteStatus === 'accepted' && (
                        <Badge variant="default" className="text-xs bg-green-600">
                          Accepted
                        </Badge>
                      )}
                      {split.inviteStatus === 'pending' && (
                        <Badge variant="secondary" className="text-xs">
                          Pending
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{split.email}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={split.percentage}
                      onChange={(e) =>
                        updateSplit(split.id, {
                          percentage: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-20 text-right"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSplit(split.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add New Split */}
        <div className="space-y-4 pt-4 border-t">
          <Label>Add Collaborator</Label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="split-name" className="text-xs">
                Name
              </Label>
              <Input
                id="split-name"
                placeholder="Collaborator name"
                value={newSplit.name}
                onChange={(e) => setNewSplit({ ...newSplit, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="split-email" className="text-xs">
                Email
              </Label>
              <Input
                id="split-email"
                type="email"
                placeholder="email@example.com"
                value={newSplit.email}
                onChange={(e) => setNewSplit({ ...newSplit, email: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="split-role" className="text-xs">
                Role
              </Label>
              <Select
                value={newSplit.role}
                onValueChange={(value: unknown) => setNewSplit({ ...newSplit, role: value })}
              >
                <SelectTrigger id="split-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="split-percentage" className="text-xs">
                Percentage
                {remainingPercentage > 0 && (
                  <span className="text-muted-foreground ml-1">
                    ({remainingPercentage}% available)
                  </span>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="split-percentage"
                  type="number"
                  min={0}
                  max={remainingPercentage}
                  step={0.1}
                  placeholder="0.0"
                  value={newSplit.percentage || ''}
                  onChange={(e) =>
                    setNewSplit({
                      ...newSplit,
                      percentage: parseFloat(e.target.value) || 0,
                    })
                  }
                />
                <span className="flex items-center text-muted-foreground">%</span>
              </div>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={addSplit}
            disabled={remainingPercentage <= 0}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Collaborator
          </Button>
        </div>

        {/* Send Invites */}
        {splits.length > 0 && onSendInvites && (
          <Button type="button" className="w-full" onClick={handleSendInvites} disabled={!isValid}>
            <Mail className="h-4 w-4 mr-2" />
            Send Email Invitations
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
