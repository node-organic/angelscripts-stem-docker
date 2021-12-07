const findRepoRoot = require('organic-stem-skeleton-find-root')
const { getCell } = require('organic-dna-cells-info')
const loadDna = require('organic-dna-repo-loader')
const { exec } = require('child_process')
const path = require('path')

module.exports = function (angel) {
  angel.on('docker-publish', async function () {
    const packagejson = require(path.join(process.cwd(), 'package.json'))
    const repoRoot = await findRepoRoot()
    const rootDNA = await loadDna({ root: repoRoot })
    const cellInfo = getCell(rootDNA, packagejson.name)
    const registry = cellInfo.dna.registry || ''
    const imageTag = packagejson.name + ':' + packagejson.version
    const cmd = [
      `docker tag ${imageTag} ${registry}/${imageTag}`,
      `docker tag ${imageTag} ${registry}/${packagejson.name}:latest`,
      `docker push ${registry}/${imageTag}`,
      `docker push ${registry}/${packagejson.name}:latest`
    ].join(' && ')
    console.log('publishing:', cmd)
    const child = exec(cmd)
    child.stdout.pipe(process.stdout)
    child.stderr.pipe(process.stderr)
    return new Promise((resolve, reject) => {
      child.on('exit', function (code) {
        if (code === 0) {
          console.log(`done, pushed ${registry}/${imageTag}`)
          return resolve()
        }
        reject(new Error('failed to publish via cmd:' + cmd.join(' && ')))
      })
    })
  })
}
