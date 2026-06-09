import express from "express";
import path from "path";
import multer from "multer";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Set up in-memory file uploads with multer
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// 1. Initialize Gemini client if API key is present
const geminiApiKey = process.env.GEMINI_API_KEY;

let ai: GoogleGenAI | null = null;
if (geminiApiKey) {
  ai = new GoogleGenAI({
    apiKey: geminiApiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Helper function to call Gemini API with exponential retry and model fallback (handles 503 Overloaded/Unavailable errors)
async function generateContentWithRetry(
  aiClient: GoogleGenAI,
  contents: any,
  config: any
) {
  const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
  let lastError: any = null;

  for (const modelName of modelsToTry) {
    let attempts = 3;
    let delay = 1000; // 1 second base delay

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        console.log(`[Gemini API] Attempting contract analysis using ${modelName} (Attempt ${attempt}/${attempts})...`);
        const response = await aiClient.models.generateContent({
          model: modelName,
          contents,
          config,
        });
        console.log(`[Gemini API] Success using ${modelName}`);
        return response;
      } catch (error: any) {
        lastError = error;
        console.warn(`[Gemini API] Attempt ${attempt} failed with model ${modelName}:`, error?.message || error);
        
        // Wait and double the delay for exponential backoff if retrying this model
        if (attempt < attempts) {
          console.log(`[Gemini API] Retrying ${modelName} in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay = delay * 2;
        }
      }
    }
    console.warn(`[Gemini API] Model ${modelName} failed after all attempts. Trying next fallback model...`);
  }

  throw lastError;
}

// 2. Add WeddingVault Contract Analyzer endpoint
app.post("/api/analyze-contract", upload.single("file"), async (req, res) => {
  try {
    if (!ai) {
      return res.status(500).json({
        error: "Gemini API key is missing or not configured server-side. Please set GEMINI_API_KEY.",
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file was uploaded." });
    }

    const mimeType = req.file.mimetype;
    const base64Data = req.file.buffer.toString("base64");

    const systemPrompt = `결혼 준비 계약서 이미지 또는 PDF입니다. 이 문서에서 관련 업체의 상세 정보를 완벽하게 분석하여 파싱하십시오.
결과물은 반드시 다음의 JSON 스키마를 만족하는 구조화된 JSON 데이터여야 합니다. 다른 불필요한 마크다운, 부가 설명 없이 오직 이 순수 JSON 데이터만 반환하세요:

{
  "vendor_name": "업체 이름 (없으면 빈 문자열)",
  "category": "카테고리 (다음 목록 중 반드시 하나만 정확히 선택: '본식스냅', '웨딩영상', '드레스', '헤어메이크업', '예식장/홀', '한복', '부케/플라워', '신혼여행', '기타')",
  "contract_date": "계약일 (문서상에 없으면 오늘 날짜 기준으로 어림잡거나 null. 형식 YYYY-MM-DD)",
  "event_date": "본식일 또는 이용 예정일 (없으면 null. 형식 YYYY-MM-DD)",
  "total_amount": 총 계약금액 (숫자 정수형, 없으면 0),
  "paid_amount": 이미 납입한 총 계약금/계약금액/선금 (숫자 정수형, 없으면 0),
  "balance_due_date": 잔금 납부 기한 또는 최종정산 기한 (없으면 null. 형식 YYYY-MM-DD)",
  "manager_name": "담당자 이름 또는 대표자 (없으면 null)",
  "manager_phone": "담당자 연락처 (010-XXXX-XXXX 형식, 없으면 null)",
  "memo": "계약의 중요 취소 약관 또는 중요 메모 사항",
  "details": [
    { "구분": "항목구분", "내용": "제공품 주요 상세 사양 설명 및 수량 등", "시점": "상품 제공 시점 또는 완료 시점" }
  ]
}

주의 사항:
1. 'total_amount'와 'paid_amount'는 순수 정수 숫자 형태여야 하며, 특수문자나 쉼표, 한글 '원' 단위 기호가 포함되어서는 안 됩니다. (예: 1500000)
2. 'details' 배열은 계약서상의 구체적인 제공 품목들과 조건(본식 앨범, 메이크업 인원, 원본 파일 제공 여부, 촬영 시간, 드레스 피팅 횟수 등)을 항목별로 깔끔하게 정리하여 기입해 주세요. 만약 별도 상세 정보가 없더라도 파악되는 대표 내용들을 한두개라도 적어주세요.
3. 카테고리는 반드시 목록 중 하나와 일치해야 합니다: '본식스냅', '웨딩영상', '드레스', '헤어메이크업', '예식장/홀', '한복', '부케/플라워', '신혼여행', '기타'.`;

    const response = await generateContentWithRetry(
      ai,
      [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Data,
          },
        },
        {
          text: systemPrompt,
        },
      ],
      {
        responseMimeType: "application/json",
      }
    );

    const textOutput = response.text || "{}";
    const parsedData = JSON.parse(textOutput);

    return res.json(parsedData);
  } catch (error: any) {
    console.error("AI Analysis Error: ", error);
    return res.status(500).json({
      error: "계약서 분석 도중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      details: error?.message || String(error),
    });
  }
});

// Serve Vite or static frontend build path
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[WeddingVault Backend] Server is running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
