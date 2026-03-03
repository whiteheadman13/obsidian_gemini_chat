import { ItemView, WorkspaceLeaf } from 'obsidian';

export const AGENT_LOG_VIEW_TYPE = 'agent-log-view';

export interface LogEntry {
    timestamp: Date;
    level: 'info' | 'warn' | 'error' | 'success';
    message: string;
}

export interface FeedbackPromptResult {
    action: 'continue' | 'rerun' | 'deepen';
    feedback: string | null;
}

export class AgentLogView extends ItemView {
    private logContainer: HTMLElement;
    private feedbackContainer?: HTMLElement;
    private feedbackInput?: HTMLTextAreaElement;
    private feedbackResolver?: (result: FeedbackPromptResult) => void;
    private logs: LogEntry[] = [];

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType(): string {
        return AGENT_LOG_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Agent Logs';
    }

    getIcon(): string {
        return 'file-text';
    }

    async onOpen() {
        const container = this.containerEl.children[1] as HTMLElement;
        if (!container) return;
        
        container.empty();
        container.addClass('agent-log-view');
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.height = '100%';

        // Header
        const header = container.createDiv('agent-log-header');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.padding = '8px 12px';
        header.style.borderBottom = '1px solid var(--background-modifier-border)';

        const title = header.createEl('h4', { text: 'Agent Logs' });
        title.style.margin = '0';

        const clearBtn = header.createEl('button', { text: 'Clear' });
        clearBtn.addEventListener('click', () => this.clearLogs());

        // Main content wrapper
        const mainWrapper = container.createDiv();
        mainWrapper.style.display = 'flex';
        mainWrapper.style.flexDirection = 'column';
        mainWrapper.style.flex = '1';
        mainWrapper.style.minHeight = '0';

        // Log container
        this.logContainer = mainWrapper.createDiv('agent-log-content');
        this.logContainer.style.padding = '8px';
        this.logContainer.style.overflowY = 'auto';
        this.logContainer.style.flex = '1';
        this.logContainer.style.fontFamily = 'var(--font-monospace)';
        this.logContainer.style.fontSize = '12px';

        // Feedback container (hidden by default)
        this.feedbackContainer = mainWrapper.createDiv('agent-feedback-section');
        this.feedbackContainer.style.display = 'none';
        this.feedbackContainer.style.borderTop = '1px solid var(--background-modifier-border)';
        this.feedbackContainer.style.padding = '8px';
        this.feedbackContainer.style.backgroundColor = 'var(--background-secondary)';

        // Render existing logs
        this.renderLogs();
    }

    async onClose() {
        // Nothing to clean up
    }

    addLog(level: LogEntry['level'], message: string) {
        const entry: LogEntry = {
            timestamp: new Date(),
            level,
            message,
        };
        this.logs.push(entry);
        this.renderLogEntry(entry);
        
        // Auto-scroll to bottom
        if (this.logContainer) {
            this.logContainer.scrollTop = this.logContainer.scrollHeight;
        }
    }

    clearLogs() {
        this.logs = [];
        if (this.logContainer) {
            this.logContainer.empty();
        }
    }

    private renderLogs() {
        if (!this.logContainer) return;
        this.logContainer.empty();
        this.logs.forEach(entry => this.renderLogEntry(entry));
    }

    private renderLogEntry(entry: LogEntry) {
        if (!this.logContainer) return;

        const logLine = this.logContainer.createDiv('agent-log-line');
        logLine.style.display = 'flex';
        logLine.style.gap = '8px';
        logLine.style.padding = '4px 0';
        logLine.style.borderBottom = '1px solid var(--background-modifier-border-hover)';

        // Timestamp
        const time = logLine.createSpan('log-timestamp');
        time.textContent = this.formatTime(entry.timestamp);
        time.style.color = 'var(--text-muted)';
        time.style.minWidth = '80px';

        // Level badge
        const level = logLine.createSpan('log-level');
        level.textContent = entry.level.toUpperCase();
        level.style.minWidth = '60px';
        level.style.fontWeight = 'bold';
        level.style.textAlign = 'center';
        level.style.padding = '2px 6px';
        level.style.borderRadius = '3px';

        switch (entry.level) {
            case 'info':
                level.style.color = 'var(--text-accent)';
                level.style.backgroundColor = 'var(--background-modifier-border)';
                break;
            case 'warn':
                level.style.color = '#ff9800';
                level.style.backgroundColor = 'rgba(255, 152, 0, 0.1)';
                break;
            case 'error':
                level.style.color = '#f44336';
                level.style.backgroundColor = 'rgba(244, 67, 54, 0.1)';
                break;
            case 'success':
                level.style.color = '#4caf50';
                level.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
                break;
        }

        // Message
        const msg = logLine.createSpan('log-message');
        msg.textContent = entry.message;
        msg.style.flex = '1';
        msg.style.wordBreak = 'break-word';
    }

