import * as monaco from 'monaco-editor'
import type {
  ExtensionCodeAction,
  ExtensionCodeActionRequest,
  ExtensionCompletionItem,
  ExtensionCompletionRequest,
  ExtensionCompletionResult,
  ExtensionDefinitionRequest,
  ExtensionDocumentSymbol,
  ExtensionFormattingRequest,
  ExtensionHoverRequest,
  ExtensionHoverResult,
  ExtensionInlineCompletionItem,
  ExtensionInlineCompletionRequest,
  ExtensionInlineCompletionResult,
  ExtensionLocation,
  ExtensionOnTypeFormattingRequest,
  ExtensionPrepareRenameResult,
  ExtensionRange,
  ExtensionRangeFormattingRequest,
  ExtensionReferencesRequest,
  ExtensionRenameRequest,
  ExtensionSignatureHelpRequest,
  ExtensionSignatureHelpResult,
  ExtensionTextEdit,
  ExtensionWorkspaceEdit
} from '@/types'

let registered = false

function toMonacoRange(range: ExtensionRange): monaco.IRange {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1
  }
}

function toMonacoUri(uri: string): monaco.Uri {
  return uri.startsWith('file://') ? monaco.Uri.parse(uri) : monaco.Uri.file(uri)
}

function toMonacoLocation(location: ExtensionLocation): monaco.languages.Location {
  return {
    uri: toMonacoUri(location.uri),
    range: toMonacoRange(location.range)
  }
}

function toMonacoTextEdit(edit: ExtensionTextEdit): monaco.languages.TextEdit {
  return {
    range: toMonacoRange(edit.range),
    text: edit.newText
  }
}

function toMonacoWorkspaceEdit(edit: ExtensionWorkspaceEdit): monaco.languages.WorkspaceEdit {
  const edits: monaco.languages.IWorkspaceTextEdit[] = []
  for (const entry of edit.edits) {
    for (const change of entry.edits) {
      edits.push({
        resource: toMonacoUri(entry.uri),
        textEdit: toMonacoTextEdit(change),
        versionId: undefined
      })
    }
  }
  return { edits }
}

function toMonacoHover(result: ExtensionHoverResult): monaco.languages.Hover {
  return {
    contents: result.contents.map(value => ({ value })),
    range: result.range ? toMonacoRange(result.range) : undefined
  }
}

function toMonacoDocumentSymbol(symbol: ExtensionDocumentSymbol): monaco.languages.DocumentSymbol {
  return {
    name: symbol.name,
    detail: symbol.detail ?? '',
    kind: symbol.kind as monaco.languages.SymbolKind,
    range: toMonacoRange(symbol.range),
    selectionRange: toMonacoRange(symbol.selectionRange),
    children: symbol.children?.map(child => toMonacoDocumentSymbol(child)) ?? [],
    tags: []
  }
}

function toMonacoSignatureHelp(result: ExtensionSignatureHelpResult): monaco.languages.SignatureHelp {
  return {
    signatures: result.signatures.map(signature => ({
      label: signature.label,
      documentation: signature.documentation,
      parameters: signature.parameters?.map(parameter => ({
        label: parameter.label,
        documentation: parameter.documentation
      })) ?? []
    })),
    activeSignature: result.activeSignature ?? 0,
    activeParameter: result.activeParameter ?? 0
  }
}

function toMonacoCodeAction(action: ExtensionCodeAction): monaco.languages.CodeAction {
  const command = action.command
    ? {
      id: action.command.command,
      title: action.command.title,
      arguments: action.command.arguments
    }
    : undefined
  return {
    title: action.title,
    kind: action.kind,
    isPreferred: action.isPreferred,
    edit: action.edit ? toMonacoWorkspaceEdit(action.edit) : undefined,
    command
  }
}

function toMonacoCompletionItem(item: ExtensionCompletionItem, fallbackRange: monaco.IRange): monaco.languages.CompletionItem {
  const insertText = item.textEdit?.newText || item.insertText || item.label
  const range = item.textEdit?.range ? toMonacoRange(item.textEdit.range) : fallbackRange
  const insertTextRules = item.insertTextFormat === 2
    ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
    : undefined

  return {
    label: item.label,
    kind: item.kind as monaco.languages.CompletionItemKind,
    detail: item.detail,
    documentation: item.documentation,
    insertText,
    insertTextRules,
    range
  }
}

