// 后端构建：把 app/server 打包为可随桌面包分发的自包含服务目录。
//
// 产物：app/src-tauri/server/server.js（单一 ESM bundle）+ 运行时原生依赖
//       node_modules/better-sqlite3（含 prebuilds）。
//
// 说明：
// - 业务数据事实来源仍是网络访问的 Node 服务，此处只是把其运行所需内容收拢，
//   由 Rust 壳以 Tauri sidecar 在 app_data_dir 下启动。
// - better-sqlite3 为原生模块，保持 external（esbuild 不内联），
//   运行时从产物目录的 node_modules 解析，避免把整棵前端 node_modules 打进安装包。
// - 构建脚本不修改任何业务代码，仅制作用于桌面打包的产物目录。

import { build } from 'esbuild'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(scriptDir, '..')
// 输出到 src-tauri/server，使 tauri.conf.json 用相对路径 resources:[server]
// 即可让 Tauri 把它放到 Resources/server，避免产物带 _up_ 目录后缀。
const outDir = resolve(appRoot, 'src-tauri/server')
const outFile = resolve(outDir, 'server.js')

// better-sqlite3 是本项目唯一的原生依赖，必须 external 并在运行时解析。
const NATIVE_DEPS = ['better-sqlite3']

// 清空旧产物，保证每次构建都是干净、可验证的快照。
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: [resolve(appRoot, 'server/src/index.ts')],
  outfile: outFile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  minify: false,
  // Node 内置模块自动 external；显式 external 原生依赖。
  external: [...NATIVE_DEPS, 'node:*'],
  logLevel: 'info',
  // 让依赖表的 import 按源码意图保留 .ts 扩展（bundled，产物内不再有跨模块扩展匹配问题）。
  banner: { js: '/* 知枝后端 bundle，由 esbuild 构建 */' },
})

// 拷贝 better-sqlite3 运行目录（含 prebuilds/ 原生二进制，随版本附带）。
// 注意：包内条件导出会解析到 lib/，需以 package.json 定位真实包根，
// 拷贝整包（package.json + lib + prebuilds），否则装入安装包后运行态解析会失败。
for (const dep of NATIVE_DEPS) {
  const pkgRoot = await resolvePackageRoot(dep, appRoot)
  if (!pkgRoot) {
    throw new Error(`找不到原生依赖 ${dep} 的包目录，请先安装依赖`)
  }
  cpSync(pkgRoot, resolve(outDir, 'node_modules', dep), { recursive: true })
}

/** 解析已安装依赖的包根目录（含 package.json 的路径）。 */
async function resolvePackageRoot(dep, base) {
  // 从 appRoot 逐级向上找 node_modules/<dep>
  let dir = resolve(base, 'node_modules', dep)
  if (!existsSync(resolve(dir, 'package.json'))) {
    return null
  }
  return dir
}

console.log(`[build-server] 已生成 ${outFile}`)
