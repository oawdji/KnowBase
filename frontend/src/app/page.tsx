import Link from "next/link";

const FEATURES = [
  {
    title: "文档问答",
    desc: "上传 PDF / Word / Markdown / 文本，自动切块、向量化入库；提问时先检索出相关片段，再让模型基于这些片段作答。",
    // 闪电
    path: "M13 10V3L4 14h7v7l9-11h-7z",
  },
  {
    title: "引用可溯源",
    desc: "回答带 [citation:x] 角标，点开就能看到它引用了哪一段原文——答得对不对，你可以自己核对。",
    // 文档
    path: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  },
  {
    title: "多模型可切换",
    desc: "支持 DeepSeek / OpenAI / MiniMax / 本地 Ollama；一个账号可保存多套配置，一键切换，切换前还能「测试连接」。",
    // 滑块
    path: "M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="max-w-7xl mx-auto px-4 py-24">
        {/* Hero Section */}
        <div className="text-center space-y-8 mb-24">
          <h1 className="text-6xl sm:text-7xl font-bold tracking-tight text-black">
            知库问答
          </h1>
          <p className="text-xl sm:text-2xl text-gray-500 max-w-3xl mx-auto font-light leading-relaxed">
            把你的文档变成能问答的知识库。
            <br />
            回答附引用，出处可查。
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mt-12">
            <Link
              href="/register"
              className="px-8 py-4 bg-blue-600 text-white rounded-full text-lg font-medium transition-all duration-300 hover:bg-blue-700 w-full sm:w-auto"
            >
              开始使用
            </Link>
            <Link
              href="/login"
              className="px-8 py-4 bg-gray-200 text-gray-800 rounded-full text-lg font-medium transition-all duration-300 hover:bg-gray-300 w-full sm:w-auto"
            >
              登录
            </Link>
          </div>
        </div>

        {/* Features Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-24">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="text-center">
              <div className="h-20 w-20 mx-auto rounded-full bg-blue-100 flex items-center justify-center mb-6">
                <svg
                  className="h-10 w-10 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={feature.path}
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-semibold text-black mb-4">
                {feature.title}
              </h3>
              <p className="text-gray-500 leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>

        {/* Call to Action */}
        <div className="text-center bg-gray-100 rounded-3xl p-16">
          <h2 className="text-4xl font-bold mb-6">准备好开始了吗？</h2>
          <p className="text-xl text-gray-500 mb-8 max-w-2xl mx-auto">
            上传你的第一份文档，几分钟内就能对着它提问。
          </p>
          <Link
            href="/register"
            className="px-8 py-4 bg-blue-600 text-white rounded-full text-lg font-medium transition-all duration-300 hover:bg-blue-700"
          >
            免费试用
          </Link>
        </div>

        {/* 上游归属（Apache-2.0 要求保留） */}
        <p className="mt-16 text-center text-sm text-gray-500">
          本项目基于开源项目{" "}
          <a
            href="https://github.com/rag-web-ui/rag-web-ui"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-700"
          >
            rag-web-ui
          </a>{" "}
          （Apache-2.0）二次开发，原项目版权归其作者所有。
        </p>
      </div>
    </main>
  );
}