function toMonacoInlineCompletion(item: ExtensionInlineCompletionItem, fallbackRange: monaco.IRange): monaco.languages.InlineCompletion {
  return {
    insertText: item.insertText,
    range: item.range ? toMonacoRange(item.range) : fallbackRange
  }
}

function buildCompletionRequest(model: monaco.editor.ITextModel, position: monaco.Position, context: monaco.languages.CompletionContext): ExtensionCompletionRequest {
  return {
    uri: model.uri.fsPath,
    position: { line: position.lineNumber - 1, character: position.column - 1 },
    context: {
      triggerKind: context.triggerKind,
      triggerCharacter: context.triggerCharacter
    }
  }
}

function buildInlineCompletionRequest(model: monaco.editor.ITextModel, position: monaco.Position): ExtensionInlineCompletionRequest {
  return {
    uri: model.uri.fsPath,
    position: { line: position.lineNumber - 1, character: position.column - 1 }
  }
}

function buildHoverRequest(model: monaco.editor.ITextModel, position: monaco.Position): ExtensionHoverRequest {
  return {
    uri: model.uri.fsPath,
    position: { line: position.lineNumber - 1, character: position.column - 1 }
  }
}

function buildDefinitionRequest(model: monaco.editor.ITextModel, position: monaco.Position): ExtensionDefinitionRequest {
  return {
    uri: model.uri.fsPath,
    position: { line: position.lineNumber - 1, character: position.column - 1 }
  }
}

function buildReferencesRequest(model: monaco.editor.ITextModel, position: monaco.Position, context: monaco.languages.ReferenceContext): ExtensionReferencesRequest {
  return {
    uri: model.uri.fsPath,
    position: { line: position.lineNumber - 1, character: position.column - 1 },
    context: { includeDeclaration: context.includeDeclaration }
  }
}

function buildSignatureHelpRequest(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  context?: monaco.languages.SignatureHelpContext
): ExtensionSignatureHelpRequest {
  const safeContext = context ?? {
    triggerKind: monaco.languages.SignatureHelpTriggerKind.Invoke,
    isRetrigger: false
  }
  return {
    uri: model.uri.fsPath,
    position: { line: position.lineNumber - 1, character: position.column - 1 },
    context: {
      triggerKind: safeContext.triggerKind,
      triggerCharacter: safeContext.triggerCharacter,
      isRetrigger: safeContext.isRetrigger
    }
  }
}

function buildCodeActionRequest(model: monaco.editor.ITextModel, range: monaco.IRange, context: monaco.languages.CodeActionContext): ExtensionCodeActionRequest {
  const triggerKind = context.trigger === monaco.languages.CodeActionTriggerType.Invoke ? 1 : 2
  const only = typeof context.only === 'string'
    ? context.only
    : (context.only as { value?: string } | undefined)?.value
  return {
    uri: model.uri.fsPath,
    range: {
      start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
      end: { line: range.endLineNumber - 1, character: range.endColumn - 1 }
    },
    context: {
      only,
      triggerKind
    }
  }
}

function buildFormattingOptions(model: monaco.editor.ITextModel): { tabSize: number; insertSpaces: boolean } {
  const options = model.getOptions()
  return {
    tabSize: options.tabSize,
    insertSpaces: options.insertSpaces
  }
}

function buildFormattingRequest(model: monaco.editor.ITextModel): ExtensionFormattingRequest {
  return {
    uri: model.uri.fsPath,
    options: buildFormattingOptions(model)
  }
}

function buildRangeFormattingRequest(model: monaco.editor.ITextModel, range: monaco.IRange): ExtensionRangeFormattingRequest {
  return {
    uri: model.uri.fsPath,
    range: {
      start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
      end: { line: range.endLineNumber - 1, character: range.endColumn - 1 }
    },
    options: buildFormattingOptions(model)
  }
}

function buildOnTypeFormattingRequest(model: monaco.editor.ITextModel, position: monaco.Position, ch: string): ExtensionOnTypeFormattingRequest {
  return {
    uri: model.uri.fsPath,
    position: { line: position.lineNumber - 1, character: position.column - 1 },
    ch,
    options: buildFormattingOptions(model)
  }
}

