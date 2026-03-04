import { App, TFile } from 'obsidian';

export interface AgentSessionData {
    goal: string;
    status: 'planning' | 'executing' | 'waiting' | 'completed' | 'error';
    plan: string[];
    currentStep: number;
    executionLog: Array<{
        step: number;
        description: string;
        status: 'pending' | 'running' | 'completed' | 'error';
        result?: string;
        userFeedback?: string;
        inputRequired?: string;
        references?: string[];
    }>;
}

export class AgentSessionNote {
    private app: App;
    private file: TFile | null = null;
    private sessionData: AgentSessionData;

    constructor(app: App, goal: string) {
        this.app = app;
        this.sessionData = {
            goal,
            status: 'planning',
            plan: [],
            currentStep: 0,
            executionLog: [],
        };
    }

    async create(): Promise<TFile> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const safeGoal = this.sessionData.goal
            .replace(/[:\\/*?"<>|]/g, '-')
            .slice(0, 50);
        const filename = `Agent_Session_${timestamp}_${safeGoal}.md`;
        const path = `Agent Sessions/${filename}`;

        // Ensure folder exists
        await this.ensureFolder('Agent Sessions');

        // Create initial note content
        const content = this.generateNoteContent();

        this.file = await this.app.vault.create(path, content);
        return this.file;
    }

    async update(): Promise<void> {
        if (!this.file) {
            throw new Error('Session note not created yet');
        }

        // Log userFeedback state before generating content
        console.log('[AgentSessionNote] update() called - checking userFeedback state:');
        this.sessionData.executionLog.forEach((log, idx) => {
            if (log.userFeedback) {
                console.log(`  Step ${idx + 1}: ${log.userFeedback.substring(0, 50)}...`);
            } else {
                console.log(`  Step ${idx + 1}: (empty)`);
            }
        });

        const content = this.generateNoteContent();
        await this.app.vault.modify(this.file, content);
        console.log('[AgentSessionNote] Note updated successfully');
    }

    async readFromNote(): Promise<void> {
        if (!this.file) {
            throw new Error('Session note not created yet');
        }

        console.log('[AgentSessionNote] Reading note from:', this.file.path);
        const content = await this.app.vault.read(this.file);
        console.log('[AgentSessionNote] Note content length:', content.length);
        
        // Parse frontmatter first
        this.parseFrontmatter(content);
        
        // Then parse content
        this.parseNoteContent(content);
        
        // Log current userFeedback state
        this.sessionData.executionLog.forEach((log, idx) => {
            if (log.userFeedback) {
                console.log(`[AgentSessionNote] After parse - Step ${idx + 1} has feedback:`, log.userFeedback.substring(0, 50));
            }
        });
    }

    getFile(): TFile | null {
        return this.file;
    }

    setFile(file: TFile): void {
        this.file = file;
    }

    getData(): AgentSessionData {
        return this.sessionData;
    }

    setStatus(status: AgentSessionData['status']): void {
        this.sessionData.status = status;
    }

    setPlan(plan: string[]): void {
        this.sessionData.plan = plan;
        // Initialize execution log
        this.sessionData.executionLog = plan.map((desc, idx) => ({
            step: idx + 1,
            description: desc,
            status: 'pending',
        }));
    }

    updateStepStatus(step: number, status: 'running' | 'completed' | 'error', result?: string, inputRequired?: string, references?: string[]): void {
        const logEntry = this.sessionData.executionLog[step - 1];
        if (logEntry) {
            logEntry.status = status;
            if (result) {
                logEntry.result = result;
            }
            if (inputRequired) {
                logEntry.inputRequired = inputRequired;
            }
            if (references && references.length > 0) {
                logEntry.references = references;
            }
        }
    }

    setCurrentStep(step: number): void {
        this.sessionData.currentStep = step;
    }

    private generateNoteContent(): string {
        const lines: string[] = [];

        // Frontmatter
        lines.push('---');
        lines.push('agent-session: true');
        lines.push(`goal: "${this.sessionData.goal.replace(/"/g, '\\"')}"`);
        lines.push(`status: ${this.sessionData.status}`);
        lines.push(`current-step: ${this.sessionData.currentStep}`);
        lines.push('---');
        lines.push('');

        // Title
        lines.push(`# Agent Session`);
        lines.push('');

        // Goal
        lines.push('## 🎯 Goal');
        lines.push('');
        lines.push(this.sessionData.goal);
        lines.push('');

        // Status indicator
        const statusEmoji = {
            planning: '📋',
            executing: '⚙️',
            waiting: '⏸️',
            completed: '✅',
            error: '❌',
        };
        lines.push(`**Status:** ${statusEmoji[this.sessionData.status]} ${this.sessionData.status.toUpperCase()}`);
        lines.push('');

        // Plan section
        lines.push('## 📝 Plan');
        lines.push('');
        if (this.sessionData.plan.length === 0) {
            lines.push('_計画を生成中..._');
        } else {
            this.sessionData.plan.forEach((step, idx) => {
                lines.push(`${idx + 1}. ${step}`);
            });
        }
        lines.push('');
        lines.push('> **💡 ヒント:** この計画を編集できます。編集後、エージェントコマンドを再実行してください。');
        lines.push('');

        // Execution log
        lines.push('## 📊 Execution Log');
        lines.push('');

        if (this.sessionData.executionLog.length === 0) {
            lines.push('_実行ログはまだありません_');
        } else {
            this.sessionData.executionLog.forEach((log) => {
                const statusIcon = {
                    pending: '⏳',
                    running: '▶️',
                    completed: '✅',
                    error: '❌',
                };

                lines.push(`### Step ${log.step}: ${log.description}`);
                lines.push('');
                lines.push(`**Status:** ${statusIcon[log.status]} ${log.status}`);
                lines.push('');

                if (log.result) {
                    lines.push('**Result:**');
                    lines.push('');
                    lines.push(log.result);
                    lines.push('');
                }

                if (log.inputRequired) {
                    lines.push('**⚠️ Input Required:**');
                    lines.push('');
                    lines.push(log.inputRequired);
                    lines.push('');
                }
                
                // Always show answer section for user feedback
                lines.push('**📝 Your Answer:**');
                lines.push('```');
                const feedbackText = log.userFeedback || '_ここに回答を記入してください（Log View のフィードバック欄でも入力可能）_';
                lines.push(feedbackText);
                lines.push('```');
                lines.push('');
                
                console.log(`[AgentSessionNote] generateNoteContent - Step ${log.step} userFeedback:`, log.userFeedback ? log.userFeedback.substring(0, 50) + '...' : 'empty');

                // Add references section if available
                if (log.references && log.references.length > 0) {
                    lines.push('**🔗 References:**');
                    lines.push('');
                    log.references.forEach(url => {
                        lines.push(`- ${url}`);
                    });
                    lines.push('');
                }

                lines.push('---');
                lines.push('');
            });
        }

        // User input section
        lines.push('## 💬 Instructions / Feedback');
        lines.push('');
        lines.push('_ここに追加の指示やフィードバックを記入してください：_');
        lines.push('');
        lines.push('');

        // Collect all references from all steps
        const allReferences: Array<{ step: number; url: string }> = [];
        for (const log of this.sessionData.executionLog) {
            if (log.references && log.references.length > 0) {
                for (const url of log.references) {
                    allReferences.push({ step: log.step, url });
                }
            }
        }

        // Add all references section at the end
        if (allReferences.length > 0) {
            lines.push('');
            lines.push('---');
            lines.push('');
            lines.push('## 📚 All References');
            lines.push('');
            
            // Group by step
            const referencesByStep = new Map<number, string[]>();
            for (const ref of allReferences) {
                if (!referencesByStep.has(ref.step)) {
                    referencesByStep.set(ref.step, []);
                }
                referencesByStep.get(ref.step)!.push(ref.url);
            }
            
            // Output by step
            for (const [stepNum, urls] of Array.from(referencesByStep.entries()).sort((a, b) => a[0] - b[0])) {
                const stepDesc = this.sessionData.plan[stepNum - 1] || `Step ${stepNum}`;
                lines.push(`### Step ${stepNum}: ${stepDesc}`);
                lines.push('');
                // Remove duplicates
                const uniqueUrls = Array.from(new Set(urls));
                uniqueUrls.forEach(url => {
                    lines.push(`- ${url}`);
                });
                lines.push('');
            }
        }

        lines.push('');

        return lines.join('\n');
    }

    private parseFrontmatter(content: string): void {
        const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
        if (!match || !match[1]) return;

        const lines = match[1].split('\n');
        for (const line of lines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
                const key = line.substring(0, colonIndex).trim();
                let value = line.substring(colonIndex + 1).trim();
                
                // Remove quotes
                if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.slice(1, -1);
                }
                
                // Update session data based on key
                if (key === 'status') {
                    this.sessionData.status = value as AgentSessionData['status'];
                } else if (key === 'current-step') {
                    this.sessionData.currentStep = parseInt(value) || 0;
                }
            }
        }
    }

    private parseNoteContent(content: string): void {
        // Parse plan section
        const planMatch = content.match(/## 📝 Plan\s*\n\s*\n((?:\d+\..+\n?)+)/);
        if (planMatch && planMatch[1]) {
            const planText = planMatch[1];
            const plan = planText
                .split('\n')
                .filter(line => /^\d+\./.test(line.trim()))
                .map(line => line.replace(/^\d+\.\s*/, '').trim())
                .filter(line => line);
            
