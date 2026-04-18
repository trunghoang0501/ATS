import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { ExtractionResult } from "../types";
import * as mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";

// Set worker source using a CDN that matches the library version to avoid version mismatch errors
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey! });

export async function parseDocx(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ arrayBuffer });
    if (!result || typeof result.value !== 'string') {
      throw new Error("No text content could be extracted from this Word document.");
    }
    return result.value;
  } catch (error: any) {
    console.error("Error parsing DOCX:", error);
    throw new Error(error.message || "Could not parse DOCX file. Please ensure it is a valid document.");
  }
}

export async function parsePdf(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    // Initialize PDF.js
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
      useSystemFonts: true,
      disableFontFace: false,
    });
    
    const pdf = await loadingTask.promise;
    let fullText = "";
    let isImageBased = true;
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      // Sort items by vertical position (top to bottom) then horizontal (left to right)
      const items = textContent.items as any[];
      items.sort((a, b) => {
        if (Math.abs(a.transform[5] - b.transform[5]) < 5) {
          return a.transform[4] - b.transform[4];
        }
        return b.transform[5] - a.transform[5];
      });

      const pageText = items
        .map((item: any) => item.str)
        .join(" ");
      
      if (pageText.trim()) {
        isImageBased = false;
        fullText += pageText + "\n";
      }
    }
    
    if (isImageBased) {
      // If no text was found, it's likely an image-based PDF (scanned)
      // We'll use Gemini to extract text from the first few pages as images
      console.log("Image-based PDF detected, using Gemini for OCR...");
      fullText = await extractTextFromImagePdf(pdf);
    }
    
    if (!fullText.trim()) {
      throw new Error("No text content found in PDF. It might be an image-based PDF that failed OCR.");
    }
    
    return fullText;
  } catch (error: any) {
    console.error("Error parsing PDF:", error);
    if (error.message?.includes("Worker")) {
      throw new Error("PDF Worker initialization failed. Please refresh the page and try again.");
    }
    throw new Error(error.message || "Could not parse PDF file. Please ensure it is not password protected and contains text.");
  }
}

async function extractTextFromImagePdf(pdf: pdfjsLib.PDFDocumentProxy): Promise<string> {
  let fullText = "";
  // We'll only process the first 3 pages for OCR to keep it fast and within limits
  const pagesToProcess = Math.min(pdf.numPages, 3);
  
  for (let i = 1; i <= pagesToProcess; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    
    if (!context) continue;
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    await page.render({
      canvasContext: context,
      viewport: viewport,
      // @ts-ignore - Some versions of types require canvas element directly
      canvas: canvas
    }).promise;
    
    const base64Image = canvas.toDataURL("image/png").split(",")[1];
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: "Extract all text from this CV page image. Return only the extracted text." },
            { inlineData: { data: base64Image, mimeType: "image/png" } }
          ]
        }
      ],
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        maxOutputTokens: 2048,
      }
    });
    
    fullText += (response.text || "") + "\n";
  }
  
  return fullText;
}

export async function extractCandidateInfo(text: string, jobPosition?: string, jdText?: string): Promise<ExtractionResult> {
  if (!apiKey) {
    throw new Error("Gemini API key is missing. Please set it in the environment.");
  }

  const prompt = jdText 
    ? `You are an expert recruitment AI. Analyze the following CV text against the provided Job Description (JD)${jobPosition ? ` for the position of "${jobPosition}"` : ""}.
    
    [JOB_DESCRIPTION_START]
    ${jdText}
    [JOB_DESCRIPTION_END]
    
    [CV_START]
    ${text}
    [CV_END]
    
    INSTRUCTIONS:
    1. Extract the candidate's full name, email, and phone.
    2. Estimate years of experience (use 0 if not clear).
    3. Identify key skills relevant to the requirements in the JD.
    4. Determine the highest education level.
    5. Provide a comprehensive summary of the candidate's profile.
    6. List the key strengths specifically matching the JD requirements.
    7. List potential gaps or missing requirements specifically compared to the JD.
    8. Calculate a "matchScore" (0-100) based on how precisely the candidate's skills and experience align with the JD requirements.
    9. Identify the job title/position from the JD.
    
    If any information is missing, use an empty string for strings, 0 for numbers, and an empty array for arrays.`
    : `You are an expert recruitment AI. Analyze the following CV text${jobPosition ? ` for the position of "${jobPosition}"` : ""}.
    
    [CV_START]
    ${text}
    [CV_END]
    
    INSTRUCTIONS:
    1. Extract the candidate's full name, email, and phone.
    2. Estimate years of experience (use 0 if not clear).
    3. Identify key skills relevant to the ${jobPosition ? `"${jobPosition}" role` : "target role"}.
    4. Determine the highest education level.
    5. Provide a comprehensive summary of the candidate's profile.
    6. List the key strengths relevant to the role.
    7. List potential weaknesses or missing requirements for the role.
    8. Calculate a "matchScore" (0-100) based on how well the candidate's skills and experience align with the requirements of ${jobPosition ? `a "${jobPosition}"` : "the target position"}.
    9. Identify the target job title/position based on the CV content.
    
    If any information is missing, use an empty string for strings, 0 for numbers, and an empty array for arrays.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      maxOutputTokens: 2048,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          fullName: { type: Type.STRING, description: "Full name of the candidate" },
          email: { type: Type.STRING, description: "Email address" },
          phone: { type: Type.STRING, description: "Phone number" },
          yearsOfExperience: { type: Type.NUMBER, description: "Total years of professional experience" },
          keySkills: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "List of key skills relevant to the target position"
          },
          educationLevel: { type: Type.STRING, description: "Highest degree or education level" },
          matchScore: { type: Type.NUMBER, description: "Score from 0 to 100 representing job fit" },
          summary: { type: Type.STRING, description: "A brief professional summary" },
          strengths: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Key strengths for this specific role"
          },
          weaknesses: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Potential gaps or weaknesses for this specific role"
          },
          jobPosition: { type: Type.STRING, description: "The job title/position being analyzed" }
        },
        required: ["fullName", "email", "phone", "yearsOfExperience", "keySkills", "educationLevel", "matchScore", "summary", "strengths", "weaknesses", "jobPosition"]
      }
    }
  });

  try {
    const text = response.text || "{}";
    // Clean up potential markdown formatting if it exists (though responseMimeType should prevent it)
    const cleanedText = text.replace(/```json\n?|\n?```/g, "").trim();
    const result = JSON.parse(cleanedText) as ExtractionResult;
    
    // Basic validation to ensure required fields are present
    if (!result.fullName || !result.email) {
      throw new Error("The AI was unable to find essential information (Name or Email) in this CV.");
    }
    
    // Ensure arrays are initialized
    result.keySkills = result.keySkills || [];
    result.strengths = result.strengths || [];
    result.weaknesses = result.weaknesses || [];
    
    return result;
  } catch (error: any) {
    console.error("Failed to parse Gemini response:", error);
    if (error.message?.includes("Unexpected token")) {
      throw new Error("The CV analysis was interrupted. Please try a shorter version or a different file.");
    }
    throw new Error(error.message || "Failed to analyze CV data correctly.");
  }
}
