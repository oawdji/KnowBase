"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ProviderOption {
  value: string;
  label: string;
  default_model: string;
  default_api_base: string;
  requires_key: boolean;
}

interface ModelProfile {
  id: number;
  name: string;
  provider: string;
  model: string;
  api_base: string;
  api_key_set: boolean;
  api_key_masked: string | null;
  api_key_source: "profile" | "env" | null;
  is_active: boolean;
}

interface CurrentConfig {
  provider: string;
  model: string;
  api_base: string;
  api_key_set: boolean;
  api_key_masked: string | null;
  source: "user" | "env";
  profile_id: number | null;
  profile_name: string | null;
}

interface EmbeddingsInfo {
  provider?: string;
  model?: string;
  managed_by?: string;
}

interface EnvDefaults {
  provider?: string;
  model?: string;
  api_key_set?: boolean;
}

interface ProfilesResponse {
  items: ModelProfile[];
  active_id: number | null;
  current: CurrentConfig;
  providers: ProviderOption[];
  embeddings?: EmbeddingsInfo;
  vector_store?: string;
  env_defaults?: EnvDefaults;
}

interface TestResult {
  ok: boolean;
  message: string;
}

/** 编辑对话框里的草稿 */
interface Draft {
  name: string;
  provider: string;
  apiKey: string;
  apiBase: string;
  model: string;
  activate: boolean;
}

const buildDraft = (
  provider: ProviderOption | undefined,
  base?: Partial<Draft>
): Draft => ({
  name: "",
  provider: provider?.value ?? "",
  apiKey: "",
  apiBase: provider?.default_api_base ?? "",
  model: provider?.default_model ?? "",
  activate: true,
  ...base,
});