function buildRenameRequest(model: monaco.editor.ITextModel, position: monaco.Position, newName: string): ExtensionRenameRequest {
  return {
    uri: model.uri.fsPath,
    position: { line: position.lineNumber - 1, character: position.column - 1 },
    newName
  }
}

async function fetchCompletions(request: ExtensionCompletionRequest): Promise<ExtensionCompletionResult | null> {
  if (!window.electronAPI?.extensions?.provideCompletions) {
    return null
  }
  try {
    return await window.electronAPI.extensions.provideCompletions(request)
  } catch (error) {
    console.error('[extensions] completion request failed:', error)
    return null
  }
}

async function fetchInlineCompletions(request: ExtensionInlineCompletionRequest): Promise<ExtensionInlineCompletionResult | null> {
  if (!window.electronAPI?.extensions?.provideInlineCompletions) {
    return null
  }
  try {
    return await window.electronAPI.extensions.provideInlineCompletions(request)
  } catch (error) {
    console.error('[extensions] inline completion request failed:', error)
    return null
  }
}

async function fetchHover(request: ExtensionHoverRequest): Promise<ExtensionHoverResult | null> {
  if (!window.electronAPI?.extensions?.provideHover) {
    return null
  }
  try {
    return await window.electronAPI.extensions.provideHover(request)
  } catch (error) {
    console.error('[extensions] hover request failed:', error)
    return null
  }
}

async function fetchDefinition(request: ExtensionDefinitionRequest): Promise<ExtensionLocation[]> {
  if (!window.electronAPI?.extensions?.provideDefinition) {
    return []
  }
  try {
    return await window.electronAPI.extensions.provideDefinition(request)
  } catch (error) {
    console.error('[extensions] definition request failed:', error)
    return []
  }
}

async function fetchImplementation(request: ExtensionDefinitionRequest): Promise<ExtensionLocation[]> {
  if (!window.electronAPI?.extensions?.provideImplementation) {
    return []
  }
  try {
    return await window.electronAPI.extensions.provideImplementation(request)
  } catch (error) {
    console.error('[extensions] implementation request failed:', error)
    return []
  }
}

async function fetchTypeDefinition(request: ExtensionDefinitionRequest): Promise<ExtensionLocation[]> {
  if (!window.electronAPI?.extensions?.provideTypeDefinition) {
    return []
  }
  try {
    return await window.electronAPI.extensions.provideTypeDefinition(request)
  } catch (error) {
    console.error('[extensions] type definition request failed:', error)
    return []
  }
}

async function fetchDeclaration(request: ExtensionDefinitionRequest): Promise<ExtensionLocation[]> {
  if (!window.electronAPI?.extensions?.provideDeclaration) {
    return []
  }
  try {
    return await window.electronAPI.extensions.provideDeclaration(request)
  } catch (error) {
    console.error('[extensions] declaration request failed:', error)
    return []
  }
}

async function fetchReferences(request: ExtensionReferencesRequest): Promise<ExtensionLocation[]> {
  if (!window.electronAPI?.extensions?.provideReferences) {
    return []
  }
  try {
    return await window.electronAPI.extensions.provideReferences(request)
  } catch (error) {
    console.error('[extensions] references request failed:', error)
    return []
  }
}

async function fetchDocumentSymbols(uri: string): Promise<ExtensionDocumentSymbol[]> {
  if (!window.electronAPI?.extensions?.provideDocumentSymbols) {
    return []
  }
  try {
    return await window.electronAPI.extensions.provideDocumentSymbols({ uri })
  } catch (error) {
    console.error('[extensions] document symbols request failed:', error)
    return []
  }
}

async function fetchSignatureHelp(request: ExtensionSignatureHelpRequest): Promise<ExtensionSignatureHelpResult | null> {
  if (!window.electronAPI?.extensions?.provideSignatureHelp) {
    return null
  }
  try {
    return await window.electronAPI.extensions.provideSignatureHelp(request)
  } catch (error) {
    console.error('[extensions] signature help request failed:', error)
    return null
  }
}

