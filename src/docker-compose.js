const findRepoRoot = require('organic-stem-skeleton-find-root')
const loadDna = require('organic-dna-repo-loader')
const { selectBranch } = require('organic-dna-branches')
const YAML = require('yaml')
const path = require('path')
const { exec, spawn } = require('child_process')
const { getCell } = require('organic-dna-cells-info')
const execPromise = require('util').promisify(exec)

module.exports = function (angel) {
  angel.on('docker-compose.yaml', async function (a) {
    return angel.do('docker-compose.yaml docker-compose')
  })
  angel.on('docker-compose.yaml :dnabranch', async function (a) {
    const packagejson = require(path.join(process.cwd(), 'package.json'))
    const repoRoot = await findRepoRoot()
    const rootDNA = await loadDna({ root: repoRoot, mode: '_development' })
    const branchPath = `cells.${packagejson.name}.${a.cmdData.dnabranch}`
    try {
      const dockerCompose = selectBranch(rootDNA, branchPath)
      const cellCompose = dockerCompose.services[packagejson.name]
      const cellInfo = getCell(rootDNA, packagejson.name)
      if (!cellCompose.build && !cellCompose.image) {
        const version = process.version.split('.')[0].replace('v', '')
        cellCompose.image = `node:${version}-alpine`
      }
      if (!cellCompose.volumes) {
        cellCompose.volumes = []
      }
      const repoDnaVolume = `${path.join(repoRoot, 'dna')}:/repo/dna`
      const cellVolume = `${process.cwd()}:/repo/${cellInfo.dna.cwd}`
      appendIfNotExists(cellCompose.volumes, repoDnaVolume)
      appendIfNotExists(cellCompose.volumes, cellVolume)
      appendIfNotExists(cellCompose.volumes, await buildPackagesVolumes(packagejson, repoRoot))
      if (cellInfo.dna.port && !cellCompose.ports) {
        cellCompose.ports = [`${cellInfo.dna.port}:${cellInfo.dna.port}`]
      }
      console.log(YAML.stringify(dockerCompose))
    } catch (e) {
      throw new Error('failed to render ' + a.cmdData.dnabranch + ' Error: ' + e.message)
    }
  })
  angel.on('docker-compose up', async function (a) {
    return angel.do('docker-compose up docker-compose')
  })
  angel.on('docker-compose up :dnabranch', async function (a) {
    return runDockerCompose(a.cmdData.dnabranch, 'up')
  })
  angel.on('docker-compose down', function (a) {
    return angel.do('docker-compose down docker-compose')
  })
  angel.on('docker-compose down :dnabranch', async function (a) {
    return runDockerCompose(a.cmdData.dnabranch, 'down')
  })
  angel.on(/docker-compose exec -- (.*)/, async function (a) {
    return angel.do(`docker-compose exec docker-compose -- ${a.cmdData[1]}`)
  })
  angel.on(/docker-compose exec (.*) -- (.*)/, async function (a) {
    const repoRoot = await findRepoRoot()
    const projectName = require(path.join(repoRoot, 'package.json')).name
    const cellName = require(path.join(process.cwd(), 'package.json')).name
    // thanks to https://stackoverflow.com/questions/46540091/how-to-tell-docker-compose-exec-to-read-from-stdin
    const runCmd = `docker exec -it $(npx angel docker-compose.yaml ${a.cmdData[1]} | docker-compose -p ${projectName} -f - ps -q ${cellName}) ${a.cmdData[2]}`
    const child = spawn('bash', ['-c', runCmd], {
      stdio: 'inherit',
      env: process.env
    })
    return new Promise((resolve, reject) => {
      child.on('exit', (status) => {
        if (status === 0) return resolve()
        reject(new Error('failed to execute: ' + runCmd))
      })
    })
  })
}

const runDockerCompose = async function (dnabranch, cmd) {
  const repoRoot = await findRepoRoot()
  const projectName = require(path.join(repoRoot, 'package.json')).name
  const cellName = require(path.join(process.cwd(), 'package.json')).name
  const cellCwd = process.cwd()
  let upCmd = `cd ${cellCwd} && npx angel docker-compose.yaml ${dnabranch} | DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker-compose -p ${projectName} -f - ${cmd}`
  if (cmd === 'up') {
    upCmd += ' ' + cellName
  }
  console.info(upCmd)
  const child = exec(upCmd, {
    cwd: repoRoot,
    maxBuffer: Infinity,
    env: process.env
  })
  child.stdout.pipe(process.stdout)
  child.stderr.pipe(process.stderr)
  process.stdin.pipe(child.stdin)
  return new Promise((resolve, reject) => {
    child.on('exit', code => {
      if (code === 0) return resolve()
      reject(new Error('failed to execute docker-compose'))
    })
  })
}

const appendIfNotExists = function (volumes, value) {
  if (Array.isArray(value)) {
    value.map(v => appendIfNotExists(volumes, v))
    return
  }
  if (volumes.includes(value)) return
  volumes.push(value)
}

const buildPackagesVolumes = async function (packagejson, repoRoot) {
  const depsresult = await execPromise(`lerna ls --scope ${packagejson.name} --include-dependencies --a --json`)
  const deps = JSON.parse(depsresult.stdout)
  const result = []
  for (let i = 0; i < deps.length; i++) {
    if (deps[i].name === packagejson.name) continue
    const deppath = deps[i].location.replace(repoRoot, '')
    result.push(`${deps[i].location}:/repo${deppath}`)
  }
  return result
}
