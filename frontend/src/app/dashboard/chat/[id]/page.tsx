"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "ai/react";
import { Send, User, Check, Pencil, X } from "lucide-react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { Answer } from "@/components/chat/answer";

interface Message {
  id: string;
  role: "assistant" | "user" | "system" | "data";
  content: string;
  citations?: Citation[];
}

interface ChatMessage {
  id: number;
  content: string;
  role: "assistant" | "user";
  created_at: string;
}

interface Chat {
  id: number;
  /** null 表示尚未命名（后端会在首条消息后自动命名） */
  title: string | null;
  messages: ChatMessage[];
}

interface Citation {
  id: number;
  text: string;
  metadata: Record<string, any>;
}

/** 后端通过 AI SDK data 帧推来的对话标题事件 */
interface ChatTitleEvent {
  type: "chat_title";
  title: string;
  /** true 表示后端正在用模型优化标题，稍后可能还会变 */
  refining?: boolean;
}

const PLACEHOLDER_TITLE = "新对话";
const OPTIMISTIC_TITLE_MAX_LENGTH = 30;
const TITLE_POLL_INTERVAL = 1200;
const TITLE_POLL_MAX_ATTEMPTS = 2;

/** 本地乐观标题：与后端的截断规则保持一致 */
const deriveOptimisticTitle = (text: string) => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > OPTIMISTIC_TITLE_MAX_LENGTH
    ? `${cleaned.slice(0, OPTIMISTIC_TITLE_MAX_LENGTH).trimEnd()}…`
    : cleaned;
};

/** 从 useChat 的 data 数组里取最后一条标题事件 */
const findLastTitleEvent = (data: unknown): ChatTitleEvent | null => {
  if (!Array.isArray(data)) return null;
  for (let i = data.length - 1; i >= 0; i -= 1) {
    const item = data[i] as ChatTitleEvent | null;
    if (item && typeof item === "object" && item.type === "chat_title") {
      return item;
    }
  }
  return null;
};

// Extend the default useChat message type
declare module "ai/react" {
  interface Message {
    citations?: Citation[];
  }
}

