import InteractiveAgentService from './interactiveAgentService';
import { App } from 'obsidian';
import type MyPlugin from '../main';
import { GeminiService } from '../geminiService';

export function createAgent(app: App, plugin: MyPlugin, goal: string, apiKey?: string, interactive: boolean = true) {
    const gemini = apiKey ? new GeminiService(apiKey) : undefined;
    return new InteractiveAgentService(app, plugin, goal, gemini, interactive);
}

export default createAgent;
