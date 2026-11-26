import { describe, expect, it } from 'vitest'
import { adminSurveyIdFromPath } from './admin'

describe('adminSurveyIdFromPath', () => {
  it('reads the survey id from an admin survey link', () => {
    expect(adminSurveyIdFromPath('/admin/s/AbCdEfGhIjKlMnOpQrSt_-')).toBe('AbCdEfGhIjKlMnOpQrSt_-')
    expect(adminSurveyIdFromPath('/admin/s/AbCdEfGhIjKlMnOpQrSt_-/')).toBe('AbCdEfGhIjKlMnOpQrSt_-')
  })

  it('is null on other pages', () => {
    expect(adminSurveyIdFromPath('/admin')).toBeNull()
    expect(adminSurveyIdFromPath('/s/AbCdEfGhIjKlMnOpQrSt_-')).toBeNull()
    expect(adminSurveyIdFromPath('/admin/s/short')).toBeNull()
  })
})
