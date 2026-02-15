import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Logo } from '@/components/ui/Logo';
import { Heart, Music, Code, Target } from 'lucide-react';

export default function SoloFounderStory() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 backdrop-blur-lg bg-white/80 dark:bg-gray-900/80 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/">
              <div className="cursor-pointer">
                <Logo size="md" />
              </div>
            </Link>
            <div className="flex items-center space-x-4">
              <Link href="/pricing">
                <Button>Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative px-4 pt-20 pb-16 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <Heart className="h-16 w-16 mx-auto mb-6 text-red-500" />
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Built by a Musician
            <span className="block bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              For Musicians
            </span>
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300">The story of how frustration became innovation</p>
        </div>
      </section>

      {/* Story Content */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <Card className="mb-8 dark:bg-gray-900 dark:border-gray-700">
              <CardContent className="p-8">
                <div className="flex items-center mb-6">
                  <Music className="h-8 w-8 text-blue-600 mr-3" />
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">The Problem</h2>
                </div>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                  As an independent artist, I spent years juggling multiple expensive platforms just
                  to manage my music career. DistroKid for distribution, BeatStars for selling
                  beats, Hootsuite for social media, expensive DAWs for production, and countless ad
                  platforms for promotion. The costs added up to over $500/month, and nothing talked
                  to each other.
                </p>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
                  I watched talented artists give up not because they lacked skill, but because they
                  couldn't afford the tools to compete. The music industry gatekeepers were winning.
                </p>
              </CardContent>
            </Card>

            <Card className="mb-8 dark:bg-gray-900 dark:border-gray-700">
              <CardContent className="p-8">
                <div className="flex items-center mb-6">
                  <Code className="h-8 w-8 text-green-600 mr-3" />
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">The Solution</h2>
                </div>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                  I decided to build what I wished existed: One platform that does everything. I
                  spent 2 years learning to code, understanding AI, and building connections with
                  DSPs. Max Booster was born from countless late nights, fueled by coffee and the
                  belief that artists deserve better.
                </p>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
                  Instead of paying $500/month for multiple platforms, artists now pay $49/month for
                  everything. The AI features aren't just buzzwords—they're tools I actually use for
                  my own music.
                </p>
              </CardContent>
            </Card>

            <Card className="mb-8 dark:bg-gray-900 dark:border-gray-700">
              <CardContent className="p-8">
                <div className="flex items-center mb-6">
                  <Target className="h-8 w-8 text-purple-600 mr-3" />
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">The Mission</h2>
                </div>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                  Max Booster isn't backed by venture capital. There are no investors pushing for
                  quick profits. It's just me, working directly with artists, continuously improving
                  the platform based on real feedback.
                </p>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
                  Every feature request gets read. Every bug report gets fixed. Every artist
                  matters. This is the platform I needed when I started, and now it's here for you.
                </p>
                <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-lg mt-6">
                  <p className="text-gray-800 dark:text-white font-medium mb-2">90-Day Money-Back Guarantee</p>
                  <p className="text-gray-700 dark:text-gray-300 text-sm">
                    I'm so confident Max Booster will transform your career that I offer a full
                    90-day refund, no questions asked. Try it risk-free.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="text-center mt-12">
            <p className="text-gray-600 dark:text-gray-400 mb-6">Ready to join the movement?</p>
            <Link href="/pricing">
              <Button size="lg" className="px-8 py-4 text-lg">
                Get Started - 90-Day Guarantee
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
