import { GoogleGenAI, Type } from '@google/genai';

export interface HardwareDiagnosticRequest {
  imageBase64: string;
  mimeType?: string;
  deviceCategory?: string;
  symptoms?: string;
}

export interface HardwareDiagnosticResult {
  summary: string;
  faultIdentified: {
    component: string;
    probableIssue: string;
    confidenceLevel: 'High' | 'Medium' | 'Low';
    standardsIdentified: string;
    visualIndicators: string[];
  };
  troubleshootingChecklist: string[];
  safetyPrecautions: string[];
  recommendedActions: string[];
  rawMarkdownReport: string;
}

export async function analyzeHardwareImage(req: HardwareDiagnosticRequest): Promise<HardwareDiagnosticResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server. Please check environment configuration.');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });

  // Extract pure base64 payload if data URL was passed
  let base64 = req.imageBase64;
  let mime = req.mimeType || 'image/jpeg';
  if (base64.includes(';base64,')) {
    const parts = base64.split(';base64,');
    const match = parts[0].match(/:(.*?)$/);
    if (match) mime = match[1];
    base64 = parts[1];
  }

  const prompt = `You are a Principal Hardware Diagnostic Engineer & Workplace Technology Specialist with deep expertise in enterprise data centers, server racks, server motherboards, network switches, cables, and workplace devices.

Analyze the uploaded hardware photograph carefully.

Device Context: ${req.deviceCategory || 'Unspecified Hardware Component'}
Observed Symptoms / Operator Notes: ${req.symptoms || 'None provided'}

Provide a rigorous, actionable technical evaluation:
1. Identify the specific hardware component, board zone, pinout, or connector shown in the image.
2. Determine the most probable fault, failure mode, or configuration anomaly (e.g. bulging/leaking electrolytic capacitor, motherboard 7-segment hex debug post code error like 00/D0/55, bent CPU socket LGA/AM4 pins, scorched trace, SFP+ optical transceiver indicator status, cable crimp pinout mismatch like T568A vs T568B, degraded RJ45 latch, port LED status light blinking pattern, or thermal dust occlusion).
3. Identify relevant hardware or electrical standards (e.g. Cat6A T-568B, ATX 24-Pin v2.4, PCIe 4.0/5.0 x16, OM4 Multimode LC, 10GBASE-SR SFP+, USB-C PD 100W, DDR4/DDR5 DIMM).
4. Outline 4 to 8 sequential, step-by-step field troubleshooting steps in a clear logical order (from non-invasive isolation tests to multimeter/oscilloscope/RMA testing).
5. State 3 to 5 critical safety precautions (e.g. disconnect AC mains, discharge high-voltage filter capacitors with resistor probe, ground with anti-static wrist strap, laser optical safety Class 1M, thermal cooldown).
6. Provide recommended repair/replacement actions.
7. Generate a clean, complete Markdown report that can be copied or saved into a field ticket.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mime,
            data: base64
          }
        },
        {
          text: prompt
        }
      ]
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          faultIdentified: {
            type: Type.OBJECT,
            properties: {
              component: { type: Type.STRING },
              probableIssue: { type: Type.STRING },
              confidenceLevel: { type: Type.STRING, enum: ['High', 'Medium', 'Low'] },
              standardsIdentified: { type: Type.STRING },
              visualIndicators: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ['component', 'probableIssue', 'confidenceLevel', 'standardsIdentified', 'visualIndicators']
          },
          troubleshootingChecklist: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          safetyPrecautions: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          recommendedActions: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          rawMarkdownReport: { type: Type.STRING }
        },
        required: [
          'summary',
          'faultIdentified',
          'troubleshootingChecklist',
          'safetyPrecautions',
          'recommendedActions',
          'rawMarkdownReport'
        ]
      }
    }
  });

  const text = response.text;
  if (!text) {
    throw new Error('Gemini API did not return any output text.');
  }

  const parsed = JSON.parse(text) as HardwareDiagnosticResult;
  return parsed;
}
