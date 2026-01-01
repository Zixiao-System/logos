/**
 * Type declarations for logos-wasm module
 * This file provides types for TypeScript when the WASM module hasn't been built yet
 */

declare module 'logos-wasm' {
  export class LanguageService {
    free(): void
    [Symbol.dispose](): void

    constructor()

    openDocument(uri: string, content: string, languageId: string): void
    closeDocument(uri: string): void
    updateDocument(uri: string, content: string): void

    getCompletions(uri: string, line: number, column: number): string
    getDefinition(uri: string, line: number, column: number): string
    getReferences(uri: string, line: number, column: number): string
    getHover(uri: string, line: number, column: number): string
    getDiagnostics(uri: string): string
    getDocumentSymbols(uri: string): string

    prepareRename(uri: string, line: number, column: number): string
    rename(uri: string, line: number, column: number, newName: string): string
    searchSymbols(query: string): string

    // TODO and analysis methods
    getTodoItems(uri: string): string
    getAllTodoItems(): string
    getTodoStats(): string
    getUnusedSymbols(uri: string): string
  }

  export function init(): void

  export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module

  export interface InitOutput {
    readonly memory: WebAssembly.Memory
  }

  export type SyncInitInput = BufferSource | WebAssembly.Module

  export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput

  export default function __wbg_init(
    module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>
  ): Promise<InitOutput>
}