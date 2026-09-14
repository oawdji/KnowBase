import React, {
  FC,
  useMemo,
  useEffect,
  useRef,
  useState,
  ClassAttributes,
} from "react";
import { AnchorHTMLAttributes } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Divider } from "@/components/ui/divider";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { api } from "@/lib/api";
import { FileIcon } from "react-file-icon";

// Debounce hook to prevent rapid state updates during streaming.
// key 用于以「内容签名」而不是对象身份作为依赖：父组件每次重渲染都会传入新的
// citations 数组，若以身份作依赖，定时器会被不断重置并持续触发 setState，
// 父组件因此再重渲染，形成无限循环（Issue #69 的根因）。
const useDebouncedValue = <T,>(value: T, delay: number, key?: string): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const latestValue = useRef(value);

  useEffect(() => {
    latestValue.current = value;
  });

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(latestValue.current);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [key ?? value, delay]);

  return debouncedValue;
};

interface Citation {
  id: number;
  text: string;
  metadata: Record<string, any>;
}

interface KnowledgeBaseInfo {
  name: string;
}

interface DocumentInfo {
  file_name: string;
  knowledge_base: KnowledgeBaseInfo;
}

interface CitationInfo {
  knowledge_base: KnowledgeBaseInfo;
  document: DocumentInfo;
}

// 比较两份引用信息是否等价：内容相同则跳过 setState（返回原对象），
// 避免因为新对象身份而多触发一次渲染
const isSameCitationInfo = (
  prev: Record<string, CitationInfo>,
  next: Record<string, CitationInfo>
): boolean => {
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);
  if (prevKeys.length !== nextKeys.length) return false;

  return prevKeys.every(
    (key) =>
      next[key] !== undefined &&
      prev[key]?.knowledge_base?.name === next[key]?.knowledge_base?.name &&
      prev[key]?.document?.file_name === next[key]?.document?.file_name
  );
};

export const Answer: FC<{
  markdown: string;
  citations?: Citation[];
}> = ({ markdown, citations = [] }) => {
  const [citationInfoMap, setCitationInfoMap] = useState<
    Record<string, CitationInfo>
  >({});

  // 引用内容的「签名」：只随内容变化，不随数组身份变化。
  // 前半段是请求引用信息用的 ids，后半段（text 长度）用于感知文本变化。
  const citationsKey = citations
    .map(
      (citation) =>
        `${citation.metadata?.kb_id ?? ""}:${
          citation.metadata?.document_id ?? ""
        }:${citation.text?.length ?? 0}`
    )
    .join("|");

  // Debounce citations to prevent rapid API calls during streaming
  const debouncedCitations = useDebouncedValue(citations, 300, citationsKey);

  const processedMarkdown = useMemo(() => {
    return markdown
      .replace(/<think>/g, "## 💭 深度思考\n```think")
      .replace(/<\/think>/g, "```");
  }, [markdown]);

  useEffect(() => {
    const fetchCitationInfo = async () => {
      const infoMap: Record<string, CitationInfo> = {};

      for (const citation of debouncedCitations) {
        const { kb_id, document_id } = citation.metadata;
        if (!kb_id || !document_id) continue;

        const key = `${kb_id}-${document_id}`;
        if (infoMap[key]) continue;

        try {
          const [kb, doc] = await Promise.all([
            api.get(`/api/knowledge-base/${kb_id}`),
            api.get(`/api/knowledge-base/${kb_id}/documents/${document_id}`),
          ]);

          infoMap[key] = {
            knowledge_base: {
              name: kb.name,
            },
            document: {
              file_name: doc.file_name,
              knowledge_base: {
                name: kb.name,
              },
            },
          };
        } catch (error) {
          console.error("Failed to fetch citation info:", error);
        }
      }

      setCitationInfoMap((prev) =>
        isSameCitationInfo(prev, infoMap) ? prev : infoMap
      );
    };

    if (debouncedCitations.length > 0) {
      fetchCitationInfo();
    }
  }, [debouncedCitations]);

  const CitationLink = useMemo(
    () =>
      (
        props: ClassAttributes<HTMLAnchorElement> &
          AnchorHTMLAttributes<HTMLAnchorElement>
      ) => {
        const citationId = props.href?.match(/^(\d+)$/)?.[1];
        const citation = citationId
          ? debouncedCitations[parseInt(citationId) - 1]
          : null;

        if (!citation) {
          return <a>[{props.href}]</a>;
        }

        const citationInfo =
          citationInfoMap[
            `${citation.metadata.kb_id}-${citation.metadata.document_id}`
          ];

        return (
          <Popover>
            <PopoverTrigger asChild>
              <a
                {...props}
                href="#"
                role="button"
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors relative"
              >
                <span className="absolute -top-3 -right-1">[{props.href}]</span>
              </a>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              className="max-w-2xl w-[calc(100vw-100px)] p-4 rounded-lg shadow-lg"
            >
              <div className="text-sm space-y-3">
                {citationInfo && (
                  <div className="flex items-center gap-2 text-xs font-medium text-gray-700 bg-gray-50 p-2 rounded">
                    <div className="w-5 h-5 flex items-center justify-center">
                      <FileIcon
                        extension={
                          citationInfo.document.file_name.split(".").pop() || ""
                        }
                        color="#E2E8F0"
                        labelColor="#94A3B8"
                      />
                    </div>
                    <span className="truncate">
                      {citationInfo.knowledge_base.name} /{" "}
                      {citationInfo.document.file_name}
                    </span>
                  </div>
                )}
                <Divider />
                <p className="text-gray-700 leading-relaxed">{citation.text}</p>
                <Divider />
                {Object.keys(citation.metadata).length > 0 && (
                  <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                    <div className="font-medium mb-2">调试信息：</div>
                    <div className="space-y-1">
                      {Object.entries(citation.metadata).map(([key, value]) => (
                        <div key={key} className="flex">
                          <span className="font-medium min-w-[100px]">
                            {key}:
                          </span>
                          <span className="text-gray-600">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        );
      },
    [debouncedCitations, citationInfoMap]
  );

  if (!markdown) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="max-w-sm h-4 bg-zinc-200" />
        <Skeleton className="max-w-lg h-4 bg-zinc-200" />
        <Skeleton className="max-w-2xl h-4 bg-zinc-200" />
        <Skeleton className="max-w-lg h-4 bg-zinc-200" />
        <Skeleton className="max-w-xl h-4 bg-zinc-200" />
      </div>
    );
  }

  return (
    <div className="prose prose-sm max-w-full">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a: CitationLink,
        }}
      >
        {processedMarkdown}
      </Markdown>
    </div>
  );
};
