"use client";

import { useState, useEffect } from "react";
import { Plus, Copy, Check, List } from "lucide-react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { api } from "@/lib/api";

export interface APIKey {
  id: number;
  name: string;
  key: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface APIKeyCreate {
  name: string;
  is_active?: boolean;
}

export interface APIKeyUpdate {
  name?: string;
  is_active?: boolean;
}

export default function APIKeysPage() {
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAPIListDialogOpen, setIsAPIListDialogOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  // 获取 API Keys 列表
  const fetchAPIKeys = async () => {
    try {
      const data = await api.get("/api/api-keys");
      setApiKeys(data);
    } catch (error) {
      toast({
        title: "出错了",
        description: "获取 API 密钥列表失败",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAPIKeys();
  }, []);

  // 创建新的 API Key
  const createAPIKey = async () => {
    if (!newKeyName.trim()) {
      toast({
        title: "出错了",
        description: "请输入 API 密钥名称",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      const data = await api.post("/api/api-keys", {
        name: newKeyName,
        is_active: true,
      });

      setApiKeys([...apiKeys, data]);
      setNewKeyName("");
      setIsDialogOpen(false);
      toast({
        title: "操作成功",
        description: "API 密钥创建成功",
      });
    } catch (error) {
      toast({
        title: "出错了",
        description: "创建 API 密钥失败",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  // 删除 API Key
  const deleteAPIKey = async (id: number) => {
    try {
      // api.delete 返回的是已经解析好的 JSON，不是 Response 对象；
      // 非 2xx 的情况它内部已经抛出 ApiError 了，所以这里不能再判断 response.ok
      // （那样 !undefined 恒为真，会导致删除成功也报「删除失败」）。
      await api.delete(`/api/api-keys/${id}`);

      setApiKeys(apiKeys.filter((key) => key.id !== id));
      toast({
        title: "操作成功",
        description: "API 密钥删除成功",
      });
    } catch (error) {
      toast({
        title: "出错了",
        description: "删除 API 密钥失败",
        variant: "destructive",
      });
    }
  };

  // 更新 API Key 状态
  const toggleAPIKeyStatus = async (id: number, currentStatus: boolean) => {
    try {
      const response = await api.put(`/api/api-keys/${id}`, {
        is_active: !currentStatus,
      });

      setApiKeys(
        apiKeys.map((key) =>
          key.id === id ? { ...key, is_active: !currentStatus } : key
        )
      );

      toast({
        title: "操作成功",
        description: "API 密钥状态更新成功",
      });
    } catch (error) {
      toast({
        title: "出错了",
        description: "更新 API 密钥失败",
        variant: "destructive",
      });
    }
  };

  // 复制 API Key
  const copyAPIKey = async (id: number, key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId(null);
      }, 3000);
      toast({
        title: "操作成功",
        description: "API 密钥已复制到剪贴板",
      });
    } catch (error) {
      toast({
        title: "出错了",
        description: "复制 API 密钥失败",
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto py-10">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">API 密钥</h1>
          <div className="flex gap-4">
            <Dialog
              open={isAPIListDialogOpen}
              onOpenChange={setIsAPIListDialogOpen}
            >
              <DialogTrigger asChild>
                <Button variant="outline">
                  <List className="mr-2 h-4 w-4" />
                  密钥列表
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>可用接口</DialogTitle>
                  <DialogDescription>
                    可用接口列表及其用法说明。
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-4 space-y-6">
                  <div className="border rounded-lg p-6 bg-slate-50">
                    <h3 className="text-lg font-semibold mb-4">
                      知识库检索
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-sm font-medium text-slate-700 mb-2">
                          请求方法
                        </h4>
                        <code className="block p-3 bg-white border rounded-md text-sm font-mono text-blue-600">
                          GET
                        </code>
                      </div>

                      <div>
                        <h4 className="text-sm font-medium text-slate-700 mb-2">
                          接口地址
                        </h4>
                        <code className="block p-3 bg-white border rounded-md text-sm font-mono">
                          /openapi/knowledge/{"{id}"}/query
                        </code>
                      </div>

                      <div>
                        <h4 className="text-sm font-medium text-slate-700 mb-2">
                          请求参数
                        </h4>
                        <div className="bg-white border rounded-md p-3 space-y-2">
                          <div className="grid grid-cols-3 text-sm">
                            <div className="font-mono text-blue-600">query</div>
                            <div className="col-span-2">
                              您的搜索查询内容
                            </div>
                          </div>
                          <div className="grid grid-cols-3 text-sm">
                            <div className="font-mono text-blue-600">top_k</div>
                            <div className="col-span-2">
                              返回结果数量（可选，默认 3）
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-medium text-slate-700 mb-2">
                          请求头
                        </h4>
                        <div className="bg-white border rounded-md p-3 grid grid-cols-3 text-sm">
                          <div className="font-mono text-blue-600">
                            X-API-Key
                          </div>
                          <div className="col-span-2">your_api_key</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  新建 API 密钥
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>新建 API 密钥</DialogTitle>
                  <DialogDescription>
                    创建新的 API 密钥，以便通过程序调用接口。
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">名称</Label>
                    <Input
                      id="name"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="请输入 API 密钥名称"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={createAPIKey}
                    disabled={isCreating || !newKeyName.trim()}
                  >
                    {isCreating ? "创建中…" : "创建"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>API 密钥</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead>最近使用</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.map((apiKey) => (
                <TableRow key={apiKey.id}>
                  <TableCell>{apiKey.name}</TableCell>
                  <TableCell className="flex items-center gap-2">
                    <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm">
                      {apiKey.key}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyAPIKey(apiKey.id, apiKey.key)}
                    >
                      {copiedId === apiKey.id ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={apiKey.is_active}
                      onCheckedChange={() =>
                        toggleAPIKeyStatus(apiKey.id, apiKey.is_active)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {new Date(apiKey.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {apiKey.last_used_at
                      ? new Date(apiKey.last_used_at).toLocaleDateString()
                      : "从未使用"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteAPIKey(apiKey.id)}
                    >
                      删除
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardLayout>
  );
}
