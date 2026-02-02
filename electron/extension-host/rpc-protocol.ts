/**
 * RPC Protocol Implementation
 *
 * JSON-RPC 2.0 based message protocol for communicating with the extension host.
 * This module defines the message types and serialization/deserialization logic.
 *
 * Specification: https://www.jsonrpc.org/specification
 */

/**
 * JSON-RPC 2.0 Request Message
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: unknown
}

/**
 * JSON-RPC 2.0 Response Message
 */
export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: JsonRpcError
}

/**
 * JSON-RPC 2.0 Notification Message (no response expected)
 */
export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

/**
 * JSON-RPC 2.0 Error Object
 */
export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

/**
 * Error codes from JSON-RPC 2.0 spec and extensions
 */
export const JsonRpcErrorCode = {
  // JSON-RPC 2.0 reserved error codes
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,

  // Server error range: -32768 to -32000
  SERVER_ERROR_START: -32099,
  SERVER_ERROR_END: -32000,

  // Extension errors
  TIMEOUT: -32001,
  UNKNOWN_ERROR: -32002
}

/**
 * RPC Protocol Handler
 *
 * Handles serialization, deserialization, and validation of JSON-RPC messages.
 */
export class RpcProtocol {
  /**
   * Create a well-formed JSON-RPC request.
   */
  static createRequest(id: string | number, method: string, params?: unknown): JsonRpcRequest {
    if (typeof id !== 'string' && typeof id !== 'number') {
      throw new Error('Request id must be a string or number')
    }
    if (typeof method !== 'string' || method.length === 0) {
      throw new Error('Request method must be a non-empty string')
    }
    const request: JsonRpcRequest = { jsonrpc: '2.0', id, method }
    if (params !== undefined) {
      request.params = params
    }
    return request
  }

  /**
   * Create a well-formed JSON-RPC success response.
   */
  static createResponse(id: string | number, result: unknown): JsonRpcResponse {
    return { jsonrpc: '2.0', id, result }
  }

  /**
   * Create a well-formed JSON-RPC error response.
   */
  static createErrorResponse(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcResponse {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: id as string | number,
      error: { code, message }
    }
    if (data !== undefined) {
      response.error!.data = data
    }
    return response
  }

  /**
   * Create a well-formed JSON-RPC notification.
   */
  static createNotification(method: string, params?: unknown): JsonRpcNotification {
    if (typeof method !== 'string' || method.length === 0) {
      throw new Error('Notification method must be a non-empty string')
    }
    const notification: JsonRpcNotification = { jsonrpc: '2.0', method }
    if (params !== undefined) {
      notification.params = params
    }
    return notification
  }

  /**
   * Serialize a request message to JSON string.
   */
  static serializeRequest(request: JsonRpcRequest): string {
    if (request.jsonrpc !== '2.0') {
      throw new Error('Invalid jsonrpc version')
    }
    if (request.id === undefined || request.id === null) {
      throw new Error('Request must have an id')
    }
    if (typeof request.method !== 'string' || request.method.length === 0) {
      throw new Error('Request must have a method')
    }
    return JSON.stringify(request)
  }

  /**
   * Serialize a response message to JSON string.
   */
  static serializeResponse(response: JsonRpcResponse): string {
    if (response.jsonrpc !== '2.0') {
      throw new Error('Invalid jsonrpc version')
    }
    if (response.id === undefined) {
      throw new Error('Response must have an id')
    }
    if (!('result' in response) && !('error' in response)) {
      throw new Error('Response must have either result or error')
    }
    return JSON.stringify(response)
  }

  /**
   * Serialize a notification message to JSON string.
   */
  static serializeNotification(notification: JsonRpcNotification): string {
    if (notification.jsonrpc !== '2.0') {
      throw new Error('Invalid jsonrpc version')
    }
    if (typeof notification.method !== 'string' || notification.method.length === 0) {
      throw new Error('Notification must have a method')
    }
    return JSON.stringify(notification)
  }

