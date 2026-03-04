import { App, TFile, Notice } from 'obsidian';

export interface AgentTemplate {
    templatePath: string;
    approach: string;
    definition: string;
    recordingMethod: string;
    notesList: string[];
    referenceNotes: string[];
    rawContent: string;
}

/**
 * Handles reading and parsing agent template files
 * Template should have the following sections:
 * 
 * ## 課題整理の進め方
 * ## 課題の定義
 * ## 課題の記載方法
 * ## 課題ノート一覧
 * ## その他参考とするノート
 */
export class AgentTemplateService {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    /**
     * Load and parse template file from given path
     */
    async loadTemplate(templatePath: string): Promise<AgentTemplate> {
        try {
            const file = this.app.vault.getAbstractFileByPath(templatePath);
            if (!file || !(file instanceof TFile)) {
                throw new Error(`Template file not found: ${templatePath}`);
            }

            const content = await this.app.vault.read(file);
            return this.parseTemplate(content, templatePath);
        } catch (e) {
            console.error(`Failed to load template: ${e}`);
            throw e;
        }
    }

    /**
     * Get list of available markdown files in vault for template selection
     */
    getAvailableMarkdownFiles(): TFile[] {
        return this.app.vault.getMarkdownFiles()
            .sort((a, b) => a.path.localeCompare(b.path, 'ja'));
    }

    /**
     * Parse template content into structured format
     */
    private parseTemplate(content: string, templatePath: string): AgentTemplate {
        const sections = this.extractSections(content);

        return {
            templatePath,
            approach: sections['課題整理の進め方'] || '',
            definition: sections['課題の定義'] || '',
            recordingMethod: sections['課題の記載方法'] || '',
            notesList: this.parseListSection(sections['課題ノート一覧'] || ''),
            referenceNotes: this.parseListSection(sections['その他参考とするノート'] || ''),
            rawContent: content,
        };
    }

    /**
     * Extract sections from markdown by h2 headers
     */
    private extractSections(content: string): { [key: string]: string } {
        const sections: { [key: string]: string } = {};
        const lines = content.split('\n');
        
        let currentSection = '';
        let currentContent: string[] = [];

        for (const line of lines) {
            const h2Match = line.match(/^##\s+(.+?)(?:\s*#.*)?$/);
            if (h2Match && h2Match[1]) {
                // Save previous section
                if (currentSection) {
                    sections[currentSection] = currentContent.join('\n').trim();
                }
                currentSection = h2Match[1].trim();
                currentContent = [];
            } else if (currentSection) {
                currentContent.push(line);
            }
        }

        // Save last section
        if (currentSection) {
            sections[currentSection] = currentContent.join('\n').trim();
        }

        return sections;
    }

    /**
     * Parse list items from section content
     * Expects markdown list format (- item or * item)
     */
    private parseListSection(content: string): string[] {
        if (!content) return [];
        
        return content
            .split('\n')
            .map(line => {
                // Match list items starting with - or *
                const match = line.match(/^[\s]*[-*]\s+(.+)$/);
                return match && match[1] ? match[1].trim() : null;
            })
            .filter((item): item is string => item !== null && item.length > 0);
    }

    /**
     * Format template into system prompt context
     */
    formatAsSystemPrompt(template: AgentTemplate): string {
        let prompt = '';

        if (template.approach) {
            prompt += `【課題整理の進め方】\n${template.approach}\n\n`;
        }

        if (template.definition) {
            prompt += `【課題の定義】\n${template.definition}\n\n`;
        }

        if (template.recordingMethod) {
            prompt += `【課題の記載方法】\n${template.recordingMethod}\n\n`;
        }

        if (template.notesList.length > 0) {
            prompt += `【課題ノート一覧】\n${template.notesList.map(n => `- ${n}`).join('\n')}\n\n`;
        }

        if (template.referenceNotes.length > 0) {
            prompt += `【参考ノート】\n${template.referenceNotes.map(n => `- ${n}`).join('\n')}\n\n`;
        }

        return prompt.trim();
    }

    /**
     * Load and read content of notes from template's reference list
     */
    async loadReferenceNoteContents(notesList: string[]): Promise<{ [key: string]: string }> {
        const contents: { [key: string]: string } = {};

        for (const noteName of notesList) {
            try {
                // Try to find file by path or name
                let file: TFile | null = null;
                
                // First try exact path match
                const fileByPath = this.app.vault.getAbstractFileByPath(noteName);
                if (fileByPath instanceof TFile) {
                    file = fileByPath;
                } else {
                    // Try to find by name (with .md extension)
                    const nameWithoutExt = noteName.replace(/\.md$/, '');
                    const markdownFiles = this.app.vault.getMarkdownFiles();
                    file = markdownFiles.find(f => 
                        f.path === noteName || 
                        f.path === `${noteName}.md` ||
                        f.basename === nameWithoutExt
                    ) || null;
                }

                if (file) {
                    const content = await this.app.vault.read(file);
                    contents[noteName] = content;
                } else {
                    console.warn(`Reference note not found: ${noteName}`);
                }
            } catch (e) {
                console.error(`Failed to load reference note ${noteName}: ${e}`);
            }
        }

        return contents;
    }
}
