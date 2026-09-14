"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState({
    email: "",
    password: "",
    confirmPassword: "",
  });

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setValidationErrors((prev) => ({
        ...prev,
        email: "请输入有效的邮箱地址",
      }));
      return false;
    }
    setValidationErrors((prev) => ({ ...prev, email: "" }));
    return true;
  };

  const validatePassword = (password: string) => {
    if (password.length < 8) {
      setValidationErrors((prev) => ({
        ...prev,
        password: "密码长度至少为 8 个字符",
      }));
      return false;
    }
    if (!/[A-Z]/.test(password)) {
      setValidationErrors((prev) => ({
        ...prev,
        password: "密码需至少包含一个大写字母",
      }));
      return false;
    }
    if (!/[a-z]/.test(password)) {
      setValidationErrors((prev) => ({
        ...prev,
        password: "密码需至少包含一个小写字母",
      }));
      return false;
    }
    if (!/[0-9]/.test(password)) {
      setValidationErrors((prev) => ({
        ...prev,
        password: "密码需至少包含一个数字",
      }));
      return false;
    }
    setValidationErrors((prev) => ({ ...prev, password: "" }));
    return true;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setValidationErrors({ email: "", password: "", confirmPassword: "" });

    const formData = new FormData(e.currentTarget);
    const username = formData.get("username") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    // Validate email and password
    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);

    if (password !== confirmPassword) {
      setValidationErrors((prev) => ({
        ...prev,
        confirmPassword: "两次输入的密码不一致",
      }));
      return;
    }

    if (!isEmailValid || !isPasswordValid) {
      return;
    }

    try {
      await api.post("/api/auth/register", {
        username,
        email,
        password,
      });

      router.push("/login");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("注册失败，请稍后重试");
      }
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-md p-8 space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900">
              欢迎使用知库问答
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              创建账号，即刻开始
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="username"
                  className="block text-sm font-medium text-gray-700"
                >
                  用户名
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  className="mt-1 block w-full px-3 py-2 rounded-md border border-gray-300 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="请输入用户名"
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700"
                >
                  邮箱
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className={`mt-1 block w-full px-3 py-2 rounded-md border ${
                    validationErrors.email
                      ? "border-red-300"
                      : "border-gray-300"
                  } shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                  placeholder="请输入邮箱"
                  onChange={(e) => validateEmail(e.target.value)}
                />
                {validationErrors.email && (
                  <p className="mt-1 text-sm text-red-600">
                    {validationErrors.email}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700"
                >
                  密码
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className={`mt-1 block w-full px-3 py-2 rounded-md border ${
                    validationErrors.password
                      ? "border-red-300"
                      : "border-gray-300"
                  } shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                  placeholder="设置密码"
                  onChange={(e) => validatePassword(e.target.value)}
                />
                {validationErrors.password && (
                  <p className="mt-1 text-sm text-red-600">
                    {validationErrors.password}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-gray-700"
                >
                  确认密码
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  className={`mt-1 block w-full px-3 py-2 rounded-md border ${
                    validationErrors.confirmPassword
                      ? "border-red-300"
                      : "border-gray-300"
                  } shadow-sm focus:ring-2 focus:ring-gray-500 focus:border-gray-500`}
                  placeholder="请再次输入密码"
                />
                {validationErrors.confirmPassword && (
                  <p className="mt-1 text-sm text-red-600">
                    {validationErrors.confirmPassword}
                  </p>
                )}
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-md bg-red-50 text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              注册
            </button>
          </form>

          <div className="text-center">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-600 hover:text-gray-500"
            >
              已有账号？立即登录
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
