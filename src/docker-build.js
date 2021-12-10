const util = require('util')
const path = require('path')
const readFile = util.promisify(require('fs').readFile)
const unlink = util.promisify(require('fs').unlink)
const exec = require('child_process').exec
const execPromise = util.promisify(exec)
const findRepoRoot = require('organic-stem-skeleton-find-root')
const exists = require('file-exists')

module.exports = function (angel) {
  angel.on('dockerfile :templatepath', async function (a) {
    const repoRoot = await findRepoRoot()
    const cellRoot = process.cwd()
    const dockerfile_contents = await readFile(path.join(cellRoot, a.cmdData.templatepath), 'utf-8')
    const dockerfile_lines = dockerfile_contents.split('\n')
    cleanupDeps(dockerfile_lines)
    const deplines = await buildDepLines(cellRoot, repoRoot)
    for (let i = 0; i < dockerfile_lines.length; i++) {
      if (dockerfile_lines[i] === '#deps>') {
        deplines.forEach(function (line) {
          dockerfile_lines.splice(i + 1, 0, line)
          i++
        })
        break
      }
    }
    console.log(dockerfile_lines.join('\n'))
    return dockerfile_lines.join('\n')
  })
  angel.on('docker-build', async function () {
    if (await exists('./Dockerfile')) {
      return angel.do('docker-build ./Dockerfile')
    }
    if (await exists('./docker/Dockerfile')) {
      return angel.do('docker-build ./docker/Dockerfile')
    }
    throw new Error('Dockerfile not found neither in ./ nor in ./docker/')
  })
  angel.on('docker-build :templatepath', async function (a) {
    const repoRoot = await findRepoRoot()

    // we need to use a dockerfile instead of direct stdio pipe into docker
    // because without dockerfile, docker daemon is missing context to build from
    // otherway around is to use tar.gz, see for details: https://docs.docker.com/engine/reference/commandline/build/#text-files
    const dockerfilepath = '/tmp/dockerfile'
    await execPromise(`npx angel dockerfile ${a.cmdData.templatepath} > ${dockerfilepath}`)
    const packagejson = require(path.join(process.cwd(), 'package.json'))
    const child = exec(`docker build -t ${packagejson.name}-${packagejson.version} -f ${dockerfilepath} .`, {
      cwd: repoRoot,
      maxBuffer: Infinity,
      env: process.env
    })
    child.stderr.pipe(process.stderr)
    child.stdout.pipe(process.stdout)
    child.stdin.end()
    return new Promise((resolve, reject) => {
      child.on('exit', async function (code) {
        await unlink(dockerfilepath)
        if (code === 0) {
          console.info('done')
          return resolve()
        }
        reject(new Error(`failed to build with code ${code}`))
      })
    })
  })
}

const buildDepLines = async function (cellRoot, repoRoot) {
  let packagejson = await readFile(path.join(cellRoot, 'package.json'), 'utf-8')
  packagejson = JSON.parse(packagejson)
  const depsresult = await execPromise(`npx lerna ls --scope ${packagejson.name} --include-dependencies --a --json`, {
    cwd: repoRoot,
    maxBuffer: Infinity,
    env: process.env
  })
  const deps = JSON.parse(depsresult.stdout)
  const result = []
  for (let i = 0; i < deps.length; i++) {
    if (deps[i].name === packagejson.name) continue
    const deppath = deps[i].location.replace(repoRoot, '')
    result.push(`COPY .${deppath}/ /repo${deppath}/`)
    result.push(`RUN cd /repo${deppath}/ && npm install --$mode`)
  }
  return result
}

const cleanupDeps = function (dockerfile_lines) {
  let cut = false
  for (let i = 0; i < dockerfile_lines.length; i++) {
    if (dockerfile_lines[i] === '#deps>') {
      cut = true
      continue
    }
    if (dockerfile_lines[i] === '#<deps') {
      cut = false
      continue
    }
    if (cut) {
      dockerfile_lines.splice(i, 1)
      i -= 1
    }
  }
  return dockerfile_lines
}
