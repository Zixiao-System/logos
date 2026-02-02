/**
 * RPC Protocol unit tests
 */

import { describe, it, expect } from 'vitest'
import {
  RpcProtocol,
  JsonRpcErrorCode,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification
} from '../../../electron/extension-host/rpc-protocol'

describe('RpcProtocol', () => {
  describe('isRequest', () => {
    it('returns true for valid request', () => {
      const request = { jsonrpc: '2.0', id: 1, method: 'test' }
      expect(RpcProtocol.isRequest(request)).toBe(true)
    })

    it('returns true for request with params', () => {
      const request = { jsonrpc: '2.0', id: 'req-1', method: 'test', params: { foo: 'bar' } }
      expect(RpcProtocol.isRequest(request)).toBe(true)
    })

    it('returns false for null', () => {
      expect(RpcProtocol.isRequest(null)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(RpcProtocol.isRequest(undefined)).toBe(false)
    })

    it('returns false for non-object', () => {
      expect(RpcProtocol.isRequest('string')).toBe(false)
      expect(RpcProtocol.isRequest(123)).toBe(false)
    })

    it('returns false for missing id', () => {
      const msg = { jsonrpc: '2.0', method: 'test' }
      expect(RpcProtocol.isRequest(msg)).toBe(false)
    })

    it('returns false for missing method', () => {
      const msg = { jsonrpc: '2.0', id: 1 }
      expect(RpcProtocol.isRequest(msg)).toBe(false)
    })

    it('returns false for wrong jsonrpc version', () => {
      const msg = { jsonrpc: '1.0', id: 1, method: 'test' }
      expect(RpcProtocol.isRequest(msg)).toBe(false)
    })
  })

  describe('isResponse', () => {
    it('returns true for success response', () => {
      const response = { jsonrpc: '2.0', id: 1, result: { data: 'test' } }
      expect(RpcProtocol.isResponse(response)).toBe(true)
    })

    it('returns true for error response', () => {
      const response = { jsonrpc: '2.0', id: 1, error: { code: -32600, message: 'Error' } }
      expect(RpcProtocol.isResponse(response)).toBe(true)
    })

    it('returns true for null result', () => {
      const response = { jsonrpc: '2.0', id: 1, result: null }
      expect(RpcProtocol.isResponse(response)).toBe(true)
    })

    it('returns false for missing id', () => {
      const msg = { jsonrpc: '2.0', result: 'test' }
      expect(RpcProtocol.isResponse(msg)).toBe(false)
    })

    it('returns false for missing result and error', () => {
      const msg = { jsonrpc: '2.0', id: 1 }
      expect(RpcProtocol.isResponse(msg)).toBe(false)
    })

    it('returns false for wrong jsonrpc version', () => {
      const msg = { jsonrpc: '1.0', id: 1, result: 'test' }
      expect(RpcProtocol.isResponse(msg)).toBe(false)
    })
  })

  describe('isNotification', () => {
    it('returns true for valid notification', () => {
      const notification = { jsonrpc: '2.0', method: 'notify' }
      expect(RpcProtocol.isNotification(notification)).toBe(true)
    })

    it('returns true for notification with params', () => {
      const notification = { jsonrpc: '2.0', method: 'notify', params: [1, 2, 3] }
      expect(RpcProtocol.isNotification(notification)).toBe(true)
    })

    it('returns false when id is present', () => {
      const msg = { jsonrpc: '2.0', id: 1, method: 'test' }
      expect(RpcProtocol.isNotification(msg)).toBe(false)
    })

    it('returns false for missing method', () => {
      const msg = { jsonrpc: '2.0' }
      expect(RpcProtocol.isNotification(msg)).toBe(false)
    })

    it('returns false for wrong jsonrpc version', () => {
      const msg = { jsonrpc: '1.0', method: 'test' }
      expect(RpcProtocol.isNotification(msg)).toBe(false)
    })
  })

  describe('createRequest', () => {
    it('creates request with string id', () => {
      const request = RpcProtocol.createRequest('req-1', 'testMethod')
      expect(request).toEqual({ jsonrpc: '2.0', id: 'req-1', method: 'testMethod' })
    })

    it('creates request with number id', () => {
      const request = RpcProtocol.createRequest(42, 'testMethod')
      expect(request).toEqual({ jsonrpc: '2.0', id: 42, method: 'testMethod' })
    })

    it('creates request with params', () => {
      const request = RpcProtocol.createRequest(1, 'testMethod', { foo: 'bar' })
      expect(request).toEqual({ jsonrpc: '2.0', id: 1, method: 'testMethod', params: { foo: 'bar' } })
    })

    it('throws on invalid id', () => {
      expect(() => RpcProtocol.createRequest(null as any, 'test')).toThrow('id must be a string or number')
    })

    it('throws on empty method', () => {
      expect(() => RpcProtocol.createRequest(1, '')).toThrow('method must be a non-empty string')
    })

    it('throws on non-string method', () => {
      expect(() => RpcProtocol.createRequest(1, 123 as any)).toThrow('method must be a non-empty string')
    })
  })

  describe('createResponse', () => {
    it('creates success response', () => {
      const response = RpcProtocol.createResponse(1, { data: 'test' })
      expect(response).toEqual({ jsonrpc: '2.0', id: 1, result: { data: 'test' } })
    })

    it('creates response with null result', () => {
      const response = RpcProtocol.createResponse('req-1', null)
      expect(response).toEqual({ jsonrpc: '2.0', id: 'req-1', result: null })
    })

    it('creates response with undefined result', () => {
      const response = RpcProtocol.createResponse(1, undefined)
      expect(response).toEqual({ jsonrpc: '2.0', id: 1, result: undefined })
    })
  })

  describe('createErrorResponse', () => {
    it('creates error response', () => {
      const response = RpcProtocol.createErrorResponse(1, JsonRpcErrorCode.INTERNAL_ERROR, 'Something went wrong')
      expect(response).toEqual({
        jsonrpc: '2.0',
        id: 1,
        error: { code: JsonRpcErrorCode.INTERNAL_ERROR, message: 'Something went wrong' }
      })
    })

    it('creates error response with data', () => {
      const response = RpcProtocol.createErrorResponse(1, JsonRpcErrorCode.INVALID_PARAMS, 'Bad params', { field: 'name' })
      expect(response).toEqual({
        jsonrpc: '2.0',
        id: 1,
        error: { code: JsonRpcErrorCode.INVALID_PARAMS, message: 'Bad params', data: { field: 'name' } }
      })
    })

    it('creates error response with null id', () => {
      const response = RpcProtocol.createErrorResponse(null, JsonRpcErrorCode.PARSE_ERROR, 'Parse error')
      expect(response.id).toBe(null)
    })
  })

  describe('createNotification', () => {
    it('creates notification without params', () => {
      const notification = RpcProtocol.createNotification('testEvent')
      expect(notification).toEqual({ jsonrpc: '2.0', method: 'testEvent' })
    })

    it('creates notification with params', () => {
      const notification = RpcProtocol.createNotification('testEvent', { value: 123 })
      expect(notification).toEqual({ jsonrpc: '2.0', method: 'testEvent', params: { value: 123 } })
    })

    it('throws on empty method', () => {
      expect(() => RpcProtocol.createNotification('')).toThrow('method must be a non-empty string')
    })

    it('throws on non-string method', () => {
      expect(() => RpcProtocol.createNotification(123 as any)).toThrow('method must be a non-empty string')
    })
  })

  describe('serializeRequest', () => {
    it('serializes valid request', () => {
      const request: JsonRpcRequest = { jsonrpc: '2.0', id: 1, method: 'test' }
      const json = RpcProtocol.serializeRequest(request)
      expect(JSON.parse(json)).toEqual(request)
    })

    it('throws on invalid jsonrpc version', () => {
      const request = { jsonrpc: '1.0', id: 1, method: 'test' } as any
      expect(() => RpcProtocol.serializeRequest(request)).toThrow('Invalid jsonrpc version')
    })

    it('throws on missing id', () => {
      const request = { jsonrpc: '2.0', method: 'test' } as any
      expect(() => RpcProtocol.serializeRequest(request)).toThrow('Request must have an id')
    })

    it('throws on empty method', () => {
      const request = { jsonrpc: '2.0', id: 1, method: '' } as any
      expect(() => RpcProtocol.serializeRequest(request)).toThrow('Request must have a method')
    })
  })

  describe('serializeResponse', () => {
    it('serializes success response', () => {
      const response: JsonRpcResponse = { jsonrpc: '2.0', id: 1, result: 'ok' }
      const json = RpcProtocol.serializeResponse(response)
      expect(JSON.parse(json)).toEqual(response)
    })

    it('serializes error response', () => {
      const response: JsonRpcResponse = { jsonrpc: '2.0', id: 1, error: { code: -32600, message: 'Error' } }
      const json = RpcProtocol.serializeResponse(response)
      expect(JSON.parse(json)).toEqual(response)
    })

    it('throws on invalid jsonrpc version', () => {
      const response = { jsonrpc: '1.0', id: 1, result: 'ok' } as any
      expect(() => RpcProtocol.serializeResponse(response)).toThrow('Invalid jsonrpc version')
    })

    it('throws on missing id', () => {
      const response = { jsonrpc: '2.0', result: 'ok' } as any
      expect(() => RpcProtocol.serializeResponse(response)).toThrow('Response must have an id')
    })

    it('throws on missing result and error', () => {
      const response = { jsonrpc: '2.0', id: 1 } as any
      expect(() => RpcProtocol.serializeResponse(response)).toThrow('Response must have either result or error')
    })
  })

  describe('serializeNotification', () => {
    it('serializes valid notification', () => {
      const notification: JsonRpcNotification = { jsonrpc: '2.0', method: 'test' }
      const json = RpcProtocol.serializeNotification(notification)
      expect(JSON.parse(json)).toEqual(notification)
    })

    it('throws on invalid jsonrpc version', () => {
      const notification = { jsonrpc: '1.0', method: 'test' } as any
      expect(() => RpcProtocol.serializeNotification(notification)).toThrow('Invalid jsonrpc version')
    })

    it('throws on empty method', () => {
      const notification = { jsonrpc: '2.0', method: '' } as any
      expect(() => RpcProtocol.serializeNotification(notification)).toThrow('Notification must have a method')
    })
  })

  describe('deserialize', () => {
    it('deserializes valid request', () => {
      const json = '{"jsonrpc":"2.0","id":1,"method":"test"}'
      const msg = RpcProtocol.deserialize(json)
      expect(msg).toEqual({ jsonrpc: '2.0', id: 1, method: 'test' })
    })

    it('deserializes valid response', () => {
      const json = '{"jsonrpc":"2.0","id":1,"result":"ok"}'
      const msg = RpcProtocol.deserialize(json)
      expect(msg).toEqual({ jsonrpc: '2.0', id: 1, result: 'ok' })
    })

    it('deserializes valid notification', () => {
      const json = '{"jsonrpc":"2.0","method":"notify","params":{"x":1}}'
      const msg = RpcProtocol.deserialize(json)
      expect(msg).toEqual({ jsonrpc: '2.0', method: 'notify', params: { x: 1 } })
    })

    it('throws PARSE_ERROR on invalid JSON', () => {
      expect(() => RpcProtocol.deserialize('not json')).toThrow(
        expect.objectContaining({ code: JsonRpcErrorCode.PARSE_ERROR })
      )
    })

    it('throws INVALID_REQUEST on non-object', () => {
      expect(() => RpcProtocol.deserialize('"string"')).toThrow(
        expect.objectContaining({ code: JsonRpcErrorCode.INVALID_REQUEST, message: 'Invalid request: not an object' })
      )
    })

    it('throws INVALID_REQUEST on null', () => {
      expect(() => RpcProtocol.deserialize('null')).toThrow(
        expect.objectContaining({ code: JsonRpcErrorCode.INVALID_REQUEST })
      )
    })

    it('throws INVALID_REQUEST on wrong jsonrpc version', () => {
      expect(() => RpcProtocol.deserialize('{"jsonrpc":"1.0","id":1,"method":"test"}')).toThrow(
        expect.objectContaining({ code: JsonRpcErrorCode.INVALID_REQUEST, message: 'Invalid jsonrpc version: 1.0' })
      )
    })

    it('throws INVALID_REQUEST on missing jsonrpc field', () => {
      expect(() => RpcProtocol.deserialize('{"id":1,"method":"test"}')).toThrow(
        expect.objectContaining({ code: JsonRpcErrorCode.INVALID_REQUEST, message: 'Invalid jsonrpc version: undefined' })
      )
    })
  })

  describe('round-trip serialization', () => {
    it('request round-trip', () => {
      const original = RpcProtocol.createRequest('req-123', 'testMethod', { foo: 'bar' })
      const json = RpcProtocol.serializeRequest(original)
      const parsed = RpcProtocol.deserialize(json)
      expect(parsed).toEqual(original)
      expect(RpcProtocol.isRequest(parsed)).toBe(true)
    })

    it('response round-trip', () => {
      const original = RpcProtocol.createResponse(42, { result: [1, 2, 3] })
      const json = RpcProtocol.serializeResponse(original)
      const parsed = RpcProtocol.deserialize(json)
      expect(parsed).toEqual(original)
      expect(RpcProtocol.isResponse(parsed)).toBe(true)
    })

    it('error response round-trip', () => {
      const original = RpcProtocol.createErrorResponse(1, JsonRpcErrorCode.METHOD_NOT_FOUND, 'Method not found', { method: 'unknown' })
      const json = RpcProtocol.serializeResponse(original)
      const parsed = RpcProtocol.deserialize(json)
      expect(parsed).toEqual(original)
      expect(RpcProtocol.isResponse(parsed)).toBe(true)
    })

    it('notification round-trip', () => {
      const original = RpcProtocol.createNotification('documentChanged', { uri: 'file:///test.ts' })
      const json = RpcProtocol.serializeNotification(original)
      const parsed = RpcProtocol.deserialize(json)
      expect(parsed).toEqual(original)
      expect(RpcProtocol.isNotification(parsed)).toBe(true)
    })
  })

  describe('error codes', () => {
    it('has correct JSON-RPC 2.0 standard error codes', () => {
      expect(JsonRpcErrorCode.PARSE_ERROR).toBe(-32700)
      expect(JsonRpcErrorCode.INVALID_REQUEST).toBe(-32600)
      expect(JsonRpcErrorCode.METHOD_NOT_FOUND).toBe(-32601)
      expect(JsonRpcErrorCode.INVALID_PARAMS).toBe(-32602)
      expect(JsonRpcErrorCode.INTERNAL_ERROR).toBe(-32603)
    })

    it('has server error range', () => {
      expect(JsonRpcErrorCode.SERVER_ERROR_START).toBe(-32099)
      expect(JsonRpcErrorCode.SERVER_ERROR_END).toBe(-32000)
    })

    it('has extension error codes in server range', () => {
      expect(JsonRpcErrorCode.TIMEOUT).toBeGreaterThanOrEqual(-32099)
      expect(JsonRpcErrorCode.TIMEOUT).toBeLessThanOrEqual(-32000)
      expect(JsonRpcErrorCode.UNKNOWN_ERROR).toBeGreaterThanOrEqual(-32099)
      expect(JsonRpcErrorCode.UNKNOWN_ERROR).toBeLessThanOrEqual(-32000)
    })
  })
})