async function fetchRenameEdits(request: ExtensionRenameRequest): Promise<ExtensionWorkspaceEdit | null> {
  if (!window.electronAPI?.extensions?.provideRenameEdits) {
    return null
  }
  try {
    return await window.electronAPI.extensions.provideRenameEdits(request)
  } catch (error) {
    console.error('[extensions] rename request failed:', error)
    return null
  }
}

async function fetchPrepareRename(request: ExtensionDefinitionRequest): Promise<ExtensionPrepareRenameResult | null> {
  if (!window.electronAPI?.extensions?.prepareRename) {
    return null
  }
  try {
    return await window.electronAPI.extensions.prepareRename(request)
  } catch (error) {
    console.error('[extensions] prepare rename request failed:', error)
    return null
  }
}

async function fetchCodeActions(request: ExtensionCodeActionRequest): Promise<ExtensionCodeAction[]> {
  if (!window.electronAPI?.extensions?.provideCodeActions) {
    return []
  }
  try {
    return await window.electronAPI.extensions.provideCodeActions(request)
  } catch (error) {
    console.error('[extensions] code action request failed:', error)
    return []
  }
}

async function fetchFormattingEdits(request: ExtensionFormattingRequest): Promise<ExtensionTextEdit[]> {
  if (!window.electronAPI?.extensions?.provideFormattingEdits) {
    return []
  }
  try {
    return await window.electronAPI.extensions.provideFormattingEdits(request)
  } catch (error) {
    console.error('[extensions] formatting request failed:', error)
    return []
  }
}

async function fetchRangeFormattingEdits(request: ExtensionRangeFormattingRequest): Promise<ExtensionTextEdit[]> {
  if (!window.electronAPI?.extensions?.provideRangeFormattingEdits) {
    return []
  }
  try {
    return await window.electronAPI.extensions.provideRangeFormattingEdits(request)
  } catch (error) {
    console.error('[extensions] range formatting request failed:', error)
    return []
  }
}

async function fetchOnTypeFormattingEdits(request: ExtensionOnTypeFormattingRequest): Promise<ExtensionTextEdit[]> {
  if (!window.electronAPI?.extensions?.provideOnTypeFormattingEdits) {
    return []
  }
  try {
    return await window.electronAPI.extensions.provideOnTypeFormattingEdits(request)
  } catch (error) {
    console.error('[extensions] on-type formatting request failed:', error)
    return []
  }
}

