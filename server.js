// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

/* === ENV / CONFIG === */
const KEY = process.env.GOOGLE_API_KEY;
if (!KEY) {
  console.error("❌ Missing GOOGLE_API_KEY in .env");
  process.exit(1);
}

// Dùng model mới (v1)
const MODEL_NAME = "gemini-2.5-flash";
const genAI = new GoogleGenerativeAI(KEY);
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

/* === ROUTES === */
app.get("/", (_req, res) =>
  res.json({ ok: true, service: "AI Recruitment Helper", model: MODEL_NAME })
);

app.get("/health", (_req, res) => res.json({ ok: true }));

/**
 * POST /api/generate-questions
 * body: { name, position, experience, skills }
 * -> trả về JSON đúng mẫu, KHÔNG còn 'raw' nếu parse được
 */
app.post("/api/generate-questions", async (req, res) => {
  try {
    const {
      name = "",
      position = "",
      experience = "",
      skills = "",
    } = req.body || {};

    // Prompt: bắt buộc trả JSON thuần (không giải thích, không markdown)
    const prompt = `
Bạn là một interviewer kỹ thuật. Hãy tạo danh sách 7–10 câu hỏi phỏng vấn cho ứng viên.

Ứng viên: ${name}
Vị trí: ${position}
Kinh nghiệm: ${experience}
Kỹ năng: ${skills}

YÊU CẦU:
- Trộn Technical / Behavioral / Scenario.
- Mỗi câu hỏi ngắn gọn, rõ mục tiêu đánh giá.
- KHÔNG viết thêm lời chào/lời giải thích.
- CHỈ trả về JSON **thuần**, đúng schema sau. Không bọc \`\`\`json.
- Mã hóa UTF-8, không chứa dấu xuống dòng dư thừa ở cuối.

SCHEMA JSON CHÍNH XÁC:
{
  "name": "${name}",
  "position": "${position}",
  "questions": [
    { "no": 1, "type": "Technical",  "question": "..." },
    { "no": 2, "type": "Behavioral", "question": "..." }
  ]
}
`.trim();

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result?.response?.text?.() ?? "";

    // Thử parse JSON thuần
    let payload = safeParseJSON(text);

    // Nếu vẫn không parse được, thử cắt JSON ở trong chuỗi (trường hợp model lỡ chèn text)
    if (!payload) {
      const extracted = extractFirstJson(text);
      payload = safeParseJSON(extracted);
    }

    // Nếu parse OK và có mảng questions -> trả JSON chuẩn
    if (payload && Array.isArray(payload.questions)) {
      return res.json(payload);
    }

    // Fallback: trả raw + note
    return res.status(200).json({
      raw: text,
      note:
        "Model không trả JSON đúng schema, đã trả về raw để bạn xem. Hãy gửi lại request.",
    });
  } catch (err) {
    console.error("[Gemini ERROR]", err?.status, err?.message || err);
    if (err?.status === 404)
      return res
        .status(502)
        .json({ error: "404: Model không hợp lệ. Dùng 'gemini-2.5-flash'." });
    if (err?.status === 401)
      return res
        .status(401)
        .json({ error: "401: API key không hợp lệ hoặc chưa được phép gọi." });
    return res.status(500).json({ error: "Gemini service error" });
  }
});

/* === HELPERS === */
function safeParseJSON(s) {
  if (!s || typeof s !== "string") return null;
  // loại bỏ fence nếu có
  const cleaned = s
    .replace(/^\s*```json\s*/i, "")
    .replace(/^\s*```\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

// Tìm JSON đầu tiên trong chuỗi (dấu { … } khớp ngoặc)
function extractFirstJson(s) {
  if (!s) return "";
  const start = s.indexOf("{");
  if (start === -1) return "";
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth === 0) {
      return s.slice(start, i + 1);
    }
  }
  return "";
}

/* === START === */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Gemini server running at http://localhost:${PORT}`)
);

