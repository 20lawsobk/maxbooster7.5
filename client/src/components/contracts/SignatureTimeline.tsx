import { CheckCircle, Clock, XCircle, FileText, Send, PenTool } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface TimelineEvent {
  event: string;
  timestamp: string | Date;
  actor?: string;
  details?: string;
}

interface Signer {
  name: string;
  role: string;
  status: 'signed' | 'pending' | 'declined';
  signedAt?: string | Date;
}

interface SignatureTimelineProps {
  signers: Signer[];
  timeline?: TimelineEvent[];
  showTimeline?: boolean;
}

const eventIcons: Record<string, React.ElementType> = {
  contract_created: FileText,
  signature_added: PenTool,
  signature_requested: Send,
  contract_executed: CheckCircle,
  signature_declined: XCircle,
};

export function SignatureTimeline({ signers, timeline = [], showTimeline = true }: SignatureTimelineProps) {
  const signedCount = signers.filter(s => s.status === 'signed').length;
  const totalCount = signers.length;
  const progress = totalCount > 0 ? (signedCount / totalCount) * 100 : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Signature Progress</CardTitle>
            <Badge variant={signedCount === totalCount ? 'default' : 'secondary'}>
              {signedCount}/{totalCount} Signed
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="w-full bg-muted rounded-full h-2 mb-4">
            <div 
              className={cn(
                "h-2 rounded-full transition-all duration-300",
                signedCount === totalCount ? "bg-green-500" : "bg-primary"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          
          <div className="space-y-3">
            {signers.map((signer, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center",
                  signer.status === 'signed' ? "bg-green-100 text-green-600" :
                  signer.status === 'declined' ? "bg-red-100 text-red-600" :
                  "bg-amber-100 text-amber-600"
                )}>
                  {signer.status === 'signed' ? <CheckCircle className="h-4 w-4" /> :
                   signer.status === 'declined' ? <XCircle className="h-4 w-4" /> :
                   <Clock className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{signer.name}</span>
                    <Badge variant="outline" className="text-xs">{signer.role}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {signer.status === 'signed' && signer.signedAt
                      ? `Signed ${format(new Date(signer.signedAt), 'MMM d, yyyy h:mm a')}`
                      : signer.status === 'declined'
                      ? 'Declined to sign'
                      : 'Awaiting signature'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {showTimeline && timeline.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Activity Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
              <div className="space-y-4">
                {timeline.map((event, i) => {
                  const Icon = eventIcons[event.event] || FileText;
                  return (
                    <div key={i} className="relative flex gap-3 pl-2">
                      <div className="z-10 w-8 h-8 rounded-full bg-background border flex items-center justify-center">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 pt-1">
                        <p className="text-sm font-medium">
                          {event.event.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </p>
                        {event.actor && (
                          <p className="text-xs text-muted-foreground">by {event.actor}</p>
                        )}
                        {event.details && (
                          <p className="text-xs text-muted-foreground mt-1">{event.details}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(event.timestamp), 'MMM d, yyyy h:mm a')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