export default function ModelSettingsPage() {
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [profiles, setProfiles] = useState<ModelProfile[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [current, setCurrent] = useState<CurrentConfig | null>(null);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [embeddings, setEmbeddings] = useState<EmbeddingsInfo | null>(null);
  const [vectorStore, setVectorStore] = useState("");
  const [envDefaults, setEnvDefaults] = useState<EnvDefaults | null>(null);

  // 编辑对话框
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ModelProfile | null>(null);
  const [draft, setDraft] = useState<Draft>(() => buildDraft(undefined));
  const [draftTest, setDraftTest] = useState<TestResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingDraft, setIsTestingDraft] = useState(false);

  // 行内操作 / 确认对话框
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ModelProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isTestingCurrent, setIsTestingCurrent] = useState(false);
  const [currentTest, setCurrentTest] = useState<TestResult | null>(null);

  const errorMessage = (error: unknown, fallback: string) =>
    error instanceof ApiError && error.message ? error.message : fallback;

  const applyResponse = (data: ProfilesResponse) => {
    setProfiles(data.items ?? []);
    setActiveId(data.active_id ?? null);
    setCurrent(data.current ?? null);
    setProviders(data.providers ?? []);
    setEmbeddings(data.embeddings ?? null);
    setVectorStore(data.vector_store ?? "");
    setEnvDefaults(data.env_defaults ?? null);
  };

  const fetchProfiles = async () => {
    try {
      const data: ProfilesResponse = await api.get("/api/settings/models");
      applyResponse(data);
    } catch (error) {
      toast({
        title: "出错了",
        description: errorMessage(error, "获取模型配置失败，请稍后重试。"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const providerOf = (value: string) =>
    providers.find((item) => item.value === value);
  const draftProvider = providerOf(draft.provider);
  const draftRequiresKey = draftProvider ? draftProvider.requires_key : true;
  /** 编辑时：该配置已存有 Key，留空即表示不改动 */
  const draftKeepsStoredKey = Boolean(editing?.api_key_set);

  // ---------------- 新建 / 编辑 ----------------

  const openCreate = () => {
    const preferred =
      providerOf(current?.provider ?? "") ?? providers[0];
    setEditing(null);
    setDraft(buildDraft(preferred));
    setDraftTest(null);
    setIsEditorOpen(true);
  };

  const openEdit = (profile: ModelProfile) => {
    setEditing(profile);
    setDraft({
      name: profile.name,
      provider: profile.provider,
      apiKey: "",
      apiBase: profile.api_base,
      model: profile.model,
      activate: profile.is_active,
    });
    setDraftTest(null);
    setIsEditorOpen(true);
  };

  // 切换服务商时带上该服务商的默认接口地址与模型，避免留空导致请求打错地址
  const handleDraftProviderChange = (value: string) => {
    const option = providerOf(value);
    setDraft((prev) => ({
      ...prev,
      provider: value,
      apiBase: option ? option.default_api_base : prev.apiBase,
      model: option ? option.default_model : prev.model,
      apiKey: option && !option.requires_key ? "" : prev.apiKey,
    }));
    setDraftTest(null);
  };

  const validateDraft = (): string | null => {
    if (!draft.name.trim()) return "请填写配置名称";
    if (!draft.provider) return "请选择服务商";
    if (
      draft.apiBase.trim() &&
      !/^https?:\/\//i.test(draft.apiBase.trim())
    ) {
      return "接口地址需以 http:// 或 https:// 开头";
    }
    if (draftRequiresKey && !draftKeepsStoredKey && !draft.apiKey.trim()) {
      return "该服务商需要 API Key，请填写后再保存";
    }
    return null;
  };

  const buildDraftPayload = () => {
    const payload: Record<string, unknown> = {
      name: draft.name.trim(),
      provider: draft.provider,
      api_base: draft.apiBase.trim(),
      model: draft.model.trim(),
    };
    if (draft.apiKey.trim()) payload.api_key = draft.apiKey.trim();
    return payload;
  };

  const handleSaveDraft = async () => {
    const invalid = validateDraft();
    if (invalid) {
      toast({ title: "出错了", description: invalid, variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      if (editing) {
        await api.patch(
          `/api/settings/models/${editing.id}`,
          buildDraftPayload()
        );
      } else {
        await api.post("/api/settings/models", {
          ...buildDraftPayload(),
          activate: draft.activate,
        });
      }
      await fetchProfiles();
      setIsEditorOpen(false);
      toast({
        title: "操作成功",
        description: editing
          ? `已更新「${draft.name.trim()}」`
          : `已保存「${draft.name.trim()}」`,
      });
    } catch (error) {
      toast({
        title: "出错了",
        description: errorMessage(error, "保存模型配置失败，请稍后重试。"),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestDraft = async () => {
    if (!draft.provider) {
      toast({ title: "出错了", description: "请选择服务商", variant: "destructive" });
      return;
    }
    setIsTestingDraft(true);
    setDraftTest(null);
    try {
      const payload: Record<string, unknown> = { provider: draft.provider };
      // 带上 id 后，未填写的字段会回退到该配置已保存的值
      if (editing) payload.id = editing.id;
      if (draft.apiKey.trim()) payload.api_key = draft.apiKey.trim();
      if (draft.apiBase.trim()) payload.api_base = draft.apiBase.trim();
      if (draft.model.trim()) payload.model = draft.model.trim();

      const data = await api.post("/api/settings/models/test", payload);
      setDraftTest({
        ok: Boolean(data?.ok),
        message: data?.message || "测试完成，但服务端未返回结果说明",
      });
    } catch (error) {
      setDraftTest(null);
      toast({
        title: "出错了",
        description: errorMessage(error, "测试连接失败，请稍后重试。"),
        variant: "destructive",
      });
    } finally {
      setIsTestingDraft(false);
    }
  };

  // ---------------- 列表操作 ----------------

  const handleActivate = async (profile: ModelProfile) => {
    setBusyId(profile.id);
    try {
      await api.post(`/api/settings/models/${profile.id}/activate`, {});
      await fetchProfiles();
      setCurrentTest(null);
      toast({
        title: "操作成功",
        description: `后续对话将使用「${profile.name}」`,
      });
    } catch (error) {
      toast({
        title: "出错了",
        description: errorMessage(error, "切换模型配置失败，请稍后重试。"),
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setIsDeleting(true);
    try {
      await api.delete(`/api/settings/models/${target.id}`);
      await fetchProfiles();
      setCurrentTest(null);
      setDeleteTarget(null);
      toast({
        title: "操作成功",
        description: target.is_active
          ? `已删除「${target.name}」，并切换到另一套配置`
          : `已删除「${target.name}」`,
      });
    } catch (error) {
      toast({
        title: "出错了",
        description: errorMessage(error, "删除模型配置失败，请稍后重试。"),
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTestCurrent = async () => {
    setIsTestingCurrent(true);
    setCurrentTest(null);
    try {
      const payload: Record<string, unknown> = {};
      if (activeId) payload.id = activeId;
      const data = await api.post("/api/settings/models/test", payload);
      setCurrentTest({
        ok: Boolean(data?.ok),
        message: data?.message || "测试完成，但服务端未返回结果说明",
      });
    } catch (error) {
      setCurrentTest(null);
      toast({
        title: "出错了",
        description: errorMessage(error, "测试连接失败，请稍后重试。"),
        variant: "destructive",
      });
    } finally {
      setIsTestingCurrent(false);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await api.delete("/api/settings/models");
      await fetchProfiles();
      setCurrentTest(null);
      setIsResetOpen(false);
      toast({
        title: "操作成功",
        description: "已清除全部模型配置，回退到 .env 默认值",
      });
    } catch (error) {
      toast({
        title: "出错了",
        description: errorMessage(error, "恢复默认配置失败，请稍后重试。"),
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto max-w-3xl space-y-6 py-10">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-5 w-full max-w-xl" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  const isBusy = isSaving || isDeleting || isResetting;

  return (
    <DashboardLayout>
      <div className="container mx-auto max-w-3xl space-y-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">模型设置</h1>
            <p className="text-sm text-muted-foreground">
              为本账号保存多套对话模型配置，切换后立即对后续对话生效；配置仅对你自己生效。
            </p>
            {envDefaults?.provider && envDefaults?.model && (
              <p className="text-xs text-muted-foreground">
                .env 默认值：{envDefaults.provider} / {envDefaults.model}
                {envDefaults.api_key_set ? "" : "（该默认值未配置可用的 API Key）"}
              </p>
            )}
          </div>
        </div>

        {/* 当前生效的配置 */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-lg">当前使用</CardTitle>
              <CardDescription>
                以下配置会用于你的对话；测试连接不会改动已保存的配置。
              </CardDescription>
            </div>
            <Badge
              variant={current?.source === "user" ? "default" : "secondary"}
            >
              {current?.source === "user" ? "来自模型配置" : ".env 默认值"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="font-medium">
                {current?.profile_name ?? "未保存任何配置"}
              </span>
              <span className="text-muted-foreground">
                {current?.provider ?? "未知"} · {current?.model ?? "未知"}
              </span>
              {current?.api_key_set && current.api_key_masked ? (
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {current.api_key_masked}
                </code>
              ) : (
                <span className="text-xs text-muted-foreground">
                  未使用可用的 API Key
                </span>
              )}
            </div>

            {currentTest && (
              <div
                role="status"
                className={cn(
                  "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
                  currentTest.ok
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
                    : "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
                )}
              >
                {currentTest.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span className="break-all">{currentTest.message}</span>
              </div>
            )}

            <div>
              <Button
                type="button"
                variant="outline"
                disabled={isBusy || isTestingCurrent}
                onClick={handleTestCurrent}
              >
                {isTestingCurrent ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="mr-2 h-4 w-4" />
                )}
                {isTestingCurrent ? "测试中…" : "测试当前配置"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 配置列表 */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-lg">模型配置</CardTitle>
              <CardDescription>
                可以保存多套配置（例如「DeepSeek 主力」「公司 OpenAI」），随时切换其中一套。
              </CardDescription>
            </div>
            <Button type="button" disabled={isBusy} onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              新建配置
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {profiles.length === 0 ? (
              <div className="rounded-lg border border-dashed px-4 py-8 text-center">
                <p className="text-sm font-medium">还没有保存任何配置</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  当前对话使用 .env 里的默认模型；新建一套配置后就会改用它。
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4"
                  disabled={isBusy}
                  onClick={openCreate}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  新建配置
                </Button>
              </div>
            ) : (
              <ul className="divide-y rounded-lg border">
                {profiles.map((profile) => {
                  const isActive = profile.id === activeId;
                  const option = providerOf(profile.provider);
                  return (
                    <li
                      key={profile.id}
                      className={cn(
                        "flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors",
                        isActive ? "bg-primary/5" : "hover:bg-accent/40"
                      )}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{profile.name}</span>
                          {isActive && <Badge>当前</Badge>}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            {option?.label ?? profile.provider} ·{" "}
                            {profile.model || "服务商默认模型"}
                          </span>
                          <span aria-hidden="true">|</span>
                          {profile.api_key_masked ? (
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                              {profile.api_key_masked}
                            </code>
                          ) : profile.api_key_source === "env" ? (
                            <span>API Key 来自 .env 默认值</span>
                          ) : option && !option.requires_key ? (
                            <span>该服务商不需要 API Key</span>
                          ) : (
                            <span>尚未填写 API Key</span>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={isActive ? "secondary" : "outline"}
                          aria-pressed={isActive}
                          disabled={isActive || isBusy || busyId === profile.id}
                          onClick={() => handleActivate(profile)}
                        >
                          {busyId === profile.id && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          {isActive ? "使用中" : "设为当前"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={isBusy || busyId === profile.id}
                          onClick={() => openEdit(profile)}
                          aria-label={`编辑配置 ${profile.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                          <span className="ml-1.5">编辑</span>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          disabled={isBusy || busyId === profile.id}
                          onClick={() => setDeleteTarget(profile)}
                          aria-label={`删除配置 ${profile.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="ml-1.5">删除</span>
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {profiles.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  正在使用的配置会加粗显示，并标为「当前」。
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={isBusy}
                  onClick={() => setIsResetOpen(true)}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  全部清除，恢复默认
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 只读信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">只读信息</CardTitle>
            <CardDescription>这些配置由 .env 管理，本页不支持修改。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-1">
              <span className="text-sm font-medium">向量模型</span>
              <span className="text-sm text-muted-foreground">
                {embeddings?.provider ?? "未知"} / {embeddings?.model ?? "未知"}
              </span>
              <span className="text-xs text-muted-foreground">
                由 .env 配置，本页不支持修改；更换会导致已有文档向量不匹配，需重新处理文档
              </span>
            </div>
            <div className="grid gap-1">
              <span className="text-sm font-medium">向量数据库</span>
              <span className="text-sm text-muted-foreground">
                {vectorStore || "未知"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 新建 / 编辑配置 */}
      <Dialog
        open={isEditorOpen}
        onOpenChange={(open) => {
          if (isSaving || isTestingDraft) return;
          setIsEditorOpen(open);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? `编辑「${editing.name}」` : "新建模型配置"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "保存后立即生效；API Key 留空表示继续使用已保存的那个。"
                : "保存后可以随时在列表里切换使用哪一套配置。"}
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              handleSaveDraft();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="profile-name">配置名称</Label>
              <Input
                id="profile-name"
                value={draft.name}
                maxLength={100}
                disabled={isSaving}
                onChange={(event) => {
                  setDraft((prev) => ({ ...prev, name: event.target.value }));
                  setDraftTest(null);
                }}
                placeholder="例如：DeepSeek 主力"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="profile-provider">服务商</Label>
              <Select
                value={draft.provider}
                onValueChange={handleDraftProviderChange}
              >
                <SelectTrigger id="profile-provider" disabled={isSaving}>
                  <SelectValue placeholder="请选择服务商" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="profile-key">API Key</Label>
              <Input
                id="profile-key"
                type="password"
                autoComplete="off"
                value={draft.apiKey}
                disabled={isSaving || !draftRequiresKey}
                onChange={(event) => {
                  setDraft((prev) => ({ ...prev, apiKey: event.target.value }));
                  setDraftTest(null);
                }}
                placeholder={
                  !draftRequiresKey
                    ? "不需要填写"
                    : draftKeepsStoredKey && editing?.api_key_masked
                      ? editing.api_key_masked
                      : "请输入该服务商的 API Key"
                }
              />
              <p className="text-xs text-muted-foreground">
                {!draftRequiresKey
                  ? "该服务商不需要 API Key。"
                  : draftKeepsStoredKey
                    ? "留空表示不修改，继续使用已保存的 API Key。"
                    : "填写后才能保存或测试；密钥加密存储，页面只回显打码值。"}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="profile-base">接口地址</Label>
              <Input
                id="profile-base"
                value={draft.apiBase}
                disabled={isSaving}
                onChange={(event) => {
                  setDraft((prev) => ({ ...prev, apiBase: event.target.value }));
                  setDraftTest(null);
                }}
                placeholder="https://api.example.com/v1"
              />
              <p className="text-xs text-muted-foreground">
                留空则使用该服务商在 .env 中的默认地址。
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="profile-model">模型名称</Label>
              <Input
                id="profile-model"
                value={draft.model}
                disabled={isSaving}
                onChange={(event) => {
                  setDraft((prev) => ({ ...prev, model: event.target.value }));
                  setDraftTest(null);
                }}
                placeholder={draftProvider?.default_model ?? "请输入模型名称"}
              />
              <p className="text-xs text-muted-foreground">
                留空则使用该服务商的默认模型
                {draftProvider?.default_model
                  ? `（${draftProvider.default_model}）`
                  : ""}
                。
              </p>
            </div>

            {!editing && (
              <div className="flex items-start justify-between gap-4 rounded-md border px-3 py-3">
                <div className="space-y-0.5">
                  <Label htmlFor="profile-activate">保存后设为当前配置</Label>
                  <p className="text-xs text-muted-foreground">
                    开启后，后续对话立即改用这套配置。
                  </p>
                </div>
                <Switch
                  id="profile-activate"
                  checked={draft.activate}
                  disabled={isSaving}
                  onCheckedChange={(checked) => {
                    setDraft((prev) => ({ ...prev, activate: checked }));
                    setDraftTest(null);
                  }}
                />
              </div>
            )}

            {draftTest && (
              <div
                role="status"
                className={cn(
                  "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
                  draftTest.ok
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
                    : "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
                )}
              >
                {draftTest.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span className="break-all">{draftTest.message}</span>
              </div>
            )}

            <DialogFooter className="flex-wrap gap-2 sm:justify-between">
              <Button
                type="button"
                variant="outline"
                disabled={isSaving || isTestingDraft}
                onClick={handleTestDraft}
              >
                {isTestingDraft ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="mr-2 h-4 w-4" />
                )}
                {isTestingDraft ? "测试中…" : "测试连接"}
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSaving}
                  onClick={() => setIsEditorOpen(false)}
                >
                  取消
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {isSaving ? "保存中…" : editing ? "保存修改" : "保存配置"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 删除单套配置需二次确认 */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!isDeleting && !open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除模型配置</DialogTitle>
            <DialogDescription>
              确定要删除「{deleteTarget?.name}」吗？
              {deleteTarget?.is_active
                ? "它正在使用中，删除后会自动切换到另一套配置。"
                : "已保存的 API Key 也会一并删除，此操作不可撤销。"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isDeleting}
              onClick={() => setDeleteTarget(null)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? "删除中…" : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 清除全部配置需二次确认 */}
      <Dialog
        open={isResetOpen}
        onOpenChange={(open) => {
          if (!isResetting) setIsResetOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>恢复默认配置</DialogTitle>
            <DialogDescription>
              确定要删除全部 {profiles.length} 套模型配置吗？删除后对话将回退到 .env
              默认配置，已保存的 API Key 也会一并清除，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isResetting}
              onClick={() => setIsResetOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={isResetting}
              onClick={handleReset}
            >
              {isResetting ? "恢复中…" : "全部清除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
