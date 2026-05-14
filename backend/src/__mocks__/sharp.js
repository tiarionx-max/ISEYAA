const mockSharp = jest.fn().mockReturnValue({
  resize: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  webp: jest.fn().mockReturnThis(),
  png: jest.fn().mockReturnThis(),
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('')),
  metadata: jest.fn().mockResolvedValue({ width: 100, height: 100, format: 'jpeg' }),
});
module.exports = mockSharp;
module.exports.default = mockSharp;