export function registerExtensionProviders(): void {
  if (registered) {
    return
  }
  registered = true

  const languageIds = Array.from(new Set(monaco.languages.getLanguages().map(language => language.id)))

  for (const languageId of languageIds) {
    monaco.languages.registerCompletionItemProvider(languageId, {
      provideCompletionItems: async (model, position, context) => {
        const request = buildCompletionRequest(model, position, context)
        const response = await fetchCompletions(request)
        if (!response) {
          return { suggestions: [], incomplete: false }
        }
        const word = model.getWordUntilPosition(position)
        const fallbackRange = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
        const suggestions = response.items.map(item => toMonacoCompletionItem(item, fallbackRange))
        return { suggestions, incomplete: response.isIncomplete ?? false }
      }
    })

    monaco.languages.registerInlineCompletionsProvider(languageId, {
      provideInlineCompletions: async (model, position) => {
        const request = buildInlineCompletionRequest(model, position)
        const response = await fetchInlineCompletions(request)
        if (!response) {
          return { items: [], dispose: () => undefined }
        }
        const fallbackRange = new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)
        const items = response.items.map(item => toMonacoInlineCompletion(item, fallbackRange))
        return { items, dispose: () => undefined }
      },
      freeInlineCompletions: () => undefined
    })

    monaco.languages.registerHoverProvider(languageId, {
      provideHover: async (model, position) => {
        const request = buildHoverRequest(model, position)
        const response = await fetchHover(request)
        if (!response) {
          return null
        }
        return toMonacoHover(response)
      }
    })

    monaco.languages.registerDefinitionProvider(languageId, {
      provideDefinition: async (model, position) => {
        const request = buildDefinitionRequest(model, position)
        const response = await fetchDefinition(request)
        if (!response.length) {
          return null
        }
        return response.map(toMonacoLocation)
      }
    })

    monaco.languages.registerImplementationProvider(languageId, {
      provideImplementation: async (model, position) => {
        const request = buildDefinitionRequest(model, position)
        const response = await fetchImplementation(request)
        if (!response.length) {
          return null
        }
        return response.map(toMonacoLocation)
      }
    })

    monaco.languages.registerTypeDefinitionProvider(languageId, {
      provideTypeDefinition: async (model, position) => {
        const request = buildDefinitionRequest(model, position)
        const response = await fetchTypeDefinition(request)
        if (!response.length) {
          return null
        }
        return response.map(toMonacoLocation)
      }
    })

    monaco.languages.registerDeclarationProvider(languageId, {
      provideDeclaration: async (model, position) => {
        const request = buildDefinitionRequest(model, position)
        const response = await fetchDeclaration(request)
        if (!response.length) {
          return null
        }
        return response.map(toMonacoLocation)
      }
    })

    monaco.languages.registerReferenceProvider(languageId, {
      provideReferences: async (model, position, context) => {
        const request = buildReferencesRequest(model, position, context)
        const response = await fetchReferences(request)
        if (!response.length) {
          return []
        }
        return response.map(toMonacoLocation)
      }
    })

    monaco.languages.registerDocumentSymbolProvider(languageId, {
      provideDocumentSymbols: async (model) => {
        const response = await fetchDocumentSymbols(model.uri.fsPath)
        if (!response.length) {
          return []
        }
        return response.map(symbol => toMonacoDocumentSymbol(symbol))
      }
    })

    monaco.languages.registerSignatureHelpProvider(languageId, {
      signatureHelpTriggerCharacters: ['(', ',', '<'],
      provideSignatureHelp: async (model, position, token, context) => {
        void token
        const request = buildSignatureHelpRequest(model, position, context)
        const response = await fetchSignatureHelp(request)
        if (!response) {
          return null
        }
        return {
          value: toMonacoSignatureHelp(response),
          dispose: () => undefined
        }
      }
    })

    monaco.languages.registerRenameProvider(languageId, {
      provideRenameEdits: async (model, position, newName) => {
        const request = buildRenameRequest(model, position, newName)
        const response = await fetchRenameEdits(request)
        if (!response) {
          return null
        }
        return toMonacoWorkspaceEdit(response)
      },
      resolveRenameLocation: async (model, position) => {
        const request = buildDefinitionRequest(model, position)
        const response = await fetchPrepareRename(request)
        if (!response) {
          return null
        }
        const range = toMonacoRange(response.range)
        return {
          range,
          text: response.placeholder ?? model.getValueInRange(range)
        }
      }
    })

    monaco.languages.registerCodeActionProvider(languageId, {
      provideCodeActions: async (model, range, context) => {
        const request = buildCodeActionRequest(model, range, context)
        const response = await fetchCodeActions(request)
        if (!response.length) {
          return { actions: [], dispose: () => undefined }
        }
        return {
          actions: response.map(toMonacoCodeAction),
          dispose: () => undefined
        }
      }
    })

    monaco.languages.registerDocumentFormattingEditProvider(languageId, {
      provideDocumentFormattingEdits: async (model) => {
        const request = buildFormattingRequest(model)
        const response = await fetchFormattingEdits(request)
        if (!response.length) {
          return []
        }
        return response.map(toMonacoTextEdit)
      }
    })

    monaco.languages.registerDocumentRangeFormattingEditProvider(languageId, {
      provideDocumentRangeFormattingEdits: async (model, range) => {
        const request = buildRangeFormattingRequest(model, range)
        const response = await fetchRangeFormattingEdits(request)
        if (!response.length) {
          return []
        }
        return response.map(toMonacoTextEdit)
      }
    })

    monaco.languages.registerOnTypeFormattingEditProvider(languageId, {
      autoFormatTriggerCharacters: [';', '\n', '}'],
      provideOnTypeFormattingEdits: async (model, position, ch) => {
        const request = buildOnTypeFormattingRequest(model, position, ch)
        const response = await fetchOnTypeFormattingEdits(request)
        if (!response.length) {
          return []
        }
        return response.map(toMonacoTextEdit)
      }
    })
  }
}
