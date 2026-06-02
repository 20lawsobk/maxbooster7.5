import { Link, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/ui/Logo";
import {
  Calendar,
  User,
  Clock,
  ArrowLeft,
  ArrowRight,
  Lightbulb,
  Info,
  Quote,
} from "lucide-react";
import {
  getBlogPostBySlug,
  getRelatedPosts,
  type BlogPost,
  type BlogSection,
} from "@/data/blogPosts";

function SectionRenderer({ section }: { section: BlogSection }) {
  switch (section.type) {
    case "heading":
      return (
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-10 mb-4 leading-tight">
          {section.content}
        </h2>
      );

    case "subheading":
      return (
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mt-6 mb-3">
          {section.content}
        </h3>
      );

    case "paragraph":
      return (
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-5 text-[1.05rem]">
          {section.content}
        </p>
      );

    case "list":
      return (
        <div className="mb-5">
          {section.content && (
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-3 text-[1.05rem]">
              {section.content}
            </p>
          )}
          <ul className="space-y-2 pl-1">
            {section.items?.map((item, i) => (
              <li
                key={i}
                className="flex gap-3 text-gray-700 dark:text-gray-300 text-[1.05rem]"
              >
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      );

    case "numbered":
      return (
        <div className="mb-5">
          {section.content && (
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-3 text-[1.05rem]">
              {section.content}
            </p>
          )}
          <ol className="space-y-3 pl-1">
            {section.items?.map((item, i) => (
              <li
                key={i}
                className="flex gap-3 text-gray-700 dark:text-gray-300 text-[1.05rem]"
              >
                <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold mt-0.5">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ol>
        </div>
      );

    case "quote":
      return (
        <blockquote className="my-8 border-l-4 border-blue-500 pl-6 py-1">
          <div className="flex gap-3">
            <Quote className="h-6 w-6 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-xl italic text-gray-700 dark:text-gray-300 leading-relaxed">
              {section.content}
            </p>
          </div>
        </blockquote>
      );

    case "tip":
      return (
        <div className="my-6 flex gap-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 p-5">
          <Lightbulb className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-1">
              Pro Tip
            </p>
            <p className="text-blue-800 dark:text-blue-200 leading-relaxed text-[0.97rem]">
              {section.content}
            </p>
          </div>
        </div>
      );

    case "callout":
      return (
        <div className="my-6 flex gap-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-5">
          <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-800 dark:text-amber-200 leading-relaxed text-[0.97rem]">
            {section.content}
          </p>
        </div>
      );

    default:
      return null;
  }
}

function RelatedPostCard({ post }: { post: BlogPost }) {
  return (
    <Link href={`/blog/${post.slug}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer dark:bg-gray-900 dark:border-gray-700 h-full">
        <CardContent className="p-5">
          <div
            className={`h-24 rounded-lg bg-gradient-to-br ${post.coverGradient} mb-4 flex items-center justify-center`}
          >
            <span className="text-white text-2xl font-bold opacity-30">
              {post.category[0]}
            </span>
          </div>
          <Badge variant="secondary" className="mb-2 text-xs">
            {post.category}
          </Badge>
          <h3 className="font-semibold text-gray-900 dark:text-white leading-snug mb-1 line-clamp-2">
            {post.title}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <Clock className="h-3 w-3" /> {post.readTime}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function BlogPost() {
  const params = useParams<{ slug: string }>();
  const post = getBlogPostBySlug(params.slug ?? "");
  const related = getRelatedPosts(params.slug ?? "");

  if (!post) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
        <div className="text-center px-4">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Article Not Found
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            This article doesn't exist or may have moved.
          </p>
          <Link href="/blog">
            <Button>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Blog
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <nav className="sticky top-0 z-50 backdrop-blur-lg bg-white/80 dark:bg-gray-900/80 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/">
              <div className="cursor-pointer">
                <Logo size="md" />
              </div>
            </Link>
            <div className="flex items-center gap-3">
              <Link href="/blog">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="mr-1.5 h-4 w-4" />
                  All Articles
                </Button>
              </Link>
              <Link href="/pricing">
                <Button size="sm">Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div
        className={`w-full bg-gradient-to-br ${post.coverGradient} py-16 px-4`}
      >
        <div className="max-w-3xl mx-auto text-center">
          <Badge className="bg-white/20 text-white border-white/30 mb-4">
            {post.category}
          </Badge>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-6">
            {post.title}
          </h1>
          <p className="text-white/85 text-lg mb-8 max-w-2xl mx-auto leading-relaxed">
            {post.excerpt}
          </p>
          <div className="flex flex-wrap justify-center gap-5 text-white/75 text-sm">
            <span className="flex items-center gap-1.5">
              <User className="h-4 w-4" />
              {post.author} — {post.authorRole}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {post.date}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {post.readTime}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <article>
          {post.sections.map((section, i) => (
            <SectionRenderer key={i} section={section} />
          ))}
        </article>

        <div className="mt-12 pt-8 border-t dark:border-gray-800">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Written by
              </p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {post.author}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {post.authorRole}
              </p>
            </div>
            <Link href="/pricing">
              <Button
                size="lg"
                className={`bg-gradient-to-r ${post.coverGradient} text-white border-0`}
              >
                Try Max Booster Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <div className="border-t dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 py-12 px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
              More Articles
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {related.map((p) => (
                <RelatedPostCard key={p.slug} post={p} />
              ))}
            </div>
            <div className="mt-8 text-center">
              <Link href="/blog">
                <Button variant="outline">
                  View All Articles
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
