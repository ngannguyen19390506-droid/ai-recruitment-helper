// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

// ----- Paths (ESM) -----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----- App & Middlewares -----
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ----- Gemini config -----
const KEY = process.env.GOOGLE_API_KEY;
if (!KEY) {
  console.error("❌ Missing GOOGLE_API_KEY in .env");
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(KEY);

// Sử dụng model ổn định (tùy key của bạn). Có thể để 'gemini-1.5-pro' hoặc 'gemini-2.5-flash'
const MODEL_NAME = "gemini-2.5-flash";

// ----- Serve UI (public/index.html) -----
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => {
  // Gửi file index.html trong thư mục public
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ----- Health check -----
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "AI Recruitment Helper", model: MODEL_NAME });
});

// ----- Helpers -----
function buildPrompt({ name = "", position = "", experience = "", skills = "" }) {
  return `
Bạn là một interviewer kỹ thuật. Hãy tạo danh sách 7–10 câu hỏi phỏng vấn cho ứng viên:

- Ứng viên: ${name}
- Vị trí: ${position}
- Kinh nghiệm: ${experience}
- Kỹ năng: ${skills}

YÊU CẦU:
1) Trộn Technical / Behavioral / Scenario.
2) Mỗi câu hỏi ngắn gọn, rõ ràng.
3) Trả về JSON đúng mẫu:

{
  "name": "${name}",
  "position": "${position}",
  "questions": [
    { "no": 1, "type": "Technical", "question": "..." }
  ]
}
`.trim();
}

function safeParseJSON(s) {
  if (!s) return null;
  // loại bỏ code fence ```json ... ```
  const cleaned = s
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

// ----- API: generate questions -----
app.post("/api/generate-questions", async (req, res) => {
  try {
    const { name = "", position = "", experience = "", skills = "" } = req.body || {};
    const prompt = buildPrompt({ name, position, experience, skills });

    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result?.response?.text?.() ?? "";

    const payload = safeParseJSON(text);
    if (!payload || !Array.isArray(payload?.questions)) {
      // Trường hợp model trả về dạng văn bản, trả về raw để client hiển thị
      return res.status(200).json({
        name,
        position,
        raw: text,
        note: "Không parse được JSON chuẩn, trả về raw.",
      });
    }

    res.json(payload);
  } catch (err) {
    console.error("[Gemini ERROR]", err?.status, err?.statusText, err?.message || err);
    if (err?.status === 404) {
      return res.status(502).json({ error: "404: Model không hợp lệ cho API v1. Dùng 'gemini-1.5-pro' hoặc 'gemini-2.5-flash'." });
    }
    if (err?.status === 401) {
      return res.status(401).json({ error: "401: API key không hợp lệ hoặc chưa được phép gọi." });
    }
    res.status(500).json({ error: "Gemini service error" });
  }
});

// ----- Start server -----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 AI Recruitment Helper running at http://localhost:${PORT}`);
});