            if (plan.length > 0) {
                this.sessionData.plan = plan;
                // Re-initialize execution log based on plan
                if (this.sessionData.executionLog.length === 0) {
                    this.sessionData.executionLog = plan.map((desc, idx) => ({
                        step: idx + 1,
                        description: desc,
                        status: 'pending',
                    }));
                }
            }
        }

        // Parse execution log section to restore step statuses and user answers
        const logSectionMatch = content.match(/## 📊 Execution Log\s*\n\s*\n([\s\S]*?)(?=\n## |$)/);
        if (logSectionMatch && logSectionMatch[1]) {
            const logContent = logSectionMatch[1];
            
            // Match each step header first, then slice using next step header index.
            // This avoids truncation when Gemini advice contains '---' in the Result block.
            const stepPattern = /### Step (\d+): (.+?)\n\s*\n\*\*Status:\*\* [^\s]+ (\w+)/g;
            const stepMatches = Array.from(logContent.matchAll(stepPattern));

            for (let idx = 0; idx < stepMatches.length; idx++) {
                const match = stepMatches[idx];
                if (!match || !match[1] || !match[2] || !match[3]) continue;

                const stepNum = parseInt(match[1]);
                const description = match[2];
                const status = match[3] as 'pending' | 'running' | 'completed' | 'error';

                // Update or create log entry
                const logEntry = this.sessionData.executionLog[stepNum - 1];
                if (logEntry) {
                    logEntry.status = status;
                    // Only sync description if it differs from plan - don't overwrite with stale data
                    const currentPlanDesc = this.sessionData.plan[stepNum - 1];
                    if (currentPlanDesc && currentPlanDesc !== description) {
                        console.log(`[parseNoteContent] Step ${stepNum}: note description differs from plan. Keeping plan value:`, currentPlanDesc);
                        logEntry.description = currentPlanDesc;
                    } else if (!currentPlanDesc) {
                        // No plan yet, use note description
                        logEntry.description = description;
                    }

                    const startIndex = match.index ?? 0;
                    const nextMatch = stepMatches[idx + 1];
                    const endIndex = (nextMatch?.index ?? logContent.length);
                    const stepText = logContent.substring(startIndex, endIndex);
                    
                    console.log(`[AgentSessionNote] Parsing Step ${stepNum}...`);
                    
                    // Extract result (no longer wrapped in code blocks)
                    const resultMatch = stepText.match(/\*\*Result:\*\*\s*\n\s*\n([\s\S]*?)(?=\n\s*\n\*\*|$)/);
                    if (resultMatch && resultMatch[1]) {
                        logEntry.result = resultMatch[1].trim();
                        console.log(`[AgentSessionNote] Step ${stepNum} result found`);
                    }
                    
                    // Extract "📝 Your Answer" section
                    // Pattern: **📝 Your Answer:** \n ``` \n <content> \n ```
                    const answerMatch = stepText.match(/\*\*📝 Your Answer:\*\*\s*\n```\s*\n([\s\S]*?)\n```/);
                    if (answerMatch && answerMatch[1]) {
                        const answer = answerMatch[1].trim();
                        console.log(`[AgentSessionNote] Step ${stepNum} answer content found:`, answer.substring(0, 100));
                        
                        // Only use non-empty answers (not the placeholder text)
                        if (answer && answer.length > 0 && !answer.includes('ここに回答を記入してください')) {
                            logEntry.userFeedback = answer;
                            console.log(`[AgentSessionNote] Step ${stepNum} userFeedback SET:`, answer.substring(0, 50) + '...');
                        } else {
                            console.log(`[AgentSessionNote] Step ${stepNum} answer is placeholder or empty, not setting userFeedback`);
                        }
                    } else {
                        console.log(`[AgentSessionNote] Step ${stepNum} answer section NOT found with pattern`);
                        console.log(`[AgentSessionNote] Step ${stepNum} attempting fallback pattern...`);
                        // Fallback: try to find answer section with more lenient spacing
                        const fallbackMatch = stepText.match(/\*\*📝 Your Answer:\*\*[\s\S]*?```([\s\S]*?)```/);
                        if (fallbackMatch && fallbackMatch[1]) {
                            const answer = fallbackMatch[1].trim();
                            console.log(`[AgentSessionNote] Step ${stepNum} fallback found:`, answer.substring(0, 100));
                            if (answer && answer.length > 0 && !answer.includes('ここに回答を記入してください')) {
                                logEntry.userFeedback = answer;
                                console.log(`[AgentSessionNote] Step ${stepNum} userFeedback SET (fallback):`, answer.substring(0, 50) + '...');
                            }
                        } else {
                            console.log(`[AgentSessionNote] Step ${stepNum} fallback also failed`);
                        }
                    }
                    
                    // Extract references section
                    const referencesMatch = stepText.match(/\*\*🔗 References:\*\*\s*\n\s*\n((?:- .+\n?)*)/);
                    if (referencesMatch && referencesMatch[1]) {
                        const referencesText = referencesMatch[1];
                        const urls = referencesText
                            .split('\n')
                            .filter(line => line.trim().startsWith('- '))
                            .map(line => line.replace(/^- /, '').trim())
                            .filter(url => url);
                        if (urls.length > 0) {
                            logEntry.references = urls;
                            console.log(`[AgentSessionNote] Step ${stepNum} references found: ${urls.length} URLs`);
                        }
                    }
                }
            }
        }

        // Parse user feedback from the last section
        const feedbackMatch = content.match(/## 💬 Instructions \/ Feedback\s*\n\s*\n_.*?_\s*\n\s*\n([\s\S]*?)$/);
        if (feedbackMatch && feedbackMatch[1]) {
            const feedback = feedbackMatch[1].trim();
            if (feedback && this.sessionData.currentStep > 0) {
                const logEntry = this.sessionData.executionLog[this.sessionData.currentStep - 1];
                if (logEntry) {
                    logEntry.userFeedback = feedback;
                }
            }
        }
    }

    private async ensureFolder(folder: string): Promise<void> {
        try {
            const abstractFile = this.app.vault.getAbstractFileByPath(folder);
            if (!abstractFile) {
                await this.app.vault.createFolder(folder);
            }
        } catch (e) {
            // Folder might already exist
        }
    }
}
