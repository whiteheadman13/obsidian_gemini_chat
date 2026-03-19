// Tool definition for Gemini Function Calling
export interface GeminiFunctionDeclaration {
	name: string;
	description: string;
	parameters: {
		type: string;
		properties: Record<string, {
			type: string;
			description: string;
			enum?: string[];
		}>;
		required?: string[];
	};
}

// Tool execution handler
export type ToolExecutor = (functionName: string, args: Record<string, any>) => Promise<any>;

export class GeminiService {
	private apiKey: string;
	private model: string;

	constructor(apiKey: string, model: string = 'gemini-3.1-flash-lite-preview') {
		this.apiKey = apiKey;
		this.model = model;
	}

	async chat(
		messages: Array<{ role: string; content: string }>,
		inlineImages?: Array<{ mimeType: string; data: string }>,
		useGoogleSearch?: boolean
	): Promise<string> {
		const result = await this.chatWithMetadata(messages, inlineImages, useGoogleSearch);
		return result.text;
	}

	async chatWithMetadata(
		messages: Array<{ role: string; content: string }>,
		inlineImages?: Array<{ mimeType: string; data: string }>,
		useGoogleSearch?: boolean
	): Promise<{ text: string; references: string[] }> {
		if (!this.apiKey) {
			throw new Error('Gemini API key is not set');
		}

		const requestBody: any = {
			contents: messages.map((msg, index) => {
				const isLastUser = msg.role === 'user' && index === messages.length - 1;
				const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> =
					[{ text: msg.content }];
				if (isLastUser && inlineImages && inlineImages.length > 0) {
					for (const img of inlineImages) {
						parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
					}
				}
				return { role: msg.role === 'user' ? 'user' : 'model', parts };
			}),
		};

		// Google Search Grounding を有効にする（チェックボックスがONの場合のみ）
		// Gemini APIのREST指定は google_search。
		if (useGoogleSearch) {
			requestBody.tools = [{ google_search: {} }];
		}

		const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=` + this.apiKey, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
		}

		const data = await response.json();
		const text = data.candidates[0]?.content?.parts[0]?.text || '';
		const references: string[] = [];

		// Extract URLs from grounding metadata if available
		const groundingMetadata = data.candidates[0]?.groundingMetadata;
		if (groundingMetadata?.groundingChunks) {
			for (const chunk of groundingMetadata.groundingChunks) {
				if (chunk.web?.uri) {
					references.push(chunk.web.uri);
				}
			}
		}

		// Also extract URLs from the text content as fallback
		const urlRegex = /https?:\/\/[^\s\)\]]+/g;
		const urlsInText = text.match(urlRegex) || [];
		for (const url of urlsInText) {
			if (!references.includes(url)) {
				references.push(url);
			}
		}

		return { text, references };
	}

	/**
	 * Chat with Function Calling support.
	 * LLM can call tools and this method will execute them and return the final response.
	 */
	async chatWithTools(
		messages: Array<{ role: string; content: string }>,
		functionDeclarations: GeminiFunctionDeclaration[],
		toolExecutor: ToolExecutor,
		maxIterations: number = 5
	): Promise<{ text: string; references: string[]; toolCalls: Array<{ name: string; args: any; result: any }> }> {
		if (!this.apiKey) {
			throw new Error('Gemini API key is not set');
		}

		const references: string[] = [];
		const toolCalls: Array<{ name: string; args: any; result: any }> = [];
		
		// Build conversation history with tool calls
		const conversationHistory: any[] = messages.map(msg => ({
			role: msg.role === 'user' ? 'user' : 'model',
			parts: [{ text: msg.content }],
		}));

		for (let iteration = 0; iteration < maxIterations; iteration++) {
			const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=` + this.apiKey, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					contents: conversationHistory,
					tools: [
						{
							functionDeclarations: functionDeclarations
						}
					]
				}),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
			}

			const data = await response.json();
			const candidate = data.candidates[0];
			
			if (!candidate?.content) {
				throw new Error('No content in Gemini response');
			}

			// Extract grounding references
			const groundingMetadata = candidate.groundingMetadata;
			if (groundingMetadata?.groundingChunks) {
				for (const chunk of groundingMetadata.groundingChunks) {
					if (chunk.web?.uri && !references.includes(chunk.web.uri)) {
						references.push(chunk.web.uri);
					}
				}
			}

			const parts = candidate.content.parts || [];
			
			// Check if there's a function call
			const functionCallParts = parts.filter((p: any) => p.functionCall);
			
			if (functionCallParts.length === 0) {
				// No function call, this is the final text response
				const textPart = parts.find((p: any) => p.text);
				const text = textPart?.text || '';
				
				// Extract URLs from text
				const urlRegex = /https?:\/\/[^\s\)\]]+/g;
				const urlsInText = text.match(urlRegex) || [];
				for (const url of urlsInText) {
					if (!references.includes(url)) {
						references.push(url);
					}
				}
				
				return { text, references, toolCalls };
			}

			// Execute all function calls
			const functionResponses: any[] = [];
			
			for (const part of functionCallParts) {
				const functionCall = part.functionCall;
				const functionName = functionCall.name;
				const functionArgs = functionCall.args || {};
				
				try {
					const result = await toolExecutor(functionName, functionArgs);
					toolCalls.push({ name: functionName, args: functionArgs, result });
					functionResponses.push({
						functionResponse: {
							name: functionName,
							response: { result }
						}
					});
				} catch (error) {
					const errorMessage = (error as Error).message || String(error);
					functionResponses.push({
						functionResponse: {
							name: functionName,
							response: { error: errorMessage }
						}
					});
				}
			}

			// Add model's function call to conversation
			conversationHistory.push({
				role: 'model',
				parts: functionCallParts
			});

			// Add function responses to conversation
			conversationHistory.push({
				role: 'user',
				parts: functionResponses
			});
		}

		// Max iterations reached
		throw new Error(`Max tool call iterations (${maxIterations}) reached without final response`);
	}

	/**
	 * Gemini Embedding APIでテキストを1件ベクトル化する
	 */
	async embedText(text: string, embeddingModel: string = 'gemini-embedding-001'): Promise<number[]> {
		if (!this.apiKey) {
			throw new Error('Gemini API key is not set');
		}

		const requested = embeddingModel.trim().replace(/^models\//, '') || 'gemini-embedding-001';
		const fallback = 'gemini-embedding-001';
		const candidates = requested === fallback ? [requested] : [requested, fallback];

		let lastError: Error | null = null;
		for (const model of candidates) {
			const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=` + this.apiKey, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					content: {
						parts: [{ text }],
					},
				}),
			});

			if (response.ok) {
				const data = await response.json();
				const values = data.embedding?.values;
				if (!Array.isArray(values) || values.length === 0) {
					throw new Error('Gemini Embedding API returned empty embedding values');
				}
				return values;
			}

			const errorText = await response.text();
			lastError = new Error(`Gemini Embedding API error: ${response.status} - ${errorText}`);

			// If model is missing/unsupported, try fallback model.
			if (response.status !== 404) {
				throw lastError;
			}
		}

		throw lastError ?? new Error('Gemini Embedding API request failed');
	}

	/**
	 * Gemini Embedding APIでテキスト配列を順次ベクトル化する
	 */
	async embedTexts(texts: string[], embeddingModel: string = 'gemini-embedding-001'): Promise<number[][]> {
		const vectors: number[][] = [];
		for (const text of texts) {
			vectors.push(await this.embedText(text, embeddingModel));
		}
		return vectors;
	}

	/**
	 * AIに短いタイトルを提案させる
	 */
	async generateTitle(prompt: string): Promise<string> {
		if (!this.apiKey) {
			throw new Error('Gemini API key is not set');
		}

		const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=` + this.apiKey, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				contents: [{
					role: 'user',
					parts: [{ text: prompt }],
				}],
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
		}

		const data = await response.json();
		const candidates = data.contents?.[0]?.parts || [];
		const textPart = candidates.find((p: any) => p.text);
		const text = textPart?.text || '';

		// テキストから最初の行（最短のタイトル）を抽出
		const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
		return lines[0] || '新しいノート';
	}
}
