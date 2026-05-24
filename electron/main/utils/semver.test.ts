import { compareVersions } from './semver'

describe('compareVersions', () => {
  describe('equal versions', () => {
    it('should return 0 for identical versions', () => {
      expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
    })

    it('should return 0 for version 0.0.0', () => {
      expect(compareVersions('0.0.0', '0.0.0')).toBe(0)
    })

    it('should return 0 for large version numbers', () => {
      expect(compareVersions('999.999.999', '999.999.999')).toBe(0)
    })
  })

  describe('different major versions', () => {
    it('should return negative when v1 major < v2 major', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0)
    })

    it('should return positive when v1 major > v2 major', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0)
    })

    it('should prioritize major version over minor and patch', () => {
      expect(compareVersions('1.9.9', '2.0.0')).toBeLessThan(0)
      expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0)
    })
  })

  describe('different minor versions with same major', () => {
    it('should return negative when v1 minor < v2 minor', () => {
      expect(compareVersions('1.1.0', '1.2.0')).toBeLessThan(0)
    })

    it('should return positive when v1 minor > v2 minor', () => {
      expect(compareVersions('1.2.0', '1.1.0')).toBeGreaterThan(0)
    })

    it('should prioritize minor version over patch', () => {
      expect(compareVersions('1.1.9', '1.2.0')).toBeLessThan(0)
      expect(compareVersions('1.2.0', '1.1.9')).toBeGreaterThan(0)
    })
  })

  describe('different patch versions with same major and minor', () => {
    it('should return negative when v1 patch < v2 patch', () => {
      expect(compareVersions('1.2.1', '1.2.2')).toBeLessThan(0)
    })

    it('should return positive when v1 patch > v2 patch', () => {
      expect(compareVersions('1.2.2', '1.2.1')).toBeGreaterThan(0)
    })
  })

  describe('edge cases', () => {
    it('should handle version 0.0.1', () => {
      expect(compareVersions('0.0.1', '0.0.2')).toBeLessThan(0)
      expect(compareVersions('0.0.1', '0.0.0')).toBeGreaterThan(0)
    })

    it('should handle very large version numbers', () => {
      expect(compareVersions('999.999.998', '999.999.999')).toBeLessThan(0)
      expect(compareVersions('999.999.999', '999.999.998')).toBeGreaterThan(0)
    })

    it('should handle versions with zeros', () => {
      expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0)
      expect(compareVersions('0.1.0', '0.0.1')).toBeGreaterThan(0)
    })
  })

  describe('antisymmetry property', () => {
    it('should satisfy antisymmetry: compareVersions(v1, v2) === -compareVersions(v2, v1)', () => {
      const testCases = [
        ['1.0.0', '2.0.0'],
        ['1.2.3', '1.2.4'],
        ['2.5.1', '1.9.9'],
        ['0.0.1', '0.1.0'],
      ]

      testCases.forEach(([v1, v2]) => {
        const result1 = compareVersions(v1, v2)
        const result2 = compareVersions(v2, v1)
        expect(result1).toBe(-result2)
      })
    })
  })

  describe('reflexivity property', () => {
    it('should satisfy reflexivity: compareVersions(v, v) === 0', () => {
      const testVersions = [
        '0.0.0',
        '1.0.0',
        '1.2.3',
        '10.20.30',
        '999.999.999',
      ]

      testVersions.forEach((v) => {
        expect(compareVersions(v, v)).toBe(0)
      })
    })
  })

  describe('transitivity property', () => {
    it('should satisfy transitivity: if v1 < v2 and v2 < v3, then v1 < v3', () => {
      const testCases = [
        ['1.0.0', '1.1.0', '1.2.0'],
        ['0.0.1', '0.1.0', '1.0.0'],
        ['1.2.3', '1.2.4', '1.2.5'],
        ['1.0.0', '2.0.0', '3.0.0'],
      ]

      testCases.forEach(([v1, v2, v3]) => {
        const cmp12 = compareVersions(v1, v2)
        const cmp23 = compareVersions(v2, v3)
        const cmp13 = compareVersions(v1, v3)

        // If v1 < v2 and v2 < v3, then v1 < v3
        if (cmp12 < 0 && cmp23 < 0) {
          expect(cmp13).toBeLessThan(0)
        }
      })
    })
  })
})
