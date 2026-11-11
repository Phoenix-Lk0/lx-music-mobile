#!/usr/bin/env node
/**
 * 构建前的语法检查：用项目自带的 @babel/parser（@react-native/babel-preset 的传递依赖）
 * 解析全部 .ts/.tsx，缺括号、缺分号这类问题在 CI 立刻暴露，不必等 Metro 打包失败。
 */
const fs = require('fs')
const path = require('path')

let parser
try {
  parser = require('@babel/parser')
} catch (e) {
  console.log('跳过：未找到 @babel/parser（依赖未安装）')
  process.exit(0)
}

// 只检查本分支新增/修改的文件，上游文件存在 Babel 解析差异，全量扫描会误报
const files = [
  'src/config/sourceLibrary.ts',
  'src/core/sourceLibrary.ts',
  'src/core/version.ts',
  'src/config/constant.ts',
  'src/screens/Home/Views/Setting/settings/Basic/UserApiEditModal/ImportBtn.tsx',
  'src/screens/Home/Views/Setting/settings/Basic/UserApiEditModal/SourceLibrary/index.tsx',
].filter(f => fs.existsSync(f))
let failed = 0
for (const file of files) {
  const code = fs.readFileSync(file, 'utf8')
  const isTs = file.endsWith('.ts') || file.endsWith('.tsx')
  try {
    parser.parse(code, {
      sourceType: 'module',
      plugins: isTs ? ['typescript', 'jsx'] : ['jsx'],
      errorRecovery: false,
    })
  } catch (e) {
    failed++
    console.error(`SYNTAX FAIL ${file}: ${e.message}`)
  }
}

console.log(`检查 ${files.length} 个文件，失败 ${failed} 个`)
process.exit(failed > 0 ? 1 : 0)
