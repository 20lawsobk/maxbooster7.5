import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from 'lucide-react';

/**
 * TODO: Add function documentation
 */
export function PostScheduler({ posts }: { posts?: unknown[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Post Scheduler</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8">
          <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">No scheduled posts yet</p>
        </div>
      </CardContent>
    </Card>
  );
}
