import sharedConfig from '@babadeluxe/xo-config'
import { type FlatXoConfig } from 'xo'

const configArray: FlatXoConfig = Array.isArray(sharedConfig) ? sharedConfig : [sharedConfig]
const rulesToDisable: Partial<unknown> = {
  'import-x/extensions': 'off',
  'unicorn/filename-case': 'off',
  'unicorn/prefer-string-replace-all': 'off',
  'no-warning-comments': 'off',
}
configArray.push({ rules: rulesToDisable })

export default configArray
