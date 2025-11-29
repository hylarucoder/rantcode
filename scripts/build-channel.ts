#!/usr/bin/env npx tsx
/**
 * 多渠道构建脚本
 *
 * 用法:
 *   pnpm build:stable       - 构建稳定版（本地）
 *   pnpm build:nightly      - 构建夜间版（本地）
 *   pnpm release:stable     - 构建并发布稳定版到 GitHub Releases
 *   pnpm release:nightly    - 构建并发布夜间版到 GitHub Releases
 *
 * 环境变量:
 *   CHANNEL    - 发布渠道 (stable, nightly)
 *   GH_TOKEN   - GitHub Personal Access Token（发布时必需）
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

type Channel = 'stable' | 'nightly'

const CHANNELS: Channel[] = ['stable', 'nightly']

function getChannel(): Channel {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
  const channel = args[0] || process.env.CHANNEL || 'stable'
  if (!CHANNELS.includes(channel as Channel)) {
    console.error(`❌ 无效的渠道: ${channel}`)
    console.error(`   有效渠道: ${CHANNELS.join(', ')}`)
    process.exit(1)
  }
  return channel as Channel
}

function shouldPublish(): boolean {
  return process.argv.includes('--publish')
}

function getGitShortHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

function getDateSuffix(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

interface PackageJson {
  version: string
  [key: string]: unknown
}

function generateVersion(baseVersion: string, channel: Channel): string {
  if (channel === 'stable') {
    return baseVersion
  }

  // nightly: 0.0.1-nightly.20251127.abc1234
  const dateSuffix = getDateSuffix()
  const gitHash = getGitShortHash()
  return `${baseVersion}-nightly.${dateSuffix}.${gitHash}`
}

function main(): void {
  const channel = getChannel()
  const publish = shouldPublish()
  const rootDir = resolve(__dirname, '..')
  const pkgPath = resolve(rootDir, 'package.json')

  console.log(`\n🚀 开始构建 ${channel.toUpperCase()} 版本`)
  if (publish) {
    console.log(`📤 将发布到 GitHub Releases`)

    // 检查 GH_TOKEN
    if (!process.env.GH_TOKEN) {
      console.error('\n❌ 发布需要设置 GH_TOKEN 环境变量')
      console.error('   请创建 GitHub Personal Access Token:')
      console.error('   https://github.com/settings/tokens/new?scopes=repo')
      console.error('\n   然后运行:')
      console.error('   export GH_TOKEN=your_token_here')
      process.exit(1)
    }
  }
  console.log('')

  // 读取 package.json
  const pkgContent = readFileSync(pkgPath, 'utf-8')
  const pkg: PackageJson = JSON.parse(pkgContent)
  const originalVersion = pkg.version

  // 生成版本号
  const buildVersion = generateVersion(originalVersion, channel)
  console.log(`📦 版本号: ${buildVersion}`)

  // 临时修改 package.json 中的版本号
  pkg.version = buildVersion
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

  try {
    // 运行 typecheck
    console.log('\n🔍 类型检查...')
    execSync('pnpm typecheck', { stdio: 'inherit', cwd: rootDir })

    // 运行 electron-vite build
    console.log('\n📦 构建应用...')
    execSync('electron-vite build', { stdio: 'inherit', cwd: rootDir })

    // 运行 electron-builder
    const configFile = `electron-builder.${channel}.yml`
    const publishFlag = publish ? ' --publish always' : ''

    console.log(`\n🏗️  打包 Mac 应用 (${channel})...`)
    execSync(`electron-builder --mac --config ${configFile}${publishFlag}`, {
      stdio: 'inherit',
      cwd: rootDir,
      env: {
        ...process.env,
        CHANNEL: channel
      }
    })

    console.log(`\n✅ ${channel.toUpperCase()} 版本构建成功!`)
    console.log(`   版本: ${buildVersion}`)
    console.log(`   输出目录: dist/`)
    if (publish) {
      console.log(`   📤 已发布到 GitHub Releases`)
    }
  } finally {
    // 恢复原始 package.json
    pkg.version = originalVersion
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    console.log('\n🔄 已恢复 package.json')
  }
}

main()
