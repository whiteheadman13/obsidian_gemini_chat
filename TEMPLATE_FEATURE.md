# エージェント テンプレート機能 - 実装ガイド

## 概要

Obsidian Gemini Pluginに「エージェント テンプレート機能」を追加しました。この機能により、事前に準備したテンプレートファイルをエージェント実行時に読み込み、タスク計画や実行時の判断材料として活用できます。

## 実装内容

### 1. 新規ファイル

#### [agentTemplateService.ts](src/agent/agentTemplateService.ts)
- テンプレートファイルの読み込みと解析を担当
- テンプレートから構造化情報を抽出
- システムプロンプトへの統合

**主要メソッド:**
- `loadTemplate(path)` - テンプレートファイルを読み込み
- `parseTemplate(content, path)` - テンプレートを解析
- `formatAsSystemPrompt(template)` - システムプロンプト用に整形
- `loadReferenceNoteContents(notesList)` - 参照ノートを読み込み

### 2. 修正ファイル

#### [interactiveAgentService.ts](src/agent/interactiveAgentService.ts)
- コンストラクタに`templatePath`パラメータを追加
- `run()`メソッドを拡張してテンプレート読み込みを実装
- `generatePlan()`と`executeStep()`でテンプレート情報をプロンプトに統合

#### [adkAgent.ts](src/agent/adkAgent.ts)
- `createAgent()`関数に`templatePath`パラメータを追加
- テンプレート機能をサポート

#### [settings.ts](src/settings.ts)
- `MyPluginSettings`に`agentTemplateFile`プロパティを追加
- 設定画面にテンプレートファイル選択フィールドを追加

#### [main.ts](src/main.ts)
- エージェント起動コマンドで設定済みテンプレートパスを渡すよう修正

#### [folderAccessControl.test.ts](src/folderAccessControl.test.ts)
- テスト設定に`agentTemplateFile`プロパティを追加

### 3. サンプルテンプレートファイル

#### [課題整理テンプレート.md](課題整理テンプレート.md)
- テンプレートの標準形式を定義
- 以下のセクションで構成：
  - 課題整理の進め方
  - 課題の定義
  - 課題の記載方法
  - 課題ノート一覧
  - その他参考とするノート

## 使用方法

### 1. テンプレートファイルの準備

テンプレートファイルは以下のセクションで構成します：

```markdown
# カスタム課題テンプレート

## 課題整理の進め方
[課題整理プロセスの説明]

## 課題の定義
[課題定義の説明]

## 課題の記載方法
[記載方法の説明]

## 課題ノート一覧
- ノート1.md
- ノート2.md

## その他参考とするノート
- 参考資料1.md
- 参考資料2.md
```

### 2. プラグイン設定でテンプレートを指定

1. **Settings → Personal Obsidian Gemini**を開く
2. **「エージェントテンプレート」** セクションを探す
3. **「テンプレートファイル」** に希望するテンプレートファイルのパスを入力またはドロップダウンから選択

### 3. エージェント実行

エージェント実行時（対話型/非対話型）、設定済みのテンプレートファイルが自動的に読み込まれます：

```
Obsidian → コマンドパレット(Ctrl/Cmd+P)
→ 「Start Interactive Agent」または「Start Agent」を実行
→ ゴール入力
→ エージェントが自動的にテンプレートを読み込んで実行
```

## テンプレート情報の利用フロー

```
テンプレートファイル
    ↓
AgentTemplateService.loadTemplate()
    ↓
セクション解析・構造化
    ↓
formatAsSystemPrompt()でテンプレート化
    ↓
計画生成時と実行時のプロンプトに統合
    ↓
エージェントの判断品質向上
```

## API仕様

### AgentTemplateService クラス

```typescript
interface AgentTemplate {
    templatePath: string;
    approach: string;        // 課題整理の進め方
    definition: string;      // 課題の定義
    recordingMethod: string; // 課題の記載方法
    notesList: string[];     // 課題ノート一覧
    referenceNotes: string[]; // その他参考とするノート
    rawContent: string;      // 元のファイル内容
}

class AgentTemplateService {
    loadTemplate(templatePath: string): Promise<AgentTemplate>
    getAvailableMarkdownFiles(): TFile[]
    loadReferenceNoteContents(notesList: string[]): Promise<{ [key: string]: string }>
    formatAsSystemPrompt(template: AgentTemplate): string
}
```

### InteractiveAgentService コンストラクタ

```typescript
constructor(
    app: App,
    plugin: MyPlugin,
    goal: string,
    gemini?: GeminiService,
    interactive: boolean = true,
    templatePath?: string  // 新規パラメータ
)
```

### createAgent 関数

```typescript
export function createAgent(
    app: App,
    plugin: MyPlugin,
    goal: string,
    apiKey?: string,
    interactive: boolean = true,
    templatePath?: string  // 新規パラメータ
): InteractiveAgentService
```

## ベストプラクティス

### テンプレート設計のポイント

1. **セクション名は固定にする**
   - システムが認識するセクション名は以下の通り：
     - `## 課題整理の進め方`
     - `## 課題の定義`
     - `## 課題の記載方法`
     - `## 課題ノート一覧`
     - `## その他参考とするノート`

2. **リスト形式を正しく使う**
   - 「課題ノート一覧」と「その他参考とするノート」は`-`で始まるリスト形式

3. **内容は簡潔に**
   - 複雑な記載は避ける
   - 要点を絞った説明が最適

4. **参考ノートの選定は慎重に**
   - 本当に必要な資料のみを指定
   - 多すぎるとトークン数が増加してコスト増加

### 複数テンプレートの使い分け

組織やプロジェクトごとに異なるテンプレートを用意できます：

- `課題整理テンプレート.md` (標準)
- `営業テンプレート.md` (営業チーム用)
- `開発テンプレート.md` (開発チーム用)

設定でテンプレートファイルを切り替えることで、エージェントの挙動をカスタマイズ可能です。

## トラブルシューティング

### テンプレートが読み込まれない

1. ファイルパスが正しいか確認
2. ファイルが`Mark Down`形式か確認（`.md`拡張子）
3. セクション名が正確か確認

### エージェントログで確認

エージェント実行時にログパネルで以下のメッセージを確認：

- `Loading template: [パス]` - テンプレート読み込み開始
- `Template loaded successfully` - 成功
- `Failed to load template: [エラー]` - 失敗メッセージ

## 技術仕様

### テンプレート解析の詳細

1. **セクション抽出：** `^## +セクション名` でマークダウンヘッダーを認識
2. **リスト解析：** `^[\s]*[-*]\s+item` でリスト項目を抽出
3. **プロンプト統合：** システムプロンプトの末尾にテンプレート情報を追加

### パフォーマンス

- テンプレート読み込み：ブロッキング（約100ms以下）
- 参考ノート読み込み：任意実装（現在未使用）
- プロンプト長に対する影響：約200-500トークン（テンプレートの規模による）

## 将来の拡張案

1. **複数テンプレートの同時使用**
   - メインテンプレート + 補足テンプレートの組み合わせ

2. **テンプレート変数の動的置換**
   - `{{date}}`、`{{vault_name}}` などの変数をサポート

3. **テンプレートプリセット**
   - UI上から定義済みテンプレート選択

4. **テンプレート検証機能**
   - テンプレートの整形性チェック

## まとめ

このテンプレート機能により、エージェントが組織やプロジェクト固有のコンテキスト・プロセスを理解した上で実行されるようになり、より高品質な結果が得られます。