export default function ChatPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // ---- 对话标题：自动命名 + 手动重命名 ----
  const [chatTitle, setChatTitle] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  // 记录最近一次由本地/后端自动写入的标题：
  // 只有标题仍是它时，才说明后台模型可能还在优化，需要补拉一次。
  const autoTitleRef = useRef<string | null>(null);
  const appliedTitleFrameRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const {
    messages,
    data,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    setMessages,
    error,
  } = useChat({
    api: `/api/chat/${params.id}/messages`,
    headers: {
      Authorization: `Bearer ${
        typeof window !== "undefined"
          ? window.localStorage.getItem("token")
          : ""
      }`,
    },
  });

  useEffect(() => {
    if (isInitialLoad) {
      fetchChat();
      setIsInitialLoad(false);
    }
  }, [isInitialLoad]);

  useEffect(() => {
    if (!isInitialLoad) {
      scrollToBottom();
    }
  }, [messages, isInitialLoad]);

  const fetchChat = async () => {
    try {
      const data: Chat = await api.get(`/api/chat/${params.id}`);
      setChatTitle(data.title);
      const formattedMessages = data.messages.map((msg) => {
        if (msg.role !== "assistant" || !msg.content)
          return {
            id: msg.id.toString(),
            role: msg.role,
            content: msg.content,
          };

        try {
          if (!msg.content.includes("__LLM_RESPONSE__")) {
            return {
              id: msg.id.toString(),
              role: msg.role,
              content: msg.content,
            };
          }

          const [base64Part, responseText] =
            msg.content.split("__LLM_RESPONSE__");

          const contextData = base64Part
            ? (JSON.parse(atob(base64Part.trim())) as {
                context: Array<{
                  page_content: string;
                  metadata: Record<string, any>;
                }>;
              })
            : null;

          const citations: Citation[] =
            contextData?.context.map((citation, index) => ({
              id: index + 1,
              text: citation.page_content,
              metadata: citation.metadata,
            })) || [];

          return {
            id: msg.id.toString(),
            role: msg.role,
            content: responseText || "",
            citations,
          };
        } catch (e) {
          console.error("Failed to process message:", e);
          return {
            id: msg.id.toString(),
            role: msg.role,
            content: msg.content,
          };
        }
      });
      setMessages(formattedMessages);
    } catch (error) {
      console.error("Failed to fetch chat:", error);
      if (error instanceof ApiError) {
        toast({
          title: "出错了",
          description: error.message,
          variant: "destructive",
        });
      }
      router.push("/dashboard/chat");
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  /** 补拉标题：后台模型标题通常在 1～2 秒内写好 */
  const pollTitle = async (attempt = 0) => {
    if (!isMountedRef.current) return;
    try {
      const data: Chat = await api.get(`/api/chat/${params.id}`);
      if (!isMountedRef.current) return;
      if (data.title) setChatTitle(data.title);
      // 标题还是自动生成的那个 → 可能仍在优化中，再补查一次
      if (
        attempt < TITLE_POLL_MAX_ATTEMPTS &&
        data.title === autoTitleRef.current
      ) {
        setTimeout(() => pollTitle(attempt + 1), TITLE_POLL_INTERVAL);
      }
    } catch (error) {
      // 标题补拉失败不影响对话，下次进入页面会显示正确标题
      console.error("Failed to refresh chat title:", error);
    }
  };

  // 后端在首条消息的流里推来标题帧：立即更新，并按需补拉被模型优化后的标题。
  // 用 ref 记住已处理的帧，避免 data 数组身份变化引发重复请求。
  useEffect(() => {
    const event = findLastTitleEvent(data);
    if (!event) return;
    const frameKey = `${event.title}|${event.refining ? 1 : 0}`;
    if (appliedTitleFrameRef.current === frameKey) return;
    appliedTitleFrameRef.current = frameKey;

    autoTitleRef.current = event.title;
    setChatTitle(event.title);
    if (event.refining) pollTitle();
  }, [data]);

  // 后端把模型/网络异常包装成中文提示后通过流里的 3: 帧下发，
  // 这里弹成 toast，避免用户只看到回答停住却不知道原因。
  const lastErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (!error) {
      lastErrorRef.current = null;
      return;
    }
    const message = error.message || "对话请求失败";
    if (lastErrorRef.current === message) return;
    lastErrorRef.current = message;
    toast({
      title: "出错了",
      description: message,
      variant: "destructive",
    });
  }, [error]);

  /** 发出第一条消息时先把标题乐观地显示成截断后的提问 */
  const handleChatSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const question = input.trim();
    if (!chatTitle && question) {
      const optimistic = deriveOptimisticTitle(question);
      autoTitleRef.current = optimistic;
      setChatTitle(optimistic);
    }
    handleSubmit(e);
  };

  const startEditTitle = () => {
    setTitleDraft(chatTitle ?? "");
    setIsEditingTitle(true);
  };

  const saveTitle = async () => {
    const next = titleDraft.replace(/\s+/g, " ").trim();
    if (!next) {
      toast({
        title: "出错了",
        description: "对话标题不能为空",
        variant: "destructive",
      });
      return;
    }
    setIsSavingTitle(true);
    try {
      const data: Chat = await api.patch(`/api/chat/${params.id}`, {
        title: next,
      });
      setChatTitle(data.title ?? next);
      // 用户已经手动命名，之后不再自动优化/补拉
      autoTitleRef.current = null;
      setIsEditingTitle(false);
      toast({ title: "操作成功", description: "对话标题已更新" });
    } catch (error) {
      console.error("Failed to rename chat:", error);
      toast({
        title: "出错了",
        description:
          error instanceof ApiError ? error.message : "重命名对话失败",
        variant: "destructive",
      });
    } finally {
      setIsSavingTitle(false);
    }
  };

  const processMessageContent = (message: Message): Message => {
    if (message.role !== "assistant" || !message.content) return message;

    try {
      if (!message.content.includes("__LLM_RESPONSE__")) {
        return message;
      }

      const [base64Part, responseText] =
        message.content.split("__LLM_RESPONSE__");

      const contextData = base64Part
        ? (JSON.parse(atob(base64Part.trim())) as {
            context: Array<{
              page_content: string;
              metadata: Record<string, any>;
            }>;
          })
        : null;

      const citations: Citation[] =
        contextData?.context.map((citation, index) => ({
          id: index + 1,
          text: citation.page_content,
          metadata: citation.metadata,
        })) || [];

      return {
        ...message,
        content: responseText || "",
        citations,
      };
    } catch (e) {
      console.error("Failed to process message:", e);
      return message;
    }
  };

  const markdownParse = (text: string) => {
    return text
      .replace(/\[\[([cC])itation/g, "[citation")
      .replace(/[cC]itation:(\d+)]]/g, "citation:$1]")
      .replace(/\[\[([cC]itation:\d+)]](?!])/g, `[$1]`)
      .replace(/\[[cC]itation:(\d+)]/g, "[citation]($1)");
  };

  const processedMessages = useMemo(() => {
    return messages.map((message) => {
      if (message.role !== "assistant" || !message.content) return message;

      try {
        if (!message.content.includes("__LLM_RESPONSE__")) {
          return {
            ...message,
            content: markdownParse(message.content),
          };
        }

        const [base64Part, responseText] =
          message.content.split("__LLM_RESPONSE__");

        const contextData = base64Part
          ? (JSON.parse(atob(base64Part.trim())) as {
              context: Array<{
                page_content: string;
                metadata: Record<string, any>;
              }>;
            })
          : null;

        const citations: Citation[] =
          contextData?.context.map((citation, index) => ({
            id: index + 1,
            text: citation.page_content,
            metadata: citation.metadata,
          })) || [];

        return {
          ...message,
          content: markdownParse(responseText || ""),
          citations,
        };
      } catch (e) {
        console.error("Failed to process message:", e);
        return message;
      }
    });
  }, [messages]);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-5rem)] relative">
        <div className="flex items-center gap-2 border-b pb-3 mb-2 min-h-[44px]">
          {isEditingTitle ? (
            <>
              <input
                autoFocus
                value={titleDraft}
                maxLength={255}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveTitle();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setIsEditingTitle(false);
                  }
                }}
                placeholder="输入对话标题"
                className="flex-1 min-w-0 h-9 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <button
                type="button"
                onClick={saveTitle}
                disabled={isSavingTitle || !titleDraft.trim()}
                title="保存标题"
                className="inline-flex items-center justify-center h-9 px-3 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
              >
                <Check className="h-4 w-4 mr-1" />
                {isSavingTitle ? "保存中…" : "保存"}
              </button>
              <button
                type="button"
                onClick={() => setIsEditingTitle(false)}
                title="取消"
                className="inline-flex items-center justify-center h-9 px-3 rounded-md text-sm font-medium border border-input bg-background hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <h1
                className="text-lg font-semibold truncate"
                title={chatTitle ?? PLACEHOLDER_TITLE}
              >
                {chatTitle ?? PLACEHOLDER_TITLE}
              </h1>
              <button
                type="button"
                onClick={startEditTitle}
                title="重命名对话"
                aria-label="重命名对话"
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Pencil className="h-4 w-4" />
              </button>
              {!chatTitle && (
                <span className="text-xs text-muted-foreground truncate">
                  发出第一个问题后会自动命名
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-[80px]">
          {processedMessages.map((message) =>
            message.role === "assistant" ? (
              <div
                key={message.id}
                className="flex justify-start items-start space-x-2"
              >
                <div className="w-8 h-8 flex items-center justify-center">
                  <img
                    src="/logo.png"
                    className="h-8 w-8 rounded-full"
                    alt="知库问答标志"
                  />
                </div>
                <div className="max-w-[80%] rounded-lg px-4 py-2 text-accent-foreground">
                  <Answer
                    key={message.id}
                    markdown={message.content}
                    citations={message.citations}
                  />
                </div>
              </div>
            ) : (
              <div
                key={message.id}
                className="flex justify-end items-start space-x-2"
              >
                <div className="max-w-[80%] rounded-lg px-4 py-2 bg-primary text-primary-foreground">
                  {message.content}
                </div>
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <User className="h-5 w-5 text-primary-foreground" />
                </div>
              </div>
            )
          )}
          <div className="flex justify-start">
            {isLoading &&
              processedMessages[processedMessages.length - 1]?.role !=
                "assistant" && (
                <div className="max-w-[80%] rounded-lg px-4 py-2 text-accent-foreground">
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 rounded-full bg-primary animate-bounce" />
                    <div className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:0.2s]" />
                    <div className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              )}
          </div>
          <div ref={messagesEndRef} />
        </div>
        <form
          onSubmit={handleChatSubmit}
          className="border-t p-4 flex items-center space-x-4 bg-background absolute bottom-0 left-0 right-0"
        >
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="输入消息…"
            className="flex-1 min-w-0 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
}
