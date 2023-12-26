import type { Project as PnpmProject } from '@pnpm/find-workspace-packages'
import { findWorkspacePackages } from '@pnpm/find-workspace-packages'
import type { ProjectManifest } from '@pnpm/types'
import { execa } from 'execa'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import color from 'picocolors'
import { scanEnums } from './const-enum'

export type Manifest = ProjectManifest & {
  buildOptions: {
    name?: string
    compat?: boolean
    env?: string
    formats: ('global' | 'cjs' | 'esm-bundler' | 'esm-browser')[]
  }
}

interface Project extends PnpmProject {
  manifest: Manifest
}

const pkgsPath = path.resolve(process.cwd(), 'packages')
const getWorkspacePackages = () => findWorkspacePackages(pkgsPath)

async function main() {
  scanEnums()
  // 获取所有的包 除了private与没有buildOptions的包
  const pkgs = (
    (await getWorkspacePackages()).filter(
      item => !item.manifest.private
    ) as Project[]
  ).filter(item => item.manifest.buildOptions)

  await buildAll(pkgs)
}

async function buildAll(target: Project[]) {
  // 并行打包
  return runParallel(os.cpus().length, target, build)
}

async function runParallel(
  maxConcurrent: number,
  source: Project[],
  buildFn: (project: Project) => void
) {
  const ret: Promise<void>[] = []
  const executing: Promise<void>[] = []
  for (const item of source) {
    const p = Promise.resolve().then(() => buildFn(item))
    // 封装所有打包任务
    ret.push(p)

    //
    if (maxConcurrent <= source.length) {
      const e: any = p.then(() => executing.splice(executing.indexOf(e), 1))
      executing.push(e)
      if (executing.length >= maxConcurrent) await Promise.race(executing)
    }
  }

  return Promise.all(ret)
}

async function build(project: Project) {
  const pkg = project.manifest
  // 获取相对路径 包名
  const target = path.relative(pkgsPath, project.dir)
  if (pkg.private) {
    return
  }

  const env = (pkg.buildOptions && pkg.buildOptions.env) || 'development'
  await execa(
    'rollup',
    [
      `-c`,
      // 给rollup配置文件传递参数 watch 监听文件变化
      '--watch',
      '--environment',
      [`NODE_ENV:${env}`, `TARGET:${target}`, `SOURCE_MAP:true`]
        .filter(Boolean)
        .join(',')
    ],
    { stdio: 'inherit' }
  )
}

main().catch(err => {
  console.error(color.red(err))
})
