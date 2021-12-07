module.exports = function (angel) {
  require('./src/docker-build')(angel)
  require('./src/docker-compose')(angel)
  require('./src/docker-publish')(angel)
}
