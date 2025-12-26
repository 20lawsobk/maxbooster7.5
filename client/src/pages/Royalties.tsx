import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Clock, Calendar, Shield, TrendingUp, PieChart } from 'lucide-react';

export default function Royalties() {
  return (
    <AppLayout>
      <div className="min-h-[80vh] flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700">
          <CardContent className="p-12 text-center">
            <div className="mb-8">
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-r from-green-600 to-emerald-600 flex items-center justify-center">
                <DollarSign className="w-12 h-12 text-white" />
              </div>
              <Badge variant="outline" className="mb-4 text-green-400 border-green-400">
                <Clock className="w-3 h-3 mr-1" />
                Extended Testing
              </Badge>
              <h1 className="text-4xl font-bold text-white mb-4">
                Royalties
              </h1>
              <p className="text-xl text-gray-400 mb-2">
                Coming Soon
              </p>
              <div className="flex items-center justify-center gap-2 text-2xl font-semibold text-green-400">
                <Calendar className="w-6 h-6" />
                February 1st, 2026
              </div>
            </div>

            <p className="text-gray-400 mb-8 max-w-md mx-auto">
              We're conducting extended testing on our royalty tracking and payout 
              systems to ensure accurate earnings reporting and timely payments.
            </p>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                <Shield className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Secure Payouts</p>
              </div>
              <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                <TrendingUp className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Real-time Tracking</p>
              </div>
              <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                <PieChart className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Detailed Analytics</p>
              </div>
            </div>

            <p className="text-sm text-gray-500">
              Thank you for your patience while we perfect this feature.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
