export class GeminiService {
	private apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
		const result = await this.chatWithMetadata(messages);
		return result.text;
	}

	async chatWithMetadata(messages: Array<{ role: string; content: string }>): Promise<{ text: string; references: string[] }> {
		if (!this.apiKey) {
			throw new Error('Gemini API key is not set');
		}

		const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + this.apiKey, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				contents: messages.map(msg => ({
					role: msg.role === 'user' ? 'user' : 'model',
					parts: [{ text: msg.content }],
				})),
				tools: [{
					googleSearch: {}
				}]
			}),
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
}
