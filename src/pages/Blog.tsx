import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Logo } from '@/components/ui/Logo';
import { Calendar, User, ArrowRight, TrendingUp, Lightbulb, Music } from 'lucide-react';

export default function Blog() {
  const posts = [
    {
      id: 1,
      title: 'How AI is Revolutionizing Music Production',
      excerpt:
        'Discover how artificial intelligence is transforming the way artists create, mix, and master music.',
      author: 'Max Booster Team',
      date: 'March 15, 2025',
      category: 'AI & Technology',
      readTime: '5 min read',
      icon: Lightbulb,
    },
    {
      id: 2,
      title: 'The Complete Guide to Music Distribution in 2025',
      excerpt:
        'Everything you need to know about getting your music on Spotify, Apple Music, and beyond.',
      author: 'Max Booster Team',
      date: 'March 10, 2025',
      category: 'Distribution',
      readTime: '8 min read',
      icon: TrendingUp,
    },
    {
      id: 3,
      title: 'Social Media Strategies That Actually Work for Musicians',
      excerpt:
        'Proven tactics to grow your audience and engagement without spending hours on social media.',
      author: 'Max Booster Team',
      date: 'March 5, 2025',
      category: 'Marketing',
      readTime: '6 min read',
      icon: Music,
    },
  ];

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
                <Button variant="ghost">Pricing</Button>
              </Link>
              <Link href="/login">
                <Button variant="ghost">Sign In</Button>
              </Link>
              <Link href="/pricing">
                <Button>Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative px-4 pt-20 pb-16 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Max Booster Blog
            <span className="block bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              Insights for Artists
            </span>
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Tips, tutorials, and industry insights to help you grow your music career
          </p>
        </div>
      </section>

      {/* Featured Post */}
      <section className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="overflow-hidden hover-lift dark:bg-gray-900 dark:border-gray-700">
            <div className="grid grid-cols-1 lg:grid-cols-2">
              <div className="bg-gradient-to-br from-blue-600 to-cyan-600 p-12 flex items-center justify-center">
                <div className="text-white text-center">
                  <Badge className="bg-white/20 text-white border-white/30 mb-4">
                    Featured Post
                  </Badge>
                  <h2 className="text-3xl font-bold mb-4">
                    The Solo Artist's Complete Guide to Success
                  </h2>
                  <p className="text-white/90 mb-6">
                    Everything you need to build a thriving music career independently
                  </p>
                  <Button variant="secondary" size="lg">
                    Read Article
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="p-8 flex flex-col justify-center">
                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-4">
                  <span className="flex items-center">
                    <Calendar className="h-4 w-4 mr-1" />
                    March 20, 2025
                  </span>
                  <span className="flex items-center">
                    <User className="h-4 w-4 mr-1" />
                    Max Booster Team
                  </span>
                </div>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                  From production to promotion, this comprehensive guide covers everything
                  independent artists need to know to build a sustainable music career. Learn about
                  distribution strategies, marketing tactics, and how to leverage AI tools for
                  maximum impact.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Blog Posts */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Latest Articles</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                All
              </Button>
              <Button variant="ghost" size="sm">
                AI & Technology
              </Button>
              <Button variant="ghost" size="sm">
                Distribution
              </Button>
              <Button variant="ghost" size="sm">
                Marketing
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <Card key={post.id} className="flex flex-col hover-lift dark:bg-gray-900 dark:border-gray-700">
                <CardContent className="p-6 flex flex-col flex-1">
                  <div className="flex items-center justify-between mb-4">
                    <Badge variant="secondary">{post.category}</Badge>
                    <post.icon className="h-5 w-5 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{post.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4 flex-1">{post.excerpt}</p>
                  <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 pt-4 border-t dark:border-gray-700">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center">
                        <Calendar className="h-4 w-4 mr-1" />
                        {post.date}
                      </span>
                      <span>{post.readTime}</span>
                    </div>
                    <Button variant="ghost" size="sm">
                      Read
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="py-16 bg-gradient-to-r from-blue-600 to-cyan-600">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white mb-4">Stay Updated</h2>
          <p className="text-xl text-white/90 mb-8">
            Get the latest tips, tutorials, and industry insights delivered to your inbox
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto">
            <input
              type="email"
              placeholder="Enter your email"
              className="flex-1 px-4 py-2 rounded-lg"
            />
            <Button size="lg" variant="secondary">
              Subscribe
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
