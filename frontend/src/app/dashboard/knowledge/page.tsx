"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileIcon, defaultStyles } from "react-file-icon";
import { ArrowRight, Plus, Settings, Trash2, Search } from "lucide-react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";

interface KnowledgeBase {
  id: number;
  name: string;
  description: string;
  documents: Document[];
  created_at: string;
}
interface Document {
  id: number;
  file_name: string;
  file_path: string;
  file_size: number;
  content_type: string;
  knowledge_base_id: number;
  created_at: string;
  updated_at: string;
  processing_tasks: any[];
}

export default function KnowledgeBasePage() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchKnowledgeBases();
  }, []);

  const fetchKnowledgeBases = async () => {
    try {
      const data = await api.get("/api/knowledge-base");
      setKnowledgeBases(data);
    } catch (error) {
      console.error("Failed to fetch knowledge bases:", error);
      if (error instanceof ApiError) {
        toast({
          title: "错误",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "确定要删除这个知识库吗？其中的文档将一并删除，且无法恢复。"
      )
    )
      return;
    try {
      await api.delete(`/api/knowledge-base/${id}`);
      setKnowledgeBases((prev) => prev.filter((kb) => kb.id !== id));
      toast({
        title: "操作成功",
        description: "知识库删除成功",
      });
    } catch (error) {
      console.error("Failed to delete knowledge base:", error);
      if (error instanceof ApiError) {
        toast({
          title: "错误",
          description: error.message,
          variant: "destructive",
        });
      }
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">
              知识库
            </h2>
            <p className="text-muted-foreground">
              管理你的知识库和文档
            </p>
          </div>
          <Link
            href="/dashboard/knowledge/new"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-2 h-4 w-4" />
            新建知识库
          </Link>
        </div>

        <div className="grid gap-6">
          {knowledgeBases.map((kb) => (
            <div
              key={kb.id}
              className="rounded-lg border bg-card p-6 space-y-4"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold">{kb.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {kb.description || "暂无描述"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {kb.documents.length} 个文档 •{" "}
                    {new Date(kb.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex space-x-2">
                  <Link
                    href={`/dashboard/knowledge/${kb.id}`}
                    className="inline-flex items-center justify-center rounded-md bg-secondary w-8 h-8"
                  >
                    <Settings className="h-4 w-4" />
                  </Link>
                  <Link
                    href={`/dashboard/test-retrieval/${kb.id}`}
                    className="inline-flex items-center justify-center rounded-md bg-secondary w-8 h-8"
                  >
                    <Search className="h-4 w-4" />
                  </Link>
                  <button
                    onClick={() => handleDelete(kb.id)}
                    className="inline-flex items-center justify-center rounded-md bg-destructive/10 hover:bg-destructive/20 w-8 h-8"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </button>
                </div>
              </div>

              {kb.documents.length > 0 && (
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium mb-2">文档</h4>
                  <div className="flex flex-wrap gap-2 max-h-[400px] overflow-y-auto">
                    {kb.documents.slice(0, 9).map((doc) => (
                      <div
                        key={doc.id}
                        className="flex flex-col items-center gap-2 p-2 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors w-[150px] h-[150px] justify-center"
                      >
                        <div className="w-8 h-8 mb-2">
                          {doc.content_type.toLowerCase().includes("pdf") ? (
                            <FileIcon extension="pdf" {...defaultStyles.pdf} />
                          ) : doc.content_type.toLowerCase().includes("doc") ? (
                            <FileIcon extension="doc" {...defaultStyles.docx} />
                          ) : doc.content_type.toLowerCase().includes("txt") ? (
                            <FileIcon extension="txt" {...defaultStyles.txt} />
                          ) : doc.content_type.toLowerCase().includes("md") ? (
                            <FileIcon extension="md" {...defaultStyles.md} />
                          ) : (
                            <FileIcon
                              extension={doc.file_name.split(".").pop() || ""}
                              color="#E2E8F0"
                              labelColor="#94A3B8"
                            />
                          )}
                        </div>
                        <div className="text-sm font-medium text-center max-w-[100px]">
                          <div className="line-clamp-2 overflow-hidden text-ellipsis">
                            {doc.file_name}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground mt-1">
                          {new Date(doc.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                    {kb.documents.length > 9 && (
                      <Link
                        href={`/dashboard/knowledge/${kb.id}`}
                        className="flex flex-col items-center p-2 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors w-[150px] h-[150px] justify-center"
                      >
                        <div className="w-8 h-8 mb-2 flex items-center justify-center">
                          <ArrowRight className="w-6 h-6" />
                        </div>
                        <span className="text-sm font-medium text-center">
                          查看全部文档
                        </span>
                        <span className="text-xs text-muted-foreground mt-1">
                          共 {kb.documents.length} 个
                        </span>
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {!loading && knowledgeBases.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                暂无知识库。创建一个即可开始使用。
              </p>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="space-y-4">
                <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto"></div>
                <p className="text-muted-foreground animate-pulse">
                  正在加载知识库…
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
