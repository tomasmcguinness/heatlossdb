import { describe, expect, it } from 'vitest'
import { isValidCode, normaliseCode, surveyIdFromPath } from './files'

describe('upload codes', () => {
  it('tidies codes as people type them', () => {
    expect(normaliseCode(' a7k-3p ')).toBe('A7K3P')
    expect(isValidCode(normaliseCode('a7k3p'))).toBe(true)
  })

  it('rejects codes with the wrong length or look-alike characters', () => {
    expect(isValidCode('A7K3')).toBe(false)
    expect(isValidCode('A7K3PP')).toBe(false)
    expect(isValidCode('O0I1L')).toBe(false)
  })
})

describe('surveyIdFromPath', () => {
  it('reads the id from a survey link', () => {
    expect(surveyIdFromPath('/s/AbCdEfGhIjKlMnOpQrSt_-')).toBe('AbCdEfGhIjKlMnOpQrSt_-')
    expect(surveyIdFromPath('/s/AbCdEfGhIjKlMnOpQrSt_-/')).toBe('AbCdEfGhIjKlMnOpQrSt_-')
  })

  it('ignores other pages and malformed ids', () => {
    expect(surveyIdFromPath('/')).toBeNull()
    expect(surveyIdFromPath('/s/short')).toBeNull()
    expect(surveyIdFromPath('/s/../../etc/passwd')).toBeNull()
  })
})