  /**
   * Deserialize a JSON string to a request/response/notification message.
   */
  static deserialize(data: string): JsonRpcRequest | JsonRpcResponse | JsonRpcNotification {
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch (error) {
      throw {
        code: JsonRpcErrorCode.PARSE_ERROR,
        message: 'Parse error',
        data: error
      } as JsonRpcError
    }

    if (!parsed || typeof parsed !== 'object') {
      throw {
        code: JsonRpcErrorCode.INVALID_REQUEST,
        message: 'Invalid request: not an object'
      } as JsonRpcError
    }

    const msg = parsed as Record<string, unknown>
    if (msg.jsonrpc !== '2.0') {
      throw {
        code: JsonRpcErrorCode.INVALID_REQUEST,
        message: `Invalid jsonrpc version: ${msg.jsonrpc}`
      } as JsonRpcError
    }

    return parsed as JsonRpcRequest | JsonRpcResponse | JsonRpcNotification
  }

  /**
   * Check if a message is a request (has id).
   */
  static isRequest(msg: unknown): msg is JsonRpcRequest {
    return (
      msg != null &&
      typeof msg === 'object' &&
      'id' in msg &&
      'method' in msg &&
      (msg as any).jsonrpc === '2.0'
    )
  }

  /**
   * Check if a message is a response.
   */
  static isResponse(msg: unknown): msg is JsonRpcResponse {
    return (
      msg != null &&
      typeof msg === 'object' &&
      'id' in msg &&
      ('result' in msg || 'error' in msg) &&
      (msg as any).jsonrpc === '2.0'
    )
  }

  /**
   * Check if a message is a notification (no id).
   */
  static isNotification(msg: unknown): msg is JsonRpcNotification {
    return (
      msg != null &&
      typeof msg === 'object' &&
      !('id' in msg) &&
      'method' in msg &&
      (msg as any).jsonrpc === '2.0'
    )
  }
}

/**
 * Common RPC Method Names
 *
 * Naming convention: 'extensionHost.$methodName' for extension host methods
 */
export const RpcMethods = {
  // Document operations
  PROVIDE_COMPLETIONS: 'extensionHost.$provideCompletions',
  PROVIDE_INLINE_COMPLETIONS: 'extensionHost.$provideInlineCompletions',
  PROVIDE_HOVER: 'extensionHost.$provideHover',
  PROVIDE_DEFINITION: 'extensionHost.$provideDefinition',
  PROVIDE_REFERENCES: 'extensionHost.$provideReferences',
  PROVIDE_IMPLEMENTATION: 'extensionHost.$provideImplementation',
  PROVIDE_TYPE_DEFINITION: 'extensionHost.$provideTypeDefinition',
  PROVIDE_DECLARATION: 'extensionHost.$provideDeclaration',
  PROVIDE_DOCUMENT_SYMBOLS: 'extensionHost.$provideDocumentSymbols',
  PROVIDE_SIGNATURE_HELP: 'extensionHost.$provideSignatureHelp',
  PROVIDE_CODE_ACTIONS: 'extensionHost.$provideCodeActions',
  PROVIDE_FORMATTING_EDITS: 'extensionHost.$provideFormattingEdits',
  PROVIDE_RANGE_FORMATTING_EDITS: 'extensionHost.$provideRangeFormattingEdits',
  PROVIDE_ON_TYPE_FORMATTING_EDITS: 'extensionHost.$provideOnTypeFormattingEdits',
  PROVIDE_RENAME_EDITS: 'extensionHost.$provideRenameEdits',
  PREPARE_RENAME: 'extensionHost.$prepareRename',

  // Command operations
  EXECUTE_COMMAND: 'extensionHost.$executeCommand',

  // Notifications (from extension host)
  ON_DID_CHANGE_TEXT_DOCUMENT: 'extensionHost.onDidChangeTextDocument',
  ON_DID_SAVE_TEXT_DOCUMENT: 'extensionHost.onDidSaveTextDocument',
  ON_DID_OPEN_TEXT_DOCUMENT: 'extensionHost.onDidOpenTextDocument',
  ON_DID_CLOSE_TEXT_DOCUMENT: 'extensionHost.onDidCloseTextDocument',
  ON_DID_CREATE_FILES: 'extensionHost.onDidCreateFiles',
  ON_DID_DELETE_FILES: 'extensionHost.onDidDeleteFiles',
  ON_DID_RENAME_FILES: 'extensionHost.onDidRenameFiles'
}
