import AgentService from './agentService';
import { App } from 'obsidian';
import type MyPlugin from '../main';
import { GeminiService } from '../geminiService';

export function createAgent(app: App, plugin: MyPlugin, apiKey?: string) {
    const gemini = apiKey ? new GeminiService(apiKey) : undefined;
    return new AgentService(app, plugin, gemini);
}

export default createAgent;
