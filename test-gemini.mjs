import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = 'gemini-1.5-flash-latest'; // hoặc 'gemini-1.5-pro-latest'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

async function main() {
  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    const result = await model.generateContent(
      'Hãy tạo 5 câu hỏi phỏng vấn cho Frontend Dev (React/JS).'
    );
    console.log('REPLY:\n', result.response.text());
  } catch (err) {
    console.error('STATUS:', err?.status);
    console.error('DETAIL:', err?.response?.error ?? err);
  }
}

main();
