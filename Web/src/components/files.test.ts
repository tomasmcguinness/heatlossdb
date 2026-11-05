import { describe, expect, it } from 'vitest'
import { surveyIdFromPath } from './files'

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
