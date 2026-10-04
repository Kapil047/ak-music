import { encryptData, decryptData } from '../src/utils/crypto.js';
import { ApiResponse } from '../src/utils/apiResponse.js';

describe('AK Music Core Unit Tests', () => {
  describe('Crypto Utility (AES-256-GCM)', () => {
    it('should encrypt and decrypt string payload correctly', () => {
      const originalText = 'Hello AK Music Secure Streaming';
      const encrypted = encryptData(originalText);

      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('authTag');
      expect(encrypted).toHaveProperty('payload');

      const decrypted = decryptData(encrypted.payload, encrypted.iv, encrypted.authTag);
      expect(decrypted).toBe(originalText);
    });

    it('should encrypt and decrypt complex JSON payload correctly', () => {
      const originalObject = { videoId: 'NJAv_7lHUIU', quality: '320kbps' };
      const encrypted = encryptData(originalObject);
      const decrypted = decryptData(encrypted.payload, encrypted.iv, encrypted.authTag);

      expect(decrypted).toEqual(originalObject);
    });
  });

  describe('ApiResponse Utility', () => {
    it('should format success response with standard envelope', () => {
      let responseBody = null;
      let statusCode = null;
      const mockRes = {
        status: (code) => {
          statusCode = code;
          return mockRes;
        },
        json: (body) => {
          responseBody = body;
          return mockRes;
        }
      };

      ApiResponse.success(mockRes, { song: 'Shape of You' }, {}, 200);

      expect(statusCode).toBe(200);
      expect(responseBody).toHaveProperty('success', true);
      expect(responseBody.data).toEqual({ song: 'Shape of You' });
      expect(responseBody).toHaveProperty('meta');
      expect(responseBody.meta).toHaveProperty('timestamp');
    });

    it('should format error response with standard error envelope', () => {
      let responseBody = null;
      let statusCode = null;
      const mockRes = {
        status: (code) => {
          statusCode = code;
          return mockRes;
        },
        json: (body) => {
          responseBody = body;
          return mockRes;
        }
      };

      ApiResponse.error(mockRes, 'Song not found', 'ERR_NOT_FOUND', 404);

      expect(statusCode).toBe(404);
      expect(responseBody).toHaveProperty('success', false);
      expect(responseBody.error).toEqual({
        code: 'ERR_NOT_FOUND',
        message: 'Song not found',
        details: null
      });
    });
  });
});
