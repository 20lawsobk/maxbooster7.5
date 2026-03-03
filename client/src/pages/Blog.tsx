import { useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Logo } from '@/components/ui/Logo';
import { Calendar, Clock, ArrowRight, User } from 'lucide-react';
import { blogPosts } from '@/data/blogPosts';

const ALL_CATEGORIES = ['All', ...Array.from(new Set(blogPosts.map((p) => p.category)))];

export default function Blog() {
  const [activeCategory, setActiveCategory] = useState('All');

  const featured = blogPosts.find((p) => p.featured) ?? blogPosts[0];
  const regular = blogPosts.filter((p) => !p.featured);

  const filtered =
    activeCategory === 'All'
      ? regular
      : regular.filter((p) => p.category === activeCategory);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
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

      <section className="py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href={`/blog/${featured.slug}`}>
            <Card className="overflow-hidden hover:shadow-xl transition-shadow cursor-pointer dark:bg-gray-900 dark:border-gray-700">
              <div className="grid grid-cols-1 lg:grid-cols-2">
                <div
                  className={`bg-gradient-to-br ${featured.coverGradient} p-12 flex items-center justify-center min-h-[220px]`}
                >
                  <div className="text-white text-center">
                    <Badge className="bg-white/20 text-white border-white/30 mb-4">Featured Post</Badge>
                    <h2 className="text-2xl sm:text-3xl font-bold mb-4 leading-snug">
                      {featured.title}
                    </h2>
                    <div className="flex items-center justify-center gap-2 text-white/80 text-sm">
                      <Clock className="h-4 w-4" />
                      {featured.readTime}
                    </div>
                  </div>
                </div>
                <div className="p-8 flex flex-col justify-center">
                  <Badge variant="secondary" className="w-fit mb-3">{featured.category}</Badge>
                  <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-4">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {featured.date}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="h-4 w-4" />
                      {featured.author}
                    </span>
                  </div>
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-6">
                    {featured.excerpt}
                  </p>
                  <Button className={`w-fit bg-gradient-to-r ${featured.coverGradient} text-white border-0`}>
                    Read Article
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          </Link>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Latest Articles</h2>
            <div className="flex flex-wrap gap-2">
              {ALL_CATEGORIES.map((cat) => (
                <Button
                  key={cat}
                  variant={activeCategory === cat ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </Button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-12">
              No articles in this category yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((post) => (
                <Link key={post.id} href={`/blog/${post.slug}`}>
                  <Card className="flex flex-col hover:shadow-lg transition-shadow cursor-pointer dark:bg-gray-900 dark:border-gray-700 h-full">
                    <div className={`h-36 bg-gradient-to-br ${post.coverGradient} rounded-t-lg flex items-end p-4`}>
                      <Badge className="bg-white/20 text-white border-white/30 text-xs">
                        {post.category}
                      </Badge>
                    </div>
                    <CardContent className="p-6 flex flex-col flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 leading-snug">
                        {post.title}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 flex-1 leading-relaxed">
                        {post.excerpt}
                      </p>
                      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 pt-4 border-t dark:border-gray-700">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {post.date}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {post.readTime}
                          </span>
                        </div>
                        <span className="text-blue-600 dark:text-blue-400 flex items-center gap-0.5 font-medium text-xs">
                          Read <ArrowRight className="h-3 w-3" />
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

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
              className="flex-1 px-4 py-2 rounded-lg text-gray-900"
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