    private formatTime(date: Date): string {
        const h = date.getHours().toString().padStart(2, '0');
        const m = date.getMinutes().toString().padStart(2, '0');
        const s = date.getSeconds().toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    // Feedback input methods
    showFeedbackPrompt(message: string): Promise<FeedbackPromptResult> {
        return new Promise((resolve) => {
            if (!this.feedbackContainer) return;

            this.feedbackContainer.empty();
            this.feedbackContainer.style.display = 'block';
            this.feedbackResolver = resolve;

            // Message
            const msgEl = this.feedbackContainer.createEl('p');
            msgEl.setText(message);
            msgEl.style.margin = '0 0 8px 0';
            msgEl.style.fontSize = 'var(--font-smallest)';

            // Input label
            const label = this.feedbackContainer.createEl('label', { text: 'フィードバック（任意）:' });
            label.style.display = 'block';
            label.style.marginBottom = '6px';
            label.style.fontWeight = 'bold';
            label.style.fontSize = 'var(--font-smallest)';

            // Feedback input
            this.feedbackInput = this.feedbackContainer.createEl('textarea');
            this.feedbackInput.placeholder = '例: 再実行時の追加指示、深掘りしたい観点など（空欄でも承認して次へ進めます）';
            this.feedbackInput.style.width = '100%';
            this.feedbackInput.style.minHeight = '80px';
            this.feedbackInput.style.marginBottom = '8px';
            this.feedbackInput.style.fontSize = 'var(--font-smallest)';
            this.feedbackInput.focus();

            // Button container
            const buttonContainer = this.feedbackContainer.createDiv();
            buttonContainer.style.display = 'flex';
            buttonContainer.style.gap = '8px';
            buttonContainer.style.justifyContent = 'flex-end';

            // Next task button
            const continueBtn = buttonContainer.createEl('button', { text: '次のタスクに進む' });
            continueBtn.style.padding = '4px 12px';
            continueBtn.addEventListener('click', () => {
                const feedback = this.feedbackInput?.value.trim() || '';
                this.closeFeedbackPrompt();
                if (this.feedbackResolver) {
                    this.feedbackResolver({
                        action: 'continue',
                        feedback: feedback || null,
                    });
                    this.feedbackResolver = undefined;
                }
            });

            // Re-run current task button
            const rerunBtn = buttonContainer.createEl('button', { text: 'タスク再実行' });
            rerunBtn.style.padding = '4px 12px';
            rerunBtn.addEventListener('click', () => {
                const feedback = this.feedbackInput?.value.trim() || '';
                this.closeFeedbackPrompt();
                if (this.feedbackResolver) {
                    this.feedbackResolver({
                        action: 'rerun',
                        feedback: feedback || null,
                    });
                    this.feedbackResolver = undefined;
                }
            });

            // Deep-dive current task button
            const deepenBtn = buttonContainer.createEl('button', { text: '再深掘り' });
            deepenBtn.style.padding = '4px 12px';
            deepenBtn.addEventListener('click', () => {
                const feedback = this.feedbackInput?.value.trim() || '';
                this.closeFeedbackPrompt();
                if (this.feedbackResolver) {
                    this.feedbackResolver({
                        action: 'deepen',
                        feedback: feedback || null,
                    });
                    this.feedbackResolver = undefined;
                }
            });
        });
    }

    closeFeedbackPrompt() {
        if (this.feedbackContainer) {
            this.feedbackContainer.style.display = 'none';
            this.feedbackContainer.empty();
        }
        this.feedbackInput = undefined;
    }
}
