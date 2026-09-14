"use client";

import { ChevronRight, Home } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// 路径段 → 中文标签；未收录的段回退为原文（把 - 换成空格）
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "概览",
  knowledge: "知识库",
  chat: "对话",
  "api-keys": "API 密钥",
  settings: "模型设置",
  "test-retrieval": "检索测试",
  new: "新建",
  upload: "上传文档",
};

// 动态路由的实际取值（如 /dashboard/chat/3 里的 3）统一显示为「详情」
const DETAIL_LABEL = "详情";
const DYNAMIC_SEGMENT = /^\d+$/;

const Breadcrumb = () => {
  const pathname = usePathname();

  const generateBreadcrumbs = () => {
    const paths = pathname.split("/").filter(Boolean);
    const breadcrumbs = paths.map((path, index) => {
      const href = "/" + paths.slice(0, index + 1).join("/");
      const isLast = index === paths.length - 1;

      const label =
        SEGMENT_LABELS[path] ??
        (DYNAMIC_SEGMENT.test(path) ? DETAIL_LABEL : path.replace(/-/g, " "));

      return {
        href,
        label,
        isLast,
      };
    });

    return breadcrumbs;
  };

  const breadcrumbs = generateBreadcrumbs();

  if (pathname === "/") return null;

  return (
    <nav className="flex items-center space-x-2 text-base text-muted-foreground mb-6">
      <Link
        href="/dashboard"
        className="flex items-center hover:text-foreground transition-colors"
      >
        <Home className="h-4 w-4" />
      </Link>

      {breadcrumbs.map((breadcrumb, index) => (
        <div key={breadcrumb.href} className="flex items-center">
          <ChevronRight className="h-4 w-4 mx-2 text-muted-foreground/50" />
          {breadcrumb.isLast ? (
            <span className="text-foreground font-medium">
              {breadcrumb.label}
            </span>
          ) : (
            <Link
              href={breadcrumb.href}
              className="hover:text-foreground transition-colors"
            >
              {breadcrumb.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
};

export default Breadcrumb;
