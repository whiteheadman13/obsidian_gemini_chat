export class GeminiService {
	private apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
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
			}),
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
		}

		const data = await response.json();
		return data.candidates[0]?.content?.parts[0]?.text || '';
	}
}
